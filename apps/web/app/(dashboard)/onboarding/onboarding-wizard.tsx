"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, Plus, Trash2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PersonaForm {
  name: string;
  demographics: string;
  psychographics: string;
  painPoints: string;
  preferredChannels: string[];
}

const CHANNELS = ["linkedin", "twitter", "instagram", "facebook", "tiktok", "email", "blog"];

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
            <div className={`h-0.5 w-8 ${i + 1 < current ? "bg-orion-green" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main wizard ────────────────────────────────────────────────────────────────

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 & 2 — Brand
  const [brandName, setBrandName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#10b981");
  const [secondaryColor, setSecondaryColor] = useState("#3b82f6");
  const [voiceTone, setVoiceTone] = useState("professional");

  // Step 3 — Personas
  const [personas, setPersonas] = useState<PersonaForm[]>([
    { name: "", demographics: "", psychographics: "", painPoints: "", preferredChannels: [] },
  ]);

  function addPersona() {
    if (personas.length >= 3) return;
    setPersonas((p) => [...p, { name: "", demographics: "", psychographics: "", painPoints: "", preferredChannels: [] }]);
  }

  function removePersona(i: number) {
    setPersonas((p) => p.filter((_, idx) => idx !== i));
  }

  function updatePersona(i: number, field: keyof PersonaForm, value: string | string[]) {
    setPersonas((p) => p.map((persona, idx) => idx === i ? { ...persona, [field]: value } : persona));
  }

  function toggleChannel(personaIdx: number, ch: string) {
    const p = personas[personaIdx]!;
    const has = p.preferredChannels.includes(ch);
    updatePersona(personaIdx, "preferredChannels", has ? p.preferredChannels.filter((c) => c !== ch) : [...p.preferredChannels, ch]);
  }

  async function saveStep1And2() {
    if (!brandName.trim() || !description.trim()) {
      setError("Brand name and description are required.");
      return false;
    }
    try {
      // Try PATCH first (update existing brand), fall back to POST
      const existing = await api.get<{ data: any[] }>("/brands").catch(() => ({ data: [] }));
      const activeBrand = existing.data?.[0];
      if (activeBrand) {
        await api.patch(`/brands/${activeBrand.id}`, {
          name: brandName, tagline, description, logoUrl, websiteUrl: website,
          primaryColor, voiceTone,
        });
      } else {
        await api.post("/brands", {
          name: brandName, tagline, description, logoUrl, websiteUrl: website,
          primaryColor, voiceTone,
        });
      }
      // Also update org brand colors
      await api.patch("/settings/org", {
        brandPrimaryColor: primaryColor,
        brandSecondaryColor: secondaryColor,
        logoUrl,
      }).catch(() => {}); // best-effort
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
        await api.post("/settings/personas", p);
      } catch {
        // May fail if max 3 — ignore
      }
    }
    return true;
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
      if (step === 4) {
        // Mark onboarding complete
        try {
          await api.patch("/settings/org", { onboardingCompleted: true });
        } catch {
          setError("Failed to complete setup. Please try again.");
          return;
        }
        router.push("/dashboard");
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orion-green to-orion-blue text-xl font-bold text-black">
            ⚡
          </div>
          <h1 className="text-3xl font-bold">Welcome to ORION</h1>
          <p className="mt-2 text-muted-foreground">Let's set up your AI marketing OS in 4 quick steps.</p>
        </div>

        <StepProgress current={step} total={4} />

        <div className="rounded-xl border border-border bg-card p-6">
          {/* Step 1 — Brand Basics */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Brand Basics</h2>
                <p className="text-sm text-muted-foreground mt-1">Tell ORION about your brand.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Brand Name *</label>
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tagline</label>
                <input
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="e.g. Built for speed, designed for teams"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Brand Description * (2–3 sentences)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Describe what your brand does, who it serves, and what makes it unique."
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
                    placeholder="https://yoursite.com/logo.png"
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green"
                  />
                  {logoUrl && (
                    <img src={logoUrl} alt="logo preview" className="h-10 w-10 rounded object-contain border border-border" onError={(e) => (e.currentTarget.style.display = "none")} />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Primary Color</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-9 w-9 rounded cursor-pointer border border-border" />
                    <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Secondary Color</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="h-9 w-9 rounded cursor-pointer border border-border" />
                    <input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green" />
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
                  {["professional", "casual", "bold", "playful", "authoritative"].map((v) => (
                    <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 3 — Target Audience */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Target Audience</h2>
                <p className="text-sm text-muted-foreground mt-1">Add up to 3 audience personas.</p>
              </div>
              {personas.map((p, i) => (
                <div key={i} className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Persona {i + 1}</span>
                    {personas.length > 1 && (
                      <button onClick={() => removePersona(i)} className="text-muted-foreground hover:text-red-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <input
                    value={p.name}
                    onChange={(e) => updatePersona(i, "name", e.target.value)}
                    placeholder="Name (e.g. Marketing Manager)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green"
                  />
                  <input
                    value={p.demographics}
                    onChange={(e) => updatePersona(i, "demographics", e.target.value)}
                    placeholder="Demographics (e.g. 30-45, B2B SaaS companies)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green"
                  />
                  <input
                    value={p.psychographics}
                    onChange={(e) => updatePersona(i, "psychographics", e.target.value)}
                    placeholder="Psychographics (e.g. Values ROI, data-driven)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green"
                  />
                  <input
                    value={p.painPoints}
                    onChange={(e) => updatePersona(i, "painPoints", e.target.value)}
                    placeholder="Pain points (e.g. Too much manual work, no time)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-orion-green"
                  />
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Preferred channels:</p>
                    <div className="flex flex-wrap gap-2">
                      {CHANNELS.map((ch) => (
                        <button
                          key={ch}
                          onClick={() => toggleChannel(i, ch)}
                          className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                            p.preferredChannels.includes(ch)
                              ? "border-orion-green bg-orion-green/10 text-orion-green"
                              : "border-border text-muted-foreground hover:border-muted-foreground"
                          }`}
                        >
                          {ch}
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
                  Add persona
                </button>
              )}
            </div>
          )}

          {/* Step 4 — Ready */}
          {step === 4 && (
            <div className="text-center space-y-4 py-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orion-green/10 text-3xl">
                ⚡
              </div>
              <h2 className="text-xl font-semibold">ORION is ready for {brandName || "your brand"}!</h2>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Your brand profile, visual identity, and audience personas are saved. ORION will use
                this context every time you run a campaign pipeline — automatically.
              </p>
              <div className="rounded-lg border border-border bg-muted/20 p-4 text-left text-sm space-y-2">
                <p className="font-medium">What happens when you create a goal:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>① ORION builds a strategy tailored to your brand and personas</li>
                  <li>② AI generates multi-channel content with A/B variants</li>
                  <li>③ Stock photos are sourced and composited with your branding</li>
                  <li>④ Posts are auto-scheduled at optimal send times</li>
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
            <Button onClick={handleNext} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {step === 4 ? "Create My First Campaign →" : "Next →"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
