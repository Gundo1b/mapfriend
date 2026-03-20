import { TabsNav } from "./TabsNav";
import { InboxNotifier } from "./InboxNotifier";
import { GenderGate } from "./GenderGate";

export default function TabsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {children}
      <GenderGate />
      <InboxNotifier />
      <TabsNav />
    </>
  );
}
