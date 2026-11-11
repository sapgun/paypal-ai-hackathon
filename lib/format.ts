export function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const remainder = (abs % 100).toString().padStart(2, "0");
  return `${sign}$${dollars}.${remainder}`;
}

export function formatWhen(iso: string): string {
  return iso.replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}
