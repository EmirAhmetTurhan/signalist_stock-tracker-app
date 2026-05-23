import Header from "@/components/layout/Header";
import { headers } from "next/headers";
import dynamic from "next/dynamic";

const FloatingChatButton = dynamic(() => import("@/components/ai/FloatingChatButton"));
import { auth } from "@/lib/better-auth/auth";
import { redirect } from "next/navigation";

const Layout = async ({ children }: { children: React.ReactNode }) => {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) redirect('/sign-in');

    const user = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
    }

    return (
        <main className="min-h-screen text-gray-400">
            <Header user={user} />

            <div className="container py-10">
                {children}
            </div>

            <FloatingChatButton />
        </main>
    )
}
export default Layout


