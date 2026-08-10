"use strict";

// A minimal streaming ZIP writer.
//
// Written by hand rather than pulling in `archiver` because everything this
// packs - JPEG stills, MP4 and WebM clips - is ALREADY compressed. Deflating it
// again costs CPU on a 2 vCPU box and saves nothing, so every entry is STORED,
// and a stored-only writer is small enough to own.
//
// Entries stream: bytes go from S3 straight to the socket and nothing is
// buffered to disk, which matters because the deployment box has ~2 GB free and
// the chef_absence clips are ~30 MB each.
//
// Sizes and CRCs are therefore not known when an entry's local header is
// written. That is exactly what the ZIP data descriptor is for: general-purpose
// flag bit 3 says "the sizes follow the data", so the header carries zeros and
// the real values are written afterwards. Both are repeated in the central
// directory, which is what any unzip tool actually reads.
//
// No ZIP64. Callers cap the payload well under the 4 GB where it would be
// needed, and a silent overflow would be far worse than a refusal.

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32Update(crc, buf) {
  let c = crc ^ -1;
  for (let i = 0; i < buf.length; i += 1) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

/** MS-DOS date/time, which is what the ZIP header format stores. */
function dosDateTime(d) {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Names inside the archive.
 *
 * S3 keys carry slashes, spaces and the odd character Windows refuses in a
 * filename. Anything outside a conservative set becomes an underscore, and a
 * leading dot or slash is stripped so an entry can never escape the extraction
 * directory - a zip is an untrusted-path format and "../" in a name is the
 * classic way out of it.
 */
function safeEntryName(name) {
  const cleaned = String(name)
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180);
  return cleaned || "file";
}

class ZipStream {
  /** @param out a writable stream - the HTTP response. */
  constructor(out) {
    this.out = out;
    this.offset = 0;
    this.entries = [];
    this.names = new Set();
  }

  _write(buf) {
    this.offset += buf.length;
    // Respect backpressure: a slow client must throttle the S3 read rather than
    // let Node buffer the whole archive in memory.
    return this.out.write(buf);
  }

  _drain() {
    return new Promise((resolve) => this.out.once("drain", resolve));
  }

  /** Make a name unique, so two cameras' same-named files do not collide. */
  _uniqueName(name) {
    let candidate = safeEntryName(name);
    if (!this.names.has(candidate)) { this.names.add(candidate); return candidate; }
    const dot = candidate.lastIndexOf(".");
    const stem = dot > 0 ? candidate.slice(0, dot) : candidate;
    const ext = dot > 0 ? candidate.slice(dot) : "";
    let i = 2;
    while (this.names.has(`${stem}-${i}${ext}`)) i += 1;
    candidate = `${stem}-${i}${ext}`;
    this.names.add(candidate);
    return candidate;
  }

  async _addEntry(rawName, readable, buffer) {
    const name = this._uniqueName(rawName);
    const nameBuf = Buffer.from(name, "utf8");
    const { time, date } = dosDateTime(new Date());
    const localOffset = this.offset;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);        // version needed
    local.writeUInt16LE(0x0008, 6);    // flag bit 3: sizes follow in a descriptor
    local.writeUInt16LE(0, 8);         // method: stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(0, 14);        // crc      - in the descriptor
    local.writeUInt32LE(0, 18);        // comp size - in the descriptor
    local.writeUInt32LE(0, 22);        // raw size  - in the descriptor
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    this._write(Buffer.concat([local, nameBuf]));

    let crc = 0;
    let size = 0;
    if (buffer) {
      crc = crc32Update(0, buffer);
      size = buffer.length;
      if (!this._write(buffer)) await this._drain();
    } else {
      for await (const chunk of readable) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        crc = crc32Update(crc, buf);
        size += buf.length;
        if (!this._write(buf)) await this._drain();
      }
    }

    const desc = Buffer.alloc(16);
    desc.writeUInt32LE(0x08074b50, 0);
    desc.writeUInt32LE(crc, 4);
    desc.writeUInt32LE(size, 8);
    desc.writeUInt32LE(size, 12);
    this._write(desc);

    this.entries.push({ nameBuf, crc, size, time, date, localOffset });
  }

  addStream(name, readable) { return this._addEntry(name, readable, null); }
  addBuffer(name, buffer) { return this._addEntry(name, null, buffer); }

  /** Central directory + end-of-central-directory. Nothing may be added after. */
  finish() {
    const start = this.offset;
    for (const e of this.entries) {
      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0);
      cd.writeUInt16LE(20, 4);      // version made by
      cd.writeUInt16LE(20, 6);      // version needed
      cd.writeUInt16LE(0x0008, 8);
      cd.writeUInt16LE(0, 10);      // stored
      cd.writeUInt16LE(e.time, 12);
      cd.writeUInt16LE(e.date, 14);
      cd.writeUInt32LE(e.crc, 16);
      cd.writeUInt32LE(e.size, 20);
      cd.writeUInt32LE(e.size, 24);
      cd.writeUInt16LE(e.nameBuf.length, 28);
      cd.writeUInt16LE(0, 30);      // extra
      cd.writeUInt16LE(0, 32);      // comment
      cd.writeUInt16LE(0, 34);      // disk
      cd.writeUInt16LE(0, 36);      // internal attrs
      cd.writeUInt32LE(0, 38);      // external attrs
      cd.writeUInt32LE(e.localOffset, 42);
      this._write(Buffer.concat([cd, e.nameBuf]));
    }
    const size = this.offset - start;

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(this.entries.length, 8);
    eocd.writeUInt16LE(this.entries.length, 10);
    eocd.writeUInt32LE(size, 12);
    eocd.writeUInt32LE(start, 16);
    eocd.writeUInt16LE(0, 20);
    this._write(eocd);
  }
}

module.exports = { ZipStream, safeEntryName };
