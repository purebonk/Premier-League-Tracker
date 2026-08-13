import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Premier League Tracker",
  description:
    "Premier League standings, form, streaks and league position over time, computed from an independently ingested match database.",
};

const NAV = [
  { href: "/", label: "Table" },
  { href: "/table/gaps", label: "Points gaps" },
  { href: "/history", label: "Position over time" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-ground text-ink">
        <header className="border-b border-rule">
          <div className="mx-auto flex max-w-[1100px] flex-wrap items-baseline gap-x-6 gap-y-2 px-5 py-4">
            <Link href="/" className="text-[15px] font-semibold tracking-tight">
              Premier League Tracker
            </Link>
            <nav className="flex gap-4">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="label hover:text-ink"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1100px] flex-1 px-5 py-8">
          {children}
        </main>

        <footer className="mt-12 border-t border-rule">
          <div className="mx-auto max-w-[1100px] px-5 py-6 text-[12px] leading-relaxed text-ink-muted">
            Match data ingested on a schedule into an independent Postgres
            database; every figure on this site is computed from it. Club names
            and colours are used for identification only.
          </div>
        </footer>
      </body>
    </html>
  );
}
