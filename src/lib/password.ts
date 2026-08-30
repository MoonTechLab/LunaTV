import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const SCRYPT_COST = 16384; // N
const BLOCK_SIZE = 8; // r
const PARALLELIZATION = 1; // p

/**
 * 对密码进行加盐哈希，返回格式: `salt:hash`
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
  }).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * 验证密码是否匹配存储的哈希值
 * 支持两种格式:
 * - 加盐哈希: `salt:hash` (新格式)
 * - 明文密码: 不含 `:` 或长度不符合哈希格式 (旧格式，兼容迁移期)
 */
export function verifyPassword(
  password: string,
  storedValue: string
): boolean {
  // 判断是否为加盐哈希格式 (salt:hash, salt 32 hex chars, hash 128 hex chars)
  const parts = storedValue.split(':');
  if (
    parts.length === 2 &&
    parts[0].length === SALT_LENGTH * 2 &&
    parts[1].length === KEY_LENGTH * 2
  ) {
    const [salt, storedHash] = parts;
    const hash = scryptSync(password, salt, KEY_LENGTH, {
      N: SCRYPT_COST,
      r: BLOCK_SIZE,
      p: PARALLELIZATION,
    });
    const storedHashBuf = Buffer.from(storedHash, 'hex');
    return timingSafeEqual(hash, storedHashBuf);
  }

  // 旧格式：明文密码直接比较（兼容未迁移的数据）
  return storedValue === password;
}

/**
 * 判断存储的密码值是否已经是加盐哈希格式
 */
export function isHashed(storedValue: string): boolean {
  const parts = storedValue.split(':');
  return (
    parts.length === 2 &&
    parts[0].length === SALT_LENGTH * 2 &&
    parts[1].length === KEY_LENGTH * 2
  );
}
