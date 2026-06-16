"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, FileText, Loader2, RefreshCw, Upload, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { createSupplementaryChunks } from "@/lib/supplementary-info"
import { stripLargeSourceArtifacts, stripLargeSourceArtifactsForUploadExtraction } from "@/lib/protocol-sanitize"
import { cn } from "@/lib/utils"
import type { StructuredDocumentExtraction, SupplementaryChunk } from "@/types"

export type SectionGenerationMode = "preserve" | "augment" | "generate"

type SectionInputReview = {
  summary: string
  recommendedMode: SectionGenerationMode
  sourceStatus: "not_found" | "partial" | "usable" | "strong"
  sourceEvidence: string[]
  improvements: string[]
  missingItems: string[]
  risks: string[]
  rationale: string
  updatedAt?: string
}

type SectionSourcePanelProps = {
  protocol: any
  setProtocol: React.Dispatch<React.SetStateAction<any>>
  sectionKey: string
  sectionName: string
  referenceExamples?: string
  isGenerating?: boolean
  compact?: boolean
  onGenerate: (mode: SectionGenerationMode) => void | Promise<void>
}

const defaultInstructions: Record<SectionGenerationMode, string> = {
  preserve: "Use source content as-is where available. Do not rewrite unless needed to fit the section structure.",
  augment: "Use source content as the foundation, improve wording, and fill only the gaps needed for a protocol-ready section.",
  generate: "Generate this section from the synopsis and any relevant section references.",
}

const modeLabels: Record<SectionGenerationMode, string> = {
  preserve: "Use source as-is",
  augment: "Improve with AI",
  generate: "Generate with AI",
}

const modeDescriptions: Record<SectionGenerationMode, string> = {
  preserve: "Extract matching source content without rewriting. If the source does not contain this section, the app will tell you instead of inventing it.",
  augment: "Keep source facts, improve protocol wording, and fill clear gaps.",
  generate: "Create the section when source detail is missing or too thin.",
}

const modeOptions: SectionGenerationMode[] = ["preserve", "augment", "generate"]

const sourceStatusLabels: Record<SectionInputReview["sourceStatus"], string> = {
  not_found: "No source content found",
  partial: "Partial source content",
  usable: "Usable source content",
  strong: "Strong source content",
}

const sourceStatusTone: Record<SectionInputReview["sourceStatus"], string> = {
  not_found: "bg-gray-100 text-gray-700",
  partial: "bg-amber-100 text-amber-800",
  usable: "bg-green-100 text-green-800",
  strong: "bg-green-100 text-green-800",
}

function getSectionCurrentData(protocol: any, sectionKey: string) {
  switch (sectionKey) {
    case "schedule":
      return {
        tableHeaders: protocol.tableHeaders,
        tableData: protocol.tableData,
        soaProvenance: protocol.soaProvenance,
      }
    case "criteria":
      return {
        inclusionCriteria: protocol.inclusionCriteria,
        exclusionCriteria: protocol.exclusionCriteria,
      }
    case "variables":
      return { dataVariables: protocol.dataVariables }
    case "studySchema":
      return { studySchema: protocol.studySchema }
    case "safetyDrugHandling":
      return { safetyDrugHandling: protocol.safetyDrugHandling }
    case "analysisplan":
      return { statisticalAnalysisPlan: protocol.statisticalAnalysisPlan }
    default:
      return {}
  }
}

function isSourceReadyReview(review: SectionInputReview | null | undefined) {
  const recommendedMode = String(review?.recommendedMode || "").toLowerCase()
  const sourceStatus = String(review?.sourceStatus || "").toLowerCase()
  const summary = String(review?.summary || "").toLowerCase()
  const rationale = String(review?.rationale || "").toLowerCase()
  const isUsableSource = sourceStatus === "strong" || sourceStatus === "usable" || sourceStatus.includes("strong") || sourceStatus.includes("usable")
  const isSourceRecommendation =
    recommendedMode === "preserve" ||
    recommendedMode.includes("source") ||
    summary.includes("use source as-is") ||
    summary.includes("source content is protocol-ready") ||
    summary.includes("well-documented and protocol-ready") ||
    rationale.includes("protocol-ready")

  return Boolean(
    review &&
      isUsableSource &&
      recommendedMode !== "generate" &&
      (isSourceRecommendation || sourceStatus === "strong")
  )
}

function isEmptyValue(value: any): boolean {
  if (value == null) return true
  if (Array.isArray(value)) return value.length === 0 || value.every(isEmptyValue)
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed || trimmed === "[]" || trimmed === "{}" || trimmed === "null") return true
    try {
      return isEmptyValue(JSON.parse(trimmed))
    } catch {
      return false
    }
  }
  if (typeof value === "object") {
    return Object.values(value).every(isEmptyValue)
  }
  return false
}

function isSectionContentEmpty(protocol: any, sectionKey: string) {
  const sectionData = getSectionCurrentData(protocol, sectionKey)
  return Object.values(sectionData).every(isEmptyValue)
}

function parseSupplementaryInfo(value: any): any[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return value.trim() ? [{ id: "legacy", type: "text", text: value }] : []
    }
  }
  return []
}

function getSectionReferences(items: any[], sectionKey: string, sectionName: string) {
  const key = sectionKey.toLowerCase()
  const name = sectionName.toLowerCase()
  return items.filter((item) => {
    const context = String(item?.context || "").toLowerCase()
    return context.includes(`scope: ${key}`) || context.includes(`scope: ${name}`)
  })
}

function createStructuredExtractionChunks(
  structuredExtraction: StructuredDocumentExtraction | null | undefined,
  sourceLabel: string,
  usage: string,
  idPrefix: string,
  startIndex: number
): SupplementaryChunk[] {
  if (!structuredExtraction) return []

  const chunks: SupplementaryChunk[] = []

  structuredExtraction.tables?.forEach((table, tableIndex) => {
    chunks.push({
      id: `${idPrefix}-table-${tableIndex + 1}`,
      sourceLabel: `${sourceLabel} - ${table.title}`,
      usage: [
        usage,
        table.recommendedUse === "schedule_of_activities"
          ? "Use this structured table preferentially for Schedule of Activities generation. Preserve table count, headers, merged-cell labels, row groups, notes, and visit timing where possible."
          : table.recommendedUse === "study_schema"
            ? "Use this structured table preferentially for Study Schema generation."
            : "Use this structured table as source evidence.",
      ].join(" "),
      type: "file",
      index: startIndex + chunks.length,
      text: [
        `STRUCTURED TABLE: ${table.title}`,
        `Recommended use: ${table.recommendedUse}`,
        `Extraction confidence: ${table.confidence}`,
        table.headers?.length ? `HEADERS:\n${table.headers.join(" | ")}` : "",
        table.cells?.length
          ? [
              "CELL GRID WITH SPANS:",
              ...table.cells.map((row) =>
                row
                  .map((cell) => {
                    const spanParts = [
                      cell.colSpan && cell.colSpan > 1 ? `colSpan=${cell.colSpan}` : "",
                      cell.rowSpan && cell.rowSpan > 1 ? `rowSpan=${cell.rowSpan}` : "",
                      cell.isHeader ? "header" : "",
                    ].filter(Boolean)
                    return `${cell.text || ""}${spanParts.length ? ` (${spanParts.join(", ")})` : ""}`
                  })
                  .join(" | ")
              ),
            ].join("\n")
          : "",
        table.rows?.length
          ? [
              "ROWS:",
              ...table.rows.map((row) => row.join(" | ")),
            ].join("\n")
          : "",
        table.rawText ? `RAW TABLE TEXT:\n${table.rawText}` : "",
      ].filter(Boolean).join("\n"),
    })
  })

  structuredExtraction.images?.forEach((image, imageIndex) => {
    chunks.push({
      id: `${idPrefix}-image-${imageIndex + 1}`,
      sourceLabel: `${sourceLabel} - ${image.filename || "embedded image"}`,
      usage: `${usage} ${
        image.recommendedUse === "study_schema"
          ? "Use this figure preferentially for Study Schema generation and preserve the documented flow as closely as possible."
          : "Treat this as a figure/image needing user confirmation or vision/OCR interpretation before exact protocol use."
      }`,
      type: "file",
      index: startIndex + chunks.length,
      text: [
        `IMAGE / FIGURE DETECTED: ${image.filename || image.id}`,
        `Recommended use: ${image.recommendedUse}`,
        image.visionSummary ? `Vision/OCR interpretation:\n${image.visionSummary}` : "",
        image.note,
      ].filter(Boolean).join("\n"),
    })
  })

  return chunks
}

function createStudySchemaSourceFigure(
  structuredExtraction: StructuredDocumentExtraction | null | undefined,
  sourceLabel: string
) {
  const image = structuredExtraction?.images?.find((item) => item.recommendedUse === "study_schema")
  if (!image) return null

  const imageDataUri = image.imageDataUri || (image as any).dataUri

  return {
    sourceLabel: image.source || sourceLabel,
    pageHint: image.filename || image.id,
    imageDataUri,
    extractedText: image.visionSummary || image.note || "",
    confidence: image.visionSummary ? "medium" : "low",
  }
}

function mergeSourceFigureIntoStudySchema(existingStudySchema: any, sourceFigure: any) {
  if (!sourceFigure) return existingStudySchema

  let parsed: any = null
  if (typeof existingStudySchema === "string" && existingStudySchema.trim()) {
    try {
      parsed = JSON.parse(existingStudySchema)
    } catch {
      parsed = null
    }
  } else if (existingStudySchema && typeof existingStudySchema === "object") {
    parsed = existingStudySchema
  }

  const presentationSchema = parsed?.presentationSchema || parsed || {}
  return JSON.stringify({
      presentationSchema: {
        ...presentationSchema,
        mode: presentationSchema.mode || "timeline",
        renderMode: sourceFigure.imageDataUri ? "source_image" : presentationSchema.renderMode,
        sourceStatus: presentationSchema.sourceStatus || "found",
        sourceStatusMessage: presentationSchema.sourceStatusMessage || "Source study schema figure detected during section upload.",
        sourceFigure,
      timelineSchema: presentationSchema.timelineSchema || {
        periods: [],
        arms: [],
        cells: [],
        milestones: [],
        connectors: [],
      },
    },
  })
}

function getProtocolComponents(protocol: any): any[] {
  if (!protocol?.components) return []
  if (Array.isArray(protocol.components)) return protocol.components
  if (typeof protocol.components === "string") {
    try {
      const parsed = JSON.parse(protocol.components)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function getPersistedSectionReview(protocol: any, sectionKey: string): SectionInputReview | null {
  const directReview = protocol?.sectionInputReviews?.reviews?.[sectionKey]
  if (directReview) return directReview

  const componentReview = getProtocolComponents(protocol)
    .find((component) => component?.type === "sectionInputReviews")
    ?.data
    ?.reviews
    ?.[sectionKey]

  return componentReview || null
}

function getPersistedSectionReviewError(protocol: any, sectionKey: string): string | null {
  const directError = protocol?.sectionInputReviews?.errors?.[sectionKey]
  if (directError) return String(directError)

  const componentError = getProtocolComponents(protocol)
    .find((component) => component?.type === "sectionInputReviews")
    ?.data
    ?.errors
    ?.[sectionKey]

  return componentError ? String(componentError) : null
}

function upsertSectionReview(components: any[], sectionKey: string, review: SectionInputReview) {
  const now = new Date().toISOString()
  const existing = components.find((component) => component?.type === "sectionInputReviews")
  const data = existing?.data || { reviews: {}, errors: {} }
  return [
    ...components.filter((component) => component?.type !== "sectionInputReviews"),
    {
      designStateId: existing?.designStateId || "default",
      type: "sectionInputReviews",
      data: {
        ...data,
        reviews: {
          ...(data.reviews || {}),
          [sectionKey]: {
            ...review,
            updatedAt: review.updatedAt || now,
          },
        },
        errors: {
          ...(data.errors || {}),
          [sectionKey]: undefined,
        },
      },
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    },
  ]
}

export function SectionSourcePanel({
  protocol,
  setProtocol,
  sectionKey,
  sectionName,
  referenceExamples,
  isGenerating = false,
  compact = false,
  onGenerate,
}: SectionSourcePanelProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const autoAppliedReviewRef = useRef<string | null>(null)
  const [mode, setMode] = useState<SectionGenerationMode>("augment")
  const [showReferenceUpload, setShowReferenceUpload] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isReviewing, setIsReviewing] = useState(false)
  const [sectionReview, setSectionReview] = useState<SectionInputReview | null>(null)
  const [sectionReviewError, setSectionReviewError] = useState<string | null>(null)
  const [reviewCacheLoaded, setReviewCacheLoaded] = useState(false)
  const [showReviewDetails, setShowReviewDetails] = useState(false)
  const [reviewDetailsOpenedByUser, setReviewDetailsOpenedByUser] = useState(false)
  const [showManualOptions, setShowManualOptions] = useState(false)
  const [instruction, setInstruction] = useState(
    `Use this file only for ${sectionName}. ${referenceExamples || "Use the relevant structure and details, adapted to the current synopsis."}`
  )

  const supplementaryItems = useMemo(
    () => parseSupplementaryInfo(protocol.supplementaryInfo),
    [protocol.supplementaryInfo]
  )
  const sectionReferences = useMemo(
    () => getSectionReferences(supplementaryItems, sectionKey, sectionName),
    [sectionKey, sectionName, supplementaryItems]
  )
  const hasExactSourceTable = useMemo(() => {
    const sourceTables = [
      ...(Array.isArray(protocol?.sourceExtraction?.tables) ? protocol.sourceExtraction.tables : []),
      ...sectionReferences.flatMap((item: any) =>
        Array.isArray(item?.structuredExtraction?.tables) ? item.structuredExtraction.tables : []
      ),
    ]
    return sectionKey === "schedule" && sourceTables.some((table: any) =>
      table?.recommendedUse === "schedule_of_activities" &&
      (table?.exactSourceAvailable === true || table?.sourceFormat === "docx_table")
    )
  }, [protocol?.sourceExtraction, sectionKey, sectionReferences])
  const getModeLabel = (option: SectionGenerationMode) =>
    option === "preserve" && hasExactSourceTable ? "Use exact source table" : modeLabels[option]
  const getModeDescription = (option: SectionGenerationMode) =>
    option === "preserve" && hasExactSourceTable
      ? "Copy the uploaded DOCX table structure into this section without AI rewriting."
      : modeDescriptions[option]
  const getPrimaryActionLabel = (option: SectionGenerationMode = mode) => {
    if (!sectionReview) return "Review Section Inputs"
    if (option === "preserve") return hasExactSourceTable ? "Use Exact Source Table" : "Use Source Content"
    if (option === "augment") return "Apply AI Improvements"
    return "Generate Draft"
  }
  const recommendationMode = sectionReview?.recommendedMode || mode
  const sourceReady = isSourceReadyReview(sectionReview)
  const sectionHasContent = !isSectionContentEmpty(protocol, sectionKey)
  const reviewCacheKey = `protocol-${protocol.id}-section-review-${sectionKey}-v1`
  const reviewSignature = useMemo(() => JSON.stringify({
    protocolId: protocol.id,
    sectionKey,
    sectionName,
    synopsis: protocol.synopsis || "",
    protocolType: protocol.protocolType || "",
    currentSectionData: getSectionCurrentData(protocol, sectionKey),
    sectionReferences: sectionReferences.map((item) => ({
      id: item.id,
      text: item.text,
      fileName: item.fileName,
      context: item.context,
    })),
  }), [protocol, sectionKey, sectionName, sectionReferences])

  useEffect(() => {
    try {
      const persistedReview = getPersistedSectionReview(protocol, sectionKey)
      if (persistedReview) {
        setSectionReview(persistedReview)
        setSectionReviewError(null)
        setMode(persistedReview.recommendedMode || "augment")
        setShowReviewDetails(!isSourceReadyReview(persistedReview) && !compact)
        setReviewDetailsOpenedByUser(false)
        setShowManualOptions(false)
        setReviewCacheLoaded(true)
        return
      }

      const persistedError = getPersistedSectionReviewError(protocol, sectionKey)
      if (persistedError) {
        setSectionReview(null)
        setSectionReviewError(persistedError)
        setReviewCacheLoaded(true)
        return
      }

      const cached = localStorage.getItem(reviewCacheKey)
      if (!cached) {
        setSectionReview(null)
        setSectionReviewError(null)
        setReviewCacheLoaded(true)
        return
      }

      const parsed = JSON.parse(cached)
      if (parsed.signature === reviewSignature && parsed.review) {
        setSectionReview(parsed.review)
        setSectionReviewError(null)
        setMode(parsed.review.recommendedMode || "augment")
        setShowReviewDetails(!isSourceReadyReview(parsed.review) && !compact)
        setReviewDetailsOpenedByUser(false)
        setShowManualOptions(false)
      } else {
        setSectionReview(null)
        setSectionReviewError(null)
      }
    } catch (error) {
      console.error("Error loading section input review:", error)
      setSectionReview(null)
      setSectionReviewError(null)
    } finally {
      setReviewCacheLoaded(true)
    }
  }, [protocol, reviewCacheKey, reviewSignature, sectionKey])

  const runSectionReview = async (force = false) => {
    if (!protocol.synopsis || isReviewing) return null
    if (!force && sectionReview) return sectionReview

    setIsReviewing(true)
    try {
      const response = await fetch("/api/review-section-inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol,
          sectionKey,
          sectionName,
          referenceExamples,
        }),
      })

      if (!response.ok) {
        let message = `Review failed with status ${response.status}`
        try {
          const payload = await response.json()
          message = payload?.error || payload?.message || message
        } catch {
          // Keep the status message when the server does not return JSON.
        }
        throw new Error(message)
      }

      const review = await response.json()
      setSectionReview(review)
      setMode(review.recommendedMode || "augment")
      setShowReviewDetails(!isSourceReadyReview(review) && !compact)
      setReviewDetailsOpenedByUser(false)
      setShowManualOptions(false)
      try {
        localStorage.setItem(reviewCacheKey, JSON.stringify({
          signature: reviewSignature,
          review: stripLargeSourceArtifacts(review),
        }))
      } catch (cacheError) {
        console.warn("Skipping section review local cache write:", cacheError)
      }
      setProtocol((prev: any) => {
        const components = upsertSectionReview(getProtocolComponents(prev), sectionKey, review)
        const existingReviews = prev.sectionInputReviews || { reviews: {}, errors: {} }
        return {
          ...prev,
          sectionInputReviews: {
            ...existingReviews,
            reviews: {
              ...(existingReviews.reviews || {}),
              [sectionKey]: review,
            },
            errors: {
              ...(existingReviews.errors || {}),
              [sectionKey]: undefined,
            },
          },
          components,
        }
      })
      return review as SectionInputReview
    } catch (error) {
      console.error("Error reviewing section inputs:", error)
      const message = error instanceof Error ? error.message : ""
      toast({
        title: "Section Review Failed",
        description: message.includes("OpenAI")
          ? message
          : `Could not review inputs for ${sectionName}. You can still choose a generation option manually.`,
        variant: "destructive",
      })
      return null
    } finally {
      setIsReviewing(false)
    }
  }

  useEffect(() => {
    if (!reviewCacheLoaded || sectionReview || sectionReviewError || isReviewing || !protocol.synopsis) return
    if (protocol.sectionInputReviewStatus === "running") return
    void runSectionReview(false)
  }, [reviewCacheLoaded, sectionReview, sectionReviewError, isReviewing, protocol.synopsis, protocol.sectionInputReviewStatus])

  useEffect(() => {
    if (!sourceReady || !sectionReview || isGenerating || isReviewing) return
    if (!isSectionContentEmpty(protocol, sectionKey)) return

    const reviewKey = [
      protocol.id,
      sectionKey,
      sectionReview.updatedAt || sectionReview.summary || sectionReview.rationale,
    ].join(":")
    if (autoAppliedReviewRef.current === reviewKey) return

    autoAppliedReviewRef.current = reviewKey
    setMode("preserve")
    setShowManualOptions(false)
    setShowReviewDetails(false)
    Promise.resolve(onGenerate("preserve")).catch((error) => {
      console.error(`Error applying source content for ${sectionName}:`, error)
      toast({
        title: "Source Content Not Applied",
        description: `The source review is ready, but ${sectionName} could not be populated automatically. You can run it manually.`,
        variant: "destructive",
      })
    })
  }, [isGenerating, isReviewing, onGenerate, protocol, sectionKey, sectionName, sectionReview, sourceReady, toast])

  const handleGenerateClick = async () => {
    if (!sectionReview) {
      await runSectionReview(false)
      return
    }
    await onGenerate(mode)
  }

  const handleAcceptRecommendation = async () => {
    if (!sectionReview || isGenerating || isReviewing) return

    const recommendedMode = sectionReview.recommendedMode || "augment"
    setMode(recommendedMode)
    await onGenerate(recommendedMode)
    setShowManualOptions(false)
    setReviewDetailsOpenedByUser(false)
    if (compact) {
      setShowReviewDetails(false)
    }
  }

  useEffect(() => {
    if (!sectionReview || isReviewing) return
    setMode(sectionReview.recommendedMode || "augment")
    setShowManualOptions(false)
    setReviewDetailsOpenedByUser(false)
    setShowReviewDetails(!isSourceReadyReview(sectionReview) && !compact)
  }, [compact, isReviewing, sectionReview])

  useEffect(() => {
    setShowManualOptions(false)
    setReviewDetailsOpenedByUser(false)
  }, [sectionKey])

  const sourceReadyAutoCollapsed = sourceReady && sectionHasContent && !reviewDetailsOpenedByUser && !showManualOptions && !isReviewing
  const showFullReview = !sourceReadyAutoCollapsed && (showReviewDetails || showManualOptions || isReviewing || !sectionReview)

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Upload a file under 10 MB for reliable section retrieval.",
        variant: "destructive",
      })
      event.target.value = ""
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("sectionKey", sectionKey)
      formData.append("sectionName", sectionName)
      formData.append("usage", instruction.trim() || defaultInstructions.augment)

      const response = await fetch("/api/upload-supplementary", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`)
      }

      const data = await response.json()
      const fileContent = String(data.text || data.fileContent || "")
      const structuredExtraction = data.structuredExtraction as StructuredDocumentExtraction | undefined
      const browserExtraction = stripLargeSourceArtifactsForUploadExtraction(structuredExtraction) as StructuredDocumentExtraction | undefined
      const id = `section-${sectionKey}-${Date.now()}`
      const context = `Scope: ${sectionKey}. ${instruction.trim() || defaultInstructions.augment}`
      const baseChunks = createSupplementaryChunks(fileContent, file.name, context, "file", id)
      const structuredChunks = createStructuredExtractionChunks(
        browserExtraction,
        file.name,
        context,
        `${id}-structured`,
        baseChunks.length + 1
      )
      const newItem = {
        id,
        type: "file",
        text: `Reference file: ${file.name}`,
        fileName: file.name,
        fileContent,
        context,
        sectionScope: sectionKey,
        structuredExtraction: browserExtraction,
        ragChunks: [
          ...baseChunks.map((chunk, index) => ({ ...chunk, id: `${id}-chunk-${index + 1}`, index: index + 1 })),
          ...structuredChunks.map((chunk, index) => ({ ...chunk, id: `${id}-structured-${index + 1}`, index: baseChunks.length + index + 1 })),
        ],
      }
      const updatedItems = [...supplementaryItems, newItem]
      const sourceFigure = createStudySchemaSourceFigure(browserExtraction, file.name)

      setProtocol((prev: any) => ({
        ...prev,
        supplementaryInfo: JSON.stringify(updatedItems),
        studySchema: sectionKey === "studySchema" && sourceFigure
          ? mergeSourceFigureIntoStudySchema(prev.studySchema, sourceFigure)
          : prev.studySchema,
      }))

      const tableCount = browserExtraction?.tables?.length || 0
      const figureCount = browserExtraction?.images?.filter((image) => image.recommendedUse === "study_schema").length || 0
      toast({
        title: "Reference added",
        description: [
          `${file.name} will be used only for ${sectionName}.`,
          tableCount ? `${tableCount} structured table${tableCount === 1 ? "" : "s"} captured.` : "",
          figureCount ? `${figureCount} schema figure${figureCount === 1 ? "" : "s"} captured.` : "",
        ].filter(Boolean).join(" "),
      })

      setShowReferenceUpload(false)
    } catch (error) {
      console.error("Error uploading section reference:", error)
      toast({
        title: "Upload failed",
        description: "Could not upload this reference file. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
      event.target.value = ""
    }
  }

  return (
    <div className="rounded-md border border-[#d0ebff] bg-[#f8fbff] p-4 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-[#228be6]" />
            <h3 className="font-medium text-[#212529]">
              {compact ? "Section Sources" : sourceReady ? `${sectionName} Source` : `Create ${sectionName}`}
            </h3>
          </div>
          <p className="mt-1 text-sm text-[#6c757d]">
            {sourceReady
              ? "Source content is protocol-ready. The tab uses it as-is unless you choose a different method."
              : compact
              ? "AI reviews source coverage and recommends the safest way to update this section."
              : "AI reviews source coverage and recommends whether to use source content, improve it, or generate missing content."}
          </p>
          {sectionReferences.length > 0 && (
            <p className="mt-2 text-xs text-[#1864ab]">
              {sectionReferences.length} section reference{sectionReferences.length === 1 ? "" : "s"} available for this tab.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 lg:items-end">
          {sourceReady && sectionHasContent && !showManualOptions ? (
            <span className="inline-flex h-9 items-center rounded-md border border-green-200 bg-green-50 px-3 text-sm font-medium text-green-700">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Source applied
            </span>
          ) : !sectionReview ? (
            <Button
              className="h-9 w-full bg-[#228be6] hover:bg-[#1864ab] sm:w-auto"
              onClick={handleGenerateClick}
              disabled={isGenerating || isReviewing || !protocol.synopsis}
            >
              {isGenerating || isReviewing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isReviewing ? "Reviewing..." : "Working..."}
                </>
              ) : (
                "Review Section Inputs"
              )}
            </Button>
          ) : null}
        </div>
      </div>

      {sectionReview && (sourceReadyAutoCollapsed || (!showReviewDetails && !showManualOptions && !isReviewing)) && (
        <div className="flex flex-col gap-3 rounded-md border bg-white p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-[#212529]">
                  {sourceReady ? "Source content is ready" : `Recommendation: ${getModeLabel(sectionReview.recommendedMode)}`}
                </p>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", sourceStatusTone[sectionReview.sourceStatus])}>
                  {sourceStatusLabels[sectionReview.sourceStatus]}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#6c757d]">
                {sourceReady
                  ? sectionHasContent
                    ? "The app has reproduced source content in this tab. No AI rewriting is needed unless you choose a different method."
                    : "The app is ready to reproduce source content in this tab without AI rewriting."
                  : sectionReview.summary}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(!sourceReady || !sectionHasContent) && (
              <Button
                type="button"
                size="sm"
                onClick={handleAcceptRecommendation}
                disabled={isGenerating || isReviewing}
                className="bg-[#228be6] hover:bg-[#1864ab]"
              >
                {isGenerating ? "Applying..." : getPrimaryActionLabel(sectionReview.recommendedMode)}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setReviewDetailsOpenedByUser(true)
                setShowReviewDetails(true)
              }}
            >
              View rationale
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setShowManualOptions(true)
                setReviewDetailsOpenedByUser(true)
                setShowReviewDetails(true)
              }}
            >
              Change method
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => runSectionReview(true)}
              disabled={isReviewing}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Run Again
            </Button>
          </div>
        </div>
      )}

      {showFullReview && (
      <div className="rounded-md border bg-white p-3">
        {isReviewing ? (
          <div className="flex items-start gap-3 text-sm text-[#495057]">
            <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-[#228be6]" />
            <div>
              <p className="font-medium text-[#212529]">AI is reviewing this section's inputs</p>
              <p className="mt-1 text-xs text-[#6c757d]">
                Checking source content, missing details, and whether this section should be copied, improved, or generated.
              </p>
            </div>
          </div>
        ) : !sectionReview && protocol.sectionInputReviewStatus === "running" ? (
          <div className="flex items-start gap-3 text-sm text-[#495057]">
            <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-[#228be6]" />
            <div>
              <p className="font-medium text-[#212529]">AI is reviewing all protocol sections</p>
              <p className="mt-1 text-xs text-[#6c757d]">
                This tab will show its source coverage recommendation as soon as the background review finishes.
              </p>
            </div>
          </div>
        ) : sectionReviewError ? (
          <div className="flex flex-col gap-3 text-sm md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
              <div>
                <p className="font-medium text-[#212529]">Background review is not available for this section</p>
                <p className="mt-1 text-xs text-[#6c757d]">
                  You can still choose a generation option manually or run this section review again.
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setSectionReviewError(null)
                void runSectionReview(true)
              }}
              disabled={isReviewing}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Run Review
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setShowManualOptions(true)
                setReviewDetailsOpenedByUser(true)
                setShowReviewDetails(true)
              }}
            >
              Choose manually
            </Button>
          </div>
        ) : sectionReview ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-[#212529]">AI recommendation: {getModeLabel(recommendationMode)}</p>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", sourceStatusTone[sectionReview.sourceStatus])}>
                      {sourceStatusLabels[sectionReview.sourceStatus]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#495057]">{sectionReview.summary}</p>
                  <p className="mt-1 text-xs text-[#6c757d]">{sectionReview.rationale}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => runSectionReview(true)}
                  disabled={isReviewing}
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Run Again
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAcceptRecommendation}
                  disabled={isGenerating || isReviewing}
                  className="bg-[#228be6] hover:bg-[#1864ab]"
                >
                  {getPrimaryActionLabel(sectionReview.recommendedMode)}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowManualOptions((value) => {
                      const nextValue = !value
                      if (nextValue) {
                        setReviewDetailsOpenedByUser(true)
                        setShowReviewDetails(true)
                      }
                      return nextValue
                    })
                  }}
                >
                  {showManualOptions ? "Hide methods" : "Change method"}
                </Button>
                {compact && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReviewDetailsOpenedByUser(false)
                      setShowReviewDetails(false)
                    }}
                  >
                    Hide review
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-3 text-xs md:grid-cols-3">
              <div className="rounded-md bg-[#f8f9fa] p-3">
                <p className="mb-1 font-medium text-[#495057]">Source found</p>
                {sectionReview.sourceEvidence.length > 0 ? (
                  <ul className="space-y-1 text-[#6c757d]">
                    {sectionReview.sourceEvidence.slice(0, 4).map((item, index) => (
                      <li key={index}>- {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#868e96]">No specific source content found for this section.</p>
                )}
              </div>
              <div className="rounded-md bg-[#fff9db] p-3">
                <p className="mb-1 font-medium text-[#8a5a00]">Improve or add</p>
                {[...sectionReview.improvements, ...sectionReview.missingItems].length > 0 ? (
                  <ul className="space-y-1 text-[#6c757d]">
                    {[...sectionReview.improvements, ...sectionReview.missingItems].slice(0, 4).map((item, index) => (
                      <li key={index}>- {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#868e96]">No major gaps identified.</p>
                )}
              </div>
              <div className="rounded-md bg-[#fff5f5] p-3">
                <p className="mb-1 font-medium text-[#c92a2a]">Risks or assumptions</p>
                {sectionReview.risks.length > 0 ? (
                  <ul className="space-y-1 text-[#6c757d]">
                    {sectionReview.risks.slice(0, 4).map((item, index) => (
                      <li key={index}>- {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#868e96]">No major risks identified.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 text-[#868e96]" />
              <div>
                <p className="font-medium text-[#212529]">Review this section before choosing an option</p>
                <p className="mt-1 text-xs text-[#6c757d]">
                  AI will check source availability and recommend whether to use source text, improve it, or generate missing content.
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => runSectionReview(true)}
              disabled={isReviewing || !protocol.synopsis}
              className="bg-[#228be6] hover:bg-[#1864ab]"
            >
              Review Section Inputs
            </Button>
          </div>
        )}
      </div>
      )}

      {showFullReview && showManualOptions && (
        <div className="space-y-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-[#6c757d]">Change method</p>
            {sectionReview && (
              <p className="text-xs text-[#868e96]">
                Recommended: <span className="font-medium text-[#1864ab]">{getModeLabel(sectionReview.recommendedMode)}</span>
              </p>
            )}
          </div>
          <div className={cn("grid gap-2", compact ? "md:grid-cols-3" : "md:grid-cols-3")}>
            {modeOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={cn(
                  "rounded-md border bg-white p-3 text-left transition-colors",
                  mode === option
                    ? "border-[#228be6] bg-[#e7f5ff] ring-1 ring-[#228be6]/30"
                    : "border-[#e9ecef] hover:border-[#74c0fc]"
                )}
              >
                <p className="text-sm font-medium text-[#212529]">{getModeLabel(option)}</p>
                <p className="mt-1 text-xs leading-5 text-[#6c757d]">{getModeDescription(option)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {!compact && showManualOptions && (
        <div className="rounded-md border border-[#d0ebff] bg-white px-3 py-2 text-xs text-[#495057]">
          Current choice: <span className="font-medium text-[#1864ab]">{getModeLabel(mode)}</span>
        </div>
      )}

      <div className="border-t border-[#d0ebff] pt-3">
        {!showReferenceUpload ? (
          <Button
            variant="outline"
            size="sm"
            className="bg-white"
            onClick={() => setShowReferenceUpload(true)}
          >
            <Upload className="mr-2 h-4 w-4" />
            Add reference file for this section
          </Button>
        ) : (
          <div className="space-y-3 rounded-md border border-[#e9ecef] bg-white p-3">
            <div>
              <p className="text-sm font-medium text-[#495057]">Instruction for this file</p>
              <p className="text-xs text-[#868e96]">
                Example: use this prior protocol only to model the Schedule of Activities structure.
              </p>
            </div>
            <Textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              className="min-h-[84px]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="bg-[#228be6] hover:bg-[#1864ab]"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Select File
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowReferenceUpload(false)}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <span className="text-xs text-[#868e96]">
                {sectionKey === "studySchema" ? "PDF, DOCX, TXT, or image up to 10 MB." : "PDF, DOCX, or TXT up to 10 MB."}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={sectionKey === "studySchema" ? ".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,.gif" : ".pdf,.docx,.txt"}
              onChange={handleUpload}
            />
          </div>
        )}
      </div>
    </div>
  )
}
