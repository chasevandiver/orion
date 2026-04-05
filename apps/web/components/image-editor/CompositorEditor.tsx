"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Loader2, Eye, Save, Images, Check, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type LogoPosition = "auto" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
type TextColor = "auto" | "white" | "black";

interface MediaAsset {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
}

export interface CompositorEditorProps {
  asset: {
    id: string;
    channel: string;
    compositedImageUrl?: string;
    imageUrl?: string;
    contentText?: string;
    metadata?: Record<string, unknown>;
  };
  brandName?: string;
  brandLogo?: string;
  brandPrimaryColor?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (newCompositedUrl: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractHeadline(contentText: string): string {
  const lines = contentText.split("\n").map((l) => l.trim()).filter(Boolean);
  // Prefer explicit HEADLINE: prefix if present
  const headlineLine = lines.find((l) => /^HEADLINE:/i.test(l));
  const raw = headlineLine
    ? headlineLine.replace(/^HEADLINE:\s*/i, "").trim()
    : (lines[0]?.replace(/^#+\s*/, "") ?? "");
  // Character-based cap matching pipeline safety net (compositor does pixel-accurate fitting)
  if (raw.length <= 60) return raw;
  const truncated = raw.slice(0, 60);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "\u2026";
}

const LOGO_POSITIONS: Array<{ value: LogoPosition; label: string }> = [
  { value: "auto",         label: "Auto" },
  { value: "top-left",     label: "↖ TL" },
  { value: "top-right",    label: "↗ TR" },
  { value: "bottom-left",  label: "↙ BL" },
  { value: "bottom-right", label: "↘ BR" },
];

// ── Media Picker Dialog ────────────────────────────────────────────────────────

function MediaPickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
}) {
  const toast = useAppToast();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setLoading(true);
    api
      .get<{ data: MediaAsset[] }>("/media/assets")
      .then((res) => setAssets(res.data ?? []))
      .catch(() => toast.error("Failed to load media library"))
      .finally(() => setLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pick from Media Library</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : assets.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No media assets found. Upload images in the Media Library first.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 max-h-80 overflow-y-auto py-2 pr-1">
            {assets
              .filter((a) => a.mimeType.startsWith("image/"))
              .map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelected(a.url)}
                  className={`relative overflow-hidden rounded-lg border-2 text-left transition-all ${
                    selected === a.url
                      ? "border-primary ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground"
                  }`}
                >
                  <img
                    src={a.url}
                    alt={a.filename}
                    className="aspect-video w-full object-cover bg-muted"
                  />
                  {selected === a.url && (
                    <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                      <Check className="h-6 w-6 text-white drop-shadow-md" />
                    </div>
                  )}
                  <p className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">
                    {a.filename}
                  </p>
                </button>
              ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => { if (selected) { onSelect(selected); onOpenChange(false); } }} disabled={!selected}>
            Use Selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── CompositorEditor ───────────────────────────────────────────────────────────

export function CompositorEditor({
  asset,
  brandName = "",
  brandLogo,
  brandPrimaryColor,
  open,
  onOpenChange,
  onSaved,
}: CompositorEditorProps) {
  const toast = useAppToast();

  const [headline, setHeadline] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [logoPosition, setLogoPosition] = useState<LogoPosition>("auto");
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | undefined>(undefined);
  const [isUserPhoto, setIsUserPhoto] = useState(false);
  const [textColor, setTextColor] = useState<TextColor>("auto");

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasNewPreview, setHasNewPreview] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);

  // Reset state whenever the dialog opens for a (potentially new) asset
  useEffect(() => {
    if (!open) return;
    setHeadline(
      String(asset.metadata?.compositorHeadline ?? extractHeadline(asset.contentText ?? "")),
    );
    setCtaText(String(asset.metadata?.compositorCta ?? ""));
    setLogoPosition("auto");
    setBackgroundImageUrl(asset.imageUrl);
    setIsUserPhoto(false);
    setTextColor("auto");
    setPreviewUrl(asset.compositedImageUrl ?? null);
    setHasNewPreview(false);
  }, [open, asset.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePickMedia(url: string) {
    setBackgroundImageUrl(url);
    setIsUserPhoto(true);
  }

  function handleResetBackground() {
    setBackgroundImageUrl(asset.imageUrl);
    setIsUserPhoto(false);
  }

  async function handlePreview() {
    if (!headline.trim()) {
      toast.error("Headline text is required");
      return;
    }
    setPreviewing(true);
    try {
      const res = await fetch(`/api/render-preview/${asset.channel}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          backgroundImageUrl,
          headlineText: headline,
          ctaText,
          logoUrl: brandLogo,
          brandName,
          ...(brandPrimaryColor ? { brandPrimaryColor } : {}),
          logoPosition: logoPosition === "auto" ? undefined : logoPosition,
          flowType: isUserPhoto ? "user-photo" : "generate",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((err.error as string) ?? "Render failed");
      }
      const data = (await res.json()) as { url: string };
      setPreviewUrl(data.url);
      setHasNewPreview(true);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSave() {
    if (!hasNewPreview || !previewUrl) return;
    setSaving(true);
    try {
      await api.patch(`/assets/${asset.id}`, { compositedImageUrl: previewUrl });
      onSaved(previewUrl);
      onOpenChange(false);
      toast.success("Image updated");
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const bgLabel = isUserPhoto
    ? "Media library image selected"
    : backgroundImageUrl
      ? "Original AI-generated background"
      : "Brand graphic (no background image)";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-base">
              Edit Composited Image
            </DialogTitle>
          </DialogHeader>

          <div
            className="flex flex-col md:flex-row"
            style={{ maxHeight: "calc(90vh - 130px)", minHeight: 0 }}
          >
            {/* ── Controls panel ── */}
            <div className="md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-border overflow-y-auto p-5 space-y-5">

              {/* Headline */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Headline</Label>
                <textarea
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-primary min-h-[72px]"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="Headline text on the image…"
                />
              </div>

              {/* CTA */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">CTA Text</Label>
                <Input
                  className="h-9 text-sm"
                  value={ctaText}
                  onChange={(e) => setCtaText(e.target.value)}
                  placeholder="e.g. Learn More, Shop Now…"
                />
              </div>

              {/* Logo position */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Logo Position</Label>
                <div className="flex flex-wrap gap-1.5">
                  {LOGO_POSITIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setLogoPosition(value)}
                      className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                        logoPosition === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {logoPosition !== "auto" && (
                  <p className="text-[10px] text-muted-foreground">
                    Corner placement applies when using a photo background.
                  </p>
                )}
              </div>

              {/* Background image */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Background Image</Label>
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground leading-snug">
                  {bgLabel}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5 text-xs"
                  onClick={() => setMediaPickerOpen(true)}
                >
                  <Images className="h-3.5 w-3.5" />
                  Pick from Media Library
                </Button>
                {isUserPhoto && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                    onClick={handleResetBackground}
                  >
                    Reset to original
                  </button>
                )}
              </div>

              {/* Text color */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Text Color</Label>
                <div className="flex gap-1.5">
                  {(["auto", "white", "black"] as TextColor[]).map((c) => (
                    <button
                      key={c}
                      onClick={() => setTextColor(c)}
                      className={`flex-1 rounded border px-2 py-1 text-xs capitalize transition-colors ${
                        textColor === c
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Auto picks contrast based on background brightness.
                </p>
              </div>
            </div>

            {/* ── Preview panel ── */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 bg-muted/20 overflow-y-auto gap-4">
              {previewUrl ? (
                <>
                  <img
                    src={previewUrl}
                    alt="composited preview"
                    className="w-full max-w-lg rounded-xl border border-border shadow-lg"
                  />
                  {hasNewPreview && (
                    <p className="text-xs text-muted-foreground text-center">
                      Preview updated — click{" "}
                      <span className="font-medium text-foreground">Save</span> to apply.
                    </p>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Eye className="h-12 w-12 opacity-20" />
                  <p className="text-sm">Click Preview to render</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving || previewing}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handlePreview}
                disabled={previewing || saving}
              >
                {previewing ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                )}
                {previewing ? "Rendering…" : "Preview"}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!hasNewPreview || saving}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                )}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MediaPickerDialog
        open={mediaPickerOpen}
        onOpenChange={setMediaPickerOpen}
        onSelect={handlePickMedia}
      />
    </>
  );
}
