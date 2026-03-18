import { TabsNav } from "./TabsNav";

export default function TabsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {children}
      <TabsNav />
    </>
  );
}

