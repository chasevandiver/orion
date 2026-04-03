import Link from "next/link";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import { IntelligencePanel } from "./intelligence-panel";
import {
  ArrowLeft,
  Mail,
  Building2,
  Briefcase,
  Radio,
  Calendar,
  Eye,
  MousePointerClick,
  FileText,
  Send,
  Activity,
  UserCheck,
  UserPlus,
  MessageSquare,
  Layers,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ContactEvent {
  id: string;
  eventType: string;
  metadataJson: Record<string, unknown>;
  occurredAt: string;
}

interface Contact {
  id: string;
  email: string;
  name?: string | null;
  company?: string | null;
  title?: string | null;
  status: string;
  leadScore: number;
  sourceChannel?: string | null;
  createdAt: Date | string;
  events: ContactEvent[];
  sourceCampaign?: { id: string; name: string } | null;
}

interface EmailSequence {
  id: string;
  name: string;
  triggerType: string;
  status: string;
  steps: Array<{ id: string }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  cold:     "bg-blue-500/10 text-blue-400 border-blue-500/20",
  warm:     "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  hot:      "bg-orange-500/10 text-orange-400 border-orange-500/20",
  customer: "bg-orion-green/10 text-orion-green border-orion-green/20",
  churned:  "bg-muted text-muted-foreground border-border",
};

const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  page_view:    Eye,
  email_open:   Mail,
  link_click:   MousePointerClick,
  form_submit:  FileText,
  publish:      Send,
  lead_created: UserPlus,
  status_change: UserCheck,
  reply:        MessageSquare,
};

function initials(name: string | null | undefined, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase()
      : parts[0]![0]!.toUpperCase();
  }
  return email[0]!.toUpperCase();
}

// ── Score ring ─────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const pct = score / 100;
  const strokeColor =
    score >= 70 ? "#22c55e" : score >= 40 ? "#eab308" : "#f97316";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40" cy="40" r={r}
            fill="none"
            stroke="currentColor"
            className="text-muted/30"
            strokeWidth="6"
          />
          <circle
            cx="40" cy="40" r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${circ * pct} ${circ}`}
          />
        </svg>
        <span className="text-xl font-bold tabular-nums">{score}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">Lead Score</p>
    </div>
  );
}

// ── Profile card ───────────────────────────────────────────────────────────────

function ProfileCard({ contact }: { contact: Contact }) {
  const ini = initials(contact.name, contact.email);
  const created = new Date(contact.createdAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-6">
      {/* Avatar + name */}
      <div className="flex flex-col items-center text-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orion-green/10 border border-orion-green/20 text-orion-green text-xl font-bold">
          {ini}
        </div>
        <div>
          <p className="font-semibold text-base">{contact.name ?? contact.email}</p>
          {contact.name && (
            <p className="text-sm text-muted-foreground">{contact.email}</p>
          )}
        </div>
        {/* Status badge */}
        <span
          className={`inline-flex items-center rounded border px-2.5 py-1 font-mono text-[10px] uppercase ${STATUS_COLORS[contact.status] ?? STATUS_COLORS.cold}`}
        >
          {contact.status}
        </span>
      </div>

      {/* Score ring */}
      <div className="flex justify-center">
        <ScoreRing score={contact.leadScore} />
      </div>

      {/* Details */}
      <div className="space-y-3 text-sm">
        {contact.company && (
          <div className="flex items-start gap-2.5">
            <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span>{contact.company}</span>
          </div>
        )}
        {contact.title && (
          <div className="flex items-start gap-2.5">
            <Briefcase className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span>{contact.title}</span>
          </div>
        )}
        <div className="flex items-start gap-2.5">
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <a href={`mailto:${contact.email}`} className="hover:underline text-muted-foreground">
            {contact.email}
          </a>
        </div>
        {contact.sourceChannel && (
          <div className="flex items-start gap-2.5">
            <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="capitalize text-muted-foreground">via {contact.sourceChannel}</span>
          </div>
        )}
        <div className="flex items-start gap-2.5">
          <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Added {created}</span>
        </div>
        {contact.sourceCampaign && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-1">Source campaign</p>
            <Link
              href={`/dashboard/campaigns/${contact.sourceCampaign.id}/summary`}
              className="text-xs text-orion-green hover:underline"
            >
              {contact.sourceCampaign.name}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Events timeline ────────────────────────────────────────────────────────────

function EventsTimeline({ events }: { events: ContactEvent[] }) {
  if (events.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-4 text-base font-semibold flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        Activity Timeline
      </h2>
      <div className="relative rounded-xl border border-border bg-card divide-y divide-border/50">
        {events.map((event) => {
          const Icon = EVENT_ICONS[event.eventType] ?? Activity;
          const when = new Date(event.occurredAt);
          const dateStr = when.toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          });
          const timeStr = when.toLocaleTimeString("en-US", {
            hour: "numeric", minute: "2-digit",
          });

          return (
            <div key={event.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
                <Icon className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm capitalize">
                  {event.eventType.replace(/_/g, " ")}
                </p>
                {Object.keys(event.metadataJson).length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {Object.entries(event.metadataJson)
                      .slice(0, 2)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <p>{dateStr}</p>
                <p>{timeStr}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Sequences section ──────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  welcome:       "Welcome",
  trial_ending:  "Trial Ending",
  re_engagement: "Re-engagement",
  manual:        "Manual",
  signup:        "Signup",
  download:      "Download",
  purchase:      "Purchase",
};

const SEQ_STATUS_STYLES: Record<string, string> = {
  active: "bg-orion-green/10 text-orion-green border-orion-green/20",
  draft:  "bg-muted text-muted-foreground border-border",
  paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

function SequencesSection({ sequences }: { sequences: EmailSequence[] }) {
  const active = sequences.filter((s) => s.status === "active");

  return (
    <section className="mt-8">
      <h2 className="mb-4 text-base font-semibold flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        Email Sequences
        {active.length > 0 && (
          <span className="inline-flex items-center rounded border border-orion-green/20 bg-orion-green/10 px-1.5 py-0.5 text-xs text-orion-green">
            {active.length} active
          </span>
        )}
      </h2>

      {sequences.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No email sequences configured for this org.{" "}
          <Link href="/dashboard/sequences" className="text-orion-green hover:underline">
            Create one →
          </Link>
        </p>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border/50">
          {sequences.map((seq) => (
            <div key={seq.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  seq.status === "active"
                    ? "bg-orion-green/20 text-orion-green"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {seq.steps.length}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{seq.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {TRIGGER_LABELS[seq.triggerType] ?? seq.triggerType} ·{" "}
                  {seq.steps.length} step{seq.steps.length !== 1 ? "s" : ""}
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${SEQ_STATUS_STYLES[seq.status] ?? "bg-muted text-muted-foreground border-border"}`}
              >
                {seq.status}
              </span>
            </div>
          ))}
          <div className="px-4 py-2.5">
            <p className="text-xs text-muted-foreground">
              Enrollment tracking per contact requires a schema migration.{" "}
              <Link href="/dashboard/sequences" className="text-orion-green hover:underline">
                Manage sequences →
              </Link>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export const metadata = { title: "Contact Detail" };

export default async function ContactDetailPage({
  params,
}: {
  params: { id: string };
}) {
  let contact: Contact;
  let sequences: EmailSequence[] = [];
  try {
    const [contactRes, seqRes] = await Promise.allSettled([
      serverApi.get<{ data: Contact }>(`/contacts/${params.id}`),
      serverApi.get<{ data: EmailSequence[] }>("/email-sequences"),
    ]);
    if (contactRes.status === "rejected") notFound();
    contact = (contactRes as PromiseFulfilledResult<{ data: Contact }>).value.data;
    if (seqRes.status === "fulfilled") sequences = seqRes.value.data;
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Back nav */}
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Contacts
      </Link>

      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold">{contact.name ?? contact.email}</h1>
        {contact.company && (
          <p className="text-muted-foreground mt-0.5">{contact.title ? `${contact.title} at ${contact.company}` : contact.company}</p>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Left: Profile */}
        <ProfileCard contact={contact} />

        {/* Right: AI Intelligence (client component, lazy loaded) */}
        <IntelligencePanel contactId={contact.id} />
      </div>

      {/* Bottom: Events timeline */}
      <EventsTimeline events={contact.events ?? []} />

      {/* Bottom: Email Sequences */}
      <SequencesSection sequences={sequences} />
    </div>
  );
}
