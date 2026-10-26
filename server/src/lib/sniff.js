// Upload checks. The extension must be allowed AND the first bytes must match that type,
// so a renamed .exe or .html cannot be stored as "report.pdf".
const SIGS = {
  pdf: [0x25, 0x50, 0x44, 0x46],
  jpg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
  doc: [0xd0, 0xcf, 0x11, 0xe0],
  docx: [0x50, 0x4b, 0x03, 0x04], // zip container
  xlsx: [0x50, 0x4b, 0x03, 0x04],
};

export const DOC_EXTS = ["pdf", "jpg", "jpeg", "png", "doc", "docx"];
export const MIME = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  png: "image/png",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const extOf = (name) => (/\.([a-z0-9]+)$/i.exec(name || "")?.[1] || "").toLowerCase();
export const normExt = (ext) => (ext === "jpeg" ? "jpg" : ext);

export function sniffMatches(ext, buf) {
  const sig = SIGS[normExt(ext)];
  if (!sig || !buf || buf.length < sig.length) return false;
  return sig.every((b, i) => buf[i] === b);
}

export function safeName(name) {
  const clean = String(name || "")
    .replace(/[\\/]/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);
  return clean || "file";
}
