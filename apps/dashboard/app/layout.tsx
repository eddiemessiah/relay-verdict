import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relay + Verdict — agent economy on Celo",
  description:
    "Autonomous agents buying and selling services, settling every call in stablecoins on Celo via x402.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
