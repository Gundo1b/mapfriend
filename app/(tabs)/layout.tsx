import { TabsNav } from "./TabsNav";
import { InboxNotifier } from "./InboxNotifier";

export default function TabsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {children}
      <InboxNotifier />
      <TabsNav />
    </>
  );
}
