import { getCurrentUser } from "@/lib/auth";
import Nav from "@/components/Nav";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import { navUnreadCount } from "@/lib/notifications";

// Terms, Privacy (and the unlinked About, FAQ and Contact) are public. Signed-in users see the app nav; everyone
// else sees the landing page's header and footer.
export default async function InfoLayout({ children }: { children: React.ReactNode }): Promise<React.ReactElement> {
    const result = await getCurrentUser();
    const unreadCount = result.state === "ready" ? await navUnreadCount(result.user, result.organization.id) : 0;

    return (
        <div className="min-h-screen text-foreground">
            {result.state === "ready" ? (
                <Nav showAi={result.user.aiEnabled === true} unreadCount={unreadCount} />
            ) : (
                <PublicHeader />
            )}
            {children}
            {result.state !== "ready" && <PublicFooter />}
        </div>
    );
}
