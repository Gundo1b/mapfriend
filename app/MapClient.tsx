"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("./Map").then((m) => m.Map), {
  ssr: false,
  loading: () => <div className="min-h-screen bg-white" />,
});

export function MapClient() {
  return <Map />;
}
