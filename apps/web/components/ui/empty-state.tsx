import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost";
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: EmptyStateAction[];
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center",
        className,
      )}
    >
      <Icon className="mb-4 h-10 w-10 text-muted-foreground/50" />
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
      {actions && actions.length > 0 && (
        <div className="mt-6 flex gap-2">
          {actions.map((action) =>
            action.href ? (
              <Button key={action.label} variant={action.variant ?? "default"} size="sm" asChild>
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ) : (
              <Button
                key={action.label}
                variant={action.variant ?? "default"}
                size="sm"
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
