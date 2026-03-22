import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { BroadcastComposer } from "./broadcast-composer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email Broadcast" };

export default async function BroadcastsPage() {
  const session = await auth();
  if (!session?.user?.orgId) redirect("/auth/login");

  return <BroadcastComposer />;
}
