"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface IntegrationConfig {
  google: boolean;
  github: boolean;
}

async function fetchIntegrationConfig(): Promise<IntegrationConfig> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  const res = await fetch(`${base}/health/integrations`, { cache: "no-store" });
  if (!res.ok) return { google: false, github: false };
  return res.json();
}

function OAuthButton({
  label,
  configured,
  unconfiguredTooltip,
  onClick,
}: {
  label: string;
  configured: boolean | undefined;
  unconfiguredTooltip: string;
  onClick: () => void;
}) {
  const isDisabled = configured === false;

  if (isDisabled) {
    return (
      <div className="group relative w-full">
        <Button
          variant="outline"
          className="w-full cursor-not-allowed opacity-50"
          disabled
          tabIndex={-1}
        >
          {label}
        </Button>
        <span className="pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs text-muted-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10 border border-border">
          {unconfiguredTooltip}
        </span>
      </div>
    );
  }

  return (
    <Button variant="outline" className="w-full" onClick={onClick}>
      {label}
    </Button>
  );
}

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite") ?? "";
  const inviteEmail = searchParams.get("email") ?? "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState(inviteEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<IntegrationConfig | undefined>(undefined);

  // Keep email in sync if the query param changes after mount
  useEffect(() => {
    if (inviteEmail && !email) setEmail(inviteEmail);
  }, [inviteEmail, email]);

  useEffect(() => {
    fetchIntegrationConfig()
      .then(setConfig)
      .catch(() => setConfig({ google: false, github: false }));
  }, []);

  const isInviteFlow = !!inviteToken;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        ...(inviteToken ? { inviteToken } : {}),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? "Registration failed. Please try again.");
      setLoading(false);
      return;
    }

    // Auto sign-in after successful registration
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);
    if (result?.error) {
      setError("Account created but sign-in failed. Please log in.");
    } else {
      window.location.href = "/dashboard";
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orion-green to-orion-blue text-lg font-bold text-black">
            ⚡
          </div>
          <h1 className="font-mono text-2xl font-bold tracking-tight">ORION</h1>
          <p className="text-sm text-muted-foreground">
            {isInviteFlow ? "Accept your invitation" : "Create your account"}
          </p>
        </div>

        {isInviteFlow && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary text-center">
            You&apos;ve been invited to join a team on ORION. Create your account below to accept.
          </div>
        )}

        {/* OAuth buttons — pass invite token through callbackUrl if present */}
        {!isInviteFlow && (
          <>
            <div className="space-y-2">
              <OAuthButton
                label="Continue with Google"
                configured={config?.google}
                unconfiguredTooltip="Google login not configured"
                onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
              />
              <OAuthButton
                label="Continue with GitHub"
                configured={config?.github}
                unconfiguredTooltip="GitHub login not configured"
                onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
              />
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>
          </>
        )}

        {/* Registration form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={isInviteFlow && !!inviteEmail}
              className={isInviteFlow && inviteEmail ? "opacity-70" : ""}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account…" : isInviteFlow ? "Create account & join team" : "Create account"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={inviteToken ? `/auth/accept-invite?token=${inviteToken}` : "/auth/login"}
            className="text-foreground underline underline-offset-4 hover:text-primary"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
