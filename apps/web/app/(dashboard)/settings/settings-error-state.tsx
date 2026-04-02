"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

export function SettingsErrorState() {
  const router = useRouter();

  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center space-y-4">
      <div className="flex justify-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground/50" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Could not load organization settings</p>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          The API server may not be running, or your session may have expired.
          Make sure both the web app and API server are running, then try again.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => router.refresh()}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Retry
      </Button>
    </div>
  );
}
