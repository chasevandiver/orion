import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/auth/login");
  if (session.user.email !== process.env.ADMIN_EMAIL) redirect("/dashboard");
  return <>{children}</>;
}
