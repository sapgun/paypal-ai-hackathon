import { describe, expect, it } from "vitest";
import { draftWithDemoParser, draftWithLlm, extractBudgetCents, extractJsonObject } from "../lib/agent";

const DESKS = "2 standing desks and a monitor arm for the design team, keep it under $1000";

describe("demo purchasing parser", () => {
  it("prices catalog items and keeps a stated budget", () => {
    const proposal = draftWithDemoParser(DESKS, "2026-11-11T00:00:00.000Z");
    expect(proposal.status).toBe("ready");
    expect(proposal.memo).toBe("The design team");
    expect(proposal.budgetCents).toBe(100_000);
    expect(proposal.lineItems.map((line) => [line.sku, line.quantity, line.unitPriceCents])).toEqual([
      ["desk", 2, 42_000],
      ["arm", 1, 8_900],
    ]);
    expect(proposal.lineItems.reduce((sum, line) => sum + line.lineTotalCents, 0)).toBe(92_900);
    expect(proposal.policyNotes.some((note) => note.includes("$1,000.00"))).toBe(true);
    expect(proposal.agent).toEqual({ mode: "demo", model: null });
  });

  it("is deterministic for the same request", () => {
    const first = draftWithDemoParser(DESKS, "2026-11-11T00:00:00.000Z");
    const second = draftWithDemoParser(DESKS, "2026-11-11T00:00:00.000Z");
    expect(first.proposalHash).toBe(second.proposalHash);
  });

  it("refuses an off-catalog request", () => {
    const proposal = draftWithDemoParser("Buy me a yacht");
    expect(proposal.status).toBe("unfulfillable");
    expect(proposal.lineItems).toEqual([]);
  });

  it("reduces quantities that would break the budget", () => {
    const proposal = draftWithDemoParser("10 ergonomic chairs under $1000");
    expect(proposal.lineItems).toEqual([
      expect.objectContaining({ sku: "chair", quantity: 1, unitPriceCents: 54_900 }),
    ]);
    expect(proposal.policyNotes.some((note) => note.includes("quantities were reduced"))).toBe(true);
  });

  it("reads a budget written with a comma or the word budget", () => {
    expect(extractBudgetCents("keep it under $1,000")).toBe(100_000);
    expect(extractBudgetCents("under $1000")).toBe(100_000);
    expect(extractBudgetCents("Coffee beans and notebooks for Friday's workshop, budget $80")).toBe(8_000);
    expect(extractBudgetCents("no budget here")).toBeNull();
  });

  it("does not double-count a shorter alias inside a longer one", () => {
    const proposal = draftWithDemoParser("2 standing desks and a monitor arm");
    expect(proposal.lineItems.map((line) => line.sku)).toEqual(["desk", "arm"]);
  });
});

describe("language model drafts", () => {
  it("ignores prices and unknown SKUs from the model", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  memo: "Design team",
                  lineItems: [
                    { sku: "desk", quantity: 2, unitPriceCents: 1 },
                    { sku: "yacht", quantity: 1 },
                  ],
                  rationale: "Two desks from the catalog.",
                  policyNotes: ["Yacht is not sold here."],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      )) as typeof fetch;

    const proposal = await draftWithLlm("2 desks", {
      apiKey: "test-key",
      baseUrl: "https://llm.example/v1",
      model: "test-model",
      fetchImpl,
      now: "2026-11-11T00:00:00.000Z",
    });

    expect(proposal.agent).toEqual({ mode: "llm", model: "test-model" });
    expect(proposal.lineItems).toEqual([
      expect.objectContaining({ sku: "desk", quantity: 2, unitPriceCents: 42_000 }),
    ]);
    expect(proposal.policyNotes.some((note) => note.includes("yacht"))).toBe(true);
  });

  it("extracts a JSON object from surrounding text", () => {
    expect(extractJsonObject('Sure. {"lineItems":[]}')).toEqual({ lineItems: [] });
  });
});
