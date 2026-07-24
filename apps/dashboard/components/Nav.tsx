"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/arena", label: "Arena" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="topbar">
      <Link href="/" style={{ textDecoration: "none" }}>
        <div className="brand">
          <div className="brand-orb" />
          <span className="brand-name">Relay</span>
        </div>
      </Link>
      <nav className="nav">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`nav-link ${path === l.href ? "active" : ""}`}
          >
            {l.label}
          </Link>
        ))}
        <a
          className="nav-link"
          href="https://github.com/eddiemessiah/relay-verdict"
          target="_blank"
          rel="noreferrer"
        >
          GitHub ↗
        </a>
      </nav>
    </header>
  );
}
