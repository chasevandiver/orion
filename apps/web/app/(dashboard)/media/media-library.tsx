"use client";

import { useState, useCallback, useRef } from "react";
import Image from "next/image";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload,
  X,
  Search,
  Copy,
  Check,
  Trash2,
  Tag,
  Loader2,
  ImageIcon,
  Pencil,
  Plus,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MediaAsset {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  tags: string[] | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  createdAt: Date | string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SUGGESTED_TAGS = [
  "product", "team", "lifestyle", "office", "event",
  "brand", "hero", "background", "logo", "social",
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Upload zone ───────────────────────────────────────────────────────────────

function UploadZone({ onUploaded }: { onUploaded: (asset: MediaAsset) => void }) {
  const toast = useAppToast();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingTags, setPendingTags] = useState("");
  const [pendingAlt, setPendingAlt] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setPendingFile(file);
    setPreview(URL.createObjectURL(file));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", pendingFile);
      if (pendingTags.trim()) fd.append("tags", pendingTags);
      if (pendingAlt.trim()) fd.append("altText", pendingAlt);

      const res = await api.postForm<{ data: MediaAsset }>("/media/upload", fd);
      onUploaded(res.data);
      setPendingFile(null);
      setPreview(null);
      setPendingTags("");
      setPendingAlt("");
      toast.success("Asset uploaded to media library");
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (pendingFile) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-start gap-4">
          {preview && (
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
              <Image src={preview} alt="preview" fill className="object-cover" sizes="80px" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{pendingFile.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(pendingFile.size)}</p>
          </div>
          <button onClick={() => { setPendingFile(null); setPreview(null); }} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Tags (comma-separated)</Label>
            <Input
              className="mt-1 h-8 text-xs"
              placeholder="product, lifestyle, team"
              value={pendingTags}
              onChange={(e) => setPendingTags(e.target.value)}
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {SUGGESTED_TAGS.slice(0, 6).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPendingTags((prev) => prev ? `${prev}, ${t}` : t)}
                  className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-orion-green/50 hover:text-orion-green transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Alt text (accessibility)</Label>
            <Input
              className="mt-1 h-8 text-xs"
              placeholder="Describe the image..."
              value={pendingAlt}
              onChange={(e) => setPendingAlt(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={handleUpload} disabled={uploading} className="gap-1.5">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setPendingFile(null); setPreview(null); }}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        dragging ? "border-orion-green bg-orion-green/5" : "border-border hover:border-muted-foreground/50"
      }`}
    >
      <input
        id="media-upload-input"
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">Drop images here or click to browse</p>
      <p className="mt-1 text-xs text-muted-foreground">PNG, JPEG, WebP, GIF, SVG, AVIF — up to 20 MB</p>
    </div>
  );
}

// ── Detail dialog ─────────────────────────────────────────────────────────────

function DetailDialog({
  asset,
  onClose,
  onUpdated,
  onDeleted,
}: {
  asset: MediaAsset;
  onClose: () => void;
  onUpdated: (a: MediaAsset) => void;
  onDeleted: (id: string) => void;
}) {
  const toast = useAppToast();
  const [editingTags, setEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState((asset.tags ?? []).join(", "));
  const [altInput, setAltInput] = useState(asset.altText ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const tags = tagInput.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
      const res = await api.patch<{ data: MediaAsset }>(`/media/${asset.id}`, {
        tags,
        altText: altInput || null,
      });
      onUpdated(res.data);
      setEditingTags(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Remove this asset from the media library?")) return;
    setDeleting(true);
    try {
      await api.delete(`/media/${asset.id}`);
      onDeleted(asset.id);
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete");
      setDeleting(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="truncate text-sm font-semibold">{asset.filename}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-lg border border-border bg-muted/30 flex items-center justify-center" style={{ minHeight: 200 }}>
            {asset.mimeType.startsWith("image/") ? (
              <Image
                src={asset.url}
                alt={asset.altText ?? asset.filename}
                width={asset.width ?? 400}
                height={asset.height ?? 300}
                className="max-h-64 w-auto object-contain"
                unoptimized
              />
            ) : (
              <ImageIcon className="h-16 w-16 text-muted-foreground/30" />
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="rounded-lg border border-border bg-muted/20 p-2">
              <p className="text-muted-foreground">Size</p>
              <p className="font-medium">{formatBytes(asset.sizeBytes)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-2">
              <p className="text-muted-foreground">Dimensions</p>
              <p className="font-medium">
                {asset.width && asset.height ? `${asset.width}×${asset.height}` : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-2">
              <p className="text-muted-foreground">Type</p>
              <p className="font-medium">{asset.mimeType.split("/")[1]?.toUpperCase() ?? "—"}</p>
            </div>
          </div>

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-xs">Tags</Label>
              {!editingTags && (
                <button onClick={() => setEditingTags(true)} className="text-muted-foreground hover:text-foreground">
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
            {editingTags ? (
              <div className="space-y-2">
                <Input
                  className="h-8 text-xs"
                  placeholder="product, lifestyle, team"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                />
                <div className="flex flex-wrap gap-1">
                  {SUGGESTED_TAGS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTagInput((prev) => prev ? `${prev}, ${t}` : t)}
                      className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-orion-green/50 hover:text-orion-green"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
                <Label className="text-xs mt-2 block">Alt text</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="Describe the image..."
                  value={altInput}
                  onChange={(e) => setAltInput(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingTags(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(asset.tags ?? []).length > 0
                  ? (asset.tags ?? []).map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs capitalize">{t}</Badge>
                    ))
                  : <span className="text-xs text-muted-foreground">No tags — click the pencil to add some</span>
                }
              </div>
            )}
          </div>

          {/* URL + actions */}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCopy} className="flex-1 gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy URL"}
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-1.5">
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function MediaLibrary({ initialAssets }: { initialAssets: MediaAsset[] }) {
  const [assets, setAssets] = useState(initialAssets);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaAsset | null>(null);

  // Derive all unique tags from current assets
  const allTags = Array.from(
    new Set(assets.flatMap((a) => a.tags ?? []))
  ).sort();

  // Filter
  const filtered = assets.filter((a) => {
    const matchSearch = !search || a.filename.toLowerCase().includes(search.toLowerCase());
    const matchTag = !activeTag || (a.tags ?? []).includes(activeTag);
    return matchSearch && matchTag;
  });

  function handleUploaded(asset: MediaAsset) {
    setAssets((prev) => [asset, ...prev]);
  }

  function handleUpdated(updated: MediaAsset) {
    setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setSelected(updated);
  }

  function handleDeleted(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="flex gap-6">
      {/* ── Tag sidebar ── */}
      <aside className="w-44 shrink-0 space-y-1">
        <p className="px-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Filter by tag</p>
        <button
          onClick={() => setActiveTag(null)}
          className={`w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
            !activeTag ? "bg-orion-green/10 text-orion-green" : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          All assets
          <span className="ml-auto float-right text-muted-foreground">{assets.length}</span>
        </button>
        {allTags.map((tag) => {
          const count = assets.filter((a) => (a.tags ?? []).includes(tag)).length;
          return (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={`w-full rounded-md px-2.5 py-1.5 text-left text-xs capitalize transition-colors ${
                activeTag === tag ? "bg-orion-green/10 text-orion-green" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Tag className="inline h-3 w-3 mr-1.5 -mt-0.5" />
              {tag}
              <span className="ml-auto float-right text-muted-foreground">{count}</span>
            </button>
          );
        })}
        {allTags.length === 0 && (
          <p className="px-2 text-xs text-muted-foreground/60 pt-2">Tags appear here after you label your uploads.</p>
        )}
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-9 text-sm"
              placeholder="Search by filename…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <UploadZone onUploaded={handleUploaded} />

        {filtered.length === 0 ? (
          assets.length === 0 ? (
            <EmptyState
              icon={ImageIcon}
              title="Your media library is empty"
              description="Upload brand photos, product images, and team headshots. These are used in your campaigns and landing pages."
              actions={[{
                label: "Upload First Asset",
                onClick: () => (document.getElementById("media-upload-input") as HTMLInputElement | null)?.click(),
              }]}
            />
          ) : (
            <EmptyState
              icon={ImageIcon}
              title="No assets match your filter"
              description="Try a different tag or clear the search."
            />
          )
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((asset) => (
              <button
                key={asset.id}
                onClick={() => setSelected(asset)}
                className="group relative overflow-hidden rounded-xl border border-border bg-muted/20 aspect-square transition-all hover:border-orion-green/50 hover:shadow-lg hover:shadow-orion-green/5 focus:outline-none focus:ring-2 focus:ring-orion-green/40"
              >
                {asset.mimeType.startsWith("image/") ? (
                  <Image
                    src={asset.url}
                    alt={asset.altText ?? asset.filename}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                  <p className="text-xs text-white font-medium truncate">{asset.filename}</p>
                  {(asset.tags ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(asset.tags ?? []).slice(0, 2).map((t) => (
                        <span key={t} className="rounded bg-black/60 px-1 py-0.5 text-[9px] text-white/80 capitalize">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <DetailDialog
          asset={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
