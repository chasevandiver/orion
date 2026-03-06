"use client";

/**
 * /dashboard/content — Content generator with SSE streaming
 *
 * Full client component: the SSE stream starts on form submit and
 * progressively renders tokens as they arrive from the AI agent.
 */
import { useState, useRef } from "react";
import { createAgentStream, api } from "@/lib/api-client";
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
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, Check, Sparkles, FileText } from "lucide-react";

const CHANNELS = [
  { value: "linkedin", label: "LinkedIn", emoji: "💼" },
  { value: "twitter", label: "X / Twitter", emoji: "🐦" },
  { value: "instagram", label: "Instagram", emoji: "📸" },
  { value: "facebook", label: "Facebook", emoji: "📘" },
  { value: "tiktok", label: "TikTok", emoji: "🎵" },
  { value: "email", label: "Email", emoji: "📧" },
  { value: "blog", label: "Blog", emoji: "✍️" },
];

const GOAL_TYPES = [
  "leads", "awareness", "conversions", "traffic", "social", "product", "event",
];

export default function ContentPage() {
  const [channel, setChannel] = useState("linkedin");
  const [goalType, setGoalType] = useState("leads");
  const [brandName, setBrandName] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [strategyContext, setStrategyContext] = useState("");

  const [streaming, setStreaming] = useState(false);
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const stopRef = useRef<(() => void) | null>(null);

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (streaming) {
      stopRef.current?.();
      setStreaming(false);
      return;
    }

    setContent("");
    setStatusMsg("Connecting to Content Creator Agent…");
    setStreaming(true);

    const stop = createAgentStream(
      "/assets/generate",
      { channel, goalType, brandName, brandDescription, strategyContext },
      {
        onChunk: (text) => setContent((prev) => prev + text),
        onEvent: (event, data: any) => {
          if (event === "status") setStatusMsg(data.message ?? "");
          if (event === "done") setStatusMsg("Generation complete.");
        },
        onDone: () => setStreaming(false),
        onError: (msg) => {
          setStatusMsg(`Error: ${msg}`);
          setStreaming(false);
        },
      },
    );
    stopRef.current = stop;
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Content</h1>
        <p className="text-sm text-muted-foreground">
          Generate platform-native marketing copy with real-time AI streaming.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* Form panel */}
        <form onSubmit={handleGenerate} className="space-y-4">
          {/* Channel selector */}
          <div className="space-y-2">
            <Label>Channel</Label>
            <div className="grid grid-cols-4 gap-2">
              {CHANNELS.map((ch) => (
                <button
                  key={ch.value}
                  type="button"
                  onClick={() => setChannel(ch.value)}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors ${
                    channel === ch.value
                      ? "border-orion-green bg-orion-green/10 text-orion-green"
                      : "border-border text-muted-foreground hover:border-border/80 hover:bg-accent"
                  }`}
                >
                  <span className="text-base">{ch.emoji}</span>
                  <span className="truncate text-[10px]">{ch.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Goal Type</Label>
            <Select value={goalType} onValueChange={setGoalType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOAL_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Brand Name *</Label>
            <Input
              required
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Acme Corp"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Brand Description</Label>
            <Textarea
              value={brandDescription}
              onChange={(e) => setBrandDescription(e.target.value)}
              placeholder="What does your brand do and who is it for?"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Strategy Context (optional)</Label>
            <Textarea
              value={strategyContext}
              onChange={(e) => setStrategyContext(e.target.value)}
              placeholder="Paste key points from your strategy to guide the content…"
              rows={3}
            />
          </div>

          <Button type="submit" className="w-full gap-2" disabled={!brandName}>
            {streaming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Stop Generation
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Content
              </>
            )}
          </Button>
        </form>

        {/* Output panel */}
        <div className="flex flex-col rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Generated Content</span>
              {streaming && (
                <Badge variant="outline" className="border-orion-green/30 text-orion-green text-[10px]">
                  LIVE
                </Badge>
              )}
            </div>
            {content && (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={handleCopy}>
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-orion-green" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            )}
          </div>

          <div className="flex-1 p-4">
            {statusMsg && !content && (
              <p className="text-sm text-muted-foreground">{statusMsg}</p>
            )}
            {content ? (
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                {content}
                {streaming && (
                  <span className="inline-block h-4 w-0.5 animate-pulse bg-orion-green align-middle" />
                )}
              </pre>
            ) : !statusMsg ? (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
                <Sparkles className="mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Fill in the form and click Generate to stream content.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
