"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Mail,
  Send,
  Loader2,
  Users,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

const CONTACT_STATUSES = [
  { value: "cold", label: "Cold", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { value: "warm", label: "Warm", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  { value: "hot", label: "Hot", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  { value: "customer", label: "Customer", color: "bg-green-500/10 text-green-400 border-green-500/20" },
  { value: "churned", label: "Churned", color: "bg-red-500/10 text-red-400 border-red-500/20" },
] as const;

interface SendResult {
  sent: number;
  failed: number;
  total: number;
  errors?: string[];
}

export function BroadcastComposer() {
  const toast = useAppToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [fromName, setFromName] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [minScore, setMinScore] = useState("");
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  // Fetch recipient count when filters change
  useEffect(() => {
    const timeout = setTimeout(async () => {
      setLoadingCount(true);
      try {
        const filter: Record<string, unknown> = {};
        if (selectedStatuses.length > 0) filter.statuses = selectedStatuses;
        if (minScore) filter.minScore = parseInt(minScore, 10);

        const res = await api.post<{ data: { count: number } }>("/broadcasts/preview", filter);
        setRecipientCount(res.data.count);
      } catch {
        setRecipientCount(null);
      } finally {
        setLoadingCount(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [selectedStatuses, minScore]);

  function toggleStatus(status: string) {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;

    setSending(true);
    setResult(null);

    try {
      const payload: Record<string, unknown> = {
        subject: subject.trim(),
        body: body.trim(),
      };
      if (fromName.trim()) payload.fromName = fromName.trim();
      if (selectedStatuses.length > 0) payload.statuses = selectedStatuses;
      if (minScore) payload.minScore = parseInt(minScore, 10);

      const res = await api.post<{ data: SendResult }>("/broadcasts/send", payload);
      setResult(res.data);

      if (res.data.failed === 0) {
        toast.success(`Broadcast sent to ${res.data.sent} contacts`);
      } else {
        toast.error(`Sent ${res.data.sent}, failed ${res.data.failed}`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send broadcast");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Email Broadcast</h1>
        <p className="text-sm text-muted-foreground">
          Send a one-off email to your contacts. Filter by status or lead score.
        </p>
      </div>

      {/* Result banner */}
      {result && (
        <div
          className={`flex items-start gap-3 rounded-lg border p-4 ${
            result.failed === 0
              ? "border-orion-green/30 bg-orion-green/5"
              : "border-yellow-500/30 bg-yellow-500/5"
          }`}
        >
          {result.failed === 0 ? (
            <CheckCircle2 className="h-5 w-5 text-orion-green shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="text-sm font-semibold">
              {result.failed === 0
                ? `Successfully sent to ${result.sent} contact${result.sent !== 1 ? "s" : ""}`
                : `Sent ${result.sent} of ${result.total} emails (${result.failed} failed)`}
            </p>
            {result.errors && result.errors.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {result.errors.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Compose */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <Mail className="h-4 w-4 text-orion-green" />
              <h2 className="text-sm font-semibold">Compose</h2>
            </div>

            <div className="space-y-1.5">
              <Label>From Name (optional)</Label>
              <Input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Your Company Name"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Subject *</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Your email subject line"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Body *</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your email content here. Use blank lines for paragraphs."
                rows={12}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Plain text — paragraphs are separated by blank lines. HTML formatting is applied automatically.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Audience + Send */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <Users className="h-4 w-4 text-orion-green" />
              <h2 className="text-sm font-semibold">Audience</h2>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Filter by Status</Label>
              <div className="flex flex-wrap gap-2">
                {CONTACT_STATUSES.map((s) => {
                  const isSelected = selectedStatuses.includes(s.value);
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => toggleStatus(s.value)}
                      className={`inline-flex items-center rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                        isSelected ? s.color : "border-border bg-muted/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
              {selectedStatuses.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  No filter = all contacts
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Minimum Lead Score</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                placeholder="0"
              />
            </div>

            {/* Recipient count */}
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-center">
              {loadingCount ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
              ) : recipientCount !== null ? (
                <>
                  <p className="text-2xl font-bold text-orion-green tabular-nums">{recipientCount}</p>
                  <p className="text-xs text-muted-foreground">
                    recipient{recipientCount !== 1 ? "s" : ""}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Unable to load count</p>
              )}
            </div>

            <Button
              onClick={handleSend}
              disabled={sending || !subject.trim() || !body.trim() || recipientCount === 0}
              className="w-full gap-2 bg-orion-green text-black hover:bg-orion-green-dim"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? "Sending..." : "Send Broadcast"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
