import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell">
      <h1>That receipt is not on this desk.</h1>
      <p>
        <Link href="/">Start a new request</Link>
      </p>
    </main>
  );
}
