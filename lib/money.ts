import { createHash, randomBytes } from "crypto";
import { formatUsd } from "./format";
import type { LineItem } from "./types";

export { formatUsd };

export function makeId(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

export function centsToPayPal(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error("Amount must be a non-negative integer number of cents.");
  }
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `${dollars}.${remainder.toString().padStart(2, "0")}`;
}

export function dollarsToCents(whole: string, fraction?: string): number {
  const digits = whole.replace(/,/g, "");
  if (!/^\d+$/.test(digits)) {
    throw new Error("Could not read that dollar amount.");
  }
  const cents = `${fraction ?? ""}00`.slice(0, 2);
  return Number(digits) * 100 + Number(cents);
}

export function lineTotal(lines: Pick<LineItem, "unitPriceCents" | "quantity">[]): number {
  return lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
}

export function signedPayloadHash(input: {
  requestText: string;
  budgetCents: number | null;
  lines: Pick<LineItem, "sku" | "quantity" | "unitPriceCents">[];
}): string {
  const stable = JSON.stringify({
    requestText: input.requestText.trim(),
    budgetCents: input.budgetCents,
    lines: input.lines.map((line) => ({
      sku: line.sku,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
    })),
  });
  return createHash("sha256").update(stable).digest("hex");
}

export function shortHash(hash: string): string {
  return hash.slice(0, 12);
}
