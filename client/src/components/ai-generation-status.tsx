import React from "react";
import { Check, AlertTriangle, RefreshCw, Clock } from "lucide-react";

export type GenerationStatus = "pending" | "generating" | "complete" | "error";

export interface SectionStatus {
  name: string;
  status: GenerationStatus;
  message?: string;
}

interface AIGenerationStatusProps {
  sections: SectionStatus[];
}

export function AIGenerationStatus({ sections }: AIGenerationStatusProps) {
  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Section Status</h3>
      <div className="space-y-2">
        {sections.map((section) => (
          <div key={section.name} className="flex items-center justify-between">
            <div className="flex items-center">
              {section.status === "pending" && (
                <Clock className="h-4 w-4 text-gray-400 mr-2" />
              )}
              {section.status === "generating" && (
                <RefreshCw className="h-4 w-4 text-blue-500 mr-2 animate-spin" />
              )}
              {section.status === "complete" && (
                <Check className="h-4 w-4 text-green-500 mr-2" />
              )}
              {section.status === "error" && (
                <AlertTriangle className="h-4 w-4 text-red-500 mr-2" />
              )}
              <span className="text-sm">{section.name}</span>
            </div>
            <div>
              {section.status === "pending" && (
                <span className="text-xs text-gray-400">Waiting...</span>
              )}
              {section.status === "generating" && (
                <span className="text-xs text-blue-500">Generating...</span>
              )}
              {section.status === "complete" && (
                <span className="text-xs text-green-500">Complete</span>
              )}
              {section.status === "error" && (
                <span className="text-xs text-red-500">
                  {section.message || "Error"}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}