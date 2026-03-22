"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Check,
  Plus,
  Trash2,
  CheckCircle2,
  Rocket,
  Linkedin,
  Twitter,
  Instagram,
  Facebook,
  Mail,
  Link2,
  Sparkles,
  ArrowRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PersonaForm {
  name: string;
  description: string;
  preferredChannels: string[];
}

const CHANNELS = ["linkedin", "twitter", "instagram", "facebook", "tiktok", "email", "blog"];

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  linkedin: <Linkedin className="h-4 w-4" />,
  twitter: <Twitter className="h-4 w-4" />,
  instagram: <Instagram className="h-4 w-4" />,
  facebook: <Facebook className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
};

const CONNECTABLE_CHANNELS = [
  { key: "twitter", label: "Twitter / X", icon: <Twitter className="h-5 w-5" /> },
  { key: "linkedin", label: "LinkedIn", icon: <Linkedin className="h-5 w-5" /> },
  { key: "facebook", label: "Facebook & Instagram", icon: <Facebook className="h-5 w-5" /> },
  { key: "email", label: "Email (Resend)", icon: <Mail className="h-5 w-5" /> },
];

const TOTAL_STEPS = 5;

// ── Step progress ─────────────────────────────────────────────────────────────

function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
              i + 1 < current
                ? "border-orion-green bg-orion-green text-black"
                : i + 1 === current
                ? "border-orion-green text-orion-green"
                : "border-border text-muted-foreground"
            }`}
          >
            {i + 1 < current ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`h-0.5 w-6 ${i + 1 < current ? "bg-orion-green" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Completion screen ─────────────────────────────────────────────────────────

function CompletionScreen({
  brandName,
  primaryColor,
  secondaryColor,
  personaCount,
  connectedChannels,
  generatingSample,
  sampleReady,
  sampleCampaignId,
  onViewSample,
  onCreateCampaign,
  onGoToDashboard,
}: {
  brandName: string;
  primaryColor: string;
  secondaryColor: string;
  personaCount: number;
  connectedChannels: string[];
  generatingSample: boolean;
  sampleReady: boolean;
  sampleCampaignId: string | null;
  onViewSample: () => void;
  onCreateCampaign: () => void;
  onGoToDashboard: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 40);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: "opacity 0.45s ease, transform 0.45s ease",
      }}
      className="flex min-h-screen items-center justify-center bg-background p-6"
    >
      <div className="w-full max-w-lg text-center space-y-6">
        {/* Animated checkmark */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-orion-green/15 ring-8 ring-orion-green/10">
          <CheckCircle2 className="h-10 w-10 text-orion-green" strokeWidth={1.5} />
        </div>

        <div>
          <h1 className="text-3xl font-bold">Your brand is set up!</h1>
          <p className="mt-2 text-muted-foreground">
            ORION is configured and ready to generate campaigns for{" "}
            <span className="font-semibold text-foreground">{brandName || "your brand"}</span>.
          </p>
        </div>

        {/* Summary card */}
        <div className="rounded-xl border border-border bg-card p-4 text-left space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What was configured</p>
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm">
              <Check className="h-4 w-4 shrink-0 text-orion-green" />
              <span className="text-muted-foreground">Brand profile</span>
              <span className="ml-auto font-medium">{brandName}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Check className="h-4 w-4 shrink-0 text-orion-green" />
              <span className="text-muted-foreground">Brand colors</span>
              <div className="ml-auto flex items-center gap-1.5">
                <span
                  className="h-4 w-4 rounded-full border border-border"
                  style={{ background: primaryColor }}
                />
                <span
                  className="h-4 w-4 rounded-full border border-border"
                  style={{ background: secondaryColor }}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Check className="h-4 w-4 shrink-0 text-orion-green" />
              <span className="text-muted-foreground">Audience</span>
              <span className="ml-auto font-medium">
                {personaCount} {personaCount === 1 ? "persona" : "personas"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {connectedChannels.length > 0 ? (
                <Check className="h-4 w-4 shrink-0 text-orion-green" />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border-2 border-border" />
              )}
              <span className="text-muted-foreground">Social accounts</span>
              <span className="ml-auto font-medium text-xs">
                {connectedChannels.length > 0
                  ? connectedChannels.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(", ")
                  : "None connected"}
              </span>
            </div>
          </div>
        </div>

        {/* Sample campaign generation status */}
        {generatingSample && (
          <div className="rounded-xl border border-orion-green/20 bg-orion-green/5 p-4 text-left">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-orion-green shrink-0" />
              <div>
                <p className="text-sm font-medium">Generating your sample campaign...</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ORION is creating an awareness campaign to show you what's possible.
                </p>
              </div>
            </div>
          </div>
        )}

        {sampleReady && (
          <div className="rounded-xl border border-orion-green/30 bg-orion-green/5 p-4 text-left">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-orion-green shrink-0" />
              <div>
                <p className="text-sm font-medium text-orion-green">Sample campaign is ready!</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  We created a sample campaign to show you what ORION can do.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* CTAs */}
        <div className="space-y-3">
          {sampleReady && sampleCampaignId ? (
            <>
              <Button
                className="w-full gap-2 text-base py-5 bg-orion-green text-black hover:bg-orion-green-dim"
                onClick={onViewSample}
              >
                <Sparkles className="h-4 w-4" />
                View Sample Campaign
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={onCreateCampaign}
              >
                <Rocket className="h-4 w-4" />
                Create Your Own Campaign
              </Button>
            </>
          ) : (
            <Button
              className="w-full gap-2 text-base py-5"
              onClick={onCreateCampaign}
              disabled={generatingSample}
            >
              <Rocket className="h-4 w-4" />
              Create Your First Campaign
            </Button>
          )}
          <button
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
            onClick={onGoToDashboard}
          >
            Go to Dashboard →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main wizard ────────────────────────────────────────────────────────────────

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  // Step 1 & 2 — Brand
  const [brandName, setBrandName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#10b981");
  const [secondaryColor, setSecondaryColor] = useState("#3b82f6");
  const [voiceTone, setVoiceTone] = useState("professional");

  // Step 3 — Personas (simplified)
  const [personas, setPersonas] = useState<PersonaForm[]>([
    { name: "", description: "", preferredChannels: [] },
  ]);

  // Step 4 — Connected channels
  const [connectedChannels, setConnectedChannels] = useState<string[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);

  // Completion — sample campaign
  const [generatingSample, setGeneratingSample] = useState(false);
  const [sampleReady, setSampleReady] = useState(false);
  const [sampleCampaignId, setSampleCampaignId] = useState<string | null>(null);

  // Load existing connections when reaching step 4
  useEffect(() => {
    if (step === 4 && connectedChannels.length === 0) {
      setLoadingConnections(true);
      api
        .get<{ data: Array<{ channel: string; isActive: boolean }> }>("/integrations")
        .then((res) => {
          const active = res.data.filter((c) => c.isActive).map((c) => c.channel);
          setConnectedChannels(active);
        })
        .catch(() => {})
        .finally(() => setLoadingConnections(false));
    }
  }, [step]);

  function addPersona() {
    if (personas.length >= 3) return;
    setPersonas((p) => [...p, { name: "", description: "", preferredChannels: [] }]);
  }

  function removePersona(i: number) {
    setPersonas((p) => p.filter((_, idx) => idx !== i));
  }

  function updatePersona(i: number, field: keyof PersonaForm, value: string | string[]) {
    setPersonas((p) => p.map((persona, idx) => (idx === i ? { ...persona, [field]: value } : persona)));
  }

  function toggleChannel(personaIdx: number, ch: string) {
    const p = personas[personaIdx]!;
    const has = p.preferredChannels.includes(ch);
    updatePersona(
      personaIdx,
      "preferredChannels",
      has ? p.preferredChannels.filter((c) => c !== ch) : [...p.preferredChannels, ch],
    );
  }

  async function saveStep1And2() {
    if (!brandName.trim() || !description.trim()) {
      setError("Brand name and description are required.");
      return false;
    }
    try {
      const existing = await api.get<{ data: any[] }>("/brands").catch(() => ({ data: [] }));
      const activeBrand = existing.data?.[0];
      if (activeBrand) {
        await api.patch(`/brands/${activeBrand.id}`, {
          name: brandName,
          tagline,
          description,
          logoUrl,
          websiteUrl: website,
          primaryColor,
          voiceTone,
        });
      } else {
        await api.post("/brands", {
          name: brandName,
          tagline,
          description,
          logoUrl,
          websiteUrl: website,
          primaryColor,
          voiceTone,
        });
      }
      await api
        .patch("/settings/org", {
          brandPrimaryColor: primaryColor,
          brandSecondaryColor: secondaryColor,
          logoUrl,
        })
        .catch(() => {});
      return true;
    } catch (err: any) {
      setError(err.message ?? "Failed to save brand");
      return false;
    }
  }

  async function saveStep3() {
    const validPersonas = personas.filter((p) => p.name.trim());
    for (const p of validPersonas) {
      try {
        // Map simplified form to API shape
        await api.post("/settings/personas", {
          name: p.name,
          demographics: "",
          psychographics: "",
          painPoints: p.description,
          preferredChannels: p.preferredChannels,
        });
      } catch {
        // May fail if max 3 — ignore
      }
    }
    return true;
  }

  async function triggerSampleCampaign() {
    setGeneratingSample(true);
    try {
      const res = await api.post<{ data: { id: string; campaignId?: string } }>("/goals", {
        type: "awareness",
        brandName: brandName || "My Brand",
        brandDescription: description,
        targetAudience: personas[0]?.description || "general audience",
        timeline: "1_month",
        channels: ["instagram", "linkedin"],
      });
      // Poll for completion (check every 5s, max 2 min)
      const goalId = res.data.id;
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const status = await api.get<{ stage: number; campaignId?: string; campaign?: { id: string } }>(
            `/goals/${goalId}/pipeline-status`,
          );
          const cid = status.campaignId ?? status.campaign?.id;
          if (status.stage >= 4 || cid) {
            clearInterval(poll);
            setSampleCampaignId(cid ?? null);
            setSampleReady(true);
            setGeneratingSample(false);
          }
        } catch {
          // ignore polling errors
        }
        if (attempts >= 24) {
          clearInterval(poll);
          setGeneratingSample(false);
          // Silently fail — user can still create their own campaign
        }
      }, 5000);
    } catch {
      setGeneratingSample(false);
      // Silently fail — sample campaign is a bonus, not critical
    }
  }

  async function handleNext() {
    setError(null);
    setSaving(true);
    try {
      if (step === 2) {
        const ok = await saveStep1And2();
        if (!ok) return;
      }
      if (step === 3) {
        await saveStep3();
      }
      if (step === TOTAL_STEPS) {
        // Mark onboarding complete
        try {
          await api.patch("/settings/org", { onboardingCompleted: true });
        } catch {
          setError("Failed to complete setup. Please try again.");
          return;
        }
        setCompleted(true);
        // Trigger sample campaign generation in background
        triggerSampleCampaign();
        return;
      }
      setStep((s) => s + 1);
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    setStep((s) => Math.max(1, s - 1));
    setError(null);
  }

  function handleConnectChannel(channel: string) {
    // Redirect to the API OAuth endpoint — it will redirect back to settings
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api";
    if (channel === "email") {
      // Email needs manual API key entry — redirect to settings
      window.open("/dashboard/settings?tab=integrations", "_blank");
    } else if (channel === "facebook") {
      window.location.href = `${apiBase}/integrations/meta/connect`;
    } else {
      window.location.href = `${apiBase}/integrations/${channel}/connect`;
    }
  }

  const personaCount = personas.filter((p) => p.name.trim()).length;

  if (completed) {
    return (
      <CompletionScreen
        brandName={brandName}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        personaCount={personaCount}
        connectedChannels={connectedChannels}
        generatingSample={generatingSample}
        sampleReady={sampleReady}
        sampleCampaignId={sampleCampaignId}
        onViewSample={() =>
          sampleCampaignId
            ? router.push(`/dashboard/campaigns/${sampleCampaignId}/summary`)
            : router.push("/dashboard")
        }
        onCreateCampaign={() => router.push("/dashboard?newGoal=1")}
        onGoToDashboard={() => router.push("/dashboard")}
      />
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orion-green to-orion-blue text-xl font-bold text-black">
            ⚡
          </div>
          <h1 className="text-3xl font-bold">Welcome to ORION</h1>
          <p className="mt-2 text-muted-foreground">
            Let's set up your AI marketing OS in {TOTAL_STEPS} quick steps.
          </p>
        </div>

        <StepProgress current={step} total={TOTAL_STEPS} />

        <div className="rounded-xl border border-border bg-card p-6">
          {/* Step 1 — Brand Basics */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Brand Basics</h2>
                <p className="text-sm text-muted-foreground mt-1">Tell ORION about your business.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Business / Brand Name *</label>
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g. Sweet Sarah's Bakery"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tagline</label>
                <input
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="e.g. Fresh baked daily, delivered with love"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  What does your business do? * (2–3 sentences)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="e.g. We're a neighborhood bakery specializing in artisan sourdough and custom cakes. We serve families and local businesses in the Austin area."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Website URL</label>
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yourwebsite.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green"
                />
              </div>
            </div>
          )}

          {/* Step 2 — Visual Identity */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Visual Identity</h2>
                <p className="text-sm text-muted-foreground mt-1">Colors, logo, and brand voice.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Logo URL</label>
                <div className="flex gap-3 items-center">
                  <input
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://yoursite.com/logo.png (optional)"
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green"
                  />
                  {logoUrl && (
                    <img
                      src={logoUrl}
                      alt="logo preview"
                      className="h-10 w-10 rounded object-contain border border-border"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Don't have a hosted logo? No problem — you can add one later in Settings.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Primary Color</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-9 w-9 rounded cursor-pointer border border-border"
                    />
                    <input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Secondary Color</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="h-9 w-9 rounded cursor-pointer border border-border"
                    />
                    <input
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Voice Tone</label>
                <select
                  value={voiceTone}
                  onChange={(e) => setVoiceTone(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green"
                >
                  {[
                    { value: "professional", label: "Professional — polished & trustworthy" },
                    { value: "casual", label: "Casual — friendly & approachable" },
                    { value: "bold", label: "Bold — direct & confident" },
                    { value: "playful", label: "Playful — fun & energetic" },
                    { value: "authoritative", label: "Authoritative — expert & credible" },
                  ].map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 3 — Target Audience (simplified) */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Who Are Your Customers?</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Describe your ideal customer in plain language. ORION uses this to tailor your
                  marketing.
                </p>
              </div>
              {personas.map((p, i) => (
                <div key={i} className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {personas.length > 1 ? `Customer Type ${i + 1}` : "Your Ideal Customer"}
                    </span>
                    {personas.length > 1 && (
                      <button
                        onClick={() => removePersona(i)}
                        className="text-muted-foreground hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <input
                    value={p.name}
                    onChange={(e) => updatePersona(i, "name", e.target.value)}
                    placeholder="Give them a name (e.g. Busy Parents, Local Foodies, Small Business Owners)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green"
                  />
                  <textarea
                    value={p.description}
                    onChange={(e) => updatePersona(i, "description", e.target.value)}
                    rows={3}
                    placeholder="Describe them in your own words. What do they care about? What problems do they have that you solve? (e.g. 'Working parents aged 30-45 who want healthy meals but don't have time to cook. They value convenience and quality ingredients.')"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green resize-none"
                  />
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Where do they hang out online?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {CHANNELS.map((ch) => (
                        <button
                          key={ch}
                          onClick={() => toggleChannel(i, ch)}
                          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                            p.preferredChannels.includes(ch)
                              ? "border-orion-green bg-orion-green/10 text-orion-green"
                              : "border-border text-muted-foreground hover:border-muted-foreground"
                          }`}
                        >
                          {CHANNEL_ICONS[ch]}
                          {ch.charAt(0).toUpperCase() + ch.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {personas.length < 3 && (
                <button
                  onClick={addPersona}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm text-muted-foreground hover:border-orion-green hover:text-orion-green transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Add another customer type
                </button>
              )}
            </div>
          )}

          {/* Step 4 — Connect Social Accounts */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Connect Your Accounts</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Connect your social accounts so ORION can publish content automatically. You can
                  skip this and do it later in Settings.
                </p>
              </div>
              <div className="space-y-2">
                {CONNECTABLE_CHANNELS.map((ch) => {
                  const isConnected = connectedChannels.includes(ch.key) ||
                    (ch.key === "facebook" && (connectedChannels.includes("facebook") || connectedChannels.includes("instagram")));
                  return (
                    <div
                      key={ch.key}
                      className={`flex items-center gap-4 rounded-lg border p-4 transition-colors ${
                        isConnected
                          ? "border-orion-green/30 bg-orion-green/5"
                          : "border-border bg-background hover:border-border/80"
                      }`}
                    >
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
                          isConnected
                            ? "border-orion-green/30 bg-orion-green/10 text-orion-green"
                            : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {ch.icon}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{ch.label}</p>
                        {isConnected && (
                          <p className="text-xs text-orion-green">Connected</p>
                        )}
                      </div>
                      {isConnected ? (
                        <Check className="h-5 w-5 text-orion-green" />
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() => handleConnectChannel(ch.key)}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          Connect
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
              {loadingConnections && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Checking existing connections...
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Without connected accounts, ORION will generate content but simulate publishing.
                You can connect accounts anytime from Settings.
              </p>
            </div>
          )}

          {/* Step 5 — Ready */}
          {step === 5 && (
            <div className="text-center space-y-4 py-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orion-green/10 text-3xl">
                ⚡
              </div>
              <h2 className="text-xl font-semibold">
                ORION is ready for {brandName || "your brand"}!
              </h2>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Everything is configured. When you finish setup, ORION will generate a sample
                campaign automatically so you can see what it can do.
              </p>
              <div className="rounded-lg border border-border bg-muted/20 p-4 text-left text-sm space-y-2">
                <p className="font-medium">What happens next:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-orion-green shrink-0">①</span>
                    ORION generates a sample campaign using your brand info
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orion-green shrink-0">②</span>
                    AI creates strategy, copy, and branded images for multiple channels
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orion-green shrink-0">③</span>
                    You review, edit, and publish — or let ORION handle it on autopilot
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between">
            <div>
              {step > 1 && (
                <Button variant="outline" onClick={handleBack} disabled={saving}>
                  Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step === 4 && (
                <Button
                  variant="ghost"
                  onClick={() => setStep(5)}
                  disabled={saving}
                  className="text-muted-foreground"
                >
                  Skip for now
                </Button>
              )}
              <Button onClick={handleNext} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {step === TOTAL_STEPS ? (
                  <>
                    Launch ORION
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  "Next →"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
