import { getCurrentUser } from "@/lib/auth";
import Nav from "@/components/Nav";
import PublicHeader from "@/components/PublicHeader";

// About, FAQ and Contact are public. Signed-in users see the app nav; everyone else sees the landing page header.
export default async function InfoLayout({ children }: { children: React.ReactNode }): Promise<React.ReactElement> {
    const result = await getCurrentUser();

    return (
        <div className="min-h-screen text-foreground">
            {result.state === "ready" ? <Nav showAi={result.user.aiEnabled !== false} /> : <PublicHeader showLogo />}
            {children}
        </div>
    );
}
