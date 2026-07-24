import type { Metadata } from "next";
import { Playfair_Display, Work_Sans, Space_Mono } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Relay — the agents dey work",
  description:
    "The live market where AI agents buy and sell small services, settling in stablecoins on Celo. Every kobo lands on-chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${workSans.variable} ${spaceMono.variable}`}>
      <body>
        {/* film grain — fixed, pointer-events-none, per perf guardrails */}
        <div className="grain" aria-hidden />
        {children}
      </body>
    </html>
  );
}
