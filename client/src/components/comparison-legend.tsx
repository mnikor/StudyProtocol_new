import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Info } from "lucide-react"

interface ComparisonLegendProps {
  showComparisonMode: boolean
}

export function ComparisonLegend({ showComparisonMode }: ComparisonLegendProps) {
  if (!showComparisonMode) return null

  return (
    <div className="flex flex-wrap items-center gap-4 mt-3">
      <div className="flex items-center gap-1">
        <span className="w-4 h-4 inline-block bg-white border-2 border-[#fa5252]"></span>
        <span className="text-xs text-[#6c757d]">Missing in your protocol</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info size={12} className="ml-1 text-[#adb5bd] cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                This assessment is commonly included in similar trials but is missing from your protocol.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex items-center gap-1">
        <span className="w-4 h-4 inline-block bg-white border-2 border-[#51cf66]"></span>
        <span className="text-xs text-[#6c757d]">Unique to your protocol</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info size={12} className="ml-1 text-[#adb5bd] cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                This assessment is included in your protocol but is uncommon in similar trials.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex items-center gap-1">
        <span className="w-4 h-4 inline-block bg-white border-2 border-[#4dabf7]"></span>
        <span className="text-xs text-[#6c757d]">Different timing</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info size={12} className="ml-1 text-[#adb5bd] cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                This assessment is performed at a different timepoint compared to similar trials.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex items-center gap-1">
        <span className="text-xs px-2 py-0.5 rounded-full bg-[#e7f5ff] text-[#1864ab]">8/10</span>
        <span className="text-xs text-[#6c757d]">Prevalence in similar trials</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info size={12} className="ml-1 text-[#adb5bd] cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">Shows how many similar trials include this assessment at this timepoint.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}
