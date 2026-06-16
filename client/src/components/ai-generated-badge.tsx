import React from "react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIGeneratedBadgeProps {
  className?: string;
  size?: "sm" | "md";
  label?: "AI Generated" | "AI Improved";
}

export function AIGeneratedBadge({ className, size = "sm", label = "AI Generated" }: AIGeneratedBadgeProps) {
  const isImproved = label === "AI Improved";

  return (
    <div 
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5",
        isImproved ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50",
        size === "sm" ? "text-xs" : "text-sm",
        className
      )}
    >
      <Bot 
        className={cn(
          isImproved ? "text-amber-600 mr-1" : "text-blue-500 mr-1",
          size === "sm" ? "h-3 w-3" : "h-4 w-4"
        )} 
      />
      <span className={cn("font-medium", isImproved ? "text-amber-800" : "text-blue-700")}>{label}</span>
    </div>
  );
}
