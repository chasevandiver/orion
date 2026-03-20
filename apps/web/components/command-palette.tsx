"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useCommandStore } from "@/lib/command-store";
import {
  Target, Brain, FileText, Send, BarChart3, Users, Settings,
  CreditCard, CheckSquare, CalendarDays, GitBranch, Plus, Palette,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Goals", href: "/dashboard", icon: Target },
  { label: "Brand Kit", href: "/dashboard/brands", icon: Palette },
  { label: "Strategy", href: "/dashboard/strategy", icon: Brain },
  { label: "Content", href: "/dashboard/content", icon: FileText },
  { label: "Campaigns", href: "/dashboard/campaigns", icon: GitBranch },
  { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "Review", href: "/dashboard/review", icon: CheckSquare },
  { label: "Distribute", href: "/dashboard/distribute", icon: Send },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { label: "CRM", href: "/dashboard/contacts", icon: Users },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
  { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
];

export function CommandPalette() {
  const { open, setOpen } = useCommandStore();
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  function runCommand(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => router.push("/dashboard?newGoal=1"))}>
            <Plus className="mr-2 h-4 w-4" />
            Create New Goal
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map((item) => (
            <CommandItem key={item.href} onSelect={() => runCommand(() => router.push(item.href))}>
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
