"use client";

import { useToast } from "@/components/ui/use-toast";

export function useAppToast() {
  const { toast } = useToast();

  return {
    success: (title: string, description?: string) =>
      toast({ title, description, className: "border-orion-green/30 bg-orion-green/10 text-white" }),
    error: (title: string, description?: string) =>
      toast({ title, description, className: "border-red-500/30 bg-red-500/10 text-white" }),
    info: (title: string, description?: string) =>
      toast({ title, description, className: "border-orion-blue/30 bg-orion-blue/10 text-white" }),
  };
}
