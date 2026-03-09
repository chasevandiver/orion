"use client";

import { useState, useRef, useCallback } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Save, CheckCircle2, Package, Camera, Upload, Info } from "lucide-react";

interface Product {
  name: string;
  description: string;
}

interface Brand {
  id: string;
  name: string;
  tagline?: string;
  description?: string;
  logoUrl?: string;
  websiteUrl?: string;
  primaryColor?: string;
  voiceTone?: string;
  targetAudience?: string;
  products?: Product[];
  isActive: boolean;
  createdAt: string;
}

const VOICE_TONES = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual & Friendly" },
  { value: "bold", label: "Bold & Direct" },
  { value: "playful", label: "Playful & Fun" },
  { value: "authoritative", label: "Authoritative & Expert" },
];

interface AutoFillData {
  name: string;
  description: string;
  targetAudience: string;
}

export function BrandKit({
  initialBrand,
  autoFillData,
}: {
  initialBrand: Brand | null;
  autoFillData?: AutoFillData | null;
}) {
  const [brand, setBrand] = useState<Brand | null>(initialBrand);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAutoFillNotice, setShowAutoFillNotice] = useState(!!autoFillData);

  const [form, setForm] = useState({
    name: initialBrand?.name || autoFillData?.name || "",
    tagline: initialBrand?.tagline ?? "",
    description: initialBrand?.description || autoFillData?.description || "",
    logoUrl: initialBrand?.logoUrl ?? "",
    websiteUrl: initialBrand?.websiteUrl ?? "",
    primaryColor: initialBrand?.primaryColor ?? "#10b981",
    voiceTone: initialBrand?.voiceTone ?? "professional",
    targetAudience: initialBrand?.targetAudience || autoFillData?.targetAudience || "",
    products: (initialBrand?.products ?? []) as Product[],
  });

  // Logo upload state
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoDragOver, setLogoDragOver] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoFile = useCallback(async (file: File) => {
    setLogoError(null);
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("File must be under 2 MB");
      return;
    }
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setLogoError("Only PNG, JPEG, and WebP are allowed");
      return;
    }
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const response = await fetch("/api/organizations/logo", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any).error ?? `Upload failed: ${response.status}`);
      }
      const { data } = (await response.json()) as { data: { logoUrl: string } };
      setForm((f) => ({ ...f, logoUrl: data.logoUrl }));
    } catch (err: any) {
      setLogoError(err.message ?? "Upload failed");
    } finally {
      setLogoUploading(false);
    }
  }, []);

  function handleRemoveLogo() {
    setLogoError(null);
    setForm((f) => ({ ...f, logoUrl: "" }));
  }

  function addProduct() {
    setForm((f) => ({ ...f, products: [...f.products, { name: "", description: "" }] }));
  }

  function removeProduct(idx: number) {
    setForm((f) => ({ ...f, products: f.products.filter((_, i) => i !== idx) }));
  }

  function updateProduct(idx: number, field: keyof Product, value: string) {
    setForm((f) => ({
      ...f,
      products: f.products.map((p, i) => (i === idx ? { ...p, [field]: value } : p)),
    }));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const payload = {
        ...form,
        products: form.products.filter((p) => p.name.trim()),
      };

      let res: { data: Brand };
      if (brand) {
        res = await api.patch<{ data: Brand }>(`/brands/${brand.id}`, payload);
      } else {
        res = await api.post<{ data: Brand }>("/brands", payload);
      }
      setBrand(res.data);
      setShowAutoFillNotice(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message ?? "Failed to save brand");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {showAutoFillNotice && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            Auto-filled from your most recent goal — click Save to keep these.
          </span>
          <button
            type="button"
            onClick={() => setShowAutoFillNotice(false)}
            className="ml-2 shrink-0 text-blue-400/60 hover:text-blue-400"
          >
            ✕
          </button>
        </div>
      )}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        {/* Core identity */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Brand Name *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Acme Corp"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tagline</Label>
            <Input
              value={form.tagline}
              onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
              placeholder="Work smarter, not harder"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Brand Description</Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="What does your brand do, who is it for, and what makes it unique?"
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Website URL</Label>
          <Input
            type="url"
            value={form.websiteUrl}
            onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
            placeholder="https://acme.com"
          />
        </div>

        {/* Logo upload */}
        <div className="space-y-1.5">
          <Label>Logo</Label>
          <div className="flex items-start gap-4">
            {/* Preview / drop target */}
            <div
              className={`relative flex h-[150px] w-[150px] shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 transition-colors ${
                logoDragOver
                  ? "border-orion-green bg-orion-green/5"
                  : "border-dashed border-border bg-muted/30"
              }`}
              onClick={() => logoFileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setLogoDragOver(true); }}
              onDragLeave={() => setLogoDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setLogoDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) handleLogoFile(file);
              }}
            >
              {logoUploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : form.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.logoUrl}
                  alt="Logo preview"
                  className="h-full w-full rounded-lg object-contain p-2"
                />
              ) : (
                <Camera className="h-8 w-8 text-muted-foreground/50" />
              )}
            </div>

            {/* Upload controls */}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => logoFileInputRef.current?.click()}
                disabled={logoUploading}
              >
                <Upload className="h-3.5 w-3.5" />
                {form.logoUrl ? "Replace logo" : "Upload Logo"}
              </Button>
              {form.logoUrl && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="text-left text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                >
                  Remove logo
                </button>
              )}
              <p className="text-xs text-muted-foreground">PNG, JPG, WebP · max 2 MB</p>
              <p className="text-xs text-muted-foreground">Drag &amp; drop onto the preview</p>
            </div>
          </div>
          {logoError && (
            <p className="mt-1 text-xs text-destructive">{logoError}</p>
          )}
          {/* Hidden file input */}
          <input
            ref={logoFileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleLogoFile(file);
              e.target.value = "";
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Brand Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent p-1"
              />
              <Input
                value={form.primaryColor}
                onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                placeholder="#10b981"
                className="font-mono text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Voice & Tone</Label>
            <Select value={form.voiceTone} onValueChange={(v) => setForm((f) => ({ ...f, voiceTone: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICE_TONES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Target Audience</Label>
          <Input
            value={form.targetAudience}
            onChange={(e) => setForm((f) => ({ ...f, targetAudience: e.target.value }))}
            placeholder="Marketing managers at B2B SaaS companies, 25-45, tech-savvy"
          />
        </div>
      </div>

      {/* Products / Services */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Products & Services</h3>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={addProduct}>
            <Plus className="h-3.5 w-3.5" />
            Add Product
          </Button>
        </div>

        {form.products.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Add your products or services so the AI can generate targeted content for each one.
          </div>
        ) : (
          <div className="space-y-3">
            {form.products.map((product, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-2">
                    <Input
                      value={product.name}
                      onChange={(e) => updateProduct(idx, "name", e.target.value)}
                      placeholder="Product name"
                      className="font-medium"
                    />
                    <Textarea
                      value={product.description}
                      onChange={(e) => updateProduct(idx, "description", e.target.value)}
                      placeholder="What it does, key features, target customer, pricing..."
                      rows={2}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => removeProduct(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !form.name} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <CheckCircle2 className="h-4 w-4 text-black" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saved ? "Saved!" : brand ? "Save Changes" : "Create Brand Kit"}
        </Button>
      </div>
    </div>
  );
}
