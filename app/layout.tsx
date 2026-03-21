import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "MapFriend",
  description: "Find and connect on the map.",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
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

const themeInitScript = `(function(){try{var k='mf:theme-pref:v1';var p=localStorage.getItem(k);p=(p==='light'||p==='dark'||p==='system')?p:'system';var mq=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');var dark=(p==='dark')||(p==='system'&&!!mq&&mq.matches);var t=dark?'dark':'light';document.documentElement.dataset.theme=t;try{document.documentElement.style.colorScheme=t;}catch(e){};if(p==='system'&&mq&&mq.addEventListener){mq.addEventListener('change',function(){try{var p2=localStorage.getItem(k);if(p2!=='system')return;var t2=mq.matches?'dark':'light';document.documentElement.dataset.theme=t2;try{document.documentElement.style.colorScheme=t2;}catch(e){}}catch(e){}});}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
