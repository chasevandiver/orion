"use client";

import { useState } from "react";
import Link from "next/link";
import { Rocket, ExternalLink, Plus, Sparkles } from "lucide-react";
import { GenerateLandingPageModal } from "./generate-modal";
import { EmptyState } from "@/components/ui/empty-state";

interface LandingPage {
  id: string;
  title: string;
  slug: string;
  shareToken?: string | null;
  publishedAt?: Date | string | null;
  metaTitle?: string | null;
  createdAt: Date | string;
  goal?: { type: string; brandName: string } | null;
  campaign?: { id: string; name: string } | null;
}

interface Props {
  pages: LandingPage[];
}

export function LandingPagesClient({ pages }: Props) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Landing Pages</h1>
          <p className="text-sm text-muted-foreground">AI-generated conversion pages</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
        >
          <Sparkles className="h-4 w-4" />
          Generate Landing Page
        </button>
      </div>

      {/* Empty state */}
      {pages.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title="No landing pages yet"
          description="Generate conversion-optimized landing pages for your campaigns. Each campaign auto-generates a branded capture page."
          actions={[
            { label: "Generate Landing Page", onClick: () => setShowModal(true) },
            { label: "Create Campaign", href: "/dashboard?newGoal=1", variant: "outline" },
          ]}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => (
            <div
              key={page.id}
              className="flex flex-col rounded-lg border border-border bg-card p-4 space-y-3 hover:border-border/80 transition-colors"
            >
              {/* Title */}
              <div>
                <p className="font-semibold leading-tight line-clamp-2">{page.title}</p>
              </div>

              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-2">
                {page.goal && (
                  <span className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {page.goal.brandName} &middot; {page.goal.type}
                  </span>
                )}
                {page.campaign && !page.goal && (
                  <span className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {page.campaign.name}
                  </span>
                )}

                {/* Status badge */}
                {page.publishedAt ? (
                  <span className="inline-flex items-center rounded border border-orion-green/30 bg-orion-green/10 px-2 py-0.5 text-xs font-medium text-orion-green">
                    Published
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Draft
                  </span>
                )}
              </div>

              {/* Meta title */}
              {page.metaTitle && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  <span className="font-medium">Meta:</span> {page.metaTitle}
                </p>
              )}

              {/* Created date */}
              <p className="text-xs text-muted-foreground">
                Created{" "}
                {new Date(page.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>

              {/* Links */}
              <div className="flex items-center gap-3 pt-1 border-t border-border">
                {page.shareToken ? (
                  <a
                    href={`/share/${page.shareToken}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-orion-green hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Live
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground/50">Not published</span>
                )}
                <Link
                  href={`/landing-pages/${page.id}/edit`}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <GenerateLandingPageModal open={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
}
