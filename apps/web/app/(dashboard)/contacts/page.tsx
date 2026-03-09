"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Flame, Thermometer, Snowflake, Star } from "lucide-react";
import { ContactsTable } from "./contacts-table";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  email: string;
  name?: string;
  company?: string;
  title?: string;
  status: string;
  leadScore: number;
  sourceChannel?: string;
  createdAt: string;
}

interface ContactsResponse {
  data: Contact[];
}

// ── Pipeline stat card ────────────────────────────────────────────────────────

function PipelineStatCard({
  label,
  count,
  icon,
  colorClass,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  colorClass: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colorClass}`}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold">{count}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

// ── Priority contact card ─────────────────────────────────────────────────────

function PriorityContactCard({ contact }: { contact: Contact }) {
  const scoreColor =
    contact.leadScore >= 80
      ? "bg-red-500/10 text-red-400 border-red-500/20"
      : contact.leadScore >= 50
      ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
      : "bg-blue-500/10 text-blue-400 border-blue-500/20";

  const recommendedAction =
    contact.leadScore >= 80
      ? "Book a demo call immediately"
      : contact.leadScore >= 60
      ? "Send a personalized follow-up"
      : "Add to nurture sequence";

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold uppercase">
        {(contact.name ?? contact.email).charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-semibold text-sm truncate">
            {contact.name ?? contact.email}
          </span>
          <Badge className={`border text-xs px-1.5 ${scoreColor}`}>
            Score: {contact.leadScore}
          </Badge>
        </div>
        {contact.company && (
          <p className="text-xs text-muted-foreground mb-1">{contact.company}</p>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Star className="h-3 w-3 text-yellow-400 shrink-0" />
          <span>{recommendedAction}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<ContactsResponse>("/contacts");
        setContacts(res.data ?? []);
      } catch {
        // Empty state — table handles its own errors
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Compute pipeline stats
  const cold = contacts.filter((c) => c.status === "cold").length;
  const warm = contacts.filter((c) => c.status === "warm").length;
  const hot = contacts.filter((c) => c.status === "hot").length;
  const customer = contacts.filter((c) => c.status === "customer").length;

  // Top 3 by leadScore
  const topPriority = [...contacts]
    .sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0))
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">CRM</h1>
        <p className="text-sm text-muted-foreground">
          Contacts captured from campaigns, forms, and webhooks.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading contacts…
        </div>
      ) : (
        <>
          {/* Lead Pipeline Stats */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Lead Pipeline
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PipelineStatCard
                label="Cold"
                count={cold}
                icon={<Snowflake className="h-5 w-5 text-blue-400" />}
                colorClass="bg-blue-500/10"
              />
              <PipelineStatCard
                label="Warm"
                count={warm}
                icon={<Thermometer className="h-5 w-5 text-yellow-400" />}
                colorClass="bg-yellow-500/10"
              />
              <PipelineStatCard
                label="Hot"
                count={hot}
                icon={<Flame className="h-5 w-5 text-red-400" />}
                colorClass="bg-red-500/10"
              />
              <PipelineStatCard
                label="Customer"
                count={customer}
                icon={<Users className="h-5 w-5 text-green-400" />}
                colorClass="bg-green-500/10"
              />
            </div>
          </div>

          {/* Top Priority Contacts */}
          {topPriority.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Top Priority Contacts
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {topPriority.map((contact) => (
                  <PriorityContactCard key={contact.id} contact={contact} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Contacts table — passes initial data for SSR hydration */}
      <ContactsTable initialContacts={contacts} />
    </div>
  );
}
