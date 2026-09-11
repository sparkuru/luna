import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * The server is deliberately a single SQLite writer.  Keeping the write
 * mutex in this process makes the authorization/CAS/idempotency sequence
 * atomic even when an object-store request is awaiting MinIO.
 */
class AsyncMutex {
  private tail = Promise.resolve();

  async runExclusive<T>(work: () => T | Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }
}

export class ServerDatabase {
  readonly sqlite: Database.Database;
  readonly writes = new AsyncMutex();

  constructor(readonly filePath: string) {
    if (filePath !== ":memory:") {
      mkdirSync(path.dirname(path.resolve(filePath)), {
        recursive: true,
        mode: 0o700,
      });
    }
    this.sqlite = new Database(filePath);
    this.sqlite.pragma("foreign_keys = ON");
    this.sqlite.pragma("busy_timeout = 5000");
    if (filePath !== ":memory:") {
      this.sqlite.pragma("journal_mode = WAL");
      this.sqlite.pragma("synchronous = NORMAL");
    }
  }

  transaction<T>(work: () => T): T {
    return this.sqlite.transaction(work).immediate();
  }

  close(): void {
    this.sqlite.close();
  }
}
