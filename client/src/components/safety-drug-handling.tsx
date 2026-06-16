import React, { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, FileWarning, Loader2, Pill, Plus, ShieldCheck, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { apiRequest } from "@/lib/apiRequest"
import { SectionGenerationMode, SectionSourcePanel } from "@/components/section-source-panel"
import { ProvenanceInfo } from "@/components/provenance-info"

type SafetyDrugHandlingProps = {
  protocol: any
  setProtocol: React.Dispatch<React.SetStateAction<any>>
  activeDesignState?: any
  isActive?: boolean
}

const emptySourceStatus = {
  investigatorBrochure: false,
  labelOrSmpc: false,
  riskManagementPlan: false,
  safetyManagementPlan: false,
  pharmacyManual: false,
  priorProtocol: false,
}

const defaultSafetyContent = {
  sourceStatus: emptySourceStatus,
  products: [] as Array<{
    id: string
    name: string
    role: string
    sourceStatus: typeof emptySourceStatus
    safetyRequirements: string
    handlingRequirements: string
    unresolvedItems: string[]
  }>,
  unresolvedItems: [
    "Drug-specific AESIs must be confirmed from IB, label/SmPC, RMP, or safety management plan.",
    "Dose modification and stopping rules must be confirmed from product-specific source documents.",
    "Storage, preparation, dispensing, return, and destruction requirements must be confirmed from a pharmacy manual or product handling reference.",
  ],
  content: "",
}

const sourceLabels: Record<string, string> = {
  investigatorBrochure: "Investigator's Brochure",
  labelOrSmpc: "Label / SmPC / USPI",
  riskManagementPlan: "Risk Management Plan",
  safetyManagementPlan: "Safety Management Plan",
  pharmacyManual: "Pharmacy Manual",
  priorProtocol: "Prior Protocol",
}

const productRoleOptions = [
  "investigational product",
  "comparator",
  "placebo",
  "background therapy",
  "rescue medication",
  "required concomitant medication",
  "combination component",
  "other",
]

function createProduct(name = "", role = "investigational product") {
  const productName = name.trim() || "New study product"
  return {
    id: `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: productName,
    role,
    sourceStatus: { ...emptySourceStatus },
    safetyRequirements: "",
    handlingRequirements: "",
    unresolvedItems: [
      `${productName}: confirm product-specific safety requirements from IB, label/SmPC/USPI, RMP, or safety management plan.`,
      `${productName}: confirm storage, preparation, dispensing, accountability, return/destruction, and unblinding requirements from pharmacy manual or prior protocol.`,
    ],
  }
}

function parseSafetyContent(value: any) {
  if (!value) return defaultSafetyContent
  if (typeof value === "object") {
    const products = Array.isArray(value.products)
      ? value.products.map((product: any) => ({
          ...createProduct(product?.name || "Study product", product?.role || "other"),
          ...product,
          sourceStatus: { ...emptySourceStatus, ...(product?.sourceStatus || {}) },
          unresolvedItems: Array.isArray(product?.unresolvedItems) ? product.unresolvedItems : [],
          safetyRequirements: product?.safetyRequirements || "",
          handlingRequirements: product?.handlingRequirements || "",
        }))
      : []
    return {
      ...defaultSafetyContent,
      ...value,
      sourceStatus: { ...defaultSafetyContent.sourceStatus, ...(value.sourceStatus || {}) },
      products,
      unresolvedItems: Array.isArray(value.unresolvedItems) ? value.unresolvedItems : defaultSafetyContent.unresolvedItems,
    }
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return parseSafetyContent(parsed)
    } catch {
      return { ...defaultSafetyContent, content: value }
    }
  }
  return defaultSafetyContent
}

function upsertComponent(components: any[] | undefined, data: any, designStateId?: string) {
  const now = new Date()
  const existing = Array.isArray(components) ? components : []
  const index = existing.findIndex((component) => component?.type === "safetyDrugHandling")
  const nextComponent = {
    designStateId: designStateId || "default",
    type: "safetyDrugHandling",
    data,
    createdAt: index >= 0 ? existing[index].createdAt || now : now,
    updatedAt: now,
  }
  if (index < 0) return [...existing, nextComponent]
  return existing.map((component, componentIndex) => componentIndex === index ? nextComponent : component)
}

export default function SafetyDrugHandling({
  protocol,
  setProtocol,
  activeDesignState,
  isActive,
}: SafetyDrugHandlingProps) {
  const { toast } = useToast()
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDetectingProducts, setIsDetectingProducts] = useState(false)
  const autoDetectAttemptedRef = useRef(false)
  const safetyData = useMemo(() => parseSafetyContent(protocol.safetyDrugHandling), [protocol.safetyDrugHandling])
  const sourceCount = Object.values(safetyData.sourceStatus).filter(Boolean).length
  const productSourceCount = safetyData.products.reduce((count, product) => (
    count + Object.values(product.sourceStatus || {}).filter(Boolean).length
  ), 0)
  const hasContent = safetyData.content.trim().length > 0
  const globalSourceGaps = useMemo(() => {
    const gaps: string[] = []
    if (!safetyData.sourceStatus.investigatorBrochure && !safetyData.sourceStatus.labelOrSmpc) {
      gaps.push("Upload an Investigator's Brochure or approved label/SmPC/USPI to support drug-specific risks, AESIs, contraindications, contraception, and safety monitoring.")
    }
    if (!safetyData.sourceStatus.safetyManagementPlan && !safetyData.sourceStatus.riskManagementPlan) {
      gaps.push("Upload a Safety Management Plan or Risk Management Plan to support AE/SAE/AESI reporting expectations and escalation pathways.")
    }
    if (!safetyData.sourceStatus.pharmacyManual && !safetyData.sourceStatus.priorProtocol) {
      gaps.push("Upload a Pharmacy Manual or prior protocol to support storage, preparation, dispensing, accountability, return, destruction, and unblinding procedures.")
    }
    return gaps
  }, [safetyData.sourceStatus])
  const productSourceGaps = useMemo(() => {
    return safetyData.products.flatMap((product) => {
      const gaps: string[] = []
      const label = product.name || "Study product"
      if (!product.sourceStatus.investigatorBrochure && !product.sourceStatus.labelOrSmpc) {
        gaps.push(`${label}: upload IB or label/SmPC/USPI for drug-specific risks, AESIs, contraindications, contraception, and monitoring.`)
      }
      if (!product.sourceStatus.safetyManagementPlan && !product.sourceStatus.riskManagementPlan) {
        gaps.push(`${label}: upload Safety Management Plan or RMP for SAE/AESI escalation and reporting expectations.`)
      }
      if (!product.sourceStatus.pharmacyManual && !product.sourceStatus.priorProtocol) {
        gaps.push(`${label}: upload Pharmacy Manual or prior protocol for storage, preparation, dispensing, accountability, return/destruction, and unblinding.`)
      }
      return gaps
    })
  }, [safetyData.products])
  const requiredSourceGaps = safetyData.products.length > 0 ? productSourceGaps : globalSourceGaps

  const updateSafetyData = (updates: Partial<typeof defaultSafetyContent>) => {
    const nextData = {
      ...safetyData,
      ...updates,
      sourceStatus: {
        ...safetyData.sourceStatus,
        ...(updates.sourceStatus || {}),
      },
      products: Array.isArray(updates.products) ? updates.products : safetyData.products,
    }

    setProtocol((prev: any) => ({
      ...prev,
      safetyDrugHandling: nextData,
      components: upsertComponent(prev.components, nextData, activeDesignState?.id),
    }))
  }

  const detectProducts = async () => {
    if (!protocol.synopsis) {
      toast({
        title: "Synopsis Required",
        description: "Add or upload a synopsis before detecting study products.",
        variant: "destructive",
      })
      return
    }

    setIsDetectingProducts(true)
    try {
      const result = await apiRequest("/api/detect-safety-products", "POST", { protocol })
      const detectedProducts = Array.isArray(result.products) ? result.products : []
      if (detectedProducts.length === 0) {
        toast({
          title: "No Products Detected",
          description: "No study products were detected. You can add them manually.",
        })
        return
      }

      const existingNames = new Set(safetyData.products.map((product) => product.name.toLowerCase()))
      const newProducts = detectedProducts
        .filter((product: any) => product?.name && !existingNames.has(String(product.name).toLowerCase()))
        .map((product: any) => ({
          ...createProduct(String(product.name), String(product.role || "other")),
          safetyRequirements: product.safetyRequirements || "",
          handlingRequirements: product.handlingRequirements || "",
          unresolvedItems: Array.isArray(product.unresolvedItems) && product.unresolvedItems.length > 0
            ? product.unresolvedItems
            : createProduct(String(product.name), String(product.role || "other")).unresolvedItems,
        }))

      if (newProducts.length === 0) {
        toast({
          title: "Products Already Listed",
          description: "Detected products are already present in the Study Products list.",
        })
        return
      }

      updateSafetyData({ products: [...safetyData.products, ...newProducts] })
      toast({
        title: "Study Products Detected",
        description: `${newProducts.length} product${newProducts.length === 1 ? "" : "s"} added for safety and handling review.`,
      })
    } catch (error) {
      console.error("Error detecting study products:", error)
      toast({
        title: "Product Detection Failed",
        description: "Could not detect study products from the current protocol inputs.",
        variant: "destructive",
      })
    } finally {
      setIsDetectingProducts(false)
    }
  }

  useEffect(() => {
    if (!isActive || autoDetectAttemptedRef.current || isDetectingProducts) return
    if (!protocol.synopsis || safetyData.products.length > 0) return

    autoDetectAttemptedRef.current = true
    void detectProducts()
  }, [isActive, protocol.synopsis, safetyData.products.length, isDetectingProducts])

  const addProduct = () => {
    updateSafetyData({ products: [...safetyData.products, createProduct()] })
  }

  const updateProduct = (productId: string, updates: any) => {
    updateSafetyData({
      products: safetyData.products.map((product) => (
        product.id === productId
          ? {
              ...product,
              ...updates,
              sourceStatus: {
                ...product.sourceStatus,
                ...(updates.sourceStatus || {}),
              },
            }
          : product
      )),
    })
  }

  const removeProduct = (productId: string) => {
    updateSafetyData({
      products: safetyData.products.filter((product) => product.id !== productId),
    })
  }

  const updateProductUnresolvedItem = (productId: string, index: number, value: string) => {
    updateSafetyData({
      products: safetyData.products.map((product) => (
        product.id === productId
          ? {
              ...product,
              unresolvedItems: product.unresolvedItems.map((item: string, itemIndex: number) => itemIndex === index ? value : item),
            }
          : product
      )),
    })
  }

  const addProductUnresolvedItem = (productId: string) => {
    updateSafetyData({
      products: safetyData.products.map((product) => (
        product.id === productId
          ? { ...product, unresolvedItems: [...product.unresolvedItems, `${product.name}: unresolved product-specific safety or handling item.`] }
          : product
      )),
    })
  }

  const removeProductUnresolvedItem = (productId: string, index: number) => {
    updateSafetyData({
      products: safetyData.products.map((product) => (
        product.id === productId
          ? { ...product, unresolvedItems: product.unresolvedItems.filter((_: string, itemIndex: number) => itemIndex !== index) }
          : product
      )),
    })
  }

  const handleGenerate = async (mode: SectionGenerationMode) => {
    if (!protocol.synopsis) {
      toast({
        title: "Synopsis Required",
        description: "Add or upload a synopsis before generating safety and drug handling content.",
        variant: "destructive",
      })
      return
    }

    const sourceGapInstruction = requiredSourceGaps.length > 0
      ? `Known source gaps that must remain visible as placeholders or unresolved items:\n${requiredSourceGaps.map((gap) => `- ${gap}`).join("\n")}`
      : "Product-specific safety sources have been marked as available in the Safety tab; still use only uploaded or source-supported facts for product-specific requirements."

    setIsGenerating(true)
    try {
      const result = await apiRequest("/api/generate-document", "POST", {
        protocol: {
          ...protocol,
          safetyDrugHandling: safetyData,
        },
        sectionId: "safety",
        sectionTitle: "Safety & Drug Handling",
        additionalInstructions: [
          `Safety tab generation mode: ${mode}.`,
          mode === "preserve"
            ? "Use only source-supported safety and drug handling content. If product-specific safety requirements are not present in sources, state that they are not available and use placeholders."
            : mode === "augment"
              ? "Use source facts as the foundation, improve protocol wording, and add placeholders for product-specific requirements that are not source-supported."
              : "Generate a protocol-ready safety and drug handling structure. Do not invent drug-specific risks, AESIs, dose modification rules, or handling requirements without source support; use clear placeholders instead.",
          sourceGapInstruction,
        ].join("\n"),
        previousSections: [],
        sourceReviewDecisions: [],
      })

      const generated = result?.sections?.[0]?.content || ""
      if (!generated) throw new Error("No safety content returned")

      const unresolvedItems = [
        ...safetyData.unresolvedItems.filter((item: string) => item.trim()),
        ...requiredSourceGaps,
        ...(sourceCount === 0 && productSourceCount === 0 ? ["No product-specific safety source document has been marked as available."] : []),
      ].filter((item, index, arr) => arr.indexOf(item) === index)

      updateSafetyData({
        content: generated,
        unresolvedItems,
        contentProvenance: {
          origin: mode === "preserve" ? "source" : mode === "augment" ? "ai_improved" : "ai_generated",
          action: mode === "preserve"
            ? "Safety content was assembled from source-supported text."
            : mode === "augment"
              ? "Safety source facts were retained and protocol wording was improved by AI."
              : "Safety structure was generated by AI with unresolved product-specific requirements preserved as placeholders.",
          sourceName: "Synopsis and available safety references",
        },
      })

      toast({
        title: "Safety Content Generated",
        description: "Review unresolved placeholders before final protocol generation.",
      })
    } catch (error) {
      console.error("Error generating safety and drug handling content:", error)
      toast({
        title: "Generation Failed",
        description: "Could not generate safety and drug handling content.",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const addUnresolvedItem = () => {
    updateSafetyData({
      unresolvedItems: [...safetyData.unresolvedItems, "New unresolved safety or drug handling item"],
    })
  }

  const updateUnresolvedItem = (index: number, value: string) => {
    updateSafetyData({
      unresolvedItems: safetyData.unresolvedItems.map((item: string, itemIndex: number) => itemIndex === index ? value : item),
    })
  }

  const removeUnresolvedItem = (index: number) => {
    updateSafetyData({
      unresolvedItems: safetyData.unresolvedItems.filter((_: string, itemIndex: number) => itemIndex !== index),
    })
  }

  return (
    <div className="space-y-5">
      <Card className={requiredSourceGaps.length > 0 ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              {requiredSourceGaps.length > 0 ? (
                <FileWarning className="mt-0.5 h-5 w-5 text-amber-600" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-700" />
              )}
              <div>
                <h3 className="font-medium text-[#212529]">
                  {requiredSourceGaps.length > 0 ? "Product-specific safety sources needed" : "Product-specific safety sources marked"}
                </h3>
                <p className="mt-1 text-sm text-[#495057]">
                  AI can draft standard safety structure, but drug-specific safety requirements must come from controlled source documents.
                </p>
                {requiredSourceGaps.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm text-[#5f3f00]">
                    {requiredSourceGaps.map((gap, index) => (
                      <li key={index}>- {gap}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-green-800">
                    Keep the source checklist current, then upload the actual files below as section reference files when available.
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-md border bg-white/70 p-3 text-sm text-[#495057] lg:max-w-sm">
              <div className="mb-1 flex items-center gap-2 font-medium text-[#212529]">
                <Upload className="h-4 w-4" />
                How to add them
              </div>
              <p>
                Use <span className="font-medium">Add reference file for this section</span> below and upload each document with an instruction such as “Use for AESIs and dose modification rules” or “Use for pharmacy handling only.”
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <SectionSourcePanel
        protocol={protocol}
        setProtocol={setProtocol}
        sectionKey="safetyDrugHandling"
        sectionName="Safety & Drug Handling"
        referenceExamples="Use IB, label/SmPC/USPI, RMP, safety management plan, pharmacy manual, or prior protocol for AE/SAE/AESI rules, dose modification, stopping rules, contraception, product complaints, storage, preparation, dispensing, accountability, and destruction."
        isGenerating={isGenerating}
        compact={hasContent}
        onGenerate={handleGenerate}
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Pill className="h-5 w-5 text-[#228be6]" />
                Study Products
              </CardTitle>
              <p className="mt-1 text-sm text-[#6c757d]">
                Track safety and handling separately for each investigational product, comparator, background therapy, placebo, rescue medication, or required concomitant medication.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={detectProducts} disabled={isDetectingProducts}>
                {isDetectingProducts ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Pill className="mr-2 h-4 w-4" />
                )}
                Detect products
              </Button>
              <Button type="button" onClick={addProduct} className="bg-[#228be6] hover:bg-[#1864ab]">
                <Plus className="mr-2 h-4 w-4" />
                Add product
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {safetyData.products.length === 0 ? (
            <div className="rounded-md border border-dashed p-5 text-center">
              <p className="font-medium text-[#212529]">No study products listed yet</p>
              <p className="mt-1 text-sm text-[#6c757d]">
                Detect products from the synopsis or add them manually before finalizing product-specific safety and drug handling.
              </p>
            </div>
          ) : (
            safetyData.products.map((product) => {
              const productSources = Object.values(product.sourceStatus || {}).filter(Boolean).length
              return (
                <div key={product.id} className="rounded-md border p-4">
                  <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                      <div>
                        <label className="mb-1 flex items-center gap-1 text-xs font-medium text-[#6c757d]">
                          Product name
                          <ProvenanceInfo
                            origin={productSources > 0 ? "source" : "manual"}
                            sourceName={productSources > 0 ? "Marked product-specific source documents" : undefined}
                            action={productSources > 0 ? "Product is supported by marked source documents." : "Product was detected or entered and still needs source confirmation."}
                            why={productSources > 0 ? "Product-specific safety and handling rules must be traceable per product, not only at study level." : "Detected or entered products require source confirmation before final protocol generation."}
                            section="Safety & Drug Handling product"
                            className="h-4 w-4"
                          />
                        </label>
                        <input
                          value={product.name}
                          onChange={(event) => updateProduct(product.id, { name: event.target.value })}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[#6c757d]">Role</label>
                        <select
                          value={product.role}
                          onChange={(event) => updateProduct(product.id, { role: event.target.value })}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        >
                          {productRoleOptions.map((role) => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {productSources > 0 ? (
                        <Badge className="bg-green-100 text-green-800">{productSources} source{productSources === 1 ? "" : "s"}</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800">sources needed</Badge>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProduct(product.id)}
                        className="h-8 w-8 text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-medium text-[#6c757d]">Product-specific sources</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {Object.entries(sourceLabels).map(([key, label]) => (
                          <label key={key} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
                            <span>{label}</span>
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={Boolean(product.sourceStatus?.[key as keyof typeof emptySourceStatus])}
                              onChange={(event) => updateProduct(product.id, {
                                sourceStatus: {
                                  ...product.sourceStatus,
                                  [key]: event.target.checked,
                                },
                              })}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 flex items-center gap-1 text-xs font-medium text-[#6c757d]">
                          Safety requirements
                          <ProvenanceInfo
                            origin={product.safetyRequirements ? (productSources > 0 ? "source" : "placeholder") : "placeholder"}
                            sourceName={productSources > 0 ? "Product-specific safety source documents" : undefined}
                            action={product.safetyRequirements ? "Safety requirements should be confirmed against product-specific source documents." : "Safety requirements are missing and should be confirmed from IB, label/SmPC/USPI, RMP, or safety plan."}
                            why="Drug-specific safety language should come from controlled safety sources because AI should not invent AESIs, dose modifications, stopping rules, or contraindications."
                            section={`${product.name} safety requirements`}
                            className="h-4 w-4"
                          />
                        </label>
                        <Textarea
                          value={product.safetyRequirements}
                          onChange={(event) => updateProduct(product.id, { safetyRequirements: event.target.value })}
                          rows={4}
                          placeholder="AESIs, contraindications, monitoring, pregnancy precautions, dose modification, stopping rules..."
                        />
                      </div>
                      <div>
                        <label className="mb-1 flex items-center gap-1 text-xs font-medium text-[#6c757d]">
                          Drug handling requirements
                          <ProvenanceInfo
                            origin={product.handlingRequirements ? (productSources > 0 ? "source" : "placeholder") : "placeholder"}
                            sourceName={productSources > 0 ? "Pharmacy/product handling source documents" : undefined}
                            action={product.handlingRequirements ? "Handling requirements should be confirmed against pharmacy manual, product label, or prior protocol." : "Handling requirements are missing and should be confirmed from pharmacy/product handling references."}
                            why="Storage, preparation, dispensing, accountability, return/destruction, and unblinding requirements are product-specific operational controls."
                            section={`${product.name} drug handling requirements`}
                            className="h-4 w-4"
                          />
                        </label>
                        <Textarea
                          value={product.handlingRequirements}
                          onChange={(event) => updateProduct(product.id, { handlingRequirements: event.target.value })}
                          rows={4}
                          placeholder="Storage, preparation, dispensing, accountability, return/destruction, blinding/unblinding..."
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-md bg-amber-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-amber-900">Product-specific unresolved items</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => addProductUnresolvedItem(product.id)}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Add
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {product.unresolvedItems.length === 0 ? (
                        <p className="text-xs text-[#6c757d]">No unresolved items for this product.</p>
                      ) : (
                        product.unresolvedItems.map((item: string, index: number) => (
                          <div key={index} className="flex items-start gap-2">
                            <Textarea
                              value={item}
                              onChange={(event) => updateProductUnresolvedItem(product.id, index, event.target.value)}
                              rows={2}
                              className="text-sm"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeProductUnresolvedItem(product.id, index)}
                              className="mt-1 h-8 w-8 text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-[#228be6]" />
              Approved Safety & Drug Handling Content
              <ProvenanceInfo
                item={(safetyData as any).contentProvenance}
                origin={(safetyData as any).contentProvenance?.origin || (safetyData.content ? "ai_improved" : "placeholder")}
                section="Safety & Drug Handling approved content"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={safetyData.content}
              onChange={(event) => updateSafetyData({ content: event.target.value })}
              placeholder="Generated or approved safety and drug handling content will appear here. Product-specific facts should come from IB, label/SmPC/USPI, RMP, safety plan, pharmacy manual, or prior protocol sources."
              rows={18}
              className="resize-y leading-relaxed"
            />
            <p className="text-xs text-[#6c757d]">
              This approved content is used by the final protocol generator for safety reporting, product complaints, trial intervention handling, discontinuation, and oversight sections.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Pill className="h-4 w-4 text-[#228be6]" />
                Product-Specific Sources
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(sourceLabels).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={Boolean(safetyData.sourceStatus[key])}
                    onChange={(event) => updateSafetyData({
                      sourceStatus: {
                        ...safetyData.sourceStatus,
                        [key]: event.target.checked,
                      },
                    })}
                  />
                </label>
              ))}
              <div className="pt-1">
                {sourceCount > 0 ? (
                  <Badge className="bg-green-100 text-green-800">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    {sourceCount} source{sourceCount === 1 ? "" : "s"} marked
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-800">
                    <FileWarning className="mr-1 h-3 w-3" />
                    Product safety source missing
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Unresolved Items
                </CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={addUnresolvedItem}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {safetyData.unresolvedItems.length === 0 ? (
                <p className="text-sm text-[#6c757d]">No unresolved safety items listed.</p>
              ) : (
                safetyData.unresolvedItems.map((item: string, index: number) => (
                  <div key={index} className="flex items-start gap-2">
                    <Textarea
                      value={item}
                      onChange={(event) => updateUnresolvedItem(index, event.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeUnresolvedItem(index)}
                      className="mt-1 h-8 w-8 text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
