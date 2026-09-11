import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * 密码哈希：Node 内置 scrypt（无原生依赖，容器里不需要编译）。
 * 存储格式：scrypt$N$r$p$<salt base64url>$<hash base64url>
 */

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export const PASSWORD_HASH_ALGORITHM = 'scrypt';

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Buffer {
  return scryptSync(password.normalize('NFKC'), salt, KEY_LENGTH, { N: n, r, p, maxmem: 64 * 1024 * 1024 });
}

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return [
    PASSWORD_HASH_ALGORITHM,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 6) return false;
  const [algorithm, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  if (algorithm !== PASSWORD_HASH_ALGORITHM) return false;

  const n = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (n <= 0 || r <= 0 || p <= 0) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(rawSalt, 'base64url');
    expected = Buffer.from(rawHash, 'base64url');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;

  let actual: Buffer;
  try {
    actual = derive(password, salt, n, r, p);
  } catch {
    return false;
  }
  return timingSafeEqual(actual, expected);
}
