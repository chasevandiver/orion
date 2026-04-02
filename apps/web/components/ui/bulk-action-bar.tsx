"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface BulkAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive" | "outline";
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  actions: BulkAction[];
  onClear: () => void;
  /** Singular noun for the count label — defaults to "item" */
  noun?: string;
}

/**
 * Fixed-to-bottom floating action bar for bulk operations.
 * Renders nothing when selectedCount is 0.
 */
export function BulkActionBar({
  selectedCount,
  actions,
  onClear,
  noun = "item",
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  const countLabel = `${selectedCount} ${noun}${selectedCount !== 1 ? "s" : ""} selected`;

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-xl border border-white/10 bg-[#0d0d0f]/95 px-4 py-2.5 shadow-2xl shadow-black/60 backdrop-blur-md animate-in slide-in-from-bottom-2 duration-200"
    >
      {/* Count label */}
      <span className="whitespace-nowrap text-sm font-medium text-white/60">
        {countLabel}
      </span>

      {/* Divider */}
      <div className="h-4 w-px shrink-0 bg-white/15" />

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {actions.map((action, i) => (
          <Button
            key={i}
            size="sm"
            disabled={action.disabled}
            onClick={action.onClick}
            className={`h-7 gap-1.5 text-xs font-medium border ${
              action.variant === "destructive"
                ? "border-red-500/40 bg-transparent text-red-400 hover:bg-red-500/10 hover:border-red-500/60 hover:text-red-300"
                : action.variant === "default"
                ? "border-[#00ff88]/40 bg-[#00ff88]/10 text-[#00ff88] hover:bg-[#00ff88]/20 hover:border-[#00ff88]/60"
                : "border-white/15 bg-transparent text-white/75 hover:bg-white/10 hover:text-white"
            }`}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}
      </div>

      {/* Clear */}
      <button
        onClick={onClear}
        className="ml-1 rounded p-1 text-white/30 transition-colors hover:text-white/70"
        aria-label="Clear selection"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
