import { AIGeneratedBadge } from "./ai-generated-badge";

export type AIOriginLabel = "AI Generated" | "AI Improved";

export function getAIOriginLabel(item: any): AIOriginLabel | null {
  const rawOrigin = String(
    item?.origin ||
    item?.sourceOrigin ||
    item?.sourceUse ||
    item?.sourceTreatment ||
    item?.classification ||
    ""
  ).toLowerCase();

  if (["use_as_is", "use as is", "as_is", "as-is", "source", "source_text", "preserve", "preserved", "extracted"].includes(rawOrigin)) {
    return null;
  }

  if (["improve", "improved", "enhance", "enhanced", "augment", "augmented"].includes(rawOrigin)) {
    return "AI Improved";
  }

  if (["add", "added", "generate", "generated", "ai_generated", "placeholder", "needs_user_input"].includes(rawOrigin)) {
    return "AI Generated";
  }

  if (item?.aiImproved) return "AI Improved";
  if (item?.aiGenerated) return "AI Generated";
  return null;
}

export function AIOriginBadge({ item, className }: { item: any; className?: string }) {
  const label = getAIOriginLabel(item);
  if (!label) return null;
  return <AIGeneratedBadge label={label} className={className} />;
}
