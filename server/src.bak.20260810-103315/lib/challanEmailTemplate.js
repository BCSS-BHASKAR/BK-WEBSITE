const fs = require("fs");
const path = require("path");
const { TCT_OFFENSES_LEFT, TCT_OFFENSES_RIGHT, labelsFor } = require("./tctOffenses");
const { fetchInferenceMedia, contentTypeForKey, normalizeInferenceKey } = require("./inferenceMediaStore");

const TCT_ASSETS_DIR = path.join(__dirname, "../assets/tct-form");

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function field(value, fallback = "___________________________") {
  const v = String(value || "").trim();
  return escapeHtml(v || fallback);
}

function money(n) {
  const v = Number(n || 0);
  return `₱ ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tctNumber(challan) {
  const id = Number(challan?.id);
  if (Number.isFinite(id) && id > 0) return `MTMDO-${String(id).padStart(5, "0")}`;
  return "MTMDO-00000";
}

function mark(checked) {
  return checked ? "&#9745;" : "&#9744;";
}

function cidRef(name) {
  return `${name}@mtmdo.local`;
}

function cidSrc(ref) {
  return `cid:${ref}`;
}

function readInlineAsset(fileName, cidName) {
  const full = path.join(TCT_ASSETS_DIR, fileName);
  if (!fs.existsSync(full)) return null;
  const content = fs.readFileSync(full);
  const contentType = contentTypeForKey(fileName);
  const ref = cidRef(cidName);
  return {
    ref,
    src: cidSrc(ref),
    attachment: {
      filename: fileName,
      content,
      cid: ref,
      contentDisposition: "inline",
      contentType,
    },
  };
}

function offenseRow(left, right, selected) {
  const leftChecked = left ? selected.has(left.code) : false;
  const rightChecked = right ? selected.has(right.code) : false;
  const leftCell = left
    ? `<td style="width:50%;padding:3px 6px;border:1px solid #111;font-size:11px;line-height:1.35;vertical-align:top;">
        <span style="font-size:13px;line-height:1;">${mark(leftChecked)}</span>
        ${escapeHtml(left.label)}
      </td>`
    : `<td style="width:50%;padding:3px 6px;border:1px solid #111;"></td>`;
  const rightCell = right
    ? `<td style="width:50%;padding:3px 6px;border:1px solid #111;font-size:11px;line-height:1.35;vertical-align:top;">
        <span style="font-size:13px;line-height:1;">${mark(rightChecked)}</span>
        ${escapeHtml(right.label)}
      </td>`
    : `<td style="width:50%;padding:3px 6px;border:1px solid #111;"></td>`;
  return `<tr>${leftCell}${rightCell}</tr>`;
}

function buildOffenseTable(selectedCodes) {
  const selected = new Set(Array.isArray(selectedCodes) ? selectedCodes : []);
  const rows = [];
  const maxRows = Math.max(TCT_OFFENSES_LEFT.length, TCT_OFFENSES_RIGHT.length);
  for (let i = 0; i < maxRows; i += 1) {
    rows.push(offenseRow(TCT_OFFENSES_LEFT[i], TCT_OFFENSES_RIGHT[i], selected));
  }
  return rows.join("");
}

function vehicleTypeFromViolation(type) {
  const t = String(type || "").toUpperCase();
  if (t.includes("HELMET") || t.includes("TRIPLE")) return "Motorcycle";
  return "";
}

async function resolveProofInline(proofUrl) {
  const key = normalizeInferenceKey(proofUrl);
  if (!key) return null;

  const asset = await fetchInferenceMedia(key);
  if (!asset?.body?.length) return null;

  const ext = path.extname(key) || ".jpg";
  const ref = cidRef("violation-proof");
  const filename = `violation-evidence${ext}`;

  return {
    ref,
    src: cidSrc(ref),
    attachment: {
      filename,
      content: asset.body,
      cid: ref,
      contentDisposition: "inline",
      contentType: asset.contentType || contentTypeForKey(key),
    },
  };
}

async function buildChallanEmail(challan) {
  const attachments = [];
  const seal = readInlineAsset("image15.png", "tct-seal");
  const mtmdoLogo = readInlineAsset("image25.png", "tct-mtmdo-logo");
  const stars = readInlineAsset("image33.png", "tct-stars");
  for (const asset of [seal, mtmdoLogo, stars]) {
    if (asset) attachments.push(asset.attachment);
  }

  const tctNo = tctNumber(challan);
  const plate = field(challan.plate, "________________");
  const ownerName = field(challan.ownerName);
  const ownerAddress = field(challan.ownerAddress);
  const licenseNo = field(challan.licenseNo, "___________________________");
  const vehicleType = field(challan.vehicleType || vehicleTypeFromViolation(challan.violationType), "_______________");
  const detectedAt = field(challan.detectedAt);
  const place = field(challan.siteName);
  const othersText = challan.othersText ? escapeHtml(String(challan.othersText).trim()) : "___________________________";
  const accidentYes = String(challan.accident || "").toLowerCase() === "yes";
  const amountDue = escapeHtml(money(challan.amount));
  const offenseLabels = Array.isArray(challan.offenseLabels) && challan.offenseLabels.length
    ? challan.offenseLabels
    : labelsFor(challan.offenses);

  const proof = await resolveProofInline(challan.proofUrl);
  let proofHtml = "";
  if (proof) {
    attachments.push(proof.attachment);
    proofHtml = `
      <tr>
        <td style="padding:14px 18px 18px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Violation evidence</p>
          <img src="${proof.src}" alt="Violation capture" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:1px solid #111;" />
        </td>
      </tr>`;
  }

  const sealSrc = seal?.src || "";
  const logoSrc = mtmdoLogo?.src || "";
  const starsSrc = stars?.src || "";

  const subject = `Traffic Citation Ticket ${tctNo} — ${challan.plate}`;

  const text = [
    "Republic of the Philippines",
    "BAYAN NG MONTALBAN",
    "Province of Rizal",
    "Municipal Transportation Management And Development Office",
    "",
    `TRAFFIC CITATION TICKET    TCT No. ${tctNo}`,
    "",
    `Driver's Name: ${challan.ownerName || ""}`,
    `Address: ${challan.ownerAddress || ""}`,
    `License No.: ${challan.licenseNo || ""}`,
    `Type of Vehicle: ${challan.vehicleType || vehicleTypeFromViolation(challan.violationType)}`,
    `Plate No.: ${challan.plate || ""}`,
    "",
    "YOU ARE HEREBY CITED FOR TRAFFIC VIOLATION/S MARKED HERE UNDER",
    offenseLabels.length ? offenseLabels.join("; ") : "",
    othersText !== "___________________________" ? `Others Specified: ${challan.othersText}` : "",
    "",
    `Date/Time of Violation: ${challan.detectedAt || ""}`,
    `Place of Occurrence: ${challan.siteName || ""}`,
    `Accident: ${accidentYes ? "Yes" : "No"}`,
    `Fine amount: ${money(challan.amount)}`,
    "",
    "You are hereby advised to report within five (5) working days upon receipt of this T.C.T. at the Municipal Transportation Management and Development Office (MTMDO) to answer the above stated violation/s and for the payment of the fine imposed upon you.",
    proof ? "Violation evidence image is attached inline in this email." : null,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eceff3;font-family:'Times New Roman',Times,serif;color:#111;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eceff3;padding:18px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;background:#fff;border:2px solid #111;">
          <tr>
            <td style="padding:14px 16px 8px;border-bottom:1px solid #111;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="width:92px;vertical-align:top;text-align:center;">
                    ${sealSrc ? `<img src="${sealSrc}" alt="Bayan ng Montalban seal" width="78" height="78" style="display:block;margin:0 auto;width:78px;height:78px;" />` : ""}
                  </td>
                  <td style="vertical-align:top;text-align:center;padding:0 8px;">
                    <div style="font-size:12px;line-height:1.35;">Republic of the Philippines</div>
                    <div style="font-size:15px;font-weight:700;line-height:1.35;margin-top:2px;">BAYAN NG MONTALBAN</div>
                    <div style="font-size:12px;line-height:1.35;">Province of Rizal</div>
                    <div style="font-size:11px;line-height:1.35;margin-top:4px;">Municipal Transportation Management<br/>And Development Office</div>
                    ${starsSrc ? `<img src="${starsSrc}" alt="" width="120" height="24" style="display:block;margin:8px auto 0;width:120px;height:auto;" />` : ""}
                  </td>
                  <td style="width:110px;vertical-align:top;text-align:center;">
                    ${logoSrc ? `<img src="${logoSrc}" alt="MTMDO logo" width="96" height="96" style="display:block;margin:0 auto;width:96px;height:auto;" />` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:10px 16px 6px;border-bottom:1px solid #111;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="font-size:16px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Traffic Citation Ticket</td>
                  <td align="right" style="font-size:13px;font-weight:700;white-space:nowrap;">TCT No.&nbsp; ${escapeHtml(tctNo)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:10px 16px;font-size:12px;line-height:1.8;">
              <div><strong>Driver's Name:</strong> ${ownerName}</div>
              <div><strong>Address:</strong> ${ownerAddress}</div>
              <div><strong>License No.:</strong> ${licenseNo}</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:4px;">
                <tr>
                  <td style="width:55%;"><strong>Type of Vehicle:</strong> ${vehicleType}</td>
                  <td style="width:45%;"><strong>Plate No.:</strong> ${plate}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 16px 10px;font-size:11px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="width:25%;">${mark(false)} DL Surrender</td>
                  <td style="width:25%;">${mark(false)} Plate Surrender</td>
                  <td style="width:25%;">${mark(false)} Unit Impounded</td>
                  <td style="width:25%;">${mark(false)} Other Surrender</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:6px 16px 8px;font-size:12px;font-weight:700;text-align:center;text-transform:uppercase;">
              You are hereby cited for traffic violation/s marked &ldquo;&#10003;&rdquo; here under
            </td>
          </tr>

          <tr>
            <td style="padding:0 16px 10px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                ${buildOffenseTable(challan.offenses)}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 16px 10px;font-size:12px;line-height:1.7;">
              <strong>Others Specified</strong> ${othersText}
            </td>
          </tr>

          <tr>
            <td style="padding:0 16px 10px;font-size:12px;line-height:1.8;">
              <div><strong>Date/Time of Violation:</strong> ${detectedAt}</div>
              <div><strong>Place of Occurrence:</strong> ${place}</div>
              <div><strong>Accident:</strong> ${mark(accidentYes)} Yes&nbsp;&nbsp;&nbsp;${mark(!accidentYes)} No</div>
              <div style="margin-top:6px;"><strong>Fine Amount:</strong> ${amountDue}</div>
            </td>
          </tr>

          <tr>
            <td style="padding:0 16px 12px;font-size:11px;line-height:1.55;text-align:justify;">
              You are hereby advised to report within five (5) working days upon receipt of this T.C.T. at the Municipal Transportation Management and Development Office (MTMDO) to answer the above stated violation/s and for the payment of the fine imposed upon you.<br/><br/>
              Failure to comply with this T.C.T. a complaint will be filed against you before the Municipal Trial Court of Montalban.
            </td>
          </tr>

          <tr>
            <td style="padding:0 16px 12px;font-size:12px;">
              ${mark(false)} Admitted&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${mark(false)} Contested
            </td>
          </tr>

          <tr>
            <td style="padding:0 16px 18px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="width:50%;padding-right:12px;vertical-align:top;">
                    <div style="border-top:1px solid #111;padding-top:6px;font-size:11px;text-align:center;">
                      Name and Signature of<br/>Apprehending Officer<br/><span style="font-size:10px;">Official Designation</span>
                    </div>
                  </td>
                  <td style="width:50%;padding-left:12px;vertical-align:top;">
                    <div style="border-top:1px solid #111;padding-top:6px;font-size:11px;text-align:center;">
                      Driver's Signature
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${proofHtml}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html, attachments };
}

module.exports = {
  buildChallanEmail,
};
