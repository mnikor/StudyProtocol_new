import React from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface ComparisonCellTooltipProps {
  category: string
  assessment: string
  timepoint: string
  prevalence: number
  totalTrials: number
  comparisonType: string
  children: React.ReactNode
}

export function ComparisonCellTooltip({
  category,
  assessment,
  timepoint,
  prevalence,
  totalTrials,
  comparisonType,
  children,
}: ComparisonCellTooltipProps) {
  // Get status text and color based on comparison type
  const getStatusInfo = () => {
    switch (comparisonType) {
      case "missing":
        return { text: "Missing in your schedule", color: "#fa5252" }
      case "unique":
        return { text: "Unique to your schedule", color: "#51cf66" }
      case "different":
        return { text: "Different timing", color: "#4dabf7" }
      default:
        return { text: "Standard assessment", color: "#adb5bd" }
    }
  }

  const statusInfo = getStatusInfo()

  // We need to make sure the children is a td element
  const child = React.Children.only(children)

  if (!React.isValidElement(child)) {
    return children
  }

  // Clone the child (which should be a td) and add the tooltip trigger
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{child}</TooltipTrigger>
        <TooltipContent className="p-0 overflow-hidden">
          <div className="max-w-xs">
            <div className="p-3 bg-[#f8f9fa] border-b border-[#dee2e6]">
              <h3 className="text-sm font-medium">{assessment}</h3>
              <p className="text-xs text-[#6c757d]">
                {category} - {timepoint}
              </p>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: statusInfo.color }}></span>
                <span className="text-sm">{statusInfo.text}</span>
              </div>
              <p className="text-xs text-[#6c757d] mb-2">
                This assessment appears in {prevalence} out of {totalTrials} similar trials at this timepoint.
              </p>
              <div className="text-xs text-[#228be6] cursor-pointer">View comparison details</div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
