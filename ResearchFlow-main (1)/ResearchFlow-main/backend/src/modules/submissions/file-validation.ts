import { BadRequestException } from "@nestjs/common";
import { inflateRawSync } from "node:zlib";
import { TextDecoder } from "node:util";
const mime: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};
function xmlPart(b: Buffer, name: string) {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("Invalid ZIP");
  const count = b.readUInt16LE(eocd + 10),
    start = b.readUInt32LE(eocd + 16),
    size = b.readUInt32LE(eocd + 12);
  if (
    count > 2000 ||
    start + size > eocd ||
    b.readUInt16LE(eocd + 4) !== 0 ||
    b.readUInt16LE(eocd + 6) !== 0
  )
    throw new Error("Unsupported ZIP");
  let at = start,
    total = 0,
    found: Buffer | undefined;
  for (let n = 0; n < count; n++) {
    if (at + 46 > b.length || b.readUInt32LE(at) !== 0x02014b50)
      throw new Error("Invalid directory");
    const flags = b.readUInt16LE(at + 8),
      method = b.readUInt16LE(at + 10),
      packed = b.readUInt32LE(at + 20),
      unpacked = b.readUInt32LE(at + 24),
      len = b.readUInt16LE(at + 28),
      extra = b.readUInt16LE(at + 30),
      comment = b.readUInt16LE(at + 32),
      offset = b.readUInt32LE(at + 42);
    if (at + 46 + len + extra + comment > start + size)
      throw new Error("Invalid directory bounds");
    const entry = b.subarray(at + 46, at + 46 + len).toString("utf8");
    total += unpacked;
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      total > 50 * 1024 * 1024 ||
      unpacked > 20 * 1024 * 1024 ||
      entry.includes("..") ||
      entry.includes("\\") ||
      entry.startsWith("/") ||
      entry.includes(":") ||
      /vbaProject\.bin$/i.test(entry)
    )
      throw new Error("Unsupported document archive");
    if (entry === name) {
      if (
        unpacked > 2 * 1024 * 1024 ||
        offset + 30 > b.length ||
        b.readUInt32LE(offset) !== 0x04034b50
      )
        throw new Error("Invalid part");
      const data =
        offset + 30 + b.readUInt16LE(offset + 26) + b.readUInt16LE(offset + 28);
      if (data + packed > start) throw new Error("Invalid part bounds");
      found =
        method === 0
          ? b.subarray(data, data + packed)
          : inflateRawSync(b.subarray(data, data + packed), {
              maxOutputLength: 2 * 1024 * 1024,
            });
      if (found.length !== unpacked) throw new Error("Part size mismatch");
    }
    at += 46 + len + extra + comment;
  }
  if (!found) throw new Error("Missing document part");
  return found.toString("utf8");
}
export function validateFile(file: Express.Multer.File) {
  const name = file.originalname.replace(/\\/g, "/").split("/").pop() ?? "";
  if (!name || name.length > 180 || /[\x00-\x1f\x7f]/.test(name))
    throw new BadRequestException("Invalid attachment filename");
  const extension = name.split(".").pop()?.toLowerCase() ?? "",
    b = file.buffer;
  if (!mime[extension] || !b?.length)
    throw new BadRequestException(
      "Use a nonempty PDF, DOCX, PPTX, XLSX, CSV, JPG or PNG attachment",
    );
  try {
    if (extension === "pdf") {
      if (
        b.subarray(0, 5).toString() !== "%PDF-" ||
        !b.subarray(Math.max(0, b.length - 1024)).includes(Buffer.from("%%EOF"))
      )
        throw new Error("Invalid PDF");
    } else if (extension === "png") {
      if (
        b.length < 45 ||
        b.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
        b.subarray(12, 16).toString() !== "IHDR" ||
        !b.subarray(b.length - 12).includes(Buffer.from("IEND"))
      )
        throw new Error("Invalid PNG");
    } else if (["jpg", "jpeg"].includes(extension)) {
      if (
        b.length < 8 ||
        b[0] !== 255 ||
        b[1] !== 216 ||
        b[2] !== 255 ||
        b[b.length - 2] !== 255 ||
        b[b.length - 1] !== 217
      )
        throw new Error("Invalid JPEG");
    } else if (extension === "csv") {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(b);
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))
        throw new Error("Invalid CSV");
    } else {
      const part =
        extension === "docx"
          ? "word/document.xml"
          : extension === "pptx"
            ? "ppt/presentation.xml"
            : "xl/workbook.xml";
      const content = xmlPart(b, "[Content_Types].xml");
      const main = xmlPart(b, part);
      const marker =
        extension === "docx"
          ? "wordprocessingml.document.main+xml"
          : extension === "pptx"
            ? "presentationml.presentation.main+xml"
            : "spreadsheetml.sheet.main+xml";
      if (!content.includes(marker) || !main.trim().startsWith("<"))
        throw new Error("Wrong Office document type");
    }
  } catch {
    throw new BadRequestException(
      "Attachment content does not match its supported file type or exceeds document archive limits",
    );
  }
  return { name, extension, type: mime[extension] };
}
