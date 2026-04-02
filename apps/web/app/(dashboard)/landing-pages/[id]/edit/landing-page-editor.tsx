"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Globe,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  Eye,
  Pencil,
  Server,
} from "lucide-react";
import { LandingPagePreview, type LPContent } from "./landing-page-preview";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LandingPage {
  id: string;
  title: string;
  slug: string;
  contentJson: Record<string, unknown>;
  metaTitle?: string | null;
  metaDescription?: string | null;
  shareToken?: string | null;
  publishedAt?: Date | string | null;
  goal?: { type: string; brandName: string } | null;
  campaign?: { id: string; name: string } | null;
}

interface Props {
  page: LandingPage;
}

// ── Hook: auto-save ───────────────────────────────────────────────────────────

function useAutoSave(id: string) {
  const timer = useRef<NodeJS.Timeout | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const save = useCallback(
    async (contentJson: LPContent, meta: { title?: string; metaTitle?: string; metaDescription?: string }) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        setStatus("saving");
        try {
          const res = await fetch(`/api/landing-pages/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contentJson, ...meta }),
          });
          if (!res.ok) throw new Error("Save failed");
          setStatus("saved");
          setTimeout(() => setStatus("idle"), 2000);
        } catch {
          setStatus("error");
        }
      }, 900);
    },
    [id],
  );

  return { save, status };
}

// ── Small UI helpers ──────────────────────────────────────────────────────────

function SectionShell({
  title,
  onRegenerate,
  regenerating,
  children,
}: {
  title: string;
  onRegenerate: () => void;
  regenerating: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        <button
          onClick={onRegenerate}
          disabled={regenerating}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {regenerating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Regenerate
        </button>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const cls =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none";
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {multiline ? (
        <textarea
          className={cls}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          className={cls}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function LandingPageEditor({ page }: Props) {
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────────────────────

  const raw = (page.contentJson ?? {}) as LPContent;
  const [content, setContent] = useState<LPContent>(raw);
  const [title, setTitle] = useState(page.title);
  const [metaTitle, setMetaTitle] = useState(page.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(page.metaDescription ?? "");
  const [shareToken, setShareToken] = useState(page.shareToken ?? null);
  const [publishedAt, setPublishedAt] = useState<string | null>(
    page.publishedAt ? String(page.publishedAt) : null,
  );
  const [activePanel, setActivePanel] = useState<"editor" | "preview">("editor");
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({});
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [customDomain, setCustomDomain] = useState<string>(
    (raw._customDomain as string) ?? "",
  );
  const [showDnsInstructions, setShowDnsInstructions] = useState(false);
  const { save, status: saveStatus } = useAutoSave(page.id);

  // ── Derived ───────────────────────────────────────────────────────────────

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = shareToken ? `${appUrl}/share/${shareToken}` : null;
  const brandContext = page.goal?.brandName ?? page.campaign?.name ?? title;
  const goalType = page.goal?.type ?? "lead_generation";

  // ── Update helpers ────────────────────────────────────────────────────────

  const update = useCallback(
    (patch: Partial<LPContent>) => {
      setContent((prev) => {
        const next = { ...prev, ...patch };
        save(next, { title, metaTitle, metaDescription });
        return next;
      });
    },
    [save, title, metaTitle, metaDescription],
  );

  const updateMeta = useCallback(
    (patch: { title?: string; metaTitle?: string; metaDescription?: string }) => {
      if (patch.title !== undefined) setTitle(patch.title);
      if (patch.metaTitle !== undefined) setMetaTitle(patch.metaTitle);
      if (patch.metaDescription !== undefined) setMetaDescription(patch.metaDescription);
      save(content, { title, metaTitle, metaDescription, ...patch });
    },
    [content, save, title, metaTitle, metaDescription],
  );

  // ── Regenerate section ────────────────────────────────────────────────────

  const regenerateSection = async (section: "hero" | "benefits" | "socialProof" | "faq" | "cta") => {
    setRegenerating((r) => ({ ...r, [section]: true }));
    try {
      const res = await fetch("/api/landing-pages/generate-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section,
          brandName: brandContext,
          goalType,
          brandDescription: page.campaign?.name,
        }),
      });
      if (!res.ok) throw new Error("Regeneration failed");
      const json = await res.json();
      const { content: sectionContent } = json.data;
      update({ [section === "socialProof" ? "socialProof" : section]: sectionContent });
    } catch {
      alert("Regeneration failed. Please try again.");
    } finally {
      setRegenerating((r) => ({ ...r, [section]: false }));
    }
  };

  // ── Publish ───────────────────────────────────────────────────────────────

  const publish = async () => {
    setPublishing(true);
    try {
      // Save latest content first
      const saveRes = await fetch(`/api/landing-pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentJson: { ...content, _customDomain: customDomain || undefined },
          title,
          metaTitle: metaTitle || undefined,
          metaDescription: metaDescription || undefined,
        }),
      });
      if (!saveRes.ok) throw new Error("Save failed");

      const pubRes = await fetch(`/api/landing-pages/${page.id}/publish`, {
        method: "POST",
      });
      if (!pubRes.ok) throw new Error("Publish failed");
      const { data } = await pubRes.json();
      setShareToken(data.shareToken);
      setPublishedAt(data.publishedAt);
    } catch {
      alert("Publish failed. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-background shrink-0 flex-wrap gap-y-2">
        <Link
          href="/landing-pages"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Pages
        </Link>

        <input
          className="flex-1 min-w-0 text-sm font-semibold bg-transparent border-none outline-none focus:ring-0 truncate"
          value={title}
          onChange={(e) => updateMeta({ title: e.target.value })}
        />

        {/* Save status */}
        <span className="text-xs text-muted-foreground shrink-0">
          {saveStatus === "saving" && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Saving…</span>}
          {saveStatus === "saved" && <span className="flex items-center gap-1 text-orion-green"><Check className="h-3 w-3" />Saved</span>}
          {saveStatus === "error" && <span className="text-destructive">Save failed</span>}
        </span>

        {/* Mobile preview toggle */}
        <div className="flex lg:hidden border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setActivePanel("editor")}
            className={`px-2.5 py-1 text-xs ${activePanel === "editor" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setActivePanel("preview")}
            className={`px-2.5 py-1 text-xs ${activePanel === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Actions */}
        {shareToken ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:flex items-center gap-1 text-xs font-medium text-orion-green">
              <Globe className="h-3 w-3" />
              Published
            </span>
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-orion-green" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy Link"}
            </button>
            <a
              href={shareUrl!}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View Live
            </a>
          </div>
        ) : (
          <button
            onClick={publish}
            disabled={publishing}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
          >
            {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
            Publish
          </button>
        )}
      </div>

      {/* Body: split screen */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Editor panel ── */}
        <div
          className={`w-full lg:w-[420px] shrink-0 overflow-y-auto border-r border-border bg-background ${activePanel === "preview" ? "hidden lg:block" : "block"}`}
        >
          <div className="p-4 space-y-4">

            {/* Page metadata */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Page Settings</span>
              </div>
              <div className="p-4 space-y-3">
                <Field label="Meta Title" value={metaTitle} onChange={(v) => updateMeta({ metaTitle: v })} placeholder="60 chars max" />
                <Field label="Meta Description" value={metaDescription} onChange={(v) => updateMeta({ metaDescription: v })} placeholder="155 chars max" multiline />
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Brand Accent Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={content._brandColor as string || "#00ff88"}
                      onChange={(e) => update({ _brandColor: e.target.value })}
                      className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent p-0.5"
                    />
                    <input
                      type="text"
                      value={content._brandColor as string || "#00ff88"}
                      onChange={(e) => {
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) {
                          update({ _brandColor: e.target.value });
                        }
                      }}
                      className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Hero */}
            <SectionShell
              title="Hero"
              onRegenerate={() => regenerateSection("hero")}
              regenerating={!!regenerating.hero}
            >
              <Field
                label="Headline"
                value={content.hero?.headline ?? ""}
                onChange={(v) => update({ hero: { ...content.hero, headline: v } })}
                placeholder="Your main headline"
              />
              <Field
                label="Subheadline"
                value={content.hero?.subheadline ?? ""}
                onChange={(v) => update({ hero: { ...content.hero, subheadline: v } })}
                multiline
                placeholder="Supporting copy below the headline"
              />
              <Field
                label="CTA Button Text"
                value={content.hero?.ctaText ?? ""}
                onChange={(v) => update({ hero: { ...content.hero, ctaText: v } })}
                placeholder="Get Started Free"
              />
              <Field
                label="CTA URL"
                value={content.hero?.ctaUrl ?? ""}
                onChange={(v) => update({ hero: { ...content.hero, ctaUrl: v } })}
                placeholder="#cta-form or https://…"
              />
            </SectionShell>

            {/* Benefits */}
            <SectionShell
              title="Benefits"
              onRegenerate={() => regenerateSection("benefits")}
              regenerating={!!regenerating.benefits}
            >
              {(content.benefits ?? []).map((b, i) => (
                <div key={i} className="rounded-md border border-border p-3 space-y-2 relative">
                  <button
                    onClick={() =>
                      update({
                        benefits: (content.benefits ?? []).filter((_, idx) => idx !== i),
                      })
                    }
                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono">#{i + 1}</span>
                    <input
                      className="w-16 rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring text-center"
                      value={b.icon ?? ""}
                      onChange={(e) => {
                        const next = [...(content.benefits ?? [])];
                        next[i] = { ...next[i], icon: e.target.value };
                        update({ benefits: next });
                      }}
                      placeholder="Icon"
                    />
                  </div>
                  <Field
                    label="Title"
                    value={b.title ?? ""}
                    onChange={(v) => {
                      const next = [...(content.benefits ?? [])];
                      next[i] = { ...next[i], title: v };
                      update({ benefits: next });
                    }}
                  />
                  <Field
                    label="Description"
                    value={b.description ?? ""}
                    onChange={(v) => {
                      const next = [...(content.benefits ?? [])];
                      next[i] = { ...next[i], description: v };
                      update({ benefits: next });
                    }}
                    multiline
                  />
                </div>
              ))}
              <button
                onClick={() =>
                  update({
                    benefits: [...(content.benefits ?? []), { icon: "✨", title: "", description: "" }],
                  })
                }
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add benefit
              </button>
            </SectionShell>

            {/* Social Proof */}
            <SectionShell
              title="Social Proof"
              onRegenerate={() => regenerateSection("socialProof")}
              regenerating={!!regenerating.socialProof}
            >
              {(content.socialProof ?? []).map((s, i) => (
                <div key={i} className="rounded-md border border-border p-3 space-y-2 relative">
                  <button
                    onClick={() =>
                      update({ socialProof: (content.socialProof ?? []).filter((_, idx) => idx !== i) })
                    }
                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <Field
                    label="Quote"
                    value={s.quote ?? ""}
                    onChange={(v) => {
                      const next = [...(content.socialProof ?? [])];
                      next[i] = { ...next[i], quote: v };
                      update({ socialProof: next });
                    }}
                    multiline
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label="Author"
                      value={s.author ?? ""}
                      onChange={(v) => {
                        const next = [...(content.socialProof ?? [])];
                        next[i] = { ...next[i], author: v };
                        update({ socialProof: next });
                      }}
                    />
                    <Field
                      label="Company"
                      value={s.company ?? ""}
                      onChange={(v) => {
                        const next = [...(content.socialProof ?? [])];
                        next[i] = { ...next[i], company: v };
                        update({ socialProof: next });
                      }}
                    />
                  </div>
                </div>
              ))}
              <button
                onClick={() =>
                  update({
                    socialProof: [
                      ...(content.socialProof ?? []),
                      { quote: "", author: "", company: "" },
                    ],
                  })
                }
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add testimonial
              </button>
            </SectionShell>

            {/* FAQ */}
            <SectionShell
              title="FAQ"
              onRegenerate={() => regenerateSection("faq")}
              regenerating={!!regenerating.faq}
            >
              {(content.faq ?? []).map((f, i) => (
                <div key={i} className="rounded-md border border-border p-3 space-y-2 relative">
                  <button
                    onClick={() =>
                      update({ faq: (content.faq ?? []).filter((_, idx) => idx !== i) })
                    }
                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <Field
                    label="Question"
                    value={f.question ?? ""}
                    onChange={(v) => {
                      const next = [...(content.faq ?? [])];
                      next[i] = { ...next[i], question: v };
                      update({ faq: next });
                    }}
                  />
                  <Field
                    label="Answer"
                    value={f.answer ?? ""}
                    onChange={(v) => {
                      const next = [...(content.faq ?? [])];
                      next[i] = { ...next[i], answer: v };
                      update({ faq: next });
                    }}
                    multiline
                  />
                </div>
              ))}
              <button
                onClick={() =>
                  update({ faq: [...(content.faq ?? []), { question: "", answer: "" }] })
                }
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add question
              </button>
            </SectionShell>

            {/* CTA */}
            <SectionShell
              title="Call to Action"
              onRegenerate={() => regenerateSection("cta")}
              regenerating={!!regenerating.cta}
            >
              <Field
                label="Headline"
                value={content.cta?.headline ?? ""}
                onChange={(v) => update({ cta: { ...content.cta, headline: v } })}
                placeholder="Ready to get started?"
              />
              <Field
                label="Subtext"
                value={content.cta?.subtext ?? ""}
                onChange={(v) => update({ cta: { ...content.cta, subtext: v } })}
                multiline
                placeholder="Supporting copy"
              />
              <Field
                label="Button Text"
                value={content.cta?.buttonText ?? ""}
                onChange={(v) => update({ cta: { ...content.cta, buttonText: v } })}
                placeholder="Get Started Free"
              />
              <Field
                label="Button URL (optional)"
                value={content.cta?.buttonUrl ?? ""}
                onChange={(v) => update({ cta: { ...content.cta, buttonUrl: v } })}
                placeholder="https://… (leave blank for lead capture form)"
              />
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Form Fields</label>
                {(content.cta?.formFields ?? []).map((field, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={field}
                      onChange={(e) => {
                        const next = [...(content.cta?.formFields ?? [])];
                        next[i] = e.target.value;
                        update({ cta: { ...content.cta, formFields: next } });
                      }}
                    />
                    <button
                      onClick={() => {
                        const next = (content.cta?.formFields ?? []).filter((_, idx) => idx !== i);
                        update({ cta: { ...content.cta, formFields: next } });
                      }}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    update({
                      cta: {
                        ...content.cta,
                        formFields: [...(content.cta?.formFields ?? []), ""],
                      },
                    })
                  }
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add field
                </button>
              </div>
            </SectionShell>

            {/* Custom Domain */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom Domain</span>
                <button
                  onClick={() => setShowDnsInstructions((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <Server className="h-3 w-3" />
                  DNS Setup
                </button>
              </div>
              <div className="p-4 space-y-3">
                <Field
                  label="Custom Domain"
                  value={customDomain}
                  onChange={(v) => {
                    setCustomDomain(v);
                    update({ _customDomain: v || undefined });
                  }}
                  placeholder="pages.yourdomain.com"
                />
                {showDnsInstructions && (
                  <div className="rounded-md bg-muted/60 border border-border p-3 space-y-2 text-xs">
                    <p className="font-semibold">DNS Configuration</p>
                    <p className="text-muted-foreground">Add a CNAME record pointing to your Orion app domain:</p>
                    <div className="font-mono bg-background rounded border border-border px-3 py-2 space-y-1">
                      <div className="flex gap-4">
                        <span className="text-muted-foreground w-16">Type</span>
                        <span>CNAME</span>
                      </div>
                      <div className="flex gap-4">
                        <span className="text-muted-foreground w-16">Name</span>
                        <span>{customDomain || "pages"}</span>
                      </div>
                      <div className="flex gap-4">
                        <span className="text-muted-foreground w-16">Value</span>
                        <span className="text-orion-green break-all">
                          {typeof window !== "undefined" ? window.location.hostname : "your-app.vercel.app"}
                        </span>
                      </div>
                    </div>
                    <p className="text-muted-foreground">DNS changes can take up to 48 hours to propagate. Verification coming soon.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Publish info */}
            {shareToken && (
              <div className="rounded-lg border border-orion-green/30 bg-orion-green/5 p-4 space-y-2">
                <p className="text-xs font-semibold text-orion-green flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  This page is live
                </p>
                <p className="text-xs text-muted-foreground break-all">{shareUrl}</p>
                <div className="flex gap-2">
                  <button
                    onClick={copyLink}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
                  >
                    {copied ? <Check className="h-3 w-3 text-orion-green" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied!" : "Copy Link"}
                  </button>
                  <a
                    href={shareUrl!}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Live
                  </a>
                </div>
              </div>
            )}

            <div className="h-6" />
          </div>
        </div>

        {/* ── Preview panel ── */}
        <div
          className={`flex-1 overflow-y-auto bg-gray-50 dark:bg-zinc-900 ${activePanel === "editor" ? "hidden lg:block" : "block"}`}
        >
          {/* Sticky preview label */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b border-border bg-background/80 backdrop-blur-sm text-xs text-muted-foreground">
            <span>Live Preview</span>
            <span className="text-[10px]">Updates as you type</span>
          </div>
          <div className="min-h-full bg-white dark:bg-white shadow-sm">
            <LandingPagePreview content={content} title={title} />
          </div>
        </div>
      </div>
    </div>
  );
}
