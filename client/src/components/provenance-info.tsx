import React from "react"
import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export type ProvenanceOrigin =
  | "source"
  | "supporting_source"
  | "ai_improved"
  | "ai_generated"
  | "boilerplate"
  | "manual"
  | "placeholder"
  | "removed"
  | "unknown"

type ProvenanceInfoProps = {
  item?: any
  origin?: any
  sourceName?: string
  sourceExcerpt?: string
  action?: string
  why?: string
  confidence?: string
  section?: string
  className?: string
}

const originLabels: Record<ProvenanceOrigin, string> = {
  source: "Source document",
  supporting_source: "Supporting source",
  ai_improved: "AI improved",
  ai_generated: "AI generated",
  boilerplate: "Boilerplate",
  manual: "Manual edit",
  placeholder: "Placeholder",
  removed: "Removed from source",
  unknown: "Traceability",
}

const originActions: Record<ProvenanceOrigin, string> = {
  source: "Used as-is from source content.",
  supporting_source: "Retrieved from an uploaded supporting document.",
  ai_improved: "Source facts were retained and wording or structure was improved by AI.",
  ai_generated: "Created by AI because source content was missing, thin, or needed protocol-ready structure.",
  boilerplate: "Inserted from reusable standard protocol language.",
  manual: "Entered or edited by the user.",
  placeholder: "Required information was missing and needs user confirmation.",
  removed: "Present in source material but removed or not carried into the generated section.",
  unknown: "Source metadata was not available for this item.",
}

const originWhys: Record<ProvenanceOrigin, string> = {
  source: "The source text already contained usable information for this item.",
  supporting_source: "A supporting document was uploaded or referenced for this item.",
  ai_improved: "The source content was present but needed clearer protocol wording, structure, or completion of obvious gaps.",
  ai_generated: "The required content was missing, too thin, or needed a protocol-ready structure.",
  boilerplate: "This is standard reusable protocol language rather than study-specific evidence.",
  manual: "A user entered or edited this item directly.",
  placeholder: "Required information was not available in the current sources and should be confirmed.",
  removed: "The source material included this item, but it was not carried forward because it was not supported or not appropriate for the current protocol.",
  unknown: "The app does not have enough provenance metadata to explain why this item was created or changed.",
}

function normalizeOrigin(value: any): ProvenanceOrigin {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return "unknown"

  if (["supporting_source", "supplementary", "reference", "uploaded_file", "uploaded file", "file"].includes(raw)) {
    return "supporting_source"
  }
  if (["use_as_is", "use as is", "as_is", "as-is", "source", "source_text", "preserve", "preserved", "extracted"].includes(raw)) {
    return "source"
  }
  if (["improve", "improved", "enhance", "enhanced", "augment", "augmented", "rewritten"].includes(raw)) {
    return "ai_improved"
  }
  if (["add", "added", "generate", "generated", "ai_generated", "new"].includes(raw)) {
    return "ai_generated"
  }
  if (["boilerplate", "standard", "standard_text"].includes(raw)) {
    return "boilerplate"
  }
  if (["manual", "user", "user_edit", "edited"].includes(raw)) {
    return "manual"
  }
  if (["placeholder", "needs_user_input", "missing"].includes(raw)) {
    return "placeholder"
  }
  if (["remove", "removed", "deleted", "excluded"].includes(raw)) {
    return "removed"
  }

  return "unknown"
}

export function getProvenance(item?: any, explicitOrigin?: any): {
  origin: ProvenanceOrigin
  sourceName: string
  sourceExcerpt: string
  action: string
  why: string
  confidence: string
} {
  const rawOrigin =
    explicitOrigin ||
    item?.provenance?.origin ||
    item?.origin ||
    item?.sourceOrigin ||
    item?.sourceUse ||
    item?.sourceTreatment ||
    item?.classification ||
    item?.sourceType ||
    ""

  let origin = normalizeOrigin(rawOrigin)
  if (origin === "unknown") {
    if (item?.aiImproved) origin = "ai_improved"
    else if (item?.aiGenerated) origin = "ai_generated"
    else if (item?.manual || item?.manuallyAdded) origin = "manual"
  }

  const sourceName =
    item?.provenance?.sourceName ||
    item?.sourceName ||
    item?.fileName ||
    item?.documentName ||
    item?.sourceDocument ||
    (origin === "source" ? "Uploaded synopsis / PED" : "")

  const sourceExcerpt =
    item?.provenance?.sourceExcerpt ||
    item?.sourceExcerpt ||
    item?.sourceText ||
    item?.sourceValue ||
    item?.evidence ||
    item?.quote ||
    ""

  return {
    origin,
    sourceName,
    sourceExcerpt,
    action: item?.provenance?.action || item?.action || originActions[origin],
    why:
      item?.provenance?.why ||
      item?.why ||
      item?.reason ||
      item?.rationale ||
      item?.justification ||
      item?.impact ||
      item?.aiSuggestion ||
      item?.explanation ||
      originWhys[origin],
    confidence: item?.provenance?.confidence || item?.confidence || "",
  }
}

export function ProvenanceInfo({
  item,
  origin,
  sourceName,
  sourceExcerpt,
  action,
  why,
  confidence,
  section,
  className,
}: ProvenanceInfoProps) {
  const inferred = getProvenance(item, origin)
  const display = {
    ...inferred,
    sourceName: sourceName || inferred.sourceName,
    sourceExcerpt: sourceExcerpt || inferred.sourceExcerpt,
    action: action || inferred.action,
    why: why || inferred.why,
    confidence: confidence || inferred.confidence,
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#d0ebff] bg-white text-[#1c7ed6] hover:bg-[#e7f5ff]",
              className
            )}
            aria-label="Show source traceability"
            onClick={(event) => event.stopPropagation()}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[340px] text-xs">
          <div className="space-y-1.5">
            <p className="font-medium text-sm">{originLabels[display.origin]}</p>
            {section && (
              <p>
                <span className="font-medium">Section:</span> {section}
              </p>
            )}
            {display.sourceName && (
              <p>
                <span className="font-medium">Source:</span> {display.sourceName}
              </p>
            )}
            <p>
              <span className="font-medium">Action:</span> {display.action}
            </p>
            {display.why && (
              <p>
                <span className="font-medium">Why:</span> {display.why}
              </p>
            )}
            {display.confidence && (
              <p>
                <span className="font-medium">Confidence:</span> {display.confidence}
              </p>
            )}
            {display.sourceExcerpt && (
              <p className="border-t pt-1 text-[#495057]">
                <span className="font-medium">Evidence:</span> {String(display.sourceExcerpt).slice(0, 280)}
                {String(display.sourceExcerpt).length > 280 ? "..." : ""}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
