import type { Metadata } from "next";
import { DemoProvider } from "./DemoWorkOrder";

export const metadata: Metadata = { title: "Demo", robots: { index: false, follow: false } };

export default function DemoLayout({ children }: { children: React.ReactNode }) {
    return <DemoProvider>{children}</DemoProvider>;
}
