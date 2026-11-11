import { Checkout } from "@/components/Checkout";
import { readRuntime } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export default function HomePage() {
  try {
    const runtime = readRuntime();
    return (
      <main>
        <Checkout runtime={runtime} />
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Runtime is misconfigured.";
    return (
      <main className="shell">
        <h1>Countersign is not configured</h1>
        <p className="banner" role="alert">
          {message}
        </p>
      </main>
    );
  }
}
