import { NextResponse } from "next/server";
import { CATALOG } from "@/lib/catalog";
import { readRuntime } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const runtime = readRuntime();
    return NextResponse.json({
      paypalMode: runtime.paypalMode,
      agentMode: runtime.agentMode,
      model: runtime.model,
      demoForced: runtime.demoForced,
      catalogSize: CATALOG.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Runtime is misconfigured.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
