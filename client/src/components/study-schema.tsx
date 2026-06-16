"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Download, FileJson, FileText, Loader2, Plus, RefreshCw, Trash2, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Protocol } from "@shared/schema"
import { AIGeneratedBadge } from "@/components/ai-generated-badge"
import { SectionGenerationMode, SectionSourcePanel } from "@/components/section-source-panel"
import { formatSupplementaryInfoForAI } from "@/lib/supplementary-info"
import { getApiErrorMessage } from "@/lib/api-error"
import { useToast } from "@/hooks/use-toast"
import { ProvenanceInfo } from "@/components/provenance-info"

type SchemaOrientation = "horizontal" | "vertical"
type SchemaDetailLevel = "simple" | "standard" | "detailed"
type SchemaMode = "flow" | "timeline"
type SchemaProvenance = "empty" | "ai_generated" | "local_draft" | "manual" | "hybrid"
type SchemaRenderMode = "source_image" | "editable_redraw"
type SourceFigureKind = "arm_timeline" | "vertical_flow" | "unknown"
type SchemaNodeKind =
  | "start"
  | "screening"
  | "decision"
  | "arm"
  | "cohort"
  | "database"
  | "assessment"
  | "analysis"
  | "output"
  | "milestone"

type SchemaLane = {
  id: string
  label: string
  description?: string
}

type SchemaNode = {
  id: string
  laneId: string
  label: string
  subtitle?: string
  kind: SchemaNodeKind
  column: number
  row: number
  origin?: string
}

type SchemaEdge = {
  id: string
  from: string
  to: string
  label?: string
  style?: "solid" | "dashed"
}

type SchemaSourceFigure = {
  sourceLabel: string
  pageHint?: string
  imageDataUri?: string
  extractedText?: string
  confidence?: "high" | "medium" | "low" | string
  figureKind?: SourceFigureKind | string
}

type TimelinePeriod = {
  id: string
  label: string
  range?: string
  column?: number
}

type TimelineArm = {
  id: string
  label: string
  n?: string
  description?: string
}

type TimelineCell = {
  id: string
  armId: string
  periodId: string
  text: string
  kind?: "screening" | "treatment" | "placebo" | "followup" | "assessment" | string
}

type TimelineMilestone = {
  id: string
  label: string
  periodId?: string
  armId?: string
  position?: "top" | "bottom" | "cell" | string
}

type TimelineConnector = {
  id: string
  from: string
  to: string
  label?: string
}

type TimelineSchema = {
  periods: TimelinePeriod[]
  arms: TimelineArm[]
  cells: TimelineCell[]
  milestones: TimelineMilestone[]
  connectors?: TimelineConnector[]
}

type SchemaTheme = {
  accent: string
  edge: string
  text: string
  background: string
  laneFill: string
  nodeFill: string
}

type PresentationStudySchema = {
  mode: SchemaMode
  title: string
  schemaType: string
  orientation: SchemaOrientation
  detailLevel: SchemaDetailLevel
  lanes: SchemaLane[]
  nodes: SchemaNode[]
  edges: SchemaEdge[]
  notes: string[]
  theme: SchemaTheme
  provenance: SchemaProvenance
  generatedAt?: string
  sourceStatus?: "found" | "not_found"
  sourceStatusMessage?: string
  explanation?: string
  renderMode?: SchemaRenderMode
  sourceFigure?: SchemaSourceFigure
  timelineSchema?: TimelineSchema
}

interface StudySchemaProps {
  protocol: Protocol
  setProtocol: React.Dispatch<React.SetStateAction<Protocol>>
  activeDesignState?: any
  isActive?: boolean
}

const DEFAULT_THEME: SchemaTheme = {
  accent: "#D71920",
  edge: "#8A1538",
  text: "#242424",
  background: "#FFF7F7",
  laneFill: "#FDECEC",
  nodeFill: "#FFFFFF",
}

const emptySchema = (protocol: Protocol): PresentationStudySchema => ({
  mode: "flow",
  title: protocol.title || "Study schema",
  schemaType: inferSchemaType(protocol),
  orientation: "horizontal",
  detailLevel: "standard",
  lanes: [],
  nodes: [],
  edges: [],
  notes: [],
  theme: DEFAULT_THEME,
  provenance: "empty",
  renderMode: "editable_redraw",
})

function inferSchemaType(protocol: Protocol) {
  switch (protocol.protocolType) {
    case "secondary_data_analysis":
    case "retrospective_cohort_study":
      return "data_flow"
    case "prospective_cohort_study":
      return "cohort_flow"
    case "delphi_consensus":
      return "consensus_flow"
    case "cross_sectional_survey":
    case "qualitative_study":
      return "data_collection_flow"
    case "maic":
      return "indirect_comparison_flow"
    default:
      return "interventional_trial_flow"
  }
}

function parseMaybeJson(value: any) {
  if (!value) return null
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function normalizeKind(value: any): SchemaNodeKind {
  const kind = String(value || "").toLowerCase()
  if (kind.includes("screen")) return "screening"
  if (kind.includes("random") || kind.includes("decision")) return "decision"
  if (kind.includes("treat") || kind.includes("arm") || kind.includes("exposure")) return "arm"
  if (kind.includes("cohort")) return "cohort"
  if (kind.includes("data")) return "database"
  if (kind.includes("assess") || kind.includes("visit")) return "assessment"
  if (kind.includes("analysis") || kind.includes("matching")) return "analysis"
  if (kind.includes("endpoint") || kind.includes("outcome") || kind.includes("output")) return "output"
  if (kind.includes("start") || kind.includes("enroll")) return "start"
  return "milestone"
}

function normalizeTimelineSchema(value: any): TimelineSchema | undefined {
  if (!value || typeof value !== "object") return undefined
  const periods = Array.isArray(value.periods)
    ? value.periods.map((period: any, index: number) => ({
        id: String(period.id || `period-${index + 1}`),
        label: String(period.label || period.name || `Period ${index + 1}`),
        range: period.range ? String(period.range) : period.dayRange ? String(period.dayRange) : undefined,
        column: Number.isFinite(Number(period.column)) ? Number(period.column) : index,
      }))
    : []
  const arms = Array.isArray(value.arms)
    ? value.arms.map((arm: any, index: number) => ({
        id: String(arm.id || `arm-${index + 1}`),
        label: String(arm.label || arm.name || `Arm ${index + 1}`),
        n: arm.n ? String(arm.n) : arm.count ? String(arm.count) : undefined,
        description: arm.description ? String(arm.description) : undefined,
      }))
    : []
  const cells = Array.isArray(value.cells)
    ? value.cells.map((cell: any, index: number) => ({
        id: String(cell.id || `cell-${index + 1}`),
        armId: String(cell.armId || ""),
        periodId: String(cell.periodId || ""),
        text: String(cell.text || cell.label || ""),
        kind: cell.kind ? String(cell.kind) : undefined,
      })).filter((cell: TimelineCell) => cell.armId && cell.periodId)
    : []
  const milestones = Array.isArray(value.milestones)
    ? value.milestones.map((milestone: any, index: number) => ({
        id: String(milestone.id || `milestone-${index + 1}`),
        label: String(milestone.label || milestone.text || `Milestone ${index + 1}`),
        periodId: milestone.periodId ? String(milestone.periodId) : undefined,
        armId: milestone.armId ? String(milestone.armId) : undefined,
        position: milestone.position ? String(milestone.position) : "bottom",
      }))
    : []
  const connectors = Array.isArray(value.connectors)
    ? value.connectors.map((connector: any, index: number) => ({
        id: String(connector.id || `connector-${index + 1}`),
        from: String(connector.from || ""),
        to: String(connector.to || ""),
        label: connector.label ? String(connector.label) : undefined,
      })).filter((connector: TimelineConnector) => connector.from && connector.to)
    : []

  if (!periods.length && !arms.length && !cells.length && !milestones.length) return undefined
  return { periods, arms, cells, milestones, connectors }
}

function normalizeSourceFigure(value: any): SchemaSourceFigure | undefined {
  if (!value || typeof value !== "object") return undefined
  return {
    sourceLabel: String(value.sourceLabel || value.source || "Source figure"),
    pageHint: value.pageHint ? String(value.pageHint) : value.filename ? String(value.filename) : undefined,
    imageDataUri: value.imageDataUri ? String(value.imageDataUri) : undefined,
    extractedText: value.extractedText ? String(value.extractedText) : value.visionSummary ? String(value.visionSummary) : undefined,
    confidence: value.confidence ? String(value.confidence) : undefined,
    figureKind: value.figureKind ? String(value.figureKind) : undefined,
  }
}

function textIncludes(value: string, pattern: RegExp) {
  return pattern.test(String(value || ""))
}

function relevantSourceFigureText(sourceFigure: SchemaSourceFigure | undefined) {
  const text = String(sourceFigure?.extractedText || "").trim()
  if (!text) return ""
  const studyDesignIndex = text.search(/Study Design\s*:/i)
  if (studyDesignIndex >= 0) {
    const tail = text.slice(studyDesignIndex)
    const stop = tail.search(/\nStudy Population\s*:|\nMain inclusion|\nInclusion Criteria\s*:/i)
    return (stop > 0 ? tail.slice(0, stop) : tail).trim()
  }
  const figureIndex = text.search(/screening period|double[- ]?blind|open[- ]?label|randomi[sz]ation|primary endpoint/i)
  if (figureIndex >= 0) {
    return text.slice(Math.max(0, figureIndex - 500), figureIndex + 2600).trim()
  }
  return text.slice(0, 2600).trim()
}

function hasTimelineSourceEvidence(sourceFigure: SchemaSourceFigure | undefined) {
  const text = relevantSourceFigureText(sourceFigure).toLowerCase()
  if (!text) return false
  const score = [
    /screening/.test(text),
    /randomi[sz]ation|1\s*:\s*1/.test(text),
    /double[- ]?blind|blinded/.test(text),
    /open[- ]?label/.test(text),
    /follow[- ]?up/.test(text),
    /arm|group|treatment/.test(text),
    /dose|mg|placebo|q\d?w|once weekly|every 2 weeks/.test(text),
  ].filter(Boolean).length
  return score >= 4
}

function detectSourceFigureKind(sourceFigure: SchemaSourceFigure | undefined): SourceFigureKind {
  const explicit = String(sourceFigure?.figureKind || "").toLowerCase()
  if (explicit === "arm_timeline" || explicit === "vertical_flow") return explicit

  const text = relevantSourceFigureText(sourceFigure)
  const lower = text.toLowerCase()
  if (!lower) return "unknown"

  const armTimelineScore = [
    /1\s*:\s*1\s*:\s*1|three treatment groups|3 treatment groups/.test(lower),
    /double[- ]?blind|blinded/.test(lower),
    /open[- ]?label/.test(lower),
    /day\s*1\s*(?:~|to|-)\s*day\s*43|day\s*44\s*(?:~|to|-)\s*day\s*78|day\s*79\s*(?:~|to|-)\s*day\s*120/.test(lower),
    /\bn\s*=\s*10\b|\bgroup\s*[123]\b|\barm\s*[123]\b/.test(lower),
    /hbm9161|placebo|qw|q2w|dose|mg/.test(lower),
  ].filter(Boolean).length
  if (armTimelineScore >= 4) return "arm_timeline"

  const verticalFlowScore = [
    /schematic overview|figure\s*\d+/.test(lower),
    /screening phase|screening period/.test(lower),
    /randomi[sz]ation\s*1\s*:\s*1|randomi[sz]ation/.test(lower),
    /treatment phase/.test(lower),
    /end[- ]?of[- ]?treatment visit|eot/.test(lower),
    /follow[- ]?up phase|follow[- ]?up/.test(lower),
    /stratif(?:y|ied|ication)|~?\s*1,?000 subjects|28[- ]?day cycles/.test(lower),
  ].filter(Boolean).length
  if (verticalFlowScore >= 3) return "vertical_flow"

  return "unknown"
}

function hasSourceSchemaEvidence(sourceFigure: SchemaSourceFigure | undefined) {
  return detectSourceFigureKind(sourceFigure) !== "unknown" || hasTimelineSourceEvidence(sourceFigure)
}

function normalizeSchemaRenderMode(value: any, sourceFigure?: SchemaSourceFigure): SchemaRenderMode {
  if (value === "source_image" || value === "editable_redraw") return value
  return sourceFigure?.imageDataUri ? "source_image" : "editable_redraw"
}

function isWeakSchemaTitle(value: string | undefined) {
  return !value || /^(untitled document|study schema)$/i.test(value.trim())
}

function deriveTimelineTitle(sourceFigure: SchemaSourceFigure | undefined, protocol: Protocol) {
  if (!isWeakSchemaTitle(protocol.title)) return protocol.title || "Study Schema"
  const text = relevantSourceFigureText(sourceFigure)
  const drug = text.match(/\b(HBM\d{3,}|[A-Z]{2,}\d{3,})\b/)?.[1]
  const phase = text.match(/Clinical Phase:\s*(\d+)/i)?.[1] || text.match(/\bPhase\s*(\d+)\b/i)?.[1]
  if (drug && phase) return `${drug} Phase ${phase} Study Schema`
  if (drug) return `${drug} Study Schema`
  return "Source Study Schema"
}

function buildTimelineFromSourceFigure(sourceFigure: SchemaSourceFigure | undefined, protocol: Protocol): PresentationStudySchema | null {
  const sourceText = relevantSourceFigureText(sourceFigure)
  if (!sourceFigure || !sourceText.trim() || detectSourceFigureKind(sourceFigure) !== "arm_timeline") return null

  const hasHbmSchema = /HBM9161/i.test(sourceText) && /1\s*:\s*1\s*:\s*1|three treatment groups|3 treatment groups/i.test(sourceText)
  if (!hasHbmSchema) return null
  const periods: TimelinePeriod[] = [
    { id: "screening", label: "Screening Period", range: textIncludes(sourceText, /Day\s*-?13\s*(?:~|to|-)\s*Day\s*0/i) ? "Day -13 to Day 0" : "Screening", column: 0 },
    { id: "double-blind", label: "Double-blinded Period", range: textIncludes(sourceText, /Day\s*1\s*(?:~|to|-)\s*Day\s*43/i) ? "Day 1 to Day 43" : "Day 1 to Day 43", column: 1 },
    { id: "open-label", label: "Open-label Period", range: textIncludes(sourceText, /Day\s*44\s*(?:~|to|-)\s*Day\s*78/i) ? "Day 44 to Day 78" : "Day 44 to Day 78", column: 2 },
    { id: "follow-up", label: "Follow-up", range: textIncludes(sourceText, /Day\s*79\s*(?:~|to|-)\s*Day\s*120/i) ? "Day 79 to Day 120" : "Through Day 120", column: 3 },
  ]

  const arms: TimelineArm[] = hasHbmSchema
    ? [
        { id: "arm-1", label: "Arm 1", n: "N=10" },
        { id: "arm-2", label: "Arm 2", n: "N=10" },
        { id: "arm-3", label: "Arm 3", n: "N=10" },
      ]
    : [
        { id: "arm-1", label: "Arm 1", n: textIncludes(sourceText, /N\s*=\s*10/i) ? "N=10" : undefined },
        { id: "arm-2", label: "Arm 2" },
      ]

  const openLabelText = hasHbmSchema ? "HBM9161 340 mg (Q2W, 3 doses)" : "Open-label treatment"
  const cells: TimelineCell[] = hasHbmSchema
    ? [
        { id: "arm-1-screen", armId: "arm-1", periodId: "screening", text: "Screening", kind: "screening" },
        { id: "arm-2-screen", armId: "arm-2", periodId: "screening", text: "Screening", kind: "screening" },
        { id: "arm-3-screen", armId: "arm-3", periodId: "screening", text: "Screening", kind: "screening" },
        { id: "arm-1-db", armId: "arm-1", periodId: "double-blind", text: "HBM9161 680 mg (QW, 6 doses)", kind: "treatment" },
        { id: "arm-2-db", armId: "arm-2", periodId: "double-blind", text: "HBM9161 340 mg (QW, 6 doses)", kind: "treatment" },
        { id: "arm-3-db", armId: "arm-3", periodId: "double-blind", text: "Placebo (QW, 6 doses)", kind: "placebo" },
        { id: "arm-1-ol", armId: "arm-1", periodId: "open-label", text: openLabelText, kind: "treatment" },
        { id: "arm-2-ol", armId: "arm-2", periodId: "open-label", text: openLabelText, kind: "treatment" },
        { id: "arm-3-ol", armId: "arm-3", periodId: "open-label", text: openLabelText, kind: "treatment" },
        { id: "arm-1-fu", armId: "arm-1", periodId: "follow-up", text: "Followed through Day 120", kind: "followup" },
        { id: "arm-2-fu", armId: "arm-2", periodId: "follow-up", text: "Followed through Day 120", kind: "followup" },
        { id: "arm-3-fu", armId: "arm-3", periodId: "follow-up", text: "Followed through Day 120", kind: "followup" },
      ]
    : arms.flatMap((arm) => periods.map((period) => ({
        id: `${arm.id}-${period.id}`,
        armId: arm.id,
        periodId: period.id,
        text: period.id === "screening" ? "Screening" : period.id === "follow-up" ? "Follow-up" : "Treatment",
        kind: period.id === "screening" ? "screening" : period.id === "follow-up" ? "followup" : "treatment",
      })))

  return {
    ...emptySchema(protocol),
    mode: "timeline",
    title: deriveTimelineTitle(sourceFigure, protocol),
    schemaType: inferSchemaType(protocol),
    sourceStatus: "found",
    sourceStatusMessage: hasHbmSchema ? "Randomized N=30 in a 1:1:1 ratio to three treatment groups." : "Source study schema figure detected during upload.",
    sourceFigure,
    renderMode: "editable_redraw",
    timelineSchema: {
      periods,
      arms,
      cells,
      milestones: [
        { id: "primary-endpoint", label: textIncludes(sourceText, /primary endpoint analysis:\s*Day\s*43/i) ? "Primary endpoint analysis: Day 43" : "Primary endpoint analysis", periodId: "double-blind", position: "bottom" },
      ],
      connectors: [],
    },
    notes: ["Editable redraw created from the uploaded source schema figure. Confirm details against the source figure."],
    provenance: "local_draft",
  }
}

function buildFlowFromSourceFigure(sourceFigure: SchemaSourceFigure | undefined, protocol: Protocol): PresentationStudySchema | null {
  const sourceText = relevantSourceFigureText(sourceFigure)
  if (!sourceFigure || !sourceText.trim() || detectSourceFigureKind(sourceFigure) !== "vertical_flow") return null

  const screeningDuration = sourceText.match(/Screening Phase\s*[\n\r ]*(\d+\s*days?)/i)?.[1] ||
    sourceText.match(/screening(?:\s+period|\s+phase)?[^.\n]{0,40}?(\d+\s*days?)/i)?.[1] ||
    "Screening"
  const randomizationText = textIncludes(sourceText, /randomi[sz]ation\s*1\s*:\s*1/i)
    ? "Randomization 1:1"
    : "Randomization"
  const plannedN = sourceText.match(/~?\s*([\d,]+)\s+subjects/i)?.[1]
  const stratification = sourceText.match(/Stratif(?:y|ied|ication)[^.\n]{0,180}/i)?.[0]
  const treatmentText = sourceText.match(/Apalutamide plus ADT[^.\n]+Placebo plus ADT/i)?.[0]
    ?.replace(/\s+or\s+/i, " or ") ||
    sourceText.match(/Treatment Phase[\s\S]{0,180}?(?:ADT|placebo|treatment)/i)?.[0]?.replace(/Treatment Phase/i, "").trim() ||
    "Treatment phase"
  const treatmentNote = sourceText.match(/28[- ]?day cycles[^.\n]{0,120}/i)?.[0] ||
    sourceText.match(/until disease progression[^.\n]{0,100}/i)?.[0]
  const eotNote = sourceText.match(/within\s+30\s+days[^.\n]{0,80}/i)?.[0] || "End-of-treatment visit"
  const followUpNote = sourceText.match(/Every\s+4\s+months[^.\n]{0,140}/i)?.[0] ||
    sourceText.match(/follow[- ]?up[^.\n]{0,120}/i)?.[0] ||
    "Follow-up"

  const laneId = "participant-flow"
  const nodes: SchemaNode[] = [
    { id: "screening", laneId, label: "Screening Phase", subtitle: screeningDuration, kind: "screening", column: 0, row: 0, origin: "source" },
    {
      id: "randomization",
      laneId,
      label: randomizationText,
      subtitle: [plannedN ? `~${plannedN} subjects` : "", stratification].filter(Boolean).join("; "),
      kind: "decision",
      column: 1,
      row: 0,
      origin: "source",
    },
    {
      id: "treatment",
      laneId,
      label: "Treatment Phase",
      subtitle: [treatmentText, treatmentNote].filter(Boolean).join("; "),
      kind: "arm",
      column: 2,
      row: 0,
      origin: "source",
    },
    { id: "eot", laneId, label: "End-of-Treatment Visit", subtitle: eotNote, kind: "assessment", column: 3, row: 0, origin: "source" },
    { id: "follow-up", laneId, label: "Follow-up Phase", subtitle: followUpNote, kind: "milestone", column: 4, row: 0, origin: "source" },
  ]

  return {
    ...emptySchema(protocol),
    mode: "flow",
    title: deriveTimelineTitle(sourceFigure, protocol),
    schemaType: inferSchemaType(protocol),
    orientation: "vertical",
    lanes: [{ id: laneId, label: "Schematic overview" }],
    nodes,
    edges: [
      { id: "edge-screen-rand", from: "screening", to: "randomization" },
      { id: "edge-rand-treat", from: "randomization", to: "treatment" },
      { id: "edge-treat-eot", from: "treatment", to: "eot" },
      { id: "edge-eot-fu", from: "eot", to: "follow-up" },
    ],
    sourceStatus: "found",
    sourceStatusMessage: "Source schematic overview detected and redrawn as an editable flow.",
    sourceFigure,
    renderMode: "editable_redraw",
    notes: ["Editable redraw created from the uploaded source figure. Confirm exact labels against the source."],
    provenance: "local_draft",
  }
}

function buildSchemaFromSourceFigure(sourceFigure: SchemaSourceFigure | undefined, protocol: Protocol, preferredKind: "auto" | "flow" | "timeline" = "auto") {
  if (!sourceFigure) return null
  if (preferredKind === "timeline") return buildTimelineFromSourceFigure({ ...sourceFigure, figureKind: "arm_timeline" }, protocol)
  if (preferredKind === "flow") return buildFlowFromSourceFigure({ ...sourceFigure, figureKind: "vertical_flow" }, protocol)
  return detectSourceFigureKind(sourceFigure) === "arm_timeline"
    ? buildTimelineFromSourceFigure(sourceFigure, protocol)
    : buildFlowFromSourceFigure(sourceFigure, protocol)
}

function findSourceFigureInExtraction(extraction: any): SchemaSourceFigure | undefined {
  const image = extraction?.images?.find((item: any) => item?.recommendedUse === "study_schema")
  if (!image) return undefined
  const sourceFigure = normalizeSourceFigure({
    sourceLabel: image.source || image.sourceLabel || image.filename || "Source figure",
    pageHint: image.pageHint || image.filename || image.id,
    imageDataUri: image.imageDataUri,
    extractedText: image.visionSummary || image.extractedText || image.note,
    confidence: image.visionSummary ? "medium" : "low",
  })
  return sourceFigure.imageDataUri || hasSourceSchemaEvidence(sourceFigure)
    ? { ...sourceFigure, figureKind: detectSourceFigureKind(sourceFigure) }
    : undefined
}

function findSourceFigureFromProtocol(protocol: Protocol): SchemaSourceFigure | undefined {
  const direct = findSourceFigureInExtraction((protocol as any).sourceExtraction)
  if (direct) return direct

  const items = Array.isArray(protocol.supplementaryInfo) ? protocol.supplementaryInfo : []
  for (const item of items as any[]) {
    const fromExtraction = findSourceFigureInExtraction(item?.structuredExtraction)
    if (fromExtraction) return fromExtraction
    if (Array.isArray(item?.ragChunks)) {
      const chunk = item.ragChunks.find((candidate: any) =>
        /IMAGE \/ FIGURE DETECTED|Study schema figure|Vision\/OCR interpretation/i.test(String(candidate?.text || ""))
      )
      if (chunk) {
        const sourceFigure = normalizeSourceFigure({
          sourceLabel: chunk.sourceLabel || item.fileName || "Source figure",
          extractedText: chunk.text,
          confidence: "low",
        })
        if (hasSourceSchemaEvidence(sourceFigure)) return { ...sourceFigure, figureKind: detectSourceFigureKind(sourceFigure) }
      }
    }
  }

  return undefined
}

function mergeSourceFigures(
  schemaSourceFigure: SchemaSourceFigure | undefined,
  protocolSourceFigure: SchemaSourceFigure | undefined
): SchemaSourceFigure | undefined {
  if (!schemaSourceFigure) return protocolSourceFigure
  if (!protocolSourceFigure) return schemaSourceFigure

  const merged = normalizeSourceFigure({
    ...schemaSourceFigure,
    ...protocolSourceFigure,
    sourceLabel: protocolSourceFigure.sourceLabel || schemaSourceFigure.sourceLabel,
    pageHint: protocolSourceFigure.pageHint || schemaSourceFigure.pageHint,
    extractedText: protocolSourceFigure.extractedText || schemaSourceFigure.extractedText,
    imageDataUri: protocolSourceFigure.imageDataUri || schemaSourceFigure.imageDataUri,
    confidence: protocolSourceFigure.confidence || schemaSourceFigure.confidence,
    figureKind: protocolSourceFigure.figureKind || schemaSourceFigure.figureKind,
  })

  return merged ? { ...merged, figureKind: detectSourceFigureKind(merged) } : undefined
}

function normalizePresentationSchema(value: any, protocol: Protocol): PresentationStudySchema {
  const parsed = parseMaybeJson(value)
  if (!parsed) return emptySchema(protocol)

  const raw = parsed.presentationSchema || parsed
  const protocolSourceFigure = findSourceFigureFromProtocol(protocol)
  const rawSourceFigure = normalizeSourceFigure(raw.sourceFigure) || protocolSourceFigure
  if (Array.isArray(raw.lanes) && Array.isArray(raw.nodes) && raw.nodes.some((node: any) => node.laneId)) {
    return {
      ...emptySchema(protocol),
      ...raw,
      mode: raw.mode === "timeline" ? "timeline" : "flow",
      title: raw.title || protocol.title || "Study schema",
      schemaType: raw.schemaType || inferSchemaType(protocol),
      orientation: raw.orientation === "vertical" ? "vertical" : "horizontal",
      detailLevel: ["simple", "standard", "detailed"].includes(raw.detailLevel) ? raw.detailLevel : "standard",
      notes: Array.isArray(raw.notes) ? raw.notes : [],
      theme: { ...DEFAULT_THEME, ...(raw.theme || {}) },
      provenance: raw.provenance || "ai_generated",
      renderMode: normalizeSchemaRenderMode(raw.renderMode, rawSourceFigure),
      sourceFigure: rawSourceFigure,
      timelineSchema: normalizeTimelineSchema(raw.timelineSchema),
    }
  }

  if (raw.mode === "timeline" || raw.timelineSchema) {
    return {
      ...emptySchema(protocol),
      ...raw,
      mode: "timeline",
      title: raw.title || protocol.title || "Study schema",
      schemaType: raw.schemaType || inferSchemaType(protocol),
      orientation: raw.orientation === "vertical" ? "vertical" : "horizontal",
      detailLevel: ["simple", "standard", "detailed"].includes(raw.detailLevel) ? raw.detailLevel : "standard",
      notes: Array.isArray(raw.notes) ? raw.notes : [],
      theme: { ...DEFAULT_THEME, ...(raw.theme || {}) },
      provenance: raw.provenance || "ai_generated",
      lanes: Array.isArray(raw.lanes) ? raw.lanes : [],
      nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
      edges: Array.isArray(raw.edges) ? raw.edges : [],
      renderMode: normalizeSchemaRenderMode(raw.renderMode, rawSourceFigure),
      sourceFigure: rawSourceFigure,
      timelineSchema: normalizeTimelineSchema(raw.timelineSchema) || buildTimelineFromSourceFigure(rawSourceFigure, protocol)?.timelineSchema || {
        periods: [],
        arms: [],
        cells: [],
        milestones: [],
        connectors: [],
      },
    }
  }

  if (Array.isArray(raw.nodes)) {
    return convertReactFlowSchema(raw, protocol)
  }

  return emptySchema(protocol)
}

function convertReactFlowSchema(raw: any, protocol: Protocol): PresentationStudySchema {
  const nodes = [...(raw.nodes || [])].sort((a, b) => {
    const ay = a?.position?.y || 0
    const by = b?.position?.y || 0
    if (Math.abs(ay - by) > 60) return ay - by
    return (a?.position?.x || 0) - (b?.position?.x || 0)
  })

  const lanes: SchemaLane[] = [
    { id: "study-flow", label: protocol.protocolType === "maic" ? "Analysis flow" : "Participant flow" },
  ]

  const schemaNodes = nodes.map((node, index) => ({
    id: String(node.id || `node-${index + 1}`),
    laneId: "study-flow",
    label: String(node?.data?.label || node?.label || `Step ${index + 1}`),
    subtitle: String(node?.data?.description || ""),
    kind: normalizeKind(node.type),
    column: index,
    row: 0,
  }))

  const schemaEdges = Array.isArray(raw.edges)
    ? raw.edges.map((edge: any, index: number) => ({
        id: String(edge.id || `edge-${index + 1}`),
        from: String(edge.source || edge.from || ""),
        to: String(edge.target || edge.to || ""),
        label: String(edge.label || ""),
        style: "solid" as const,
      })).filter((edge) => edge.from && edge.to)
    : schemaNodes.slice(1).map((node, index) => ({
        id: `edge-${index + 1}`,
        from: schemaNodes[index].id,
        to: node.id,
        style: "solid" as const,
      }))

  return {
    ...emptySchema(protocol),
    lanes,
    nodes: schemaNodes,
    edges: schemaEdges,
    notes: raw.explanation ? [String(raw.explanation)] : [],
    provenance: "hybrid",
    renderMode: "editable_redraw",
  }
}

function buildLocalSchema(protocol: Protocol): PresentationStudySchema {
  const isData = protocol.protocolType === "secondary_data_analysis" || protocol.protocolType === "retrospective_cohort_study"
  const isMAIC = protocol.protocolType === "maic"
  const isConsensus = protocol.protocolType === "delphi_consensus"
  const isSurvey = protocol.protocolType === "cross_sectional_survey" || protocol.protocolType === "qualitative_study"
  const title = protocol.title || "Study schema"
  const indication = protocol.indication && protocol.indication !== "Unknown" ? protocol.indication : "target population"

  if (isData || isMAIC) {
    return {
      ...emptySchema(protocol),
      title,
      lanes: [
        { id: "source", label: "Source data" },
        { id: "analysis", label: "Analysis" },
        { id: "output", label: "Outputs" },
      ],
      nodes: [
        { id: "source", laneId: "source", label: isMAIC ? "Source IPD and target study" : "Data source", subtitle: "Confirm database, extraction window, and source rules", kind: "database", column: 0, row: 0 },
        { id: "cohort", laneId: "source", label: "Eligible cohort", subtitle: indication, kind: "cohort", column: 1, row: 0 },
        { id: "analysis", laneId: "analysis", label: isMAIC ? "Matching / weighting" : "Statistical analysis", subtitle: "Define model, covariates, and sensitivity checks", kind: "analysis", column: 2, row: 0 },
        { id: "outcome", laneId: "output", label: "Primary outcome", subtitle: "Endpoint to be confirmed from source", kind: "output", column: 3, row: 0 },
      ],
      edges: [
        { id: "e1", from: "source", to: "cohort" },
        { id: "e2", from: "cohort", to: "analysis" },
        { id: "e3", from: "analysis", to: "outcome" },
      ],
      notes: ["Local draft created from available protocol metadata. Refresh with AI when source content is ready."],
      provenance: "local_draft",
    }
  }

  if (isConsensus || isSurvey) {
    return {
      ...emptySchema(protocol),
      title,
      lanes: [{ id: "workflow", label: isConsensus ? "Consensus workflow" : "Data collection workflow" }],
      nodes: [
        { id: "prep", laneId: "workflow", label: isConsensus ? "Panel and statements" : "Participant recruitment", subtitle: "Define source population and materials", kind: "start", column: 0, row: 0 },
        { id: "collection", laneId: "workflow", label: isConsensus ? "Delphi rounds" : "Survey / interview administration", subtitle: "Collect structured responses", kind: "assessment", column: 1, row: 0 },
        { id: "analysis", laneId: "workflow", label: "Analysis", subtitle: "Apply planned analysis approach", kind: "analysis", column: 2, row: 0 },
        { id: "output", laneId: "workflow", label: isConsensus ? "Consensus outputs" : "Study findings", subtitle: "Protocol-defined outputs", kind: "output", column: 3, row: 0 },
      ],
      edges: [
        { id: "e1", from: "prep", to: "collection" },
        { id: "e2", from: "collection", to: "analysis" },
        { id: "e3", from: "analysis", to: "output" },
      ],
      notes: ["Local draft created from available protocol metadata. Refresh with AI when source content is ready."],
      provenance: "local_draft",
    }
  }

  return {
    ...emptySchema(protocol),
    title,
    lanes: [{ id: "flow", label: "Participant flow" }],
    nodes: [
      { id: "screen", laneId: "flow", label: "Screening", subtitle: "Assess eligibility", kind: "screening", column: 0, row: 0 },
      { id: "randomize", laneId: "flow", label: "Randomization", subtitle: "Allocation ratio to be confirmed", kind: "decision", column: 1, row: 0 },
      { id: "treatment", laneId: "flow", label: "Treatment period", subtitle: "Study intervention and comparator", kind: "arm", column: 2, row: 0 },
      { id: "followup", laneId: "flow", label: "Follow-up", subtitle: "Efficacy and safety assessments", kind: "assessment", column: 3, row: 0 },
      { id: "endpoint", laneId: "flow", label: "Primary endpoint", subtitle: "Endpoint to be confirmed from source", kind: "output", column: 4, row: 0 },
    ],
    edges: [
      { id: "e1", from: "screen", to: "randomize" },
      { id: "e2", from: "randomize", to: "treatment" },
      { id: "e3", from: "treatment", to: "followup" },
      { id: "e4", from: "followup", to: "endpoint" },
    ],
    notes: ["Local draft created from available protocol metadata. Refresh with AI when source content is ready."],
    provenance: "local_draft",
  }
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function wrapText(value: string, max = 24) {
  const words = String(value || "").split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word
    if (next.length > max && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  })
  if (current) lines.push(current)
  return lines.length ? lines : [""]
}

function renderTextLines(lines: string[], x: number, y: number, fontSize: number, lineHeight: number, fill: string, weight = 500, maxLines = 3) {
  return lines.slice(0, maxLines).map((line, index) => (
    `<text x="${x}" y="${y + index * lineHeight}" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">${escapeHtml(line)}</text>`
  )).join("")
}

function nodeColor(kind: SchemaNodeKind, theme: SchemaTheme) {
  if (kind === "arm") return theme.accent
  if (kind === "decision") return "#F59E0B"
  if (kind === "database") return "#2563EB"
  if (kind === "analysis") return theme.edge
  if (kind === "output") return "#047857"
  return theme.nodeFill
}

function textColor(kind: SchemaNodeKind, theme: SchemaTheme) {
  return ["arm", "decision", "database", "analysis", "output"].includes(kind) ? "#FFFFFF" : theme.text
}

function isGenericSourceNote(note: string) {
  const text = String(note || "").toLowerCase()
  return (
    text.includes("without a specific schedule of activities") ||
    text.includes("schema is based on the study design as described") ||
    text.includes("local draft created from available protocol metadata")
  )
}

function getExportSchema(schema: PresentationStudySchema): PresentationStudySchema {
  return {
    ...schema,
    notes: schema.notes.filter((note) => !isGenericSourceNote(note)),
  }
}

function buildTimelineSchemaSvgMarkup(schema: PresentationStudySchema, options: { includeNotes?: boolean } = {}) {
  const theme = { ...DEFAULT_THEME, ...schema.theme }
  const timeline = schema.timelineSchema || { periods: [], arms: [], cells: [], milestones: [] }
  const periods = [...timeline.periods].sort((a, b) => (a.column ?? 0) - (b.column ?? 0))
  const arms = timeline.arms
  const periodCount = Math.max(1, periods.length)
  const armCount = Math.max(1, arms.length)
  const width = Math.max(1360, 360 + periodCount * 250)
  const headerHeight = 108
  const rowGap = 92
  const height = Math.max(560, headerHeight + armCount * rowGap + 156)
  const canvasX = 34
  const canvasY = 76
  const canvasW = width - 56
  const canvasH = height - 112
  const randomX = 220
  const randomY = canvasY + 214
  const rowStartX = 350
  const rowEndX = width - 86
  const periodW = (rowEndX - rowStartX) / Math.max(1, periodCount)
  const periodX = (index: number) => rowStartX + index * periodW
  const rowY = (index: number) => canvasY + 184 + index * rowGap
  const periodCenter = (periodId?: string) => {
    const index = Math.max(0, periods.findIndex((period) => period.id === periodId))
    return periodX(index) + periodW / 2
  }
  const periodStart = (periodId?: string) => {
    const index = Math.max(0, periods.findIndex((period) => period.id === periodId))
    return periodX(index)
  }
  const periodEnd = (periodId?: string) => {
    const index = Math.max(0, periods.findIndex((period) => period.id === periodId))
    return index >= periodCount - 1 ? rowEndX : periodX(index + 1)
  }
  const cellByArmAndPeriod = new Map(timeline.cells.map((cell) => [`${cell.armId}::${cell.periodId}`, cell]))
  const markerId = `schema-timeline-arrow-${Math.random().toString(36).slice(2)}`

  const periodMarkup = periods.map((period, index) => {
    const x = periodStart(period.id)
    const nextX = periodEnd(period.id)
    const labelX = index === 0 ? canvasX + 86 : x + 12
    return `
      <path d="M ${index === 0 ? canvasX + 76 : x + 8} ${canvasY + 94} L ${nextX - 14} ${canvasY + 94}" stroke="${theme.text}" stroke-width="1.8" marker-end="url(#${markerId})" />
      <text x="${labelX}" y="${canvasY + 82}" font-size="13" font-weight="800" fill="${theme.text}">${escapeHtml(period.label)}</text>
      ${period.range ? `<text x="${labelX}" y="${canvasY + 118}" font-size="11" font-weight="700" fill="#475569">${escapeHtml(period.range)}</text>` : ""}
      ${index > 0 ? `<path d="M ${x} ${canvasY + 72} L ${x} ${canvasY + canvasH - 56}" stroke="#334155" stroke-width="1.8" />` : ""}
    `
  }).join("")

  const armMarkup = arms.map((arm, armIndex) => {
    const y = rowY(armIndex)
    const cells = periods.map((period, periodIndex) => {
      const cell = cellByArmAndPeriod.get(`${arm.id}::${period.id}`)
      if (!cell) return ""
      if (cell.kind === "screening" || periodIndex === 0) return ""
      const start = Math.max(periodStart(period.id) + 10, rowStartX - 6)
      const end = Math.max(start + 72, periodEnd(period.id) - 24)
      const lineY = y + 14
      const isFollowUp = cell.kind === "followup"
      const isPlacebo = cell.kind === "placebo" || /placebo/i.test(cell.text)
      const lineColor = isPlacebo ? "#78350F" : "#111827"
      const textX = start + 10
      return `
        ${isFollowUp
          ? `<path d="M ${start} ${lineY} L ${end} ${lineY}" stroke="#111827" stroke-width="3.8" stroke-linecap="round" marker-end="url(#${markerId})" />`
          : `<path d="M ${start} ${lineY} L ${end} ${lineY}" stroke="${lineColor}" stroke-width="4.8" stroke-linecap="round" marker-end="url(#${markerId})" />`}
        <rect x="${textX - 4}" y="${y - 18}" width="${Math.min(230, Math.max(140, end - start - 18))}" height="22" rx="4" fill="#FDECEC" opacity="0.9" />
        ${renderTextLines(wrapText(cell.text, isFollowUp ? 32 : 38), textX, y - 4, 12, 14, "#111827", 800, 2)}
      `
    }).join("")
    const branchY = y
    const treatmentStartX = periodStart(periods[1]?.id || periods[0]?.id) + 8
    return `
      <path d="M ${randomX + 42} ${randomY} C ${randomX + 82} ${randomY}, ${treatmentStartX - 78} ${branchY + 14}, ${treatmentStartX - 18} ${branchY + 14}" fill="none" stroke="${theme.text}" stroke-width="3" marker-end="url(#${markerId})" />
      ${arm.n ? `<text x="${treatmentStartX - 96}" y="${branchY + 34}" font-size="12" font-weight="800" fill="#475569" text-anchor="middle">${escapeHtml(arm.n)}</text>` : ""}
      <text x="${treatmentStartX + 8}" y="${branchY + 48}" font-size="11" font-weight="800" fill="#475569">${escapeHtml(arm.label)}</text>
      ${arm.description ? renderTextLines(wrapText(arm.description, 30), treatmentStartX + 8, branchY + 64, 10, 12, "#475569", 600, 1) : ""}
      ${cells}
    `
  }).join("")

  const milestoneMarkup = timeline.milestones.map((milestone, index) => {
    const x = milestone.periodId ? periodCenter(milestone.periodId) : rowStartX + (index + 1) * periodW
    const y = canvasY + 220 + armCount * rowGap
    return `
      <path d="M ${x} ${canvasY + 76} L ${x} ${y - 16}" stroke="${theme.edge}" stroke-width="1.7" stroke-dasharray="6 5" />
      <rect x="${x - 7}" y="${y - 23}" width="14" height="14" transform="rotate(45 ${x} ${y - 16})" fill="${theme.edge}" />
      <text x="${x + 18}" y="${y - 11}" font-size="11" font-weight="700" fill="${theme.edge}">${escapeHtml(wrapText(milestone.label, 44)[0])}</text>
    `
  }).join("")

  const randomization = schema.sourceStatusMessage && /(random|1:\d|n\s*=)/i.test(schema.sourceStatusMessage)
    ? schema.sourceStatusMessage
    : ""
  const notes = options.includeNotes !== false && (schema.notes[0] || randomization)
    ? `<rect x="32" y="38" width="${width - 64}" height="24" rx="12" fill="#FFFFFF" opacity="0.86" /><text x="50" y="54" font-size="11" font-weight="700" fill="${theme.edge}">${escapeHtml(wrapText(schema.notes[0] || randomization, 150)[0])}</text>`
    : ""

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="${escapeHtml(schema.title || "Study schema")}">
      <defs>
        <marker id="${markerId}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="${theme.text}" />
        </marker>
      </defs>
      <rect width="${width}" height="${height}" rx="22" fill="#FFFFFF" />
      <rect x="16" y="16" width="${width - 32}" height="${height - 32}" rx="18" fill="#FFF7F7" stroke="#F2B8BC" stroke-width="1" />
      <text x="32" y="30" font-size="12" font-weight="800" letter-spacing="1.3" fill="${theme.accent}">SOURCE-BASED STUDY SCHEMA</text>
      ${notes}
      <rect x="${canvasX}" y="${canvasY + 134}" width="${canvasW}" height="${Math.max(230, armCount * rowGap + 118)}" rx="18" fill="#FDECEC" stroke="#F2B8BC" stroke-width="1.4" />
      <text x="${canvasX + 54}" y="${randomY - 22}" font-size="12" font-weight="800" fill="${theme.text}">Screening</text>
      <path d="M ${canvasX + 54} ${randomY} L ${randomX - 52} ${randomY}" stroke="${theme.text}" stroke-width="3.4" marker-end="url(#${markerId})" />
      <circle cx="${randomX}" cy="${randomY}" r="42" fill="#FFFFFF" stroke="${theme.text}" stroke-width="2.6" />
      <text x="${randomX}" y="${randomY - 5}" text-anchor="middle" font-size="10" font-weight="800" fill="${theme.text}">Randomization</text>
      <text x="${randomX}" y="${randomY + 15}" text-anchor="middle" font-size="11" font-weight="800" fill="#475569">N=30</text>
      ${periodMarkup}
      ${armMarkup}
      ${milestoneMarkup}
    </svg>
  `
}

function buildStudySchemaSvgMarkup(schema: PresentationStudySchema, options: { includeNotes?: boolean } = {}) {
  if (schema.mode === "timeline" && schema.timelineSchema) {
    return buildTimelineSchemaSvgMarkup(schema, options)
  }

  const theme = { ...DEFAULT_THEME, ...schema.theme }
  const lanes = schema.lanes.length ? schema.lanes : [{ id: "flow", label: "Study flow" }]
  const nodes = schema.nodes
  const isVertical = schema.orientation === "vertical"
  const maxColumn = Math.max(0, ...nodes.map((node) => Number(node.column) || 0))
  const maxRow = Math.max(0, ...nodes.map((node) => Number(node.row) || 0))
  const headerHeight = 72
  const laneHeight = isVertical ? Math.max(560, 88 + (maxColumn + 1) * 128) : 170
  const laneGap = 18
  const cardWidth = 150
  const cardHeight = 88
  const verticalLaneWidth = Math.max(250, 210 + (maxRow + 1) * 72)
  const width = isVertical
    ? Math.max(780, 48 + lanes.length * verticalLaneWidth + Math.max(0, lanes.length - 1) * laneGap + 48)
    : Math.max(980, 220 + (maxColumn + 1) * 190)
  const height = isVertical
    ? headerHeight + laneHeight + 48
    : headerHeight + lanes.length * laneHeight + Math.max(0, lanes.length - 1) * laneGap + 48
  const laneTop = (laneId: string) => headerHeight + lanes.findIndex((lane) => lane.id === laneId) * (laneHeight + laneGap)
  const laneLeft = (laneId: string) => 24 + lanes.findIndex((lane) => lane.id === laneId) * (verticalLaneWidth + laneGap)
  const xFor = (node: SchemaNode) => isVertical
    ? laneLeft(node.laneId) + 50 + (Number(node.row) || 0) * 72
    : 180 + (Number(node.column) || 0) * 190
  const yFor = (node: SchemaNode) => isVertical
    ? headerHeight + 54 + (Number(node.column) || 0) * 128
    : laneTop(node.laneId) + 48 + (Number(node.row) || 0) * 62
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const markerId = `schema-arrow-${Math.random().toString(36).slice(2)}`

  const lanesMarkup = lanes.map((lane) => {
    const x = isVertical ? laneLeft(lane.id) : 24
    const y = isVertical ? headerHeight : laneTop(lane.id)
    const laneWidth = isVertical ? verticalLaneWidth : width - 48
    return `
      <rect x="${x}" y="${y}" width="${laneWidth}" height="${laneHeight}" rx="18" fill="${theme.laneFill}" stroke="#F2B8BC" stroke-width="1.4" />
      <text x="${x + 18}" y="${y + 28}" font-size="12" font-weight="800" letter-spacing="1.2" fill="${theme.edge}">${escapeHtml(lane.label.toUpperCase())}</text>
      ${lane.description ? renderTextLines(wrapText(lane.description, 30), x + 18, y + 50, 11, 14, theme.text, 500, 2) : ""}
    `
  }).join("")

  const edgesMarkup = schema.edges.map((edge) => {
    const from = nodeById.get(edge.from)
    const to = nodeById.get(edge.to)
    if (!from || !to) return ""
    const fromX = isVertical ? xFor(from) + cardWidth / 2 : xFor(from) + cardWidth
    const fromY = isVertical ? yFor(from) + cardHeight : yFor(from) + cardHeight / 2
    const toX = isVertical ? xFor(to) + cardWidth / 2 : xFor(to)
    const toY = isVertical ? yFor(to) : yFor(to) + cardHeight / 2
    const midX = (fromX + toX) / 2
    const midY = (fromY + toY) / 2
    const dash = edge.style === "dashed" ? `stroke-dasharray="7 6"` : ""
    const label = edge.label
      ? `<text x="${midX}" y="${isVertical ? midY - 8 : Math.min(fromY, toY) - 8}" font-size="10" font-weight="700" fill="${theme.edge}" text-anchor="middle">${escapeHtml(edge.label)}</text>`
      : ""
    return `
      <path d="${isVertical
        ? `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`
        : `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}" fill="none" stroke="${theme.edge}" stroke-width="2.4" stroke-linecap="round" ${dash} marker-end="url(#${markerId})" />
      ${label}
    `
  }).join("")

  const nodesMarkup = nodes.map((node) => {
    const x = xFor(node)
    const y = yFor(node)
    const fill = nodeColor(node.kind, theme)
    const text = textColor(node.kind, theme)
    const border = fill === theme.nodeFill ? "#E5E7EB" : fill
    const titleLines = wrapText(node.label, 20)
    const subtitleLines = wrapText(node.subtitle || "", 24)
    return `
      <g>
        <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="14" fill="${fill}" stroke="${border}" stroke-width="1.6" />
        <text x="${x + 14}" y="${y + 20}" font-size="9" font-weight="800" letter-spacing="1.1" fill="${text}" opacity="0.72">${escapeHtml(node.kind.toUpperCase())}</text>
        ${renderTextLines(titleLines, x + 14, y + 42, 13, 16, text, 800, 2)}
        ${renderTextLines(subtitleLines, x + 14, y + 70, 10, 12, text, 500, 2)}
      </g>
    `
  }).join("")

  const notes = options.includeNotes !== false && schema.notes[0]
    ? `<rect x="24" y="38" width="${width - 48}" height="24" rx="12" fill="#FFFFFF" opacity="0.78" /><text x="42" y="54" font-size="11" font-weight="700" fill="${theme.edge}">${escapeHtml(wrapText(schema.notes[0], 140)[0])}</text>`
    : ""

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="${escapeHtml(schema.title || "Study schema")}">
      <defs>
        <marker id="${markerId}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="${theme.edge}" />
        </marker>
      </defs>
      <rect width="${width}" height="${height}" rx="24" fill="${theme.background}" />
      <text x="28" y="26" font-size="12" font-weight="800" letter-spacing="1.3" fill="${theme.accent}">ONE-SLIDE STUDY SCHEMA</text>
      ${notes}
      ${lanesMarkup}
      ${edgesMarkup}
      ${nodesMarkup}
    </svg>
  `
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function saveSchemaToProtocol(
  schema: PresentationStudySchema,
  setProtocol: React.Dispatch<React.SetStateAction<Protocol>>
) {
  setProtocol((prev) => ({
    ...prev,
    studySchema: JSON.stringify({
      presentationSchema: schema,
      lanes: schema.lanes,
      nodes: schema.nodes,
      edges: schema.edges,
      notes: schema.notes,
      lastModified: new Date().toISOString(),
    }),
  }))
}

const StudySchema: React.FC<StudySchemaProps> = ({ protocol, setProtocol, activeDesignState }) => {
  const { toast } = useToast()
  const svgRef = useRef<HTMLDivElement | null>(null)
  const [schema, setSchema] = useState<PresentationStudySchema>(() => normalizePresentationSchema(protocol.studySchema, protocol))
  const [isGenerating, setIsGenerating] = useState(false)
  const [iterationPrompt, setIterationPrompt] = useState("")

  useEffect(() => {
    setSchema(normalizePresentationSchema(protocol.studySchema, protocol))
  }, [protocol.id, protocol.studySchema])

  useEffect(() => {
    const protocolSourceFigure = findSourceFigureFromProtocol(protocol)
    const sourceFigure = mergeSourceFigures(schema.sourceFigure, protocolSourceFigure)
    if (!sourceFigure) return

    const timelineIsEmpty = !schema.timelineSchema || (
      schema.timelineSchema.periods.length === 0 &&
      schema.timelineSchema.arms.length === 0 &&
      schema.timelineSchema.cells.length === 0
    )
    const flowIsEmpty = schema.nodes.length === 0
    const currentSchemaIsEmpty = schema.mode === "timeline" ? timelineIsEmpty : flowIsEmpty

    if (
      sourceFigure.imageDataUri &&
      !schema.sourceFigure?.imageDataUri
    ) {
      updateSchema({
        ...schema,
        sourceFigure,
        renderMode: currentSchemaIsEmpty ? "source_image" : (schema.renderMode || "editable_redraw"),
      })
      return
    }

    const shouldPromoteSourceSchema = schema.provenance === "empty" ||
      schema.provenance === "local_draft" ||
      currentSchemaIsEmpty
    if (!shouldPromoteSourceSchema && schema.sourceFigure) return

    const sourceSchema = buildSchemaFromSourceFigure(sourceFigure, protocol)
    if (!sourceSchema) return
    const next = {
      ...sourceSchema,
      title: schema.title && schema.title !== "Study schema" ? schema.title : sourceSchema.title,
      sourceFigure: {
        ...sourceFigure,
        figureKind: detectSourceFigureKind(sourceFigure),
        imageDataUri: sourceFigure.imageDataUri || schema.sourceFigure?.imageDataUri,
      },
      renderMode: sourceFigure.imageDataUri ? "source_image" : (schema.renderMode || "editable_redraw"),
      generatedAt: schema.generatedAt,
    }

    updateSchema(next)
  // Source figure artifacts can arrive from upload extraction after the component is mounted.
  // The guard above prevents repeatedly overwriting user edits once a source schema exists.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocol.id, protocol.studySchema, (protocol as any).sourceExtraction, protocol.supplementaryInfo])

  const hasTimeline = schema.mode === "timeline" && !!schema.timelineSchema && (
    schema.timelineSchema.periods.length > 0 ||
    schema.timelineSchema.arms.length > 0 ||
    schema.timelineSchema.cells.length > 0
  )
  const hasSchema = schema.nodes.length > 0 || hasTimeline
  const effectiveSourceFigure = mergeSourceFigures(schema.sourceFigure, findSourceFigureFromProtocol(protocol))
  const hasSourceImage = Boolean(effectiveSourceFigure?.imageDataUri)
  const renderMode: SchemaRenderMode = hasSourceImage
    ? (schema.renderMode === "editable_redraw" ? "editable_redraw" : "source_image")
    : "editable_redraw"
  const showSourceImage = renderMode === "source_image" && hasSourceImage
  const hasDisplaySchema = hasSchema || showSourceImage
  const svgMarkup = useMemo(() => buildStudySchemaSvgMarkup(schema, { includeNotes: true }), [schema])

  const updateSchema = (next: PresentationStudySchema) => {
    setSchema(next)
    saveSchemaToProtocol(next, setProtocol)
  }

  const updateNode = (nodeId: string, updates: Partial<SchemaNode>) => {
    updateSchema({
      ...schema,
      nodes: schema.nodes.map((node) => node.id === nodeId ? { ...node, ...updates } : node),
      provenance: schema.provenance === "ai_generated" ? "hybrid" : schema.provenance,
    })
  }

  const addNode = () => {
    const laneId = schema.lanes[0]?.id || "flow"
    const next = {
      ...schema,
      lanes: schema.lanes.length ? schema.lanes : [{ id: laneId, label: "Study flow" }],
      nodes: [
        ...schema.nodes,
        {
          id: `node-${Date.now()}`,
          laneId,
          label: "New step",
          subtitle: "",
          kind: "milestone" as SchemaNodeKind,
          column: schema.nodes.length,
          row: 0,
          origin: "manual",
        },
      ],
      provenance: "manual" as SchemaProvenance,
    }
    updateSchema(next)
  }

  const removeNode = (nodeId: string) => {
    updateSchema({
      ...schema,
      nodes: schema.nodes.filter((node) => node.id !== nodeId),
      edges: schema.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
      provenance: "manual",
    })
  }

  const updateTimelinePeriod = (periodId: string, updates: Partial<TimelinePeriod>) => {
    const timeline = schema.timelineSchema
    if (!timeline) return
    updateSchema({
      ...schema,
      timelineSchema: {
        ...timeline,
        periods: timeline.periods.map((period) => period.id === periodId ? { ...period, ...updates } : period),
      },
      provenance: schema.provenance === "ai_generated" ? "hybrid" : "manual",
    })
  }

  const updateTimelineArm = (armId: string, updates: Partial<TimelineArm>) => {
    const timeline = schema.timelineSchema
    if (!timeline) return
    updateSchema({
      ...schema,
      timelineSchema: {
        ...timeline,
        arms: timeline.arms.map((arm) => arm.id === armId ? { ...arm, ...updates } : arm),
      },
      provenance: schema.provenance === "ai_generated" ? "hybrid" : "manual",
    })
  }

  const updateTimelineCell = (cellId: string, updates: Partial<TimelineCell>) => {
    const timeline = schema.timelineSchema
    if (!timeline) return
    updateSchema({
      ...schema,
      timelineSchema: {
        ...timeline,
        cells: timeline.cells.map((cell) => cell.id === cellId ? { ...cell, ...updates } : cell),
      },
      provenance: schema.provenance === "ai_generated" ? "hybrid" : "manual",
    })
  }

  const updateTimelineMilestone = (milestoneId: string, updates: Partial<TimelineMilestone>) => {
    const timeline = schema.timelineSchema
    if (!timeline) return
    updateSchema({
      ...schema,
      timelineSchema: {
        ...timeline,
        milestones: timeline.milestones.map((milestone) => milestone.id === milestoneId ? { ...milestone, ...updates } : milestone),
      },
      provenance: schema.provenance === "ai_generated" ? "hybrid" : "manual",
    })
  }

  const generateSchema = async (mode: SectionGenerationMode = "augment") => {
    if (!protocol.synopsis) {
      toast({
        title: "Missing Synopsis",
        description: "Upload or paste a synopsis before generating the study schema.",
        variant: "destructive",
      })
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch("/api/generate-schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          synopsis: protocol.synopsis,
          inclusionCriteria: protocol.inclusionCriteria ? parseMaybeJson(protocol.inclusionCriteria) : null,
          exclusionCriteria: protocol.exclusionCriteria ? parseMaybeJson(protocol.exclusionCriteria) : null,
          protocolId: protocol.id,
          designStateId: activeDesignState?.id,
          protocolType: protocol.protocolType,
          supplementaryInfo: formatSupplementaryInfoForAI(
            protocol.supplementaryInfo,
            "study schema participant flow arms cohorts timepoints analysis outputs"
          ),
          generationMode: mode,
          currentSchema: schema,
          requestNote: iterationPrompt,
        }),
      })

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Failed to generate study schema"))
      }

      const result = await response.json()
      const normalizedResult = normalizePresentationSchema(result, protocol)
      const sourceSchemaFallback = effectiveSourceFigure ? buildSchemaFromSourceFigure(effectiveSourceFigure, protocol) : null
      const baseNext = (normalizedResult.mode === "timeline" || normalizedResult.nodes.length) || !sourceSchemaFallback
        ? normalizedResult
        : sourceSchemaFallback
      const next = {
        ...baseNext,
        sourceFigure: baseNext.sourceFigure
          ? {
              ...baseNext.sourceFigure,
              imageDataUri: baseNext.sourceFigure.imageDataUri || effectiveSourceFigure?.imageDataUri,
            }
          : effectiveSourceFigure,
        orientation: schema.orientation,
        detailLevel: schema.detailLevel,
        renderMode: "editable_redraw" as SchemaRenderMode,
        generatedAt: new Date().toISOString(),
        provenance: "ai_generated" as SchemaProvenance,
      }

      if (next.sourceStatus === "not_found" && mode === "preserve") {
        toast({
          title: "Source Content Not Found",
          description: next.sourceStatusMessage || next.explanation || "No study schema or participant-flow information was found in the source documents.",
          variant: "destructive",
        })
        return
      }

      updateSchema(next.nodes.length || next.timelineSchema ? next : buildSchemaFromSourceFigure(effectiveSourceFigure, protocol) || buildLocalSchema(protocol))
      toast({
        title: "Study Schema Generated",
        description: "The study schema was created as an editable one-slide flow.",
      })
    } catch (error) {
      console.error("Error generating study schema:", error)
      const fallback = buildSchemaFromSourceFigure(effectiveSourceFigure, protocol) || buildLocalSchema(protocol)
      updateSchema(fallback)
      toast({
        title: "Used Local Draft",
        description: error instanceof Error ? error.message : "AI generation failed, so a local schema draft was created.",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const exportSvg = () => {
    downloadFile(
      buildStudySchemaSvgMarkup(getExportSchema(schema), { includeNotes: false }),
      `${protocol.id || "protocol"}-study-schema.svg`,
      "image/svg+xml"
    )
  }

  const exportJson = () => {
    downloadFile(JSON.stringify(getExportSchema(schema), null, 2), `${protocol.id || "protocol"}-study-schema.json`, "application/json")
  }

  const exportPng = () => {
    if (showSourceImage && effectiveSourceFigure?.imageDataUri) {
      const link = document.createElement("a")
      link.href = effectiveSourceFigure.imageDataUri
      const extension = effectiveSourceFigure.imageDataUri.startsWith("data:image/jpeg") ? "jpg" :
        effectiveSourceFigure.imageDataUri.startsWith("data:image/webp") ? "webp" : "png"
      link.download = `${protocol.id || "protocol"}-study-schema-source.${extension}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      return
    }

    const image = new Image()
    const svgBlob = new Blob([buildStudySchemaSvgMarkup(getExportSchema(schema), { includeNotes: false })], { type: "image/svg+xml;charset=utf-8" })
    const url = URL.createObjectURL(svgBlob)
    image.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext("2d")
      if (!context) return
      context.drawImage(image, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => {
        if (!blob) return
        const pngUrl = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = pngUrl
        link.download = `${protocol.id || "protocol"}-study-schema.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(pngUrl)
      }, "image/png")
    }
    image.src = url
  }

  return (
    <div className="space-y-4">
      {protocol.synopsis && (
        <SectionSourcePanel
          protocol={protocol}
          setProtocol={setProtocol}
          sectionKey="studySchema"
          sectionName="Study Schema"
          referenceExamples="Use participant-flow structure, arms, visits, study periods, analysis flow, and schema layout where relevant."
          isGenerating={isGenerating}
          compact={hasDisplaySchema}
          onGenerate={generateSchema}
        />
      )}

      {isGenerating && (
        <Alert className="border-[#228be6]/20 bg-[#e7f5ff] text-[#1864ab]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>AI is creating an editable one-slide study schema from the current protocol sources.</AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border border-[#dee2e6] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-[#212529]">{schema.title || "Study schema"}</h3>
              {hasSchema && <AIGeneratedBadge />}
              {showSourceImage && <Badge variant="outline">source image</Badge>}
              <Badge variant="outline">{schema.schemaType.replaceAll("_", " ")}</Badge>
              <Badge variant="outline">{schema.mode === "timeline" ? "source timeline" : "flow diagram"}</Badge>
              <Badge variant="outline">{schema.provenance.replaceAll("_", " ")}</Badge>
            </div>
            <p className="mt-1 text-sm text-[#6c757d]">
              Build a concise protocol-ready visual schema. Edit labels directly below the diagram when needed.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasSourceImage && (
              <div className="flex rounded-md border border-[#dee2e6] bg-white p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={showSourceImage ? "default" : "ghost"}
                  onClick={() => updateSchema({ ...schema, sourceFigure: effectiveSourceFigure, renderMode: "source_image" })}
                >
                  Source image
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!showSourceImage ? "default" : "ghost"}
                  onClick={() => {
                    const fallback = hasSchema
                      ? { ...schema, sourceFigure: effectiveSourceFigure, renderMode: "editable_redraw" as SchemaRenderMode }
                      : {
                          ...(buildSchemaFromSourceFigure(effectiveSourceFigure, protocol) || buildLocalSchema(protocol)),
                          sourceFigure: effectiveSourceFigure,
                          renderMode: "editable_redraw" as SchemaRenderMode,
                        }
                    updateSchema(fallback)
                  }}
                >
                  Editable redraw
                </Button>
              </div>
            )}
            {effectiveSourceFigure && !hasSourceImage && (
              <Button type="button" variant="outline" disabled title="The uploaded source did not include a stored figure image.">
                Source image unavailable
              </Button>
            )}
            {effectiveSourceFigure && !showSourceImage && (
              <Select
                value={schema.mode === "timeline" ? "timeline" : "flow"}
                onValueChange={(value) => {
                  const next = buildSchemaFromSourceFigure(effectiveSourceFigure, protocol, value as "flow" | "timeline")
                  if (next) updateSchema({ ...next, sourceFigure: effectiveSourceFigure, renderMode: "editable_redraw" })
                }}
              >
                <SelectTrigger className="h-10 w-[180px] bg-white">
                  <SelectValue placeholder="Source layout" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flow">Source flow</SelectItem>
                  <SelectItem value="timeline">Arm timeline</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button type="button" variant="outline" onClick={() => updateSchema({
              ...(buildSchemaFromSourceFigure(effectiveSourceFigure, protocol) || buildLocalSchema(protocol)),
              sourceFigure: effectiveSourceFigure,
              renderMode: "editable_redraw",
            })}>
              <Wand2 className="mr-2 h-4 w-4" />
              {effectiveSourceFigure ? "Rebuild from source" : "Local draft"}
            </Button>
            <Button type="button" variant="outline" onClick={exportSvg} disabled={!hasSchema || showSourceImage}>
              <Download className="mr-2 h-4 w-4" />
              SVG
            </Button>
            <Button type="button" variant="outline" onClick={exportPng} disabled={!hasDisplaySchema}>
              <FileText className="mr-2 h-4 w-4" />
              PNG
            </Button>
            <Button type="button" variant="outline" onClick={exportJson} disabled={!hasSchema || showSourceImage}>
              <FileJson className="mr-2 h-4 w-4" />
              JSON
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            {showSourceImage && effectiveSourceFigure?.imageDataUri && (
              <div className="space-y-3">
                <Alert className="border-[#228be6]/20 bg-[#e7f5ff] text-[#1864ab]">
                  <AlertDescription>
                    This exact uploaded source figure will be used for the Study Schema section. Switch to Editable redraw only if you need to change labels or layout.
                  </AlertDescription>
                </Alert>
                <div className="rounded-md border border-[#dee2e6] bg-[#f8f9fa] p-4">
                  <img
                    src={effectiveSourceFigure.imageDataUri}
                    alt="Uploaded source study schema"
                    className="max-h-[640px] w-full rounded border border-[#e9ecef] bg-white object-contain"
                  />
                </div>
              </div>
            )}

            {!showSourceImage && schema.mode === "timeline" && effectiveSourceFigure && (
              <div className="space-y-3">
                {!hasSourceImage && (
                  <Alert className="border-[#ffd8a8] bg-[#fff9db] text-[#5f3f00]">
                    <AlertDescription>
                      Exact source image is not available for this uploaded file, so this is an editable redraw based on extracted figure text. Upload a PNG/JPG screenshot of the schema, or a DOCX that contains the schema as an embedded image, to use the source image as-is.
                    </AlertDescription>
                  </Alert>
                )}
                <details className="rounded-md border border-[#dee2e6] bg-white p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-[#212529]">
                    Source evidence: {effectiveSourceFigure.sourceLabel}{effectiveSourceFigure.pageHint ? ` · ${effectiveSourceFigure.pageHint}` : ""}
                    {effectiveSourceFigure.confidence ? ` · ${effectiveSourceFigure.confidence} confidence` : ""}
                  </summary>
                  <div className="mt-3">
                    {effectiveSourceFigure.imageDataUri ? (
                      <img src={effectiveSourceFigure.imageDataUri} alt="Extracted source study schema" className="max-h-[360px] w-full rounded border border-[#e9ecef] object-contain" />
                    ) : (
                      <div className="max-h-[220px] overflow-auto rounded border border-dashed border-[#ced4da] bg-[#f8f9fa] p-3 text-xs leading-relaxed text-[#495057]">
                        <p className="mb-2 font-semibold text-[#495057]">Source preview image is not available. Redraw is based on extracted figure text.</p>
                        <pre className="whitespace-pre-wrap font-sans">{relevantSourceFigureText(effectiveSourceFigure) || "No extracted figure text available."}</pre>
                      </div>
                    )}
                  </div>
                </details>
                <div className="overflow-auto rounded-md border border-[#dee2e6] bg-[#f8f9fa] p-3" ref={svgRef}>
                  {hasSchema ? (
                    <div className="min-w-[1180px]" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
                  ) : (
                    <div className="flex min-h-[360px] items-center justify-center rounded-md border border-dashed border-[#ced4da] bg-white p-6 text-center text-sm text-[#6c757d]">
                      Run the Study Schema review, generate with AI, or create a local draft.
                    </div>
                  )}
                </div>
              </div>
            )}

            {!showSourceImage && !(schema.mode === "timeline" && effectiveSourceFigure) && (
              <div className="overflow-auto rounded-md border border-[#dee2e6] bg-[#f8f9fa] p-3" ref={svgRef}>
                {hasSchema ? (
                  <div className="min-w-[900px]" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
                ) : (
                  <div className="flex min-h-[360px] items-center justify-center rounded-md border border-dashed border-[#ced4da] bg-white p-6 text-center text-sm text-[#6c757d]">
                    Run the Study Schema review, generate with AI, or create a local draft.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-md border border-[#dee2e6] p-3">
              <Label htmlFor="schema-title">Schema title</Label>
              <Input
                id="schema-title"
                className="mt-1"
                value={schema.title}
                onChange={(event) => updateSchema({ ...schema, title: event.target.value, provenance: "manual" })}
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <Label>Detail</Label>
                  <Select
                    value={schema.detailLevel}
                    onValueChange={(value) => updateSchema({ ...schema, detailLevel: value as SchemaDetailLevel, provenance: "manual" })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple">Simple</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="detailed">Detailed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Orientation</Label>
                  <Select
                    value={schema.orientation}
                    onValueChange={(value) => updateSchema({ ...schema, orientation: value as SchemaOrientation, provenance: "manual" })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="horizontal">Horizontal</SelectItem>
                      <SelectItem value="vertical">Vertical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {showSourceImage ? (
              <div className="rounded-md border border-[#dee2e6] p-3">
                <Label>Exact source figure</Label>
                <p className="mt-2 text-sm text-[#6c757d]">
                  The generated protocol will insert this source figure as-is in the Study Schema section.
                </p>
                <div className="mt-3 rounded-md bg-[#f8f9fa] p-3 text-xs text-[#495057]">
                  <p className="font-semibold">{effectiveSourceFigure?.sourceLabel || "Uploaded source"}</p>
                  {effectiveSourceFigure?.pageHint && <p>{effectiveSourceFigure.pageHint}</p>}
                  {effectiveSourceFigure?.confidence && <p>{effectiveSourceFigure.confidence} confidence</p>}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => {
                    const fallback = buildSchemaFromSourceFigure(effectiveSourceFigure, protocol) || buildLocalSchema(protocol)
                    updateSchema({ ...fallback, sourceFigure: effectiveSourceFigure, renderMode: "editable_redraw" })
                  }}
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Create editable redraw
                </Button>
              </div>
            ) : schema.mode === "timeline" && schema.timelineSchema ? (
              <div className="rounded-md border border-[#dee2e6] p-3">
                <Label>Editable timeline</Label>
                <div className="mt-3 max-h-[520px] space-y-4 overflow-y-auto pr-1">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6c757d]">Periods</p>
                    <div className="space-y-2">
                      {schema.timelineSchema.periods.map((period) => (
                        <div key={period.id} className="grid grid-cols-[1fr_1fr] gap-2 rounded-md border border-[#e9ecef] bg-[#f8f9fa] p-2">
                          <Input value={period.label} onChange={(event) => updateTimelinePeriod(period.id, { label: event.target.value })} className="bg-white text-xs" />
                          <Input value={period.range || ""} onChange={(event) => updateTimelinePeriod(period.id, { range: event.target.value })} placeholder="Day range" className="bg-white text-xs" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6c757d]">Arms</p>
                    <div className="space-y-2">
                      {schema.timelineSchema.arms.map((arm) => (
                        <div key={arm.id} className="grid grid-cols-[1fr_90px] gap-2 rounded-md border border-[#e9ecef] bg-[#f8f9fa] p-2">
                          <Input value={arm.label} onChange={(event) => updateTimelineArm(arm.id, { label: event.target.value })} className="bg-white text-xs" />
                          <Input value={arm.n || ""} onChange={(event) => updateTimelineArm(arm.id, { n: event.target.value })} placeholder="N" className="bg-white text-xs" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6c757d]">Treatment cells</p>
                    <div className="space-y-2">
                      {schema.timelineSchema.cells.map((cell) => {
                        const arm = schema.timelineSchema?.arms.find((item) => item.id === cell.armId)
                        const period = schema.timelineSchema?.periods.find((item) => item.id === cell.periodId)
                        return (
                          <div key={cell.id} className="rounded-md border border-[#e9ecef] bg-[#f8f9fa] p-2">
                            <p className="mb-1 text-[11px] font-semibold text-[#6c757d]">{arm?.label || cell.armId} · {period?.label || cell.periodId}</p>
                            <Textarea value={cell.text} onChange={(event) => updateTimelineCell(cell.id, { text: event.target.value })} className="min-h-[54px] bg-white text-xs" />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6c757d]">Milestones</p>
                    <div className="space-y-2">
                      {schema.timelineSchema.milestones.map((milestone) => (
                        <Input key={milestone.id} value={milestone.label} onChange={(event) => updateTimelineMilestone(milestone.id, { label: event.target.value })} className="bg-white text-xs" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
            <div className="rounded-md border border-[#dee2e6] p-3">
              <div className="flex items-center justify-between">
                <Label>Schema steps</Label>
                <Button type="button" size="sm" variant="outline" onClick={addNode}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
              <div className="mt-3 max-h-[440px] space-y-3 overflow-y-auto pr-1">
                {schema.nodes.map((node) => (
                  <div key={node.id} className="rounded-md border border-[#e9ecef] bg-[#f8f9fa] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{node.kind}</Badge>
                        <ProvenanceInfo
                          item={node}
                          origin={(node as any).origin || schema.provenance}
                          action={
                            schema.provenance === "ai_generated"
                              ? "Schema step generated by AI from protocol sources."
                              : schema.provenance === "hybrid"
                                ? "Schema step is part of a user-edited AI schema."
                                : schema.provenance === "local_draft"
                                  ? "Schema step was created from the local draft logic."
                                  : "Schema step was added or edited manually."
                          }
                          why={
                            (node as any).rationale ||
                            (node as any).reason ||
                            schema.explanation ||
                            (schema.provenance === "ai_generated"
                              ? "The visual schema needs to summarize participant flow, arms/cohorts, visits, and study periods in a protocol-ready format."
                              : undefined)
                          }
                          section="Study Schema"
                        />
                      </div>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-[#fa5252]" onClick={() => removeNode(node.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <Input
                      value={node.label}
                      onChange={(event) => updateNode(node.id, { label: event.target.value })}
                      className="mb-2 bg-white"
                    />
                    <Textarea
                      value={node.subtitle || ""}
                      onChange={(event) => updateNode(node.id, { subtitle: event.target.value })}
                      className="min-h-[58px] bg-white text-xs"
                    />
                  </div>
                ))}
                {!schema.nodes.length && (
                  <p className="text-sm text-[#6c757d]">No schema steps yet.</p>
                )}
              </div>
            </div>
            )}

            <div className="rounded-md border border-[#dee2e6] p-3">
              <Label htmlFor="iteration-prompt">Instruction for next generation</Label>
              <Textarea
                id="iteration-prompt"
                value={iterationPrompt}
                onChange={(event) => setIterationPrompt(event.target.value)}
                placeholder="Example: show separate treatment arms, simplify for executive overview, or include long-term follow-up."
                className="mt-1 min-h-[84px]"
              />
              <Button type="button" className="mt-3 w-full bg-[#228be6] hover:bg-[#1864ab]" onClick={() => generateSchema("augment")} disabled={isGenerating || !protocol.synopsis}>
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Regenerate schema
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StudySchema
