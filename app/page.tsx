import Link from "next/link";

export default function Page() {
  return (
    <main style={{ padding: 16 }}>
      <h1>Stocks PWA</h1>
      <p>Kies een pagina:</p>
      <ul>
        <li><Link href="/portfolio">Portfolio</Link></li>
        <li><Link href="/watchlist">Watchlist</Link></li>
        <li><Link href="/dividends">Dividends</Link></li>
      </ul>
    </main>
  );
}
