import { BadRequestException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import * as argon2 from "argon2";

export async function hashPassword(password: string) {
  if (Buffer.byteLength(password, "utf8") > 72)
    throw new BadRequestException("Password must not exceed 72 UTF-8 bytes");
  return bcrypt.hash(password, 12);
}
export async function verifyPassword(hash: string, password: string) {
  try {
    if (hash.startsWith("$argon2")) return await argon2.verify(hash, password);
    if (/^\$2[aby]\$/.test(hash) && Buffer.byteLength(password, "utf8") <= 72)
      return await bcrypt.compare(password, hash);
    return false;
  } catch {
    return false;
  }
}
