import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "MapFriend",
  description: "Find and connect on the map.",
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "MapFriend",
    description: "Find and connect on the map.",
    images: ["/logo.png"],
  },
  twitter: {
    card: "summary",
    title: "MapFriend",
    description: "Find and connect on the map.",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
