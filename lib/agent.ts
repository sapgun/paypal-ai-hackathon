import { z } from "zod";
import { CATALOG, findCatalogItem } from "./catalog";
import { formatUsd } from "./format";
import { dollarsToCents, lineTotal, makeId, signedPayloadHash } from "./money";
import type { AgentMode, LineItem, Proposal } from "./types";

const WORD_QTY: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  pair: 2,
  dozen: 12,
};

const ModelDraft = z.object({
  memo: z.string().max(80).optional(),
  lineItems: z
    .array(
      z.object({
        sku: z.string(),
        quantity: z.coerce.number().int().positive().max(20),
      }),
    )
    .max(8),
  rationale: z.string().min(1).max(600),
  policyNotes: z.array(z.string().max(240)).max(8).optional(),
});

export type RequestedLine = { sku: string; quantity: number };

export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("The model did not return a JSON object.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export function extractBudgetCents(text: string): number | null {
  const amount = "(\\d[\\d,]*)(?:\\.(\\d{1,2}))?";
  const patterns = [
    new RegExp(
      `(?:under|below|at most|no more than|cap(?:ped)? at|max(?:imum)?(?: of)?|budget(?: of)?|keep it under)\\s*\\$?\\s*${amount}`,
      "i",
    ),
    new RegExp(`\\$\\s*${amount}\\s*(?:budget|cap|max(?:imum)?|limit)`, "i"),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return dollarsToCents(match[1], match[2]);
  }
  return null;
}

export function extractMemo(text: string): string {
  const match = text.match(/\bfor\s+((?:the|a|an)\s+)?([a-z0-9][^,.]{2,60})/i);
  if (!match) return "Team purchase";
  const raw = `${match[1] ?? ""}${match[2]}`.trim();
  const cut = raw.split(/\b(under|below|budget|keep)\b/i)[0].trim().replace(/[, ]+$/g, "");
  if (cut.length < 3) return "Team purchase";
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}

function aliasPattern(alias: string): RegExp {
  const escaped = alias
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}(?:es|s)?\\b`, "gi");
}

function quantityBefore(fragment: string): number {
  const re = /(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|pair|dozen)\b/gi;
  let last: number | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(fragment))) {
    const token = match[1].toLowerCase();
    const value = /^\d+$/.test(token) ? Number(token) : WORD_QTY[token];
    if (value > 0 && value <= 20) last = value;
  }
  return last ?? 1;
}

export function matchCatalog(text: string): RequestedLine[] {
  const lower = text.toLowerCase();
  const aliases = CATALOG.flatMap((item) =>
    item.aliases.map((alias) => ({ sku: item.sku, alias: alias.toLowerCase() })),
  ).sort((a, b) => b.alias.length - a.alias.length);

  const claimed: { start: number; end: number; sku: string }[] = [];
  for (const entry of aliases) {
    const pattern = aliasPattern(entry.alias);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lower))) {
      const start = match.index;
      const end = start + match[0].length;
      const overlaps = claimed.some((span) => start < span.end && end > span.start);
      if (overlaps) continue;
      claimed.push({ start, end, sku: entry.sku });
    }
  }

  claimed.sort((a, b) => a.start - b.start);
  const lines: RequestedLine[] = [];
  for (const span of claimed) {
    const prevEnd = claimed
      .filter((other) => other.end <= span.start)
      .reduce((max, other) => Math.max(max, other.end), 0);
    const quantity = quantityBefore(lower.slice(prevEnd, span.start));
    const existing = lines.find((line) => line.sku === span.sku);
    if (existing) existing.quantity = Math.min(20, existing.quantity + quantity);
    else lines.push({ sku: span.sku, quantity });
  }
  return lines;
}

export function priceLines(
  requested: RequestedLine[],
  notes: string[],
): { lines: LineItem[]; notes: string[] } {
  const policyNotes = [...notes];
  const merged = new Map<string, number>();
  for (const request of requested) {
    const item = findCatalogItem(request.sku);
    if (!item) {
      policyNotes.push(`Dropped unknown SKU "${request.sku}". Prices only exist on the catalog.`);
      continue;
    }
    const quantity = Math.min(20, Math.max(1, Math.trunc(request.quantity)));
    merged.set(item.sku, Math.min(20, (merged.get(item.sku) ?? 0) + quantity));
  }

  const lines: LineItem[] = [];
  for (const [sku, quantity] of merged) {
    const item = findCatalogItem(sku);
    if (!item) continue;
    lines.push({
      sku: item.sku,
      name: item.name,
      quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.unitPriceCents * quantity,
      blurb: item.blurb,
    });
  }
  return { lines, notes: policyNotes };
}

export function enforceBudget(
  lines: LineItem[],
  budgetCents: number | null,
): { lines: LineItem[]; notes: string[] } {
  if (budgetCents == null) return { lines, notes: [] };
  const notes: string[] = [];
  const next = lines.map((line) => ({ ...line }));
  const total = () => lineTotal(next);

  if (next.length === 0) return { lines: [], notes };

  if (total() <= budgetCents) {
    notes.push(`The draft fits inside the ${formatUsd(budgetCents)} budget.`);
    return { lines: retotal(next), notes };
  }

  const before = total();
  notes.push(
    `The draft was ${formatUsd(before)}, over the ${formatUsd(budgetCents)} budget, so quantities were reduced before it could be signed.`,
  );
  while (total() > budgetCents && next.length > 0) {
    const last = next[next.length - 1];
    if (last.quantity > 1) last.quantity -= 1;
    else next.pop();
  }
  if (next.length === 0) {
    notes.push("Nothing on the catalog fits inside that budget.");
  }
  return { lines: retotal(next), notes };
}

function retotal(lines: LineItem[]): LineItem[] {
  return lines.map((line) => ({
    ...line,
    lineTotalCents: line.unitPriceCents * line.quantity,
  }));
}

export function finalizeDraft(input: {
  requestText: string;
  memo: string;
  requested: RequestedLine[];
  rationale: string;
  policyNotes: string[];
  agent: { mode: AgentMode; model: string | null };
  now?: string;
}): Proposal {
  const budgetCents = extractBudgetCents(input.requestText);
  const priced = priceLines(input.requested, input.policyNotes);
  const fitted = enforceBudget(priced.lines, budgetCents);
  const lineItems = fitted.lines;
  const policyNotes = [...priced.notes, ...fitted.notes];
  const status = lineItems.length > 0 ? "ready" : "unfulfillable";
  const rationale =
    status === "ready"
      ? input.rationale
      : input.rationale ||
        "Nothing in that request is on the approved catalog, so there is nothing to countersign.";

  const proposal: Proposal = {
    id: makeId("prop"),
    createdAt: input.now ?? new Date().toISOString(),
    requestText: input.requestText.trim(),
    memo: input.memo.trim().slice(0, 80) || "Team purchase",
    currency: "USD",
    lineItems,
    budgetCents,
    policyNotes: dedupe(policyNotes).slice(0, 8),
    rationale,
    agent: input.agent,
    status,
    proposalHash: signedPayloadHash({
      requestText: input.requestText,
      budgetCents,
      lines: lineItems,
    }),
  };
  return proposal;
}

function dedupe(notes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const note of notes) {
    const clean = note.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

export function draftWithDemoParser(requestText: string, now?: string): Proposal {
  const text = requestText.trim();
  const requested = matchCatalog(text);
  const unmatched = requested.length === 0;
  return finalizeDraft({
    requestText: text,
    memo: extractMemo(text),
    requested,
    rationale: unmatched
      ? "Nothing in that request is on the approved catalog. The agent can only draft items that already have a catalog price."
      : "Matched the request against the approved catalog. Unit prices come from the catalog, not from the parser.",
    policyNotes: unmatched
      ? ["No PayPal order can be created from a request that does not match the catalog."]
      : [],
    agent: { mode: "demo", model: null },
    now,
  });
}

const SYSTEM_PROMPT = `You are the purchasing clerk for Countersign. You only draft orders. You never set prices, never invent SKUs, and never say that payment is complete.
Return one JSON object with the keys memo, lineItems, rationale, and policyNotes.
lineItems is an array of { "sku": string, "quantity": number } using only SKUs from the catalog the user message includes.
Quantities are integers from 1 to 20.
If the request names something that is not in the catalog, leave it out and mention it in policyNotes.
If the user states a budget, choose quantities that fit the catalog prices. If nothing fits, return an empty lineItems array.
Do not include prices in the JSON.`;

export async function draftWithLlm(
  requestText: string,
  options: {
    apiKey: string;
    baseUrl: string;
    model: string;
    fetchImpl?: typeof fetch;
    now?: string;
  },
): Promise<Proposal> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const catalogBrief = CATALOG.map(
    (item) =>
      `- ${item.sku}: ${item.name} (${item.aliases.join(", ")}), catalog price ${item.unitPriceCents / 100} USD`,
  ).join("\n");

  const bodyFor = (jsonMode: boolean) =>
    JSON.stringify({
      model: options.model,
      temperature: 0,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Catalog:\n${catalogBrief}\n\nRequest:\n${requestText.trim()}`,
        },
      ],
    });

  const call = async (jsonMode: boolean) => {
    const response = await fetchImpl(`${options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: bodyFor(jsonMode),
      signal: AbortSignal.timeout(20000),
    });
    return response;
  };

  let response = await call(true);
  if (response.status === 400) response = await call(false);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`The language model request failed (${response.status}). ${clip(detail)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("The language model returned an empty draft.");

  const parsed = ModelDraft.parse(extractJsonObject(content));
  const known = new Set(CATALOG.map((item) => item.sku));
  const dropped = parsed.lineItems.filter((line) => !known.has(line.sku)).map((line) => line.sku);
  return finalizeDraft({
    requestText,
    memo: parsed.memo?.trim() || extractMemo(requestText),
    requested: parsed.lineItems.filter((line) => known.has(line.sku)),
    rationale: parsed.rationale,
    policyNotes: [
      ...(parsed.policyNotes ?? []),
      ...dropped.map((sku) => `The model suggested unknown SKU "${sku}", which was dropped.`),
    ],
    agent: { mode: "llm", model: options.model },
    now: options.now,
  });
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "No response body.";
  return clean.length > 180 ? `${clean.slice(0, 180)}…` : clean;
}
