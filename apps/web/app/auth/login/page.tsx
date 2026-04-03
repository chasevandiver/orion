"use client";

import { Suspense, useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
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

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // undefined = not yet loaded (show buttons in loading state)
  const [config, setConfig] = useState<IntegrationConfig | undefined>(undefined);

  useEffect(() => {
    fetchIntegrationConfig()
      .then(setConfig)
      .catch(() => setConfig({ google: false, github: false }));
  }, []);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Invalid email or password.");
    } else {
      window.location.href = callbackUrl;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-baseline gap-0">
            <span style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontSize: "28px", letterSpacing: "-1.5px", lineHeight: 1, background: "linear-gradient(160deg, #ffffff 0%, #ede9fe 18%, #c4b5fd 42%, #8b5cf6 70%, #6d28d9 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STEL</span>
            <span style={{ fontFamily: "var(--font-brand)", fontWeight: 900, fontSize: "28px", letterSpacing: "-1.5px", lineHeight: 1, background: "linear-gradient(160deg, #a78bfa 0%, #7c3aed 35%, #6d28d9 65%, #4c1d95 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>OS</span>
          </div>
          <p className="text-sm text-muted-foreground">AI Marketing Operating System</p>
        </div>

        {/* OAuth buttons */}
        <div className="space-y-2">
          <OAuthButton
            label="Continue with Google"
            configured={config?.google}
            unconfiguredTooltip="Google login not configured"
            onClick={() => signIn("google", { callbackUrl })}
          />
          <OAuthButton
            label="Continue with GitHub"
            configured={config?.github}
            unconfiguredTooltip="GitHub login not configured"
            onClick={() => signIn("github", { callbackUrl })}
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

        {/* Credentials form — always available */}
        <form onSubmit={handleCredentials} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/auth/register" className="text-foreground underline underline-offset-4 hover:text-primary">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

// ── OAuth button with disabled state when provider not configured ─────────────

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
  // configured === undefined means still loading — render enabled optimistically
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
