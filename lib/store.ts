import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import type { Proposal, Receipt } from "./types";

export type Database = {
  proposals: Record<string, Proposal>;
  receipts: Record<string, Receipt>;
};

export interface Store {
  read(): Database;
  write(db: Database): void;
}

const EMPTY: Database = { proposals: {}, receipts: {} };

export function memoryStore(initial: Database = EMPTY): Store {
  let db: Database = structuredClone(initial);
  return {
    read: () => structuredClone(db),
    write: (next) => {
      db = structuredClone(next);
    },
  };
}

export function fileStore(filePath: string): Store {
  return {
    read() {
      try {
        const raw = readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw) as Database;
        return {
          proposals: parsed.proposals ?? {},
          receipts: parsed.receipts ?? {},
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY);
        throw error;
      }
    },
    write(db) {
      mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(db, null, 2));
      renameSync(tmp, filePath);
    },
  };
}

let active: Store | null = null;

export function defaultStorePath(): string {
  return process.env.STORE_PATH || path.join(process.cwd(), "data", "store.json");
}

export function setStore(store: Store | null): void {
  active = store;
}

export function getStore(): Store {
  if (active) return active;
  return fileStore(defaultStorePath());
}
