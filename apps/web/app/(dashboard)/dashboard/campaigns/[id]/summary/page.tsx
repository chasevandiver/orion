import { serverApi } from "@/lib/server-api";
import Link from "next/link";
import { ABResults, type ABPair, type AssetStub } from "./ab-results";
import { DuplicateCampaignButton } from "./duplicate-campaign-button";
import { DownloadReportButton } from "./download-report-button";
import {
  Users,
  Radio,
  MessageSquare,
  BarChart3,
  Mic,
  ChevronLeft,
  CheckCircle,
  Clock,
  ImageIcon,
  GitBranch,
} from "lucide-react";
import { ImageLightbox } from "@/components/image-lightbox";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Asset {
  id: string;
  channel: string;
  type: string;
  contentText: string;
  variant?: "a" | "b";
  variantGroupId?: string | null;
  imageUrl?: string | null;
  compositedImageUrl?: string | null;
  status: string;
  createdAt: Date | string;
}

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  budget?: number;
  createdAt: Date | string;
  goal?: {
    id: string;
    type: string;
    brandName: string;
    brandDescription?: string;
    timeline: string;
  };
  strategy?: {
    id: string;
    contentText: string;
    targetAudiences: Array<{ name: string; description: string }>;
    channels: string[];
    kpis: Record<string, string>;
    createdAt: Date | string;
  };
  assets: Asset[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CHANNEL_META: Record<string, { emoji: string; label: string; color: string }> = {
  linkedin:  { emoji: "💼", label: "LinkedIn",  color: "#0077b5" },
  twitter:   { emoji: "🐦", label: "X/Twitter", color: "#1da1f2" },
  instagram: { emoji: "📸", label: "Instagram", color: "#e1306c" },
  facebook:  { emoji: "📘", label: "Facebook",  color: "#1877f2" },
  tiktok:    { emoji: "🎵", label: "TikTok",    color: "#ff0050" },
  email:     { emoji: "📧", label: "Email",     color: "#10b981" },
  blog:      { emoji: "✍️", label: "Blog",      color: "#f59e0b" },
};

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-orion-green/10 text-orion-green border-orion-green/20",
  draft:    "bg-muted text-muted-foreground border-border",
  review:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractSection(text: string, heading: string): string {
  const regex = new RegExp(`##[^#]*${heading}[\\s\\S]*?(?=\\n##[^#]|$)`, "i");
  return text.match(regex)?.[0]?.replace(/##[^\n]*\n/, "").trim() ?? "";
}

function extractKeyMessages(text: string): string[] {
  const section = extractSection(text, "Key Messages");
  return section
    .split("\n")
    .filter((l) => l.trim().match(/^[-*•]|\d+\./))
    .slice(0, 5)
    .map((l) => l.replace(/^[-*•\d.)]+\s*/, "").trim())
    .filter(Boolean);
}

function extractTone(text: string): string {
  const section = extractSection(text, "Tone");
  const firstLine = section.split("\n").find((l) => l.trim() && !l.startsWith("#"));
  return firstLine?.replace(/^[-*•\d.)]+\s*/, "").trim() ?? "";
}

function buildCalendarWeeks(assets: Asset[]): Array<{ label: string; items: Asset[] }> {
  const weeks = [
    { label: "Week 1", items: [] as Asset[] },
    { label: "Week 2", items: [] as Asset[] },
    { label: "Week 3", items: [] as Asset[] },
    { label: "Week 4", items: [] as Asset[] },
  ];
  assets.forEach((asset, i) => {
    weeks[i % 4]!.items.push(asset);
  });
  return weeks.filter((w) => w.items.length > 0);
}

// ── Page ───────────────────────────────────────────────────────────────────────

export const metadata = { title: "Campaign Summary" };

export default async function CampaignSummaryPage({
  params,
}: {
  params: { id: string };
}) {
  let campaign: Campaign | null = null;
  let error: string | null = null;

  try {
    const res = await serverApi.get<{ data: Campaign }>(`/campaigns/${params.id}`);
    campaign = res.data;
  } catch (err: any) {
    error = err.message ?? "Failed to load campaign";
  }

  // ── Error / Not Found ──────────────────────────────────────────────────────

  if (error || !campaign) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/campaigns"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Campaigns
        </Link>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <GitBranch className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">{error ?? "Campaign not found"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This campaign may not exist or you may not have access to it.
          </p>
          <Link
            href="/dashboard/campaigns"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-orion-green px-4 py-2 text-sm font-medium text-black hover:bg-orion-green/90 transition-colors"
          >
            Back to Campaigns
          </Link>
        </div>
      </div>
    );
  }

  const { strategy, assets, goal } = campaign;

  const assetsByChannel = assets.reduce<Record<string, Asset[]>>((acc, a) => {
    if (!acc[a.channel]) acc[a.channel] = [];
    acc[a.channel]!.push(a);
    return acc;
  }, {});

  // Build A/B pairs: groups with both variant "a" and "b" sharing a variantGroupId
  const abPairs: ABPair[] = Object.values(
    assets
      .filter((a) => a.variantGroupId && (a.variant === "a" || a.variant === "b"))
      .reduce<Record<string, { a?: Asset; b?: Asset; channel: string; variantGroupId: string }>>((acc, a) => {
        const key = a.variantGroupId!;
        if (!acc[key]) acc[key] = { channel: a.channel, variantGroupId: key };
        acc[key]![a.variant as "a" | "b"] = a;
        return acc;
      }, {}),
  )
    .filter((g) => g.a && g.b)
    .map((g) => ({
      channel: g.channel,
      variantGroupId: g.variantGroupId,
      assetA: g.a! as AssetStub,
      assetB: g.b! as AssetStub,
    }));

  const calendarWeeks = buildCalendarWeeks(assets);
  const approvedCount = assets.filter((a) => a.status === "approved").length;
  const readinessPct = assets.length > 0 ? Math.round((approvedCount / assets.length) * 100) : 0;
  const keyMessages = strategy ? extractKeyMessages(strategy.contentText) : [];
  const tone = strategy ? extractTone(strategy.contentText) : null;

  return (
    <div className="space-y-8 max-w-4xl">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <Link
          href="/dashboard/campaigns"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ChevronLeft className="h-4 w-4" />
          Campaigns
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{campaign.name}</h1>
            {goal && (
              <p className="mt-1 text-sm text-muted-foreground">
                {goal.brandName}
                {" · "}
                {goal.type.replace(/_/g, " ")}
                {" · "}
                {goal.timeline.replace(/_/g, " ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DownloadReportButton campaignId={campaign.id} />
            <DuplicateCampaignButton
              campaignId={campaign.id}
              goalType={goal?.type ?? "awareness"}
              goalTimeline={goal?.timeline ?? "1_month"}
              brandName={goal?.brandName ?? campaign.name}
              defaultChannels={(strategy?.channels ?? []) as string[]}
            />
            <Link
              href={`/dashboard/review/${campaign.id}`}
              className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              <CheckCircle className="h-4 w-4" />
              Review Assets
            </Link>
          </div>
        </div>
      </div>

      {/* ── Strategy Overview ────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Strategy Overview</h2>
        {strategy ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {strategy.targetAudiences.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Target Audiences
                </div>
                <ul className="space-y-1">
                  {strategy.targetAudiences.map((a, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{a.name}</span>
                      {a.description && a.description !== a.name && (
                        <span className="text-muted-foreground"> — {a.description.slice(0, 80)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {strategy.channels.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Radio className="h-4 w-4 text-muted-foreground" />
                  Recommended Channels
                </div>
                <div className="flex flex-wrap gap-2">
                  {strategy.channels.map((ch) => {
                    const meta = CHANNEL_META[ch];
                    return (
                      <span
                        key={ch}
                        className="flex items-center gap-1 rounded border border-border bg-muted px-2 py-1 text-xs"
                      >
                        {meta?.emoji} {meta?.label ?? ch}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {keyMessages.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  Key Messages
                </div>
                <ul className="space-y-1.5">
                  {keyMessages.map((msg, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orion-green" />
                      {msg}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {Object.keys(strategy.kpis).length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  KPIs
                </div>
                <dl className="space-y-1">
                  {Object.entries(strategy.kpis).slice(0, 6).map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-2 text-sm">
                      <dt className="text-muted-foreground truncate">{k}</dt>
                      <dd className="font-medium shrink-0">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {tone && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  Tone of Voice
                </div>
                <p className="text-sm text-muted-foreground">{tone}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-10 text-center">
            <BarChart3 className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No strategy yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Run the pipeline to generate a strategy for this campaign.
            </p>
          </div>
        )}
      </section>

      {/* ── Content Overview ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Content Overview</h2>
        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-10 text-center">
            <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No assets yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Assets will appear here after the pipeline generates content.
            </p>
            <Link
              href="/dashboard"
              className="mt-3 text-sm text-orion-green hover:underline"
            >
              Create a goal to generate assets
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(assetsByChannel).map(([ch, chAssets]) => {
              const meta = CHANNEL_META[ch] ?? { emoji: "📄", label: ch, color: "#666" };
              return (
                <div key={ch} className="rounded-lg border border-border overflow-hidden">
                  <div
                    className="flex items-center gap-2 px-4 py-3 bg-muted/20 border-b border-border"
                  >
                    <span style={{ color: meta.color }}>{meta.emoji}</span>
                    <span className="font-medium">{meta.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {chAssets.length} asset{chAssets.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="grid gap-4 p-4 sm:grid-cols-2">
                    {chAssets.map((asset) => (
                      <div key={asset.id} className="rounded-lg border border-border overflow-hidden">
                        {(asset.compositedImageUrl || asset.imageUrl) ? (
                          <ImageLightbox
                            src={asset.compositedImageUrl ?? asset.imageUrl ?? ""}
                            alt={`${ch} visual`}
                            containerClassName="max-h-48"
                          />
                        ) : (
                          <div className="flex h-32 items-center justify-center bg-muted/20">
                            <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                          </div>
                        )}
                        <div className="p-3 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                              {ch}
                            </span>
                            {asset.variant && (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-orion-green/10 text-[10px] font-mono font-bold text-orion-green border border-orion-green/30">
                                {asset.variant.toUpperCase()}
                              </span>
                            )}
                            {asset.compositedImageUrl && (
                              <span className="font-mono text-[10px] text-orion-green">COMPOSITED</span>
                            )}
                            <span
                              className={`ml-auto inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${STATUS_STYLES[asset.status] ?? STATUS_STYLES.draft}`}
                            >
                              {asset.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-3">
                            {asset.contentText.slice(0, 200)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Content Calendar ─────────────────────────────────────────────────── */}
      {assets.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Content Calendar</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Suggested 4-week distribution for your campaign assets.
          </p>
          <div className="space-y-4">
            {calendarWeeks.map((week, wi) => (
              <div key={wi} className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20 border-b border-border">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{week.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {week.items.length} post{week.items.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {week.items.map((asset, ai) => {
                    const meta = CHANNEL_META[asset.channel] ?? { emoji: "📄", label: asset.channel };
                    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                    const dayLabel = days[ai % 7];
                    return (
                      <div key={asset.id} className="flex items-start gap-3 px-4 py-3">
                        <div className="w-10 shrink-0 text-center pt-0.5">
                          <p className="text-xs text-muted-foreground">{dayLabel}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span>{meta.emoji}</span>
                            <span className="text-sm font-medium">{meta.label}</span>
                            {asset.variant && (
                              <span className="font-mono text-[10px] text-muted-foreground">
                                Variant {asset.variant.toUpperCase()}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                            {asset.contentText.slice(0, 100)}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${STATUS_STYLES[asset.status] ?? STATUS_STYLES.draft}`}
                        >
                          {asset.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── A/B Test Results ─────────────────────────────────────────────────── */}
      {abPairs.length > 0 && <ABResults pairs={abPairs} />}

      {/* ── Publish Readiness ────────────────────────────────────────────────── */}
      {assets.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Publish Readiness</h2>
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-muted-foreground">Overall readiness</span>
                <span className="text-sm font-medium">{readinessPct}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-orion-green transition-all"
                  style={{ width: `${readinessPct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-orion-green inline-block" />
                  {approvedCount} approved
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground inline-block" />
                  {assets.length - approvedCount} pending
                </span>
              </div>
            </div>

            {/* Asset list */}
            <div className="space-y-1.5">
              {assets.map((asset) => {
                const meta = CHANNEL_META[asset.channel] ?? { emoji: "📄", label: asset.channel };
                return (
                  <div key={asset.id} className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-muted/20 transition-colors">
                    <span className="shrink-0">{meta.emoji}</span>
                    <span className="flex-1 truncate text-sm text-muted-foreground">
                      {meta.label}
                      {asset.variant ? ` · Variant ${asset.variant.toUpperCase()}` : ""}
                    </span>
                    <span
                      className={`shrink-0 inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${STATUS_STYLES[asset.status] ?? STATUS_STYLES.draft}`}
                    >
                      {asset.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
