"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

type Status = "loading" | "ready" | "accepting" | "success" | "error";

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setErrorMsg("No invitation token found. Check the link in your email.");
      setStatus("error");
      return;
    }
    if (sessionStatus === "loading") return; // wait for session
    setStatus("ready");
  }, [token, sessionStatus]);

  async function handleAccept() {
    setStatus("accepting");
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMsg((data as { error?: string }).error ?? "Failed to accept invitation.");
        setStatus("error");
        return;
      }

      setStatus("success");
      // Full reload so session picks up new orgId
      setTimeout(() => { window.location.href = "/dashboard"; }, 1500);
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (status === "loading") {
    return <CenteredCard><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></CenteredCard>;
  }

  if (status === "success") {
    return (
      <CenteredCard>
        <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
        <p className="font-semibold text-lg">Invitation accepted!</p>
        <p className="text-sm text-muted-foreground mt-1">Redirecting you to the dashboard…</p>
      </CenteredCard>
    );
  }

  if (status === "error") {
    return (
      <CenteredCard>
        <XCircle className="h-10 w-10 text-destructive mb-3" />
        <p className="font-semibold text-lg">Invalid invitation</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs text-center">{errorMsg}</p>
        <div className="mt-6 flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </CenteredCard>
    );
  }

  // Not signed in — prompt to sign in or register
  if (!session) {
    return (
      <CenteredCard>
        <div className="flex items-baseline gap-0 mb-2">
          <span style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontSize: "24px", letterSpacing: "-1.5px", lineHeight: 1, background: "linear-gradient(160deg, #ffffff 0%, #ede9fe 18%, #c4b5fd 42%, #8b5cf6 70%, #6d28d9 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STEL</span>
          <span style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontSize: "24px", letterSpacing: "-1.5px", lineHeight: 1, background: "linear-gradient(160deg, #a78bfa 0%, #7c3aed 35%, #6d28d9 65%, #4c1d95 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>OS</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1 mb-6">You&apos;ve been invited to join a team</p>

        <div className="w-full space-y-3">
          <Button className="w-full" asChild>
            <Link href={`/auth/register?invite=${token}`}>Create account &amp; accept</Link>
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link href={`/auth/login?callbackUrl=${encodeURIComponent(`/auth/accept-invite?token=${token}`)}`}>
              Sign in to existing account
            </Link>
          </Button>
        </div>
      </CenteredCard>
    );
  }

  // Signed in — show accept button
  return (
    <CenteredCard>
      <div className="flex items-baseline gap-0 mb-2">
        <span style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontSize: "24px", letterSpacing: "-1.5px", lineHeight: 1, background: "linear-gradient(160deg, #ffffff 0%, #ede9fe 18%, #c4b5fd 42%, #8b5cf6 70%, #6d28d9 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STEL</span>
        <span style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontSize: "24px", letterSpacing: "-1.5px", lineHeight: 1, background: "linear-gradient(160deg, #a78bfa 0%, #7c3aed 35%, #6d28d9 65%, #4c1d95 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>OS</span>
      </div>
      <p className="text-sm text-muted-foreground mt-1 mb-2">Team invitation</p>
      <p className="text-sm text-center mb-6">
        Accepting as <span className="font-medium">{session.user?.email}</span>
      </p>

      <Button
        className="w-full"
        disabled={status === "accepting"}
        onClick={handleAccept}
      >
        {status === "accepting" ? (
          <><Loader2 className="h-4 w-4 animate-spin mr-2" />Accepting…</>
        ) : (
          "Accept invitation"
        )}
      </Button>

      <p className="mt-4 text-xs text-muted-foreground text-center">
        Wrong account?{" "}
        <Link href="/auth/login" className="underline underline-offset-2">Sign in with a different account</Link>
      </p>
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col items-center rounded-xl border border-border bg-card p-8 shadow-sm">
        {children}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<CenteredCard><div className="h-8 w-8 animate-pulse rounded-full bg-muted" /></CenteredCard>}>
      <AcceptInviteContent />
    </Suspense>
  );
}
