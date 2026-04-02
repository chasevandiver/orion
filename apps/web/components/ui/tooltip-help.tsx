import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

interface TooltipHelpProps {
  text: string;
  side?: "top" | "right" | "bottom" | "left";
}

export function TooltipHelp({ text, side = "top" }: TooltipHelpProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-default">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
          </span>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-[220px] text-xs leading-snug">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
