"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Search,
  Loader2,
  Target,
  FileText,
  Link as LinkIcon,
  Hash,
  BookOpen,
  BarChart2,
} from "lucide-react";

interface SEOResult {
  targetKeyword: string;
  secondaryKeywords: string[];
  metaTitle: string;
  metaDescription: string;
  suggestedHeadings: string[];
  wordCountTarget: number;
  internalLinkingOpportunities: string[];
  schemaMarkupType: string;
  contentBrief: string;
}

export function SEOAnalyzer({
  brandName,
  website,
}: {
  brandName: string;
  website: string;
}) {
  const toast = useAppToast();
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<SEOResult | null>(null);

  const [industry, setIndustry] = useState("");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");

  async function handleAnalyze() {
    if (!industry.trim() || !topic.trim()) return;

    setAnalyzing(true);
    setResult(null);

    try {
      const res = await api.post<{ data: SEOResult }>("/seo/analyze", {
        brandName,
        industry: industry.trim(),
        goalType: "traffic",
        contentTopic: topic.trim(),
        targetAudience: audience.trim() || undefined,
      });
      setResult(res.data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "SEO analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">SEO Analyzer</h1>
        <p className="text-sm text-muted-foreground">
          Get AI-powered keyword research and content briefs for {brandName || "your brand"}
        </p>
      </div>

      {/* Input Form */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Industry / Niche *</Label>
            <Input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. SaaS, Local bakery, Fitness coaching"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Target Audience</Label>
            <Input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. Small business owners, 25-40"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Content Topic *</Label>
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. How to increase website conversion rates"
            onKeyDown={(e) => {
              if (e.key === "Enter" && industry.trim() && topic.trim()) {
                handleAnalyze();
              }
            }}
          />
        </div>
        <Button
          onClick={handleAnalyze}
          disabled={analyzing || !industry.trim() || !topic.trim()}
          className="gap-2 bg-orion-green text-black hover:bg-orion-green-dim"
        >
          {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {analyzing ? "Analyzing..." : "Analyze Topic"}
        </Button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Target Keyword + Meta */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Target className="h-4 w-4 text-orion-green" />
                Target Keyword
              </div>
              <p className="text-lg font-bold text-orion-green">{result.targetKeyword}</p>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Secondary Keywords</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.secondaryKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs"
                    >
                      <Hash className="mr-1 h-2.5 w-2.5 text-muted-foreground" />
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4 text-orion-green" />
                Meta Tags
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Title ({result.metaTitle.length}/60)
                  </p>
                  <p className="text-sm font-medium rounded border border-border bg-muted/50 px-3 py-2">
                    {result.metaTitle}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Description ({result.metaDescription.length}/155)
                  </p>
                  <p className="text-sm text-muted-foreground rounded border border-border bg-muted/50 px-3 py-2">
                    {result.metaDescription}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Headings + Stats */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3 lg:col-span-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen className="h-4 w-4 text-orion-green" />
                Suggested Headings
              </div>
              <ol className="space-y-1.5 pl-5 list-decimal text-sm">
                {result.suggestedHeadings.map((h, i) => (
                  <li key={i} className="text-muted-foreground">
                    <span className="text-foreground">{h}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <BarChart2 className="h-4 w-4 text-orion-green" />
                  Content Specs
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Word Count</span>
                  <span className="font-mono font-bold">{result.wordCountTarget.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Schema Type</span>
                  <span className="font-mono text-xs">{result.schemaMarkupType}</span>
                </div>
              </div>

              {result.internalLinkingOpportunities.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <LinkIcon className="h-4 w-4 text-orion-green" />
                    Internal Links
                  </div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {result.internalLinkingOpportunities.map((link, i) => (
                      <li key={i}>• {link}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Content Brief */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-orion-green" />
              Content Brief
            </div>
            <div className="prose prose-sm max-w-none text-muted-foreground">
              {result.contentBrief.split("\n").map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
