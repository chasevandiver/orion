"use client";

/**
 * ConfirmDialog — styled replacement for window.confirm().
 *
 * Usage:
 *   const confirm = useConfirmDialog();
 *   ...
 *   const ok = await confirm({ title: "Disconnect LinkedIn?", confirmLabel: "Disconnect" });
 *   if (!ok) return;
 *   ...
 *   return <>{confirm.dialog}...</>
 */

import { useCallback, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive styling for the confirm button (default true — most confirms guard deletions) */
  destructive?: boolean;
}

type ConfirmFn = ((options: ConfirmOptions) => Promise<boolean>) & {
  dialog: React.ReactNode;
};

export function useConfirmDialog(): ConfirmFn {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []) as ConfirmFn;

  function settle(ok: boolean) {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOptions(null);
  }

  confirm.dialog = (
    <Dialog open={options !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{options?.title}</DialogTitle>
          {options?.description && (
            <DialogDescription>{options.description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button variant="ghost" size="sm" onClick={() => settle(false)}>
            {options?.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={options?.destructive === false ? "default" : "destructive"}
            size="sm"
            onClick={() => settle(true)}
          >
            {options?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return confirm;
}
