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
        "relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border py-16 text-center",
        className,
      )}
      style={{
        background:
          "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(0,255,136,0.06) 0%, transparent 70%)",
      }}
    >
      {/* Icon container with orion-green accent */}
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-orion-green/20 bg-orion-green/10 shadow-[0_0_24px_rgba(0,255,136,0.08)]">
        <Icon className="h-6 w-6 text-orion-green" />
      </div>

      <p className="font-semibold text-base">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>

      {actions && actions.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {actions.map((action) =>
            action.href ? (
              <Button
                key={action.label}
                variant={action.variant ?? "default"}
                size="sm"
                asChild
              >
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
