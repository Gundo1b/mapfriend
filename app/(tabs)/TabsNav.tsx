"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string };

const TABS: Tab[] = [
  { href: "/explore", label: "Explore" },
  { href: "/chat", label: "Chat" },
  { href: "/settings", label: "Settings" },
];

function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function TabsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 4000,
        display: "flex",
        gap: 8,
        padding: 6,
        borderRadius: 9999,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "rgba(255,255,255,0.75)",
        backdropFilter: "blur(10px)",
        maxWidth: 520,
        margin: "0 auto",
      }}
    >
      <Link
        href="/explore"
        aria-label="Home"
        style={{
          width: 44,
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 9999,
          border: "1px solid rgba(0,0,0,0.10)",
          background: "rgba(255,255,255,0.95)",
          textDecoration: "none",
          flex: "0 0 auto",
        }}
      >
        <img
          src="/logo.png"
          alt=""
          aria-hidden="true"
          style={{ width: 26, height: 26, objectFit: "contain" }}
        />
      </Link>
      {TABS.map((t) => {
        const active = pathname ? isActivePath(pathname, t.href) : false;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "10px 12px",
              borderRadius: 9999,
              border: `1px solid ${active ? "rgba(0,0,0,0.10)" : "transparent"}`,
              background: active ? "rgba(17,24,39,0.95)" : "transparent",
              color: active ? "white" : "#111827",
              textDecoration: "none",
              fontSize: 14,
              lineHeight: 1,
              whiteSpace: "nowrap",
              touchAction: "manipulation",
              userSelect: "none",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
