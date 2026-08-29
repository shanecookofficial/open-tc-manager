import argon2 from "argon2";

/**
 * OWASP recommended Argon2id parameters (m=19456 KiB, t=2, p=1).
 * Memory-hard; not bcrypt/scrypt. See DECISIONS 2026-08-29 A2-1.
 */
const ARGON2_OPTIONS = {
  type: 2 as const, // argon2id
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  raw: false as const,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
