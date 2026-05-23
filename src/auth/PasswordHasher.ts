import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const PASSWORD_HASH_PREFIX = "scrypt";
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return `${PASSWORD_HASH_PREFIX}$${salt}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedPassword: string): Promise<boolean> {
  const [scheme, salt, expectedHash, extra] = storedPassword.split("$");

  if (scheme !== PASSWORD_HASH_PREFIX || !salt || !expectedHash || extra) {
    return storedPassword === password;
  }

  const expected = Buffer.from(expectedHash, "base64url");
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
