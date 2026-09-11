import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import type { ServerDatabase } from "./db/database";
import { recordSecurityEvent } from "./db/operations";
import { ApiError } from "./errors";

export const PASSWORD_PARAMS = {
  version: 1,
  N: 131072,
  r: 8,
  p: 1,
  maxmem: 256 * 1024 * 1024,
} as const;

export const digest = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

export function username(value: string): string {
  const result = value.normalize("NFKC").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(result))
    throw new ApiError(400, "invalid-input");
  return result;
}

export function validatePassword(value: string): void {
  if (
    [...value].length < 12 ||
    [...value].length > 128 ||
    Buffer.byteLength(value) > 512
  )
    throw new ApiError(400, "invalid-input");
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, PASSWORD_PARAMS, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

export class Passwords {
  private active = 0;
  private queue: Array<() => void> = [];

  async run(password: string, salt: Buffer): Promise<Buffer> {
    if (this.active >= 2) {
      if (this.queue.length >= 8) throw new ApiError(429, "rate-limited", true);
      await new Promise<void>((resolve) => this.queue.push(resolve));
    } else this.active++;
    try {
      return await derive(password, salt);
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
  }
}

export async function setAccount(
  database: ServerDatabase,
  name: string,
  password: string,
  reset = false,
): Promise<void> {
  const normalized = username(name);
  validatePassword(password);
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  try {
    await database.writes.runExclusive(() =>
      database.transaction(() => {
        const timestamp = new Date().toISOString();
        if (reset) {
          const result = database.sqlite
            .prepare(
              `UPDATE users SET password_hash = ?, password_salt = ?, password_params = ?
               WHERE username = ? AND disabled_at IS NULL`,
            )
            .run(hash, salt, JSON.stringify(PASSWORD_PARAMS), normalized);
          if (result.changes === 0) throw new ApiError(404, "not-found");
          const user = database.sqlite
            .prepare("SELECT id FROM users WHERE username = ?")
            .get(normalized) as { id: string };
          database.sqlite
            .prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ?")
            .run(timestamp, user.id);
        } else {
          database.sqlite
            .prepare(
              `INSERT INTO users(id, username, password_hash, password_salt, password_params, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .run(
              randomUUID(),
              normalized,
              hash,
              salt,
              JSON.stringify(PASSWORD_PARAMS),
              timestamp,
            );
        }
        recordSecurityEvent(database, {
          action: reset ? "password-reset" : "account-created",
          result: "success",
        });
      }),
    );
  } finally {
    hash.fill(0);
    salt.fill(0);
  }
}

export interface Identity {
  userId: string;
  sessionId: string;
  username: string;
}

export function authorize(
  database: ServerDatabase,
  token: string | undefined,
  _exclusive = false,
): Identity {
  if (!token?.match(/^Bearer [A-Za-z0-9_-]{43}$/))
    throw new ApiError(401, "authentication");
  const hash = digest(token.slice(7));
  const row = database.sqlite
    .prepare(
      `SELECT s.id AS session_id, s.user_id, u.username
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL AND u.disabled_at IS NULL
         AND s.expires_at > ?`,
    )
    .get(hash, new Date().toISOString()) as
    | { session_id: string; user_id: string; username: string }
    | undefined;
  if (!row) throw new ApiError(401, "authentication");
  return {
    userId: row.user_id,
    sessionId: row.session_id,
    username: row.username,
  };
}

export async function verifyLogin(
  database: ServerDatabase,
  passwords: Passwords,
  name: string,
  password: string,
): Promise<{ id: string; username: string; hash: Buffer }> {
  validatePassword(password);
  let normalized: string;
  try {
    normalized = username(name);
  } catch {
    normalized = "";
  }
  const user = database.sqlite
    .prepare(
      `SELECT id, username, password_hash, password_salt, password_params, disabled_at
       FROM users WHERE username = ?`,
    )
    .get(normalized) as
    | {
        id: string;
        username: string;
        password_hash: Buffer;
        password_salt: Buffer;
        password_params: string;
        disabled_at: string | null;
      }
    | undefined;
  const actual = await passwords.run(
    password,
    user?.password_salt ?? Buffer.alloc(16),
  );
  const expected = user?.password_hash ?? Buffer.alloc(64);
  const valid =
    expected.length === actual.length && timingSafeEqual(actual, expected);
  actual.fill(0);
  let storedParams: typeof PASSWORD_PARAMS | null = null;
  try {
    const value = user ? JSON.parse(user.password_params) : null;
    if (
      value &&
      value.version === PASSWORD_PARAMS.version &&
      value.N === PASSWORD_PARAMS.N &&
      value.r === PASSWORD_PARAMS.r &&
      value.p === PASSWORD_PARAMS.p &&
      value.maxmem === PASSWORD_PARAMS.maxmem
    )
      storedParams = PASSWORD_PARAMS;
  } catch {
    storedParams = null;
  }
  if (!valid || !user || user.disabled_at || storedParams === null)
    throw new ApiError(401, "authentication");
  return { id: user.id, username: user.username, hash: Buffer.from(user.password_hash) };
}
