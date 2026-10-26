import multer from "multer";
import { HttpError } from "../lib/errors.js";
import { DOC_EXTS, extOf, normExt, safeName, sniffMatches } from "../lib/sniff.js";

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 20, fieldSize: 10 * 1024 },
});

// Returns { buffer, ext, name } for an allowed document, or throws.
export function checkDocument(file) {
  const ext = normExt(extOf(file.originalname));
  if (!DOC_EXTS.includes(extOf(file.originalname))) {
    throw new HttpError(400, "Upload a PDF, JPG, PNG, DOC or DOCX file.");
  }
  if (!sniffMatches(ext, file.buffer)) {
    throw new HttpError(400, "That file does not look like a real " + ext.toUpperCase() + " file.");
  }
  return { buffer: file.buffer, ext, name: safeName(file.originalname) };
}
