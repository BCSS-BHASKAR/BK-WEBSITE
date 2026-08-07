"use strict";

// Read frame count and duration out of an MP4 without downloading it.
//
// The chef_absence clips are not written with faststart, so moov - the only
// box holding sample tables - is the LAST thing in the file. That is awkward
// for a poster (which needs the head) but convenient here: fetching the tail
// gets the whole index in one small range request. Clips run to 325 MB, so
// shelling out to ffprobe on a full download is not an option.
//
// moov is a few hundred bytes for a 10-frame clip and tens of KB for a
// 4700-frame one, so the default 256 KB tail covers every clip in the bucket
// with room to spare.

const { getObjectTail } = require("./inferenceS3");

const TAIL_BYTES = Number(process.env.INFERENCE_MP4_TAIL_BYTES || 256 * 1024);

// Boxes whose payload is more boxes rather than data.
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "dinf", "udta"]);

/**
 * Walk the boxes in `buf` between [start, end), invoking visit(type, payload).
 * Recurses into container boxes. Bounded by the buffer, so a truncated tail
 * simply stops early rather than throwing.
 */
function walk(buf, start, end, visit) {
  let off = start;
  while (off + 8 <= end) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    let header = 8;

    if (size === 1) {
      // 64-bit extended size.
      if (off + 16 > end) return;
      const hi = buf.readUInt32BE(off + 8);
      const lo = buf.readUInt32BE(off + 12);
      size = hi * 2 ** 32 + lo;
      header = 16;
    } else if (size === 0) {
      size = end - off; // runs to the end of its container
    }
    if (size < header || off + size > end) return; // truncated or malformed

    visit(type, off + header, off + size);
    if (CONTAINERS.has(type)) walk(buf, off + header, off + size, visit);
    off += size;
  }
}

/**
 * Locate the moov box inside a tail buffer.
 *
 * A plain search for the bytes "moov" would happily match compressed video
 * inside mdat, so each candidate is confirmed structurally: the box must
 * declare a size that ends exactly at end-of-file. moov is the final box in
 * these files, which makes that check decisive.
 */
function findMoov(buf, fileSize) {
  const tailStart = fileSize - buf.length;
  for (let i = buf.length - 8; i >= 0; i--) {
    if (buf[i + 4] !== 0x6d || buf[i + 5] !== 0x6f || buf[i + 6] !== 0x6f || buf[i + 7] !== 0x76) {
      continue; // not "moov"
    }
    const size = buf.readUInt32BE(i);
    if (size >= 8 && tailStart + i + size === fileSize) return i;
  }
  return -1;
}

/** Parse frame count and duration from an in-memory tail buffer. */
function parseTail(buf, fileSize) {
  const moov = findMoov(buf, fileSize);
  if (moov === -1) return null;

  let timescale = null;
  let duration = null;
  let frameCount = null;

  walk(buf, moov + 8, moov + buf.readUInt32BE(moov), (type, from, to) => {
    if (type === "mvhd" && to - from >= 20) {
      const version = buf[from];
      if (version === 0) {
        timescale = buf.readUInt32BE(from + 12);
        duration = buf.readUInt32BE(from + 16);
      } else if (to - from >= 32) {
        timescale = buf.readUInt32BE(from + 20);
        const hi = buf.readUInt32BE(from + 24);
        const lo = buf.readUInt32BE(from + 28);
        duration = hi * 2 ** 32 + lo;
      }
    } else if (type === "stsz" && to - from >= 12) {
      // version+flags(4), sample_size(4), sample_count(4). Take the first
      // stsz seen - these clips carry a single video track.
      if (frameCount === null) frameCount = buf.readUInt32BE(from + 8);
    }
  });

  const seconds = timescale > 0 && duration != null ? duration / timescale : null;
  if (seconds == null && frameCount == null) return null;
  return {
    frameCount,
    durationSeconds: seconds == null ? null : Number(seconds.toFixed(3)),
  };
}

/**
 * Probe an S3-hosted MP4. Returns { frameCount, durationSeconds } or null if
 * the index could not be read - a null is not fatal, it just leaves those
 * columns empty.
 */
async function probeMp4(s3Key, fileSize) {
  const size = Number(fileSize);
  if (!Number.isFinite(size) || size <= 0) return null;
  try {
    const buf = await getObjectTail(s3Key, Math.min(TAIL_BYTES, size));
    return parseTail(buf, size);
  } catch {
    return null;
  }
}

module.exports = { probeMp4, parseTail };
