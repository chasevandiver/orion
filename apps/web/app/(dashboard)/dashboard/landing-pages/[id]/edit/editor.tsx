"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Save,
  Loader2,
  ExternalLink,
  Plus,
  Trash2,
  Globe,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface HeroSection {
  headline?: string;
  subheadline?: string;
  ctaText?: string;
  ctaUrl?: string;
}

interface Benefit {
  title?: string;
  description?: string;
}

interface Testimonial {
  quote?: string;
  author?: string;
  company?: string;
}

interface FaqItem {
  question?: string;
  answer?: string;
}

interface CtaSection {
  headline?: string;
  subtext?: string;
  buttonText?: string;
  buttonUrl?: string;
  formFields?: string[];
}

interface LandingPageContent {
  hero?: HeroSection;
  benefits?: Benefit[];
  socialProof?: Testimonial[];
  faq?: FaqItem[];
  cta?: CtaSection;
}

interface PageData {
  id: string;
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  contentJson: Record<string, unknown>;
  shareToken: string | null;
  publishedAt: string | null;
}

// ── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({
  title,
  onAdd,
}: {
  title: string;
  onAdd?: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {onAdd && (
        <Button type="button" variant="ghost" size="sm" onClick={onAdd} className="h-7 gap-1 text-xs">
          <Plus className="h-3 w-3" /> Add
        </Button>
      )}
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

export function LandingPageEditor({ page }: { page: PageData }) {
  const router = useRouter();
  const toast = useAppToast();
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Meta fields
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [metaTitle, setMetaTitle] = useState(page.metaTitle);
  const [metaDescription, setMetaDescription] = useState(page.metaDescription);

  // Content sections
  const content = page.contentJson as LandingPageContent;
  const [hero, setHero] = useState<HeroSection>(content.hero ?? {});
  const [benefits, setBenefits] = useState<Benefit[]>(content.benefits ?? []);
  const [socialProof, setSocialProof] = useState<Testimonial[]>(content.socialProof ?? []);
  const [faq, setFaq] = useState<FaqItem[]>(content.faq ?? []);
  const [cta, setCta] = useState<CtaSection>(content.cta ?? {});

  const buildContentJson = useCallback((): LandingPageContent => ({
    hero,
    benefits: benefits.filter((b) => b.title || b.description),
    socialProof: socialProof.filter((s) => s.quote),
    faq: faq.filter((f) => f.question || f.answer),
    cta,
  }), [hero, benefits, socialProof, faq, cta]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.patch(`/landing-pages/${page.id}`, {
        title,
        slug,
        metaTitle: metaTitle || undefined,
        metaDescription: metaDescription || undefined,
        contentJson: buildContentJson(),
      });
      toast.success("Landing page saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      // Save first
      await api.patch(`/landing-pages/${page.id}`, {
        title,
        slug,
        metaTitle: metaTitle || undefined,
        metaDescription: metaDescription || undefined,
        contentJson: buildContentJson(),
      });
      // Then publish
      await api.post(`/landing-pages/${page.id}/publish`, {});
      toast.success("Landing page published");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  }

  function updateBenefit(index: number, field: keyof Benefit, value: string) {
    setBenefits((prev) => prev.map((b, i) => i === index ? { ...b, [field]: value } : b));
  }

  function updateTestimonial(index: number, field: keyof Testimonial, value: string) {
    setSocialProof((prev) => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  }

  function updateFaq(index: number, field: keyof FaqItem, value: string) {
    setFaq((prev) => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/landing-pages"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Edit Landing Page</h1>
            <p className="text-xs text-muted-foreground">
              {page.publishedAt ? "Published" : "Draft"}
              {page.shareToken && (
                <>
                  {" · "}
                  <Link href={`/share/${page.shareToken}`} target="_blank" className="text-orion-green hover:underline inline-flex items-center gap-0.5">
                    Preview <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!page.publishedAt && (
            <Button
              variant="outline"
              onClick={handlePublish}
              disabled={publishing || saving}
              className="gap-2"
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              Publish
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving} className="gap-2 bg-orion-green text-black hover:bg-orion-green-dim">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>

      {/* Meta Fields */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <SectionHeader title="Page Settings" />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Meta Title <span className="text-muted-foreground text-xs">({metaTitle.length}/60)</span></Label>
          <Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} maxLength={60} placeholder="SEO title" />
        </div>
        <div className="space-y-1.5">
          <Label>Meta Description <span className="text-muted-foreground text-xs">({metaDescription.length}/155)</span></Label>
          <Textarea value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} maxLength={155} rows={2} placeholder="SEO description" />
        </div>
      </div>

      {/* Hero Section */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <SectionHeader title="Hero Section" />
        <div className="space-y-1.5">
          <Label>Headline</Label>
          <Input value={hero.headline ?? ""} onChange={(e) => setHero((h) => ({ ...h, headline: e.target.value }))} placeholder="Main headline" />
        </div>
        <div className="space-y-1.5">
          <Label>Subheadline</Label>
          <Textarea value={hero.subheadline ?? ""} onChange={(e) => setHero((h) => ({ ...h, subheadline: e.target.value }))} rows={2} placeholder="Supporting text" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>CTA Button Text</Label>
            <Input value={hero.ctaText ?? ""} onChange={(e) => setHero((h) => ({ ...h, ctaText: e.target.value }))} placeholder="Get Started" />
          </div>
          <div className="space-y-1.5">
            <Label>CTA Button URL</Label>
            <Input value={hero.ctaUrl ?? ""} onChange={(e) => setHero((h) => ({ ...h, ctaUrl: e.target.value }))} placeholder="https://..." />
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <SectionHeader
          title={`Benefits (${benefits.length})`}
          onAdd={() => setBenefits((prev) => [...prev, { title: "", description: "" }])}
        />
        {benefits.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No benefits added yet.</p>
        )}
        {benefits.map((benefit, i) => (
          <div key={i} className="flex gap-3 items-start">
            <div className="flex-1 grid grid-cols-2 gap-3">
              <Input value={benefit.title ?? ""} onChange={(e) => updateBenefit(i, "title", e.target.value)} placeholder="Benefit title" />
              <Input value={benefit.description ?? ""} onChange={(e) => updateBenefit(i, "description", e.target.value)} placeholder="Description" />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
              onClick={() => setBenefits((prev) => prev.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {/* Testimonials */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <SectionHeader
          title={`Testimonials (${socialProof.length})`}
          onAdd={() => setSocialProof((prev) => [...prev, { quote: "", author: "", company: "" }])}
        />
        {socialProof.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No testimonials added yet.</p>
        )}
        {socialProof.map((item, i) => (
          <div key={i} className="space-y-2 rounded-md border border-border/50 bg-muted/30 p-3">
            <div className="flex items-start gap-2">
              <Textarea value={item.quote ?? ""} onChange={(e) => updateTestimonial(i, "quote", e.target.value)} rows={2} placeholder="Quote text" className="flex-1" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                onClick={() => setSocialProof((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input value={item.author ?? ""} onChange={(e) => updateTestimonial(i, "author", e.target.value)} placeholder="Author name" />
              <Input value={item.company ?? ""} onChange={(e) => updateTestimonial(i, "company", e.target.value)} placeholder="Company" />
            </div>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <SectionHeader
          title={`FAQ (${faq.length})`}
          onAdd={() => setFaq((prev) => [...prev, { question: "", answer: "" }])}
        />
        {faq.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No FAQ items added yet.</p>
        )}
        {faq.map((item, i) => (
          <div key={i} className="flex gap-3 items-start">
            <div className="flex-1 space-y-2">
              <Input value={item.question ?? ""} onChange={(e) => updateFaq(i, "question", e.target.value)} placeholder="Question" />
              <Textarea value={item.answer ?? ""} onChange={(e) => updateFaq(i, "answer", e.target.value)} rows={2} placeholder="Answer" />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
              onClick={() => setFaq((prev) => prev.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {/* Final CTA Section */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <SectionHeader title="Final CTA Section" />
        <div className="space-y-1.5">
          <Label>Headline</Label>
          <Input value={cta.headline ?? ""} onChange={(e) => setCta((c) => ({ ...c, headline: e.target.value }))} placeholder="Ready to get started?" />
        </div>
        <div className="space-y-1.5">
          <Label>Subtext</Label>
          <Textarea value={cta.subtext ?? ""} onChange={(e) => setCta((c) => ({ ...c, subtext: e.target.value }))} rows={2} placeholder="Supporting copy" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Button Text</Label>
            <Input value={cta.buttonText ?? ""} onChange={(e) => setCta((c) => ({ ...c, buttonText: e.target.value }))} placeholder="Sign Up Now" />
          </div>
          <div className="space-y-1.5">
            <Label>Button URL</Label>
            <Input value={cta.buttonUrl ?? ""} onChange={(e) => setCta((c) => ({ ...c, buttonUrl: e.target.value }))} placeholder="https://..." />
          </div>
        </div>
      </div>
    </div>
  );
}
