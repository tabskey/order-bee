import { compare, hash } from 'bcryptjs';

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, SALT_ROUNDS);
}

export function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  return compare(plain, stored);
}
