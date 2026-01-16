import type { Metadata, Viewport } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  applicationName: "Stocks PWA",
  title: "Stocks PWA",
  description: "Private portfolio tracker",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Stocks PWA",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

const links = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/dividends", label: "Dividends" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
        <nav style={{ display: "flex", gap: 12, padding: 12, borderBottom: "1px solid #ddd", flexWrap: "wrap" }}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} style={{ textDecoration: "none" }}>
              {l.label}
            </Link>
          ))}
        </nav>

        <main style={{ padding: 12, maxWidth: 1100, margin: "0 auto" }}>{children}</main>
      </body>
    </html>
  );
}
