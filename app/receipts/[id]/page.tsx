import Link from "next/link";
import { notFound } from "next/navigation";
import { PayActions } from "@/components/PayActions";
import { ReceiptDocument } from "@/components/ReceiptDocument";
import { getReceipt } from "@/lib/flow";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipt = getReceipt(id);
  if (!receipt) notFound();

  return (
    <main className="shell shell-narrow">
      <header className="top">
        <Link href="/" className="brand">
          <span className="mark" aria-hidden="true">
            Cs
          </span>
          <span>
            <span className="wordmark">Countersign</span>
            <span className="tag">New request</span>
          </span>
        </Link>
      </header>
      <ReceiptDocument receipt={receipt} />
      <PayActions receipt={receipt} />
    </main>
  );
}
