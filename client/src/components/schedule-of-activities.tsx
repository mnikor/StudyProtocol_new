"use client"

import React, { useState } from "react"
import {
  Plus, 
  Search, 
  Trash2, 
  ChevronDown,
  AlertCircle,
  Zap,
  Check,
  BarChart,
  Activity,
  Share2,
  Download,
  FileText
} from "lucide-react"
import { exportScheduleToExcel } from "@/lib/export-utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ComparisonCellTooltip } from "@/components/comparison-cell-tooltip"
import { useToast } from "@/hooks/use-toast"
import { Protocol } from "@/types"
import { AIGenerationStatus, SectionStatus } from "@/components/ai-generation-status"
import { AIProcessingButton } from "@/components/ai-processing-button"
import { Textarea } from "@/components/ui/textarea"
import { CommentTrigger } from "@/components/comment-trigger"
import { formatSupplementaryInfoForAI } from "@/lib/supplementary-info"
import { SectionGenerationMode, SectionSourcePanel } from "@/components/section-source-panel"
import { getApiErrorMessage } from "@/lib/api-error"
import { ProvenanceInfo } from "@/components/provenance-info"

type SoAOrigin = "source" | "improved" | "generated" | "removed" | null;
type SoATableLayout = "auto" | "single" | "split";
type ExtractedSourceTableCell = {
  text: string;
  colSpan?: number;
  rowSpan?: number;
  isHeader?: boolean;
};
type ExtractedSourceTable = {
  id: string;
  title: string;
  source: string;
  confidence?: "high" | "medium" | "low";
  extractionMethod?: string;
  sourceFormat?: "docx_table" | "html_table" | "text_table" | "pdf_text_window" | "ai_reconstructed";
  exactSourceAvailable?: boolean;
  preservationNote?: string;
  rawOoxml?: string;
  pageLayout?: {
    orientation: "portrait" | "landscape";
    widthTwips?: number;
    heightTwips?: number;
    margins?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
      header?: number;
      footer?: number;
      gutter?: number;
    };
    source?: "docx_section" | "inferred";
  };
  headers: string[];
  rows: string[][];
  cells?: ExtractedSourceTableCell[][];
  rawText?: string;
  recommendedUse?: string;
};

const normalizeSoAOrigin = (value: any): SoAOrigin => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (["use_as_is", "use as is", "as_is", "as-is", "source", "source_text", "preserve", "preserved", "extracted"].includes(raw)) {
    return "source";
  }
  if (["improve", "improved", "enhance", "enhanced", "augment", "augmented", "rewritten"].includes(raw)) {
    return "improved";
  }
  if (["add", "added", "generate", "generated", "ai_generated", "new"].includes(raw)) {
    return "generated";
  }
  if (["remove", "removed", "deleted", "excluded"].includes(raw)) {
    return "removed";
  }
  return null;
};

const getSoAOriginLabel = (origin: SoAOrigin) => {
  if (origin === "generated") return "AI added";
  if (origin === "improved") return "AI improved";
  if (origin === "removed") return "Removed";
  return null;
};

const getSoAOriginClasses = (origin: SoAOrigin) => {
  if (origin === "generated") return "border-blue-200 bg-blue-50 text-blue-700";
  if (origin === "improved") return "border-amber-200 bg-amber-50 text-amber-800";
  if (origin === "removed") return "border-red-200 bg-red-50 text-red-700";
  return "border-gray-200 bg-gray-50 text-gray-700";
};

const getSoAMarkerClasses = (origin: SoAOrigin) => {
  if (origin === "generated") return "bg-blue-500";
  if (origin === "improved") return "bg-amber-500";
  if (origin === "removed") return "bg-red-500";
  return "bg-transparent";
};

const parseJsonMaybe = (value: any) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const isLikelySoATable = (table: any) => {
  const text = `${table?.title || ""} ${table?.recommendedUse || ""} ${table?.rawText || ""} ${(table?.headers || []).join(" ")}`.toLowerCase();
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const headers = Array.isArray(table?.headers) ? table.headers : [];
  const maxColumns = Math.max(headers.length, ...rows.map((row: any[]) => Array.isArray(row) ? row.length : 0), 0);
  const hasMergedCells = Array.isArray(table?.cells) && table.cells.some((row: any[]) =>
    Array.isArray(row) && row.some((cell: any) => Number(cell?.colSpan || 1) > 1 || Number(cell?.rowSpan || 1) > 1)
  );
  if (table?.exactSourceAvailable && table?.recommendedUse === "schedule_of_activities") {
    return hasMergedCells || maxColumns >= 2 || rows.length >= 2;
  }
  const soaSignals = [
    /schedule of activities|schedule of assessments|time and events|schedule of events/.test(text),
    /screening/.test(text),
    /baseline/.test(text),
    /\bcycle\b|\bc\d+\b/.test(text),
    /\bvisit\b|day\s*-?\d+/.test(text),
    /follow[- ]?up|end of treatment|eot/.test(text),
    (text.match(/\bx\b/g) || []).length >= 3,
  ].filter(Boolean).length;
  const fragmentPenalty = rows.length <= 6 && maxColumns <= 5 && text.length > 400 && (text.match(/\|/g) || []).length > 8;
  if (fragmentPenalty && table?.confidence !== "high" && !hasMergedCells) return false;
  return table?.recommendedUse === "schedule_of_activities"
    ? (hasMergedCells || maxColumns >= 4 || soaSignals >= 3)
    : (hasMergedCells && soaSignals >= 2) || soaSignals >= 4;
};

const collectSourceSoATables = (protocol: any): ExtractedSourceTable[] => {
  const tables: ExtractedSourceTable[] = [];
  const pushTables = (structuredExtraction: any, sourcePrefix = "") => {
    if (!structuredExtraction?.tables || !Array.isArray(structuredExtraction.tables)) return;
    structuredExtraction.tables
      .filter(isLikelySoATable)
      .forEach((table: any, index: number) => {
        tables.push({
          ...table,
          id: `${sourcePrefix}${table.id || `source-table-${tables.length + index + 1}`}`,
          title: table.title || `Source SoA table ${tables.length + index + 1}`,
          source: table.source || sourcePrefix.replace(/[-:]$/, "") || "Uploaded source"
        });
      });
  };

  pushTables(protocol?.sourceExtraction, "primary-");

  const supplementaryItems = parseJsonMaybe(protocol?.supplementaryInfo);
  if (Array.isArray(supplementaryItems)) {
    supplementaryItems.forEach((item: any, index: number) => {
      pushTables(item?.structuredExtraction, `supp-${index + 1}-`);
    });
  }

  const unique = new Map<string, ExtractedSourceTable>();
  tables.forEach(table => {
    const key = `${table.source}::${table.title}::${(table.headers || []).join("|")}::${(table.rows || []).slice(0, 2).map(row => row.join("|")).join("||")}`;
    if (!unique.has(key)) unique.set(key, table);
  });

  const uniqueTables = Array.from(unique.values());
  const exactTables = uniqueTables.filter(table => table.exactSourceAvailable || table.sourceFormat === "docx_table");
  const reconstructedTables = uniqueTables.filter(table =>
    /ai[-_ ]?reconstruct|vision|ocr/i.test(String(table.extractionMethod || table.id || table.title || ""))
  );

  if (exactTables.length > 0) return exactTables;
  return reconstructedTables.length > 0 ? reconstructedTables : uniqueTables;
};

const sourceTablesToScheduleGrid = (tables: ExtractedSourceTable[]) => {
  if (!tables.length) {
    return { tableHeaders: [] as string[], tableData: {} as Record<string, any[]> };
  }

  const headerSet = new Set<string>();
  const normalizedTables = tables.map((table, tableIndex) => {
    const headers = Array.isArray(table.headers) ? table.headers : [];
    const firstHeader = String(headers[0] || "").toLowerCase();
    const hasAssessmentColumn = !headers[0] || /assessment|activity|procedure|test|item|parameter/.test(firstHeader);
    const visitHeaders = (hasAssessmentColumn ? headers.slice(1) : headers).map(header => String(header || "").trim()).filter(Boolean);
    visitHeaders.forEach(header => headerSet.add(header));
    return {
      table,
      category: table.title || `Source SoA table ${tableIndex + 1}`,
      hasAssessmentColumn,
      visitHeaders
    };
  });

  const tableHeaders = Array.from(headerSet);
  const tableData: Record<string, any[]> = {};

  normalizedTables.forEach(({ table, category, hasAssessmentColumn, visitHeaders }, tableIndex) => {
    const rows = Array.isArray(table.rows) ? table.rows : [];
    tableData[category] = rows
      .map((row, rowIndex) => {
        const cells = Array.isArray(row) ? row.map(cell => String(cell || "").trim()) : [];
        const assessment = hasAssessmentColumn ? (cells[0] || `Source row ${rowIndex + 1}`) : (cells[0] || `Source row ${rowIndex + 1}`);
        const sourceValues = hasAssessmentColumn ? cells.slice(1) : cells;
        const values = tableHeaders.map(header => {
          const sourceIndex = visitHeaders.findIndex(visit => visit === header);
          return sourceIndex >= 0 ? (sourceValues[sourceIndex] || "") : "";
        });
        return {
          assessment,
          values,
          origin: "source",
          sourceTableId: table.id,
          sourceTableTitle: table.title,
          sourceDocument: table.source
        };
      })
      .filter(row => row.assessment || row.values.some(Boolean));

    if (!tableData[category].length) {
      delete tableData[category];
    }
  });

  return { tableHeaders, tableData };
};

const hasCellValue = (value: any) => {
  const normalized = String(value || "").trim();
  return Boolean(normalized && !/^[-–—]+$/.test(normalized));
};

const isFollowUpHeader = (header: string) => /follow-up|follow up|long-term|long term|survival|end of treatment/i.test(header);

const findSplitIndex = (headers: string[]) => {
  if (headers.length < 4) return -1;
  const followUpIndex = headers.findIndex((header, index) => index >= 2 && isFollowUpHeader(header));
  if (followUpIndex >= 2 && headers.length - followUpIndex >= 2) return followUpIndex;
  return Math.ceil(headers.length / 2);
};

const getScheduleTableGroups = (
  headers: string[],
  tableData: Record<string, any[]>,
  layout: SoATableLayout,
  customSplitIndex?: number
) => {
  if (!headers.length) return [{ id: "all", title: "", headerIndexes: [] as number[] }];
  const denseGrid = headers.length >= 8 || Object.values(tableData || {}).reduce((sum, rows: any) => sum + (Array.isArray(rows) ? rows.length : 0), 0) >= 14;
  const autoSplitIndex = findSplitIndex(headers);
  const splitIndex = layout === "split" && typeof customSplitIndex === "number" && customSplitIndex >= 2 && headers.length - customSplitIndex >= 2
    ? customSplitIndex
    : autoSplitIndex;
  const shouldSplit = layout === "split" || (layout === "auto" && denseGrid && splitIndex >= 2 && headers.length - splitIndex >= 2);

  if (!shouldSplit || splitIndex < 2 || headers.length - splitIndex < 2) {
    return [{ id: "all", title: "Schedule of Activities", headerIndexes: headers.map((_, index) => index) }];
  }

  return [
    {
      id: "lead",
      title: isFollowUpHeader(headers[splitIndex] || "") ? "Core schedule" : "Earlier visit schedule",
      headerIndexes: headers.slice(0, splitIndex).map((_, index) => index)
    },
    {
      id: "trail",
      title: isFollowUpHeader(headers[splitIndex] || "") ? "Follow-up schedule" : "Later visit schedule",
      headerIndexes: headers.slice(splitIndex).map((_, index) => index + splitIndex)
    }
  ];
};



interface ScheduleOfActivitiesProps {
  protocol: Protocol
  setProtocol: React.Dispatch<React.SetStateAction<Protocol>>
  activeDesignState?: any
  isActive?: boolean
}

const ScheduleOfActivities: React.FC<ScheduleOfActivitiesProps> = ({ 
  protocol, 
  setProtocol,
  activeDesignState,
  isActive = false
}) => {
  // Initialize toast
  const { toast } = useToast()

  // Parse JSON data from protocol or use directly if already parsed
  const parsedTableHeaders = React.useMemo(() => {
    try {
      if (typeof protocol.tableHeaders === 'string') {
        return JSON.parse(protocol.tableHeaders);
      }
      return protocol.tableHeaders || [];
    } catch (e) {
      console.error("Error parsing tableHeaders:", e);
      return [];
    }
  }, [protocol.tableHeaders]);
  
  const parsedTableData = React.useMemo(() => {
    try {
      if (typeof protocol.tableData === 'string') {
        return JSON.parse(protocol.tableData);
      }
      return protocol.tableData || {};
    } catch (e) {
      console.error("Error parsing tableData:", e);
      return {};
    }
  }, [protocol.tableData]);

  const sourceSoATables = React.useMemo(() => collectSourceSoATables(protocol as any), [
    (protocol as any).sourceExtraction,
    protocol.supplementaryInfo
  ]);

  const activeSourceSoATables = React.useMemo(() => {
    const raw = parseJsonMaybe((protocol as any).soaSourceTables);
    return Array.isArray(raw) ? raw.filter(isLikelySoATable) : [];
  }, [(protocol as any).soaSourceTables]);

  const scheduleTableLayout = ((protocol as any).soaTableLayout || "auto") as SoATableLayout;
  const customSplitIndex = Number((protocol as any).soaSplitAfterIndex || 0);

  const applySourceSoATables = React.useCallback((tables = sourceSoATables) => {
    if (!tables.length) return false;
    const hasExactSourceTables = tables.some(table => table.exactSourceAvailable || table.sourceFormat === "docx_table");
    const { tableHeaders, tableData } = sourceTablesToScheduleGrid(tables);
    setProtocol(prev => ({
      ...(prev as any),
      tableHeaders,
      tableData,
      soaSourceTables: tables,
      soaProvenance: {
        ...((prev as any).soaProvenance || {}),
        generationMode: "preserve",
        sourceStatus: "found",
        exactSourceContent: hasExactSourceTables,
        preservationMode: hasExactSourceTables ? "exact_docx_table" : "structured_source_table",
          sourceTables: tables.map(table => ({
            id: table.id,
            title: table.title,
            source: table.source,
            confidence: table.confidence,
            exactSourceAvailable: table.exactSourceAvailable,
            sourceFormat: table.sourceFormat,
            pageLayout: table.pageLayout,
          })),
        headerOrigins: tableHeaders.map(() => "use_as_is"),
        explanation: tables.length === 1
          ? (hasExactSourceTables
            ? "One uploaded DOCX Schedule of Activities table was copied from the source document with table structure preserved where available."
            : "One uploaded Schedule of Activities table was reproduced from the source document.")
          : (hasExactSourceTables
            ? `${tables.length} uploaded DOCX Schedule of Activities tables were copied from the source document with table structure preserved where available.`
            : `${tables.length} uploaded Schedule of Activities tables were reproduced from the source document.`)
      }
    } as any));
    return true;
  }, [sourceSoATables, setProtocol]);

  React.useEffect(() => {
    const hasSchedule = parsedTableHeaders.length > 0 || Object.keys(parsedTableData || {}).length > 0 || activeSourceSoATables.length > 0;
    if (!isActive || hasSchedule || !sourceSoATables.length) return;
    if (applySourceSoATables(sourceSoATables)) {
      toast({
        title: "Source SoA imported",
        description: sourceSoATables.length === 1
          ? "The uploaded Schedule of Activities table was reproduced in this tab."
          : `${sourceSoATables.length} uploaded Schedule of Activities tables were reproduced in this tab.`,
        duration: 3500
      });
    }
  }, [isActive, parsedTableHeaders.length, parsedTableData, activeSourceSoATables.length, sourceSoATables, applySourceSoATables]);

  const soaProvenance = React.useMemo(() => {
    const source = (protocol as any).soaProvenance || (protocol as any).scheduleProvenance || {};
    if (typeof source === "string") {
      try {
        return JSON.parse(source);
      } catch {
        return {};
      }
    }
    return source || {};
  }, [(protocol as any).soaProvenance, (protocol as any).scheduleProvenance]);

  const headerOrigins = React.useMemo(() => {
    const rawOrigins =
      soaProvenance.headerOrigins ||
      soaProvenance.tableHeaderOrigins ||
      (protocol as any).tableHeaderOrigins ||
      [];
    return Array.isArray(rawOrigins) ? rawOrigins.map(normalizeSoAOrigin) : [];
  }, [soaProvenance, (protocol as any).tableHeaderOrigins]);

  const getRowOrigin = (assessment: any): SoAOrigin => normalizeSoAOrigin(
    assessment?.rowOrigin ||
    assessment?.origin ||
    assessment?.sourceUse ||
    assessment?.classification
  );

  const getCellOrigin = (assessment: any, columnIndex: number): SoAOrigin => {
    const cellOrigins = assessment?.cellOrigins || assessment?.valueOrigins || assessment?.provenance;
    if (!Array.isArray(cellOrigins)) return null;
    return normalizeSoAOrigin(cellOrigins[columnIndex]);
  };

  const getCellReason = (assessment: any, columnIndex: number) => {
    const reasons = assessment?.cellReasons || assessment?.valueReasons || assessment?.cellRationales;
    return Array.isArray(reasons) ? reasons[columnIndex] : "";
  };

  const getCellSource = (assessment: any, columnIndex: number) => {
    const sourceValues = assessment?.sourceValues || assessment?.sourceCells || assessment?.sourceScheduleValues;
    return Array.isArray(sourceValues) ? sourceValues[columnIndex] : "";
  };

  const soaChangeSummary = React.useMemo(() => {
    const counts = {
      sourceRows: 0,
      improvedRows: 0,
      addedRows: 0,
      addedVisits: 0,
      improvedVisits: 0,
      addedCells: 0,
      improvedCells: 0,
      removedItems: Array.isArray(soaProvenance.removedItems) ? soaProvenance.removedItems.length : 0
    };

    headerOrigins.forEach(origin => {
      if (origin === "generated") counts.addedVisits += 1;
      if (origin === "improved") counts.improvedVisits += 1;
    });

    Object.values(parsedTableData || {}).forEach((assessments: any) => {
      if (!Array.isArray(assessments)) return;
      assessments.forEach((assessment) => {
        const rowOrigin = getRowOrigin(assessment);
        if (rowOrigin === "source") counts.sourceRows += 1;
        if (rowOrigin === "improved") counts.improvedRows += 1;
        if (rowOrigin === "generated") counts.addedRows += 1;

        if (Array.isArray(assessment?.cellOrigins)) {
          assessment.cellOrigins.forEach((originValue: any) => {
            const origin = normalizeSoAOrigin(originValue);
            if (origin === "generated") counts.addedCells += 1;
            if (origin === "improved") counts.improvedCells += 1;
            if (origin === "removed") counts.removedItems += 1;
          });
        }
      });
    });

    return counts;
  }, [parsedTableData, headerOrigins, soaProvenance]);

  const hasSoAProvenance = React.useMemo(() => (
    Object.values(soaChangeSummary).some(value => value > 0)
  ), [soaChangeSummary]);

  const scheduleTableGroups = React.useMemo(
    () => getScheduleTableGroups(parsedTableHeaders, parsedTableData, scheduleTableLayout, customSplitIndex),
    [parsedTableHeaders, parsedTableData, scheduleTableLayout, customSplitIndex]
  );

  const exactSourceTables = activeSourceSoATables.length > 0
    ? activeSourceSoATables
    : parsedTableHeaders.length === 0 && Object.keys(parsedTableData || {}).length === 0
      ? sourceSoATables
      : [];
  const hasPreservedExactSourceTables = exactSourceTables.some(table => table.exactSourceAvailable || table.sourceFormat === "docx_table");

  // State for editing
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editingHeader, setEditingHeader] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterCategory, setFilterCategory] = useState("all")

  // State for dialogs
  const [showAddAssessmentDialog, setShowAddAssessmentDialog] = useState(false)
  const [showAddCategoryDialog, setShowAddCategoryDialog] = useState(false)
  const [showAddColumnDialog, setShowAddColumnDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteType, setDeleteType] = useState<"assessment" | "category" | "column">("assessment")
  const [deleteInfo, setDeleteInfo] = useState<{
    category?: string;
    assessmentIndex?: number;
    columnIndex?: number;
  }>({})

  // State for new items
  const [newAssessment, setNewAssessment] = useState({ category: "", name: "" })
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newColumnName, setNewColumnName] = useState("")
  
  // State for AI generation
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStatus, setGenerationStatus] = useState<SectionStatus[]>([
    { name: "Parse synopsis", status: "pending" },
    { name: "Generate timepoints", status: "pending" },
    { name: "Generate assessments", status: "pending" },
    { name: "Finalize schedule", status: "pending" }
  ])
  
  // State for burden analysis
  const [showBurdenDialog, setShowBurdenDialog] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [burdenAnalysis, setBurdenAnalysis] = useState<any>(null)
  
  // Filter data based on search and category
  const filteredData = React.useMemo(() => {
    return Object.entries(parsedTableData).reduce<Record<string, any[]>>(
      (acc, [category, assessments]) => {
        if (filterCategory !== "all" && filterCategory !== category) {
          return acc
        }

        const filtered = assessments.filter((item) =>
          item.assessment.toLowerCase().includes(searchQuery.toLowerCase())
        )

        if (filtered.length > 0) {
          acc[category] = filtered
        }

        return acc
      },
      {}
    )
  }, [protocol.tableData, searchQuery, filterCategory])

  // State for cell editing
  const [cellEditValue, setCellEditValue] = useState<string>("")
  const [cellEditPosition, setCellEditPosition] = useState<{
    category: string;
    row: number;
    col: number;
    isEditing: boolean;
    editType?: "cell" | "header" | "assessment";
  }>({ 
    category: "", 
    row: -1, 
    col: -1, 
    isEditing: false,
    editType: "cell" 
  })

  // Handle cell click to start editing or toggle X
  const handleCellClick = (category: string, assessmentIndex: number, columnIndex: number) => {
    // Type safety: ensure protocol.tableData is an object and not a string
    const tableData = typeof protocol.tableData === 'string' 
      ? JSON.parse(protocol.tableData) 
      : protocol.tableData;
      
    // Get current value safely
    const currentValue = 
      tableData[category]?.[assessmentIndex]?.values?.[columnIndex] || "";
    
    // Set up cell editing state
    setCellEditValue(currentValue)
    setCellEditPosition({
      category,
      row: assessmentIndex,
      col: columnIndex,
      isEditing: true,
      editType: "cell"
    })
  }
  
  // Handle header click to edit column title
  const handleHeaderClick = (headerIndex: number) => {
    // Get the current header value
    const currentValue = parsedTableHeaders[headerIndex] || "";
    
    // Set up editing state for header
    setCellEditValue(currentValue);
    setCellEditPosition({
      category: "",
      row: -1,
      col: headerIndex,
      isEditing: true,
      editType: "header"
    });
  }
  
  // Handle assessment name click to edit
  const handleAssessmentNameClick = (category: string, assessmentIndex: number) => {
    // Type safety: ensure protocol.tableData is an object and not a string
    const tableData = typeof protocol.tableData === 'string' 
      ? JSON.parse(protocol.tableData) 
      : protocol.tableData;
    
    // Get current assessment name
    const currentValue = tableData[category]?.[assessmentIndex]?.assessment || "";
    
    // Set up editing state for assessment name
    setCellEditValue(currentValue);
    setCellEditPosition({
      category,
      row: assessmentIndex,
      col: -1,
      isEditing: true,
      editType: "assessment"
    });
  }
  
  // Handle saving cell edit
  const handleSaveCellEdit = (newValue: string) => {
    if (!cellEditPosition.isEditing) return;
    
    const { category, row, col, editType } = cellEditPosition;
    
    // Don't save empty values for headers or assessment names
    if ((editType === "header" || editType === "assessment") && !newValue.trim()) {
      toast({
        title: "Invalid Value",
        description: "Name cannot be empty",
        variant: "destructive",
        duration: 2000
      });
      return;
    }
    
    // Handle different types of edits
    if (editType === "header") {
      // Edit column header
      const newHeaders = [...parsedTableHeaders];
      newHeaders[col] = newValue;
      
      // Update protocol with new headers
      setProtocol({
        ...protocol,
        tableHeaders: newHeaders
      });
      
      toast({
        title: "Header Updated",
        description: "Column title has been updated",
        duration: 2000
      });
    } 
    else if (editType === "assessment") {
      // Edit assessment name
      // Type safety: ensure protocol.tableData is an object and not a string
      const tableData = typeof protocol.tableData === 'string' 
        ? JSON.parse(protocol.tableData) 
        : protocol.tableData;
        
      // Create a deep copy of the data to avoid direct mutations
      const newData = JSON.parse(JSON.stringify(tableData));
      
      // Update the assessment name
      if (newData[category] && newData[category][row]) {
        newData[category][row].assessment = newValue;
        
        // Update protocol with new data
        setProtocol({
          ...protocol,
          tableData: newData
        });
        
        toast({
          title: "Assessment Updated",
          description: "Assessment name has been updated",
          duration: 2000
        });
      }
    }
    else {
      // Regular cell value edit
      // Type safety: ensure protocol.tableData is an object and not a string
      const tableData = typeof protocol.tableData === 'string' 
        ? JSON.parse(protocol.tableData) 
        : protocol.tableData;
        
      // Create a deep copy of the data to avoid direct mutations
      const newData = JSON.parse(JSON.stringify(tableData));
      
      // Update the cell value
      if (newData[category] && 
          newData[category][row] && 
          newData[category][row].values) {
        newData[category][row].values[col] = newValue;
        
        // Update protocol with new data
        setProtocol({
          ...protocol,
          tableData: newData
        });
        
        toast({
          title: "Cell Updated",
          description: "Assessment value has been updated",
          duration: 2000
        });
      }
    }
    
    // Reset editing state
    setCellEditPosition({
      category: "",
      row: -1,
      col: -1,
      isEditing: false,
      editType: "cell"
    });
  }
  
  // Handle cancel edit
  const handleCancelCellEdit = () => {
    setCellEditPosition({
      category: "",
      row: -1,
      col: -1,
      isEditing: false,
      editType: "cell"
    })
  }

  // Handle add assessment
  const handleAddAssessment = () => {
    if (!newAssessment.category || !newAssessment.name) return
    
    // Type safety: ensure protocol.tableData is an object and not a string
    const tableData = typeof protocol.tableData === 'string' 
      ? JSON.parse(protocol.tableData) 
      : protocol.tableData;
    
    // Create a deep copy of the data to avoid direct mutations
    const newData = JSON.parse(JSON.stringify(tableData || {}));
    
    // Create empty values array based on current headers length
    const emptyValues = new Array(parsedTableHeaders.length).fill("");
    
    // Make sure the category exists
    if (!newData[newAssessment.category]) {
      newData[newAssessment.category] = [];
    }
    
    // Add the new assessment to the category
    newData[newAssessment.category].push({
      assessment: newAssessment.name,
      values: emptyValues
    });
    
    // Update the protocol with the new data
    setProtocol({
      ...protocol,
      tableData: newData
    });
    
    // Show success toast
    toast({
      title: "Assessment Added",
      description: `Added "${newAssessment.name}" to ${newAssessment.category}`,
      duration: 2000
    });
    
    // Reset form and close dialog
    setNewAssessment({ category: "", name: "" });
    setShowAddAssessmentDialog(false);
  }

  // Handle add category
  const handleAddCategory = () => {
    if (!newCategoryName) return
    
    // Type safety: ensure protocol.tableData is an object and not a string
    const tableData = typeof protocol.tableData === 'string' 
      ? JSON.parse(protocol.tableData) 
      : protocol.tableData;
    
    // Create a deep copy of the data to avoid direct mutations
    const newData = JSON.parse(JSON.stringify(tableData || {}));
    
    // Add the new empty category
    newData[newCategoryName] = [];
    
    // Update the protocol with the new data
    setProtocol({
      ...protocol,
      tableData: newData
    });
    
    // Show success toast
    toast({
      title: "Category Added",
      description: `Added new category "${newCategoryName}"`,
      duration: 2000
    });
    
    // Reset form and close dialog
    setNewCategoryName("");
    setShowAddCategoryDialog(false);
  }

  // Handle add column
  const handleAddColumn = () => {
    if (!newColumnName) return
    
    // Create the new headers array by adding the new column name
    const newHeaders = [...parsedTableHeaders, newColumnName];
    
    // Type safety: ensure protocol.tableData is an object and not a string
    const tableData = typeof protocol.tableData === 'string' 
      ? JSON.parse(protocol.tableData) 
      : protocol.tableData;
    
    // Create a deep copy of the data to avoid direct mutations
    const newData = JSON.parse(JSON.stringify(tableData || {}));
    
    // Add empty value to each assessment's values array
    Object.keys(newData).forEach(category => {
      if (Array.isArray(newData[category])) {
        newData[category].forEach((assessment: any) => {
          if (assessment && Array.isArray(assessment.values)) {
            assessment.values.push("");
          }
        });
      }
    });
    
    // Update the protocol with the new headers and data
    setProtocol({
      ...protocol,
      tableHeaders: newHeaders,
      tableData: newData
    });
    
    // Show success toast
    toast({
      title: "Column Added",
      description: `Added new timepoint "${newColumnName}"`,
      duration: 2000
    });
    
    // Reset form and close dialog
    setNewColumnName("");
    setShowAddColumnDialog(false);
  }

  // Handle delete confirmation
  const handleDelete = () => {
    const { category, assessmentIndex, columnIndex } = deleteInfo
    const newData = { ...protocol.tableData }
    
    if (deleteType === "assessment" && category !== undefined && assessmentIndex !== undefined) {
      newData[category].splice(assessmentIndex, 1)
      
      // Remove category if empty
      if (newData[category].length === 0) {
        delete newData[category]
      }
    } 
    else if (deleteType === "category" && category !== undefined) {
      delete newData[category]
    }
    else if (deleteType === "column" && columnIndex !== undefined) {
      const newHeaders = [...parsedTableHeaders]
      newHeaders.splice(columnIndex, 1)
      
      // Remove column from each assessment
      Object.keys(newData).forEach(cat => {
        newData[cat].forEach(assessment => {
          assessment.values.splice(columnIndex, 1)
        })
      })
      
      setProtocol({
        ...protocol,
        tableHeaders: newHeaders,
        tableData: newData
      })
      
      setShowDeleteDialog(false)
      return
    }
    
    setProtocol({
      ...protocol,
      tableData: newData
    })
    
    setShowDeleteDialog(false)
  }

  // Setup delete dialog for assessment
  const setupDeleteAssessment = (category: string, index: number) => {
    setDeleteType("assessment")
    setDeleteInfo({ category, assessmentIndex: index })
    setShowDeleteDialog(true)
  }

  // Setup delete dialog for category
  const setupDeleteCategory = (category: string) => {
    setDeleteType("category")
    setDeleteInfo({ category })
    setShowDeleteDialog(true)
  }

  // Setup delete dialog for column
  const setupDeleteColumn = (index: number) => {
    setDeleteType("column")
    setDeleteInfo({ columnIndex: index })
    setShowDeleteDialog(true)
  }

  // Generate schedule with AI
  const handleGenerateWithAI = async (generationMode: SectionGenerationMode = "augment") => {
    if (!protocol.synopsis) {
      alert("Please provide a study synopsis in the Synopsis tab first");
      return;
    }

    if (generationMode === "preserve" && sourceSoATables.length > 0) {
      applySourceSoATables(sourceSoATables);
      toast({
        title: "Source Schedule Used",
        description: sourceSoATables.length === 1
          ? "The uploaded Schedule of Activities table was reproduced without AI rewriting."
          : `${sourceSoATables.length} uploaded Schedule of Activities tables were reproduced without AI rewriting.`,
        duration: 3500
      });
      return;
    }
    
    // Check for existing alignment analysis
    let alignmentAnalysis = null;
    try {
      const alignmentKey = `protocol-${protocol.id}-alignment`;
      const savedAlignment = localStorage.getItem(alignmentKey);
      if (savedAlignment) {
        alignmentAnalysis = JSON.parse(savedAlignment);
      }
    } catch (error) {
      console.error("Error retrieving alignment analysis:", error);
    }

    setIsGenerating(true)
    
    try {
      // Update status for synopsis parsing
      setGenerationStatus(prev => prev.map((item, i) => 
        i === 0 ? { ...item, status: "generating" } : item
      ))
      
      // Call the backend API to generate schedule of assessments
      const structuredTableContext = sourceSoATables.length > 0
        ? sourceSoATables.map((table, index) => [
            `STRUCTURED SOURCE SOA TABLE ${index + 1}: ${table.title}`,
            `Source document: ${table.source}`,
            `Recommended use: ${table.recommendedUse || "schedule_of_activities"}`,
            (table.headers || []).join(" | "),
            ...(table.rows || []).map(row => row.join(" | "))
          ].filter(Boolean).join("\n"))
        : [];

      const response = await fetch(`/api/generate-schedule?id=${protocol.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          synopsis: protocol.synopsis,
          supplementaryInfo: [
            ...structuredTableContext,
            ...formatSupplementaryInfoForAI(
              protocol.supplementaryInfo,
              "schedule of activities visit timepoints assessments procedures safety efficacy laboratory imaging treatment administration"
            )
          ],
          protocolType: protocol.protocolType || 'interventional_clinical_trial',
          alignmentAnalysis: alignmentAnalysis,
          generationMode
        }),
      });
      
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Failed to generate schedule"));
      }
      
      // Parse the response
      const data = await response.json();

      if (data?.sourceStatus === "not_found") {
        setIsGenerating(false);
        setShowGenerateDialog(false);
        toast({
          title: "Source Content Not Found",
          description: data.sourceStatusMessage || data.explanation || "No Schedule of Activities information was found in the source documents.",
          duration: 5000
        });
        return;
      }

      const sourcePhaseCoverage = data?.qualityCheck?.sourcePhaseCoverage;
      if (sourcePhaseCoverage && sourcePhaseCoverage.passed === false) {
        toast({
          title: "Source phase check needs review",
          description: `The generated schedule may be missing source headers: ${(sourcePhaseCoverage.missingHeaders || []).join(", ")}`,
          variant: "destructive",
          duration: 7000
        });
      }
      
      // Step 1 complete
      setGenerationStatus(prev => prev.map((item, i) => 
        i === 0 ? { ...item, status: "complete" } :
        i === 1 ? { ...item, status: "generating" } : item
      ))
      
      // Update timepoints/headers
      setTimeout(() => {
        const defaultOrigin = generationMode === "preserve" ? "source" : generationMode === "augment" ? "improved" : "generated";
        const tableHeaders = (data.tableHeaders || []).map((header: any) => (
          typeof header === "string" ? header : header?.label || header?.name || String(header || "")
        ));
        const headerOrigins = data.headerOrigins || data.tableHeaderOrigins || (data.tableHeaders || []).map((header: any) => (
          typeof header === "string" ? defaultOrigin : header?.origin || header?.sourceUse || defaultOrigin
        ));
        
        // Step 2 complete
        setGenerationStatus(prev => prev.map((item, i) => 
          i === 1 ? { ...item, status: "complete" } :
          i === 2 ? { ...item, status: "generating" } : item
        ))
        
        // Process assessments
        setTimeout(() => {
          const rawTableData = data.tableData || {};
          const tableData = Object.fromEntries(
            Object.entries(rawTableData).map(([category, assessments]: [string, any]) => [
              category,
              Array.isArray(assessments)
                ? assessments.map((assessment: any) => ({
                    ...assessment,
                    origin: assessment.origin || assessment.rowOrigin || assessment.sourceUse || assessment.classification || "generated",
                    cellOrigins: Array.isArray(assessment.cellOrigins || assessment.valueOrigins)
                      ? (assessment.cellOrigins || assessment.valueOrigins)
                      : undefined
                  }))
                : assessments
            ])
          );
          const soaProvenance = {
            headerOrigins,
            removedItems: data.removedItems || [],
            explanation: data.explanation || "",
            sourceStatus: data.sourceStatus || "found",
            qualityCheck: data.qualityCheck,
            generationMode
          };
          
          // Step 3 complete
          setGenerationStatus(prev => prev.map((item, i) => 
            i === 2 ? { ...item, status: "complete" } :
            i === 3 ? { ...item, status: "generating" } : item
          ))
          
          // Finalize
          setTimeout(() => {
            // Update the protocol with generated data
            setProtocol({
              ...protocol,
              tableHeaders,
              tableData,
              soaProvenance,
              soaSourceTables: sourceSoATables.length > 0 ? sourceSoATables : (protocol as any).soaSourceTables
            });
            
            // Step 4 complete
            setGenerationStatus(prev => prev.map((item) => 
              ({ ...item, status: "complete" })
            ))
            
            // Show success message and reset UI
            setTimeout(() => {
              setIsGenerating(false)
              setShowGenerateDialog(false)
              
              toast({
                title: "Schedule Generated",
                description: "AI has generated a schedule of activities based on your protocol",
                duration: 3000
              });
              
              // Reset status for next time
              setTimeout(() => {
                setGenerationStatus([
                  { name: "Parse synopsis", status: "pending" },
                  { name: "Generate timepoints", status: "pending" },
                  { name: "Generate assessments", status: "pending" },
                  { name: "Finalize schedule", status: "pending" }
                ]);
              }, 1000);
            }, 500);
          }, 800);
        }, 800);
      }, 800);
    } catch (error) {
      console.error("Error generating schedule:", error);
      
      // Reset generation states
      setIsGenerating(false);
      setGenerationStatus([
        { name: "Parse synopsis", status: "pending" },
        { name: "Generate timepoints", status: "pending" },
        { name: "Generate assessments", status: "pending" },
        { name: "Finalize schedule", status: "pending" }
      ]);
      
      // Show error message
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate schedule. Please try again later.",
        variant: "destructive",
        duration: 3000
      });
    }
  }

  // Handle export to Excel
  const handleExportToExcel = () => {
    if (parsedTableHeaders.length === 0) {
      toast({
        title: "Export Failed",
        description: "No data to export. Please add some timepoints and assessments first.",
        variant: "destructive",
        duration: 3000
      });
      return;
    }
    
    try {
      exportScheduleToExcel(
        protocol.title || "Protocol Schedule", 
        parsedTableHeaders, 
        parsedTableData
      );
      
      toast({
        title: "Export Successful",
        description: "Schedule of Activities has been exported to Excel",
        duration: 3000
      });
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      
      toast({
        title: "Export Failed",
        description: "Failed to export schedule. Please try again.",
        variant: "destructive",
        duration: 3000
      });
    }
  }
  
  // Conduct participant burden analysis
  const handleAnalyzeBurden = async () => {
    if (Object.keys(parsedTableData).length === 0 || parsedTableHeaders.length === 0) {
      toast({
        title: "Analysis Failed",
        description: "No schedule data to analyze. Please add assessments first.",
        variant: "destructive",
        duration: 3000
      });
      return;
    }
    
    setIsAnalyzing(true);
    
    try {
      // Call the backend API to analyze participant burden
      const response = await fetch(`/api/analyze-schedule-burden?id=${protocol.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          tableHeaders: parsedTableHeaders,
          tableData: parsedTableData,
          indication: protocol.indication,
          synopsis: protocol.synopsis
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to analyze participant burden');
      }
      
      // Parse the response
      const data = await response.json();
      
      // Update state with analysis results
      setBurdenAnalysis(data);
      
      // Show burden analysis dialog
      setShowBurdenDialog(true);
    } catch (error) {
      console.error("Error analyzing burden:", error);
      
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze participant burden. Please try again later.",
        variant: "destructive",
        duration: 3000
      });
    } finally {
      setIsAnalyzing(false);
    }
  }

  const renderExactSourceTable = (table: ExtractedSourceTable, tableIndex: number) => {
    const cellRows = Array.isArray(table.cells) && table.cells.length > 0
      ? table.cells
      : [
          (table.headers || []).map(text => ({ text, isHeader: true })),
          ...(table.rows || []).map(row => row.map(text => ({ text })))
        ];

    return (
      <div key={`${table.id}-${tableIndex}`} className="rounded-md border border-[#dee2e6] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dee2e6] px-3 py-2">
          <div>
            <h3 className="text-sm font-semibold text-[#343a40]">{table.title || `Source SoA table ${tableIndex + 1}`}</h3>
            <p className="text-xs text-[#6c757d]">
              {table.exactSourceAvailable || table.sourceFormat === "docx_table"
                ? table.preservationNote || "Copied from a DOCX source table with row/column structure preserved where available."
                : `Reproduced from ${table.source || "uploaded source"}${table.cells ? " with merged-cell structure preserved where available" : ""}.`}
              {table.pageLayout?.orientation ? ` Export uses ${table.pageLayout.orientation} page layout for this source table.` : ""}
            </p>
          </div>
          <Badge variant="outline" className="bg-white text-[#495057]">
            {table.exactSourceAvailable || table.sourceFormat === "docx_table" ? "Exact source table" : "Source as-is"}
          </Badge>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full border-collapse text-sm">
            <tbody>
              {cellRows.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex === 0 ? "bg-[#f8f9fa]" : "border-t border-[#dee2e6]"}>
                  {row.map((cell, cellIndex) => {
                    const Tag = cell.isHeader || rowIndex === 0 ? "th" : "td";
                    return (
                      <Tag
                        key={`${rowIndex}-${cellIndex}`}
                        colSpan={cell.colSpan || 1}
                        rowSpan={cell.rowSpan || 1}
                        className={`border border-[#dee2e6] px-3 py-2 align-top ${Tag === "th" ? "text-left font-semibold text-[#495057]" : "text-[#495057]"}`}
                      >
                        <div className="flex items-start gap-1">
                          <span>{cell.text}</span>
                          <ProvenanceInfo
                            origin="source"
                            sourceName={table.source || "Uploaded source"}
                            action="This cell was reproduced from the uploaded Schedule of Activities source table."
                            section={table.title || "Schedule of Activities"}
                            className="mt-0.5 h-4 w-4 shrink-0"
                          />
                        </div>
                      </Tag>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderReadOnlyScheduleTable = (group: { id: string; title: string; headerIndexes: number[] }) => (
    <div key={group.id} className="rounded-md border border-[#dee2e6] bg-white">
      {group.title && group.id !== "all" && (
        <div className="border-b border-[#dee2e6] px-3 py-2">
          <h3 className="text-sm font-semibold text-[#343a40]">{group.title}</h3>
          <p className="text-xs text-[#6c757d]">Split view keeps wide SoA grids readable. Switch to single table to edit cells.</p>
        </div>
      )}
      <div className="overflow-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="bg-[#f8f9fa] border-b border-[#dee2e6]">
              <th className="px-4 py-2 text-left text-sm font-semibold text-[#495057] min-w-[200px] sticky left-0 bg-[#f8f9fa] border-r border-[#dee2e6]">
                Assessment
              </th>
              {group.headerIndexes.map(headerIndex => {
                const headerOrigin = headerOrigins[headerIndex] || null;
                const headerLabel = getSoAOriginLabel(headerOrigin);
                return (
                  <th key={headerIndex} className="px-2 py-2 text-center text-xs font-medium text-[#495057] whitespace-pre-wrap w-[100px]">
                    <div className="flex flex-col items-center gap-1">
                      <span>{parsedTableHeaders[headerIndex]}</span>
                      {headerLabel && (
                        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${getSoAOriginClasses(headerOrigin)}`}>
                          {headerLabel}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Object.entries(filteredData).map(([category, assessments]) => {
              const rows = assessments.filter((assessment: any) =>
                group.headerIndexes.some(headerIndex => hasCellValue(assessment.values?.[headerIndex]))
              );
              if (!rows.length) return null;
              return (
                <React.Fragment key={`${group.id}-${category}`}>
                  <tr className="border-b border-[#dee2e6] bg-[#f1f3f5]">
                    <td colSpan={group.headerIndexes.length + 1} className="px-4 py-2 text-sm font-medium text-[#495057]">
                      {category}
                    </td>
                  </tr>
                  {rows.map((assessment: any, rowIndex: number) => {
                    const rowOrigin = getRowOrigin(assessment);
                    const rowLabel = getSoAOriginLabel(rowOrigin);
                    return (
                      <tr key={`${group.id}-${category}-${rowIndex}`} className="border-b border-[#dee2e6]">
                        <td className="px-4 py-3 text-sm text-[#495057] sticky left-0 bg-white border-r border-[#dee2e6]">
                          <div className="flex items-center gap-2">
                            <span>{assessment.assessment}</span>
                            <ProvenanceInfo
                              item={assessment}
                              origin={rowOrigin || "manual"}
                              action={rowOrigin === "source" ? "Assessment row used from source schedule." : rowOrigin === "improved" ? "Assessment row was improved or standardized by AI." : rowOrigin === "generated" ? "Assessment row added by AI." : "Assessment row was added or edited manually."}
                              why={assessment.reason || assessment.rationale || assessment.aiSuggestion}
                              section="Schedule of Activities assessment"
                              className="h-4 w-4"
                            />
                            {rowLabel && <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getSoAOriginClasses(rowOrigin)}`}>{rowLabel}</span>}
                          </div>
                        </td>
                        {group.headerIndexes.map(headerIndex => {
                          const cellValue = assessment.values?.[headerIndex] || "";
                          const cellOrigin = getCellOrigin(assessment, headerIndex);
                          return (
                            <td key={headerIndex} className="relative px-2 py-3 text-center text-sm">
                              {cellOrigin && (
                                <ProvenanceInfo
                                  origin={cellOrigin}
                                  sourceName={cellOrigin === "source" ? "Source schedule" : undefined}
                                  action={cellOrigin === "generated" ? "Visit marker added by AI." : cellOrigin === "improved" ? "Visit marker timing was improved or standardized by AI." : "Visit marker used from source schedule."}
                                  why={getCellReason(assessment, headerIndex)}
                                  section={`${assessment.assessment} at ${parsedTableHeaders[headerIndex]}`}
                                  className="absolute right-1 top-1 h-4 w-4"
                                />
                              )}
                              {cellValue === "X" || cellValue === "x" ? <span className="font-bold text-[#228be6]">X</span> : cellValue}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-md border border-[#dee2e6] p-4">
      {protocol.synopsis && (
        <div className="mb-4">
          <SectionSourcePanel
            protocol={protocol}
            setProtocol={setProtocol}
            sectionKey="schedule"
            sectionName="Schedule of Activities"
            referenceExamples="Use the visit/timepoint structure and assessment timing from this file, adapted to the current study."
            isGenerating={isGenerating}
            compact={parsedTableHeaders.length > 0 || Object.keys(parsedTableData).length > 0}
            onGenerate={handleGenerateWithAI}
          />
        </div>
      )}

      <div className="mb-4 rounded-md border border-[#dee2e6] bg-[#f8f9fa] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#343a40]">Schedule table structure</h3>
            <p className="text-xs text-[#6c757d]">
              Use one table, split wide schedules into two tables, or reproduce uploaded SoA tables exactly when available.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={scheduleTableLayout}
              onValueChange={(value) => {
                const nextLayout = value as SoATableLayout;
                setProtocol(prev => ({
                  ...(prev as any),
                  soaTableLayout: nextLayout
                } as any));
              }}
            >
              <SelectTrigger className="h-9 w-44 bg-white text-sm">
                <SelectValue placeholder="Table layout" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto split</SelectItem>
                <SelectItem value="single">Single table</SelectItem>
                <SelectItem value="split">Two tables</SelectItem>
              </SelectContent>
            </Select>
            {scheduleTableLayout === "split" && parsedTableHeaders.length >= 4 && (
              <Select
                value={String(customSplitIndex || findSplitIndex(parsedTableHeaders))}
                onValueChange={(value) => {
                  setProtocol(prev => ({
                    ...(prev as any),
                    soaSplitAfterIndex: Number(value)
                  } as any));
                }}
              >
                <SelectTrigger className="h-9 w-56 bg-white text-sm">
                  <SelectValue placeholder="Split after visit" />
                </SelectTrigger>
                <SelectContent>
                  {parsedTableHeaders.slice(1, -1).map((header, index) => {
                    const splitAfterIndex = index + 2;
                    return (
                      <SelectItem key={splitAfterIndex} value={String(splitAfterIndex)}>
                        Split after {header}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
            {sourceSoATables.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 bg-white text-sm"
                onClick={() => {
                  applySourceSoATables(sourceSoATables);
                  toast({
                    title: "Source SoA reproduced",
                    description: sourceSoATables.length === 1
                      ? "The uploaded SoA table is now shown as the source schedule."
                      : `${sourceSoATables.length} uploaded SoA tables are now shown as the source schedule.`,
                    duration: 3000
                  });
                }}
              >
                <FileText size={14} className="mr-1.5" />
                Use uploaded SoA table{sourceSoATables.length === 1 ? "" : "s"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {exactSourceTables.length > 0 && (
        <div className="mb-4 space-y-3">
          {hasPreservedExactSourceTables && (
            <div className="rounded-md border border-[#d0ebff] bg-[#f8fbff] px-3 py-2 text-sm text-[#1c3d5a]">
              Exact source table mode is active. The protocol will use the uploaded DOCX table structure instead of the simplified editable SoA grid.
            </div>
          )}
          {exactSourceTables.map((table, index) => renderExactSourceTable(table, index))}
        </div>
      )}

      {/* Table Controls */}
      {!hasPreservedExactSourceTables && (
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-4 border-b border-[#dee2e6]">
        <div className="flex items-center space-x-2">
          <div className="relative w-60">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-[#adb5bd]" size={16} />
            <Input
              placeholder="Search assessments..."
              className="pl-8 h-9 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-9 w-40 text-sm">
              <SelectValue placeholder="Filter by Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Object.keys(parsedTableData).map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-sm"
            onClick={() => setShowAddCategoryDialog(true)}
          >
            <Plus size={14} className="mr-1.5" />
            Add Category
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-sm"
            onClick={() => setShowAddColumnDialog(true)}
          >
            <Plus size={14} className="mr-1.5" />
            Add Timepoint
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-sm"
            onClick={handleAnalyzeBurden}
            disabled={isAnalyzing}
          >
            <BarChart size={14} className="mr-1.5" />
            {isAnalyzing ? "Analyzing..." : "Burden Analysis"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-sm"
            onClick={handleExportToExcel}
          >
            <Download size={14} className="mr-1.5" />
            Export to Excel
          </Button>
        </div>
      </div>
      )}

      {!hasPreservedExactSourceTables && hasSoAProvenance && (
        <div className="rounded-md border border-[#d0ebff] bg-[#f8fbff] p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[#1c3d5a]">Schedule Change Summary</h3>
              <p className="text-xs text-[#6c757d]">
                Source content has no label. AI changes are marked at row, visit, or cell level.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-[#495057]">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-500" /> AI added
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> AI improved
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" /> Removed from source
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {soaChangeSummary.sourceRows > 0 && (
              <Badge variant="outline" className="bg-white text-[#495057]">
                {soaChangeSummary.sourceRows} source rows used as-is
              </Badge>
            )}
            {soaChangeSummary.improvedRows > 0 && (
              <Badge variant="outline" className={getSoAOriginClasses("improved")}>
                {soaChangeSummary.improvedRows} rows improved
              </Badge>
            )}
            {soaChangeSummary.addedRows > 0 && (
              <Badge variant="outline" className={getSoAOriginClasses("generated")}>
                {soaChangeSummary.addedRows} assessments added
              </Badge>
            )}
            {soaChangeSummary.addedVisits > 0 && (
              <Badge variant="outline" className={getSoAOriginClasses("generated")}>
                {soaChangeSummary.addedVisits} visits added
              </Badge>
            )}
            {soaChangeSummary.improvedVisits > 0 && (
              <Badge variant="outline" className={getSoAOriginClasses("improved")}>
                {soaChangeSummary.improvedVisits} visits improved
              </Badge>
            )}
            {soaChangeSummary.addedCells > 0 && (
              <Badge variant="outline" className={getSoAOriginClasses("generated")}>
                {soaChangeSummary.addedCells} cells added
              </Badge>
            )}
            {soaChangeSummary.improvedCells > 0 && (
              <Badge variant="outline" className={getSoAOriginClasses("improved")}>
                {soaChangeSummary.improvedCells} cells improved
              </Badge>
            )}
            {soaChangeSummary.removedItems > 0 && (
              <Badge variant="outline" className={getSoAOriginClasses("removed")}>
                {soaChangeSummary.removedItems} source items removed
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Schedule of Activities Table */}
      {!hasPreservedExactSourceTables && (scheduleTableGroups.length > 1 ? (
        <div className="space-y-4">
          {scheduleTableGroups.map(group => renderReadOnlyScheduleTable(group))}
        </div>
      ) : (
      <div className="overflow-auto">
        <div className="min-w-[800px]">
          <table className="w-full">
            <thead>
              <tr className="bg-[#f8f9fa] border-b border-[#dee2e6]">
                <th className="px-4 py-2 text-left text-sm font-semibold text-[#495057] min-w-[200px] sticky left-0 bg-[#f8f9fa] border-r border-[#dee2e6]">
                  Assessment
                </th>
                {parsedTableHeaders.map((header, index) => {
                  const isEditing = cellEditPosition.isEditing && 
                    cellEditPosition.editType === "header" && 
                    cellEditPosition.col === index;
                  const headerOrigin = headerOrigins[index] || null;
                  const headerLabel = getSoAOriginLabel(headerOrigin);
                    
                  if (isEditing) {
                    return (
                      <th
                        key={index}
                        className="px-2 py-2 text-center text-xs font-medium text-[#495057] whitespace-pre-wrap w-[100px] relative"
                      >
                        <div className="flex flex-col gap-1">
                          <input
                            type="text"
                            value={cellEditValue}
                            onChange={(e) => setCellEditValue(e.target.value)}
                            className="w-full text-center p-1 text-xs border border-[#228be6] rounded focus:outline-none focus:ring-1 focus:ring-[#228be6]"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleSaveCellEdit(cellEditValue);
                              } else if (e.key === "Escape") {
                                handleCancelCellEdit();
                              }
                            }}
                            onBlur={() => handleSaveCellEdit(cellEditValue)}
                          />
                          <div className="flex justify-center gap-1">
                            <button
                              className="text-[#228be6] p-1 hover:text-[#1c7ed6]"
                              onClick={() => handleSaveCellEdit(cellEditValue)}
                            >
                              <Check size={12} />
                            </button>
                            <button
                              className="text-[#fa5252] p-1 hover:text-[#e03131]"
                              onClick={handleCancelCellEdit}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </th>
                    );
                  }
                    
                  return (
                    <th
                      key={index}
                      className="relative px-2 py-2 text-center text-xs font-medium text-[#495057] whitespace-pre-wrap w-[100px] group cursor-pointer"
                      onClick={() => handleHeaderClick(index)}
                    >
                      <div className="flex flex-col items-center justify-center gap-1">
                        <div className="flex items-center justify-center">
                          <span>{header}</span>
                          <ProvenanceInfo
                            origin={headerOrigin || "manual"}
                            sourceName={headerOrigin === "source" ? "Uploaded synopsis / PED" : undefined}
                            action={
                              headerOrigin === "generated"
                                ? "Visit/timepoint added by AI."
                                : headerOrigin === "improved"
                                  ? "Visit/timepoint was improved or standardized by AI."
                                  : headerOrigin === "source"
                                    ? "Visit/timepoint used from source schedule."
                                    : "Visit/timepoint was added or edited manually."
                            }
                            why={
                              headerOrigin === "generated"
                                ? "The visit/timepoint was needed to make the schedule operational for the study design."
                                : headerOrigin === "improved"
                                  ? "The visit/timepoint wording or placement needed standardization for a protocol-ready schedule."
                                  : undefined
                            }
                            section="Schedule of Activities visit"
                            className="ml-1 h-4 w-4"
                          />
                          <button
                            className="ml-1 text-[#fa5252] opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              setupDeleteColumn(index);
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {headerLabel && (
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${getSoAOriginClasses(headerOrigin)}`}>
                            {headerLabel}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
                
                {/* Empty header for spacing */}
                {parsedTableHeaders.length > 0 && <th className="w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {Object.keys(filteredData).length > 0 ? (
                Object.entries(filteredData).map(([category, assessments]) => (
                  <React.Fragment key={category}>
                    {/* Category Header */}
                    <tr className="border-b border-[#dee2e6] bg-[#f1f3f5]">
                      <td
                        colSpan={parsedTableHeaders.length + 2}
                        className="px-4 py-2 text-sm font-medium text-[#495057] sticky left-0 bg-[#f1f3f5] flex items-center justify-between group"
                      >
                        <span>{category}</span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            className="text-[#fa5252]"
                            onClick={() => setupDeleteCategory(category)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Category Items */}
                    {assessments.map((assessment, assessmentIndex) => {
                      const rowOrigin = getRowOrigin(assessment);
                      const rowLabel = getSoAOriginLabel(rowOrigin);
                      return (
                      <tr key={`${category}-${assessmentIndex}`} className="border-b border-[#dee2e6]">
                        {/* Assessment Name */}
                        <td
                          className="px-4 py-3 text-sm text-[#495057] sticky left-0 bg-white border-r border-[#dee2e6] group"
                        >
                          {cellEditPosition.isEditing && 
                           cellEditPosition.editType === "assessment" && 
                           cellEditPosition.category === category && 
                           cellEditPosition.row === assessmentIndex ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={cellEditValue}
                                onChange={(e) => setCellEditValue(e.target.value)}
                                className="flex-1 p-1 text-sm border border-[#228be6] rounded focus:outline-none focus:ring-1 focus:ring-[#228be6]"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleSaveCellEdit(cellEditValue);
                                  } else if (e.key === "Escape") {
                                    handleCancelCellEdit();
                                  }
                                }}
                                onBlur={() => handleSaveCellEdit(cellEditValue)}
                              />
                              <button
                                className="text-[#228be6] p-1 hover:text-[#1c7ed6]"
                                onClick={() => handleSaveCellEdit(cellEditValue)}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                className="text-[#fa5252] p-1 hover:text-[#e03131]"
                                onClick={handleCancelCellEdit}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <span
                                  className="cursor-pointer hover:text-[#228be6]"
                                  onClick={() => handleAssessmentNameClick(category, assessmentIndex)}
                                >
                                  {assessment.assessment}
                                </span>
                                <ProvenanceInfo
                                  item={assessment}
                                  origin={rowOrigin || "manual"}
                                  action={
                                    rowOrigin === "generated"
                                      ? "Assessment row added by AI."
                                      : rowOrigin === "improved"
                                        ? "Assessment row was improved or standardized by AI."
                                        : rowOrigin === "source"
                                          ? "Assessment row used from source schedule."
                                          : "Assessment row was added or edited manually."
                                  }
                                  why={
                                    assessment.reason ||
                                    assessment.rationale ||
                                    assessment.aiSuggestion ||
                                    (rowOrigin === "generated"
                                      ? "The assessment was needed to support the study objectives, safety monitoring, endpoint assessment, or operational completeness."
                                      : rowOrigin === "improved"
                                        ? "The source assessment needed clearer naming, grouping, or protocol-ready wording."
                                        : undefined)
                                  }
                                  section="Schedule of Activities assessment"
                                  className="h-4 w-4"
                                />
                                {rowLabel && (
                                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getSoAOriginClasses(rowOrigin)}`}>
                                    {rowLabel}
                                  </span>
                                )}
                                <CommentTrigger
                                  protocolId={protocol.id}
                                  designStateId={activeDesignState?.id || ""}
                                  section="scheduleOfActivities"
                                  sectionItem="assessment"
                                  contextData={`${category}-${assessment.assessment}`}
                                  size="icon"
                                />
                              </div>
                              <button
                                className="text-[#fa5252] opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => setupDeleteAssessment(category, assessmentIndex)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                        
                        {/* Assessment Values */}
                        {parsedTableHeaders.map((header, columnIndex) => {
                          const isEditing = cellEditPosition.isEditing && 
                            cellEditPosition.editType === "cell" && 
                            cellEditPosition.category === category && 
                            cellEditPosition.row === assessmentIndex && 
                            cellEditPosition.col === columnIndex;
                            
                          if (isEditing) {
                            return (
                              <td
                                key={columnIndex}
                                className="px-2 py-3 text-center text-sm"
                              >
                                <input
                                  type="text"
                                  value={cellEditValue}
                                  onChange={(e) => setCellEditValue(e.target.value)}
                                  className="w-full text-center p-1 text-sm border border-[#228be6] rounded focus:outline-none focus:ring-1 focus:ring-[#228be6]"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleSaveCellEdit(cellEditValue);
                                    } else if (e.key === "Escape") {
                                      handleCancelCellEdit();
                                    }
                                  }}
                                  onBlur={() => handleSaveCellEdit(cellEditValue)}
                                />
                              </td>
                            );
                          }
                          
                          const cellValue = assessment.values[columnIndex] || "";
                          const cellOrigin = getCellOrigin(assessment, columnIndex);
                          const cellLabel = getSoAOriginLabel(cellOrigin);
                          const cellReason = getCellReason(assessment, columnIndex);
                          const cellSource = getCellSource(assessment, columnIndex);
                          
                          return (
                            <td
                              key={columnIndex}
                              className="px-2 py-3 text-center text-sm cursor-pointer hover:bg-[#f1f3f5] relative group"
                              onClick={() => handleCellClick(category, assessmentIndex, columnIndex)}
                            >
                              {cellOrigin && (
                                <ProvenanceInfo
                                  origin={cellOrigin}
                                  sourceName={cellSource ? "Source schedule" : cellOrigin === "source" ? "Uploaded synopsis / PED" : undefined}
                                  sourceExcerpt={cellSource}
                                  action={
                                    cellOrigin === "generated"
                                      ? "Visit marker added by AI."
                                      : cellOrigin === "improved"
                                        ? "Visit marker timing was improved or standardized by AI."
                                        : cellOrigin === "source"
                                          ? "Visit marker used from source schedule."
                                          : cellReason || "Cell traceability available."
                                  }
                                  why={cellReason}
                                  section={`${assessment.assessment} at ${header}`}
                                  className="absolute right-1 top-1 h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100"
                                />
                              )}
                              <div className="flex items-center justify-center gap-1">
                                <span>
                                  {cellValue === "X" || cellValue === "x" ? 
                                    <span className="text-[#228be6] font-bold">X</span> : cellValue}
                                </span>
                                {(cellValue === "X" || cellValue === "x" || cellValue) && (
                                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <CommentTrigger
                                      protocolId={protocol.id}
                                      designStateId={activeDesignState?.id || ""}
                                      section="scheduleOfActivities"
                                      sectionItem="cell"
                                      contextData={`${category}-${assessment.assessment}-timepoint-${columnIndex}`}
                                      size="icon"
                                    />
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        
                        {/* Spacer cell */}
                        {parsedTableHeaders.length > 0 && <td className="w-8"></td>}
                      </tr>
                    )})}
                  </React.Fragment>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={parsedTableHeaders.length + 2}
                    className="px-4 py-8 text-center text-sm text-[#6c757d]"
                  >
                    {searchQuery ? (
                      <div className="flex flex-col items-center">
                        <Search size={36} className="mb-2 text-[#adb5bd]" />
                        <p>No assessments found matching "{searchQuery}"</p>
                        <button
                          className="mt-2 text-[#228be6]"
                          onClick={() => setSearchQuery("")}
                        >
                          Clear search
                        </button>
                      </div>
                    ) : Object.keys(parsedTableData).length === 0 ? (
                      <div className="flex flex-col items-center">
                        <Activity size={36} className="mb-2 text-[#adb5bd]" />
                        <p>No assessments defined yet</p>
                        <p className="mt-1 text-[#adb5bd]">
                          Add categories and assessments to build your schedule or use AI generation
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <AlertCircle size={36} className="mb-2 text-[#adb5bd]" />
                        <p>No assessments found in selected category</p>
                        <button
                          className="mt-2 text-[#228be6]"
                          onClick={() => setFilterCategory("all")}
                        >
                          Show all categories
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
              
              {/* Add row button at the bottom */}
              <tr>
                <td
                  colSpan={parsedTableHeaders.length + 1}
                  className="px-4 py-3 sticky left-0 bg-white border-t border-[#dee2e6]"
                >
                  <Button
                    variant="link"
                    className="text-[#228be6] text-sm font-medium p-0 h-auto"
                    onClick={() => setShowAddAssessmentDialog(true)}
                  >
                    <Plus size={16} className="mr-1" />
                    Add Assessment
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      ))}
      
      {/* Add Assessment Dialog */}
      <Dialog open={showAddAssessmentDialog} onOpenChange={setShowAddAssessmentDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Assessment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Category</label>
              <Select
                value={newAssessment.category}
                onValueChange={(value) => setNewAssessment({ ...newAssessment, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(parsedTableData).length > 0 ? (
                    Object.keys(parsedTableData).map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="Screening" disabled>
                      No categories - add one first
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Assessment Name</label>
              <Input
                value={newAssessment.name}
                onChange={(e) => setNewAssessment({ ...newAssessment, name: e.target.value })}
                placeholder="Enter assessment name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddAssessmentDialog(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddAssessment}
              disabled={!newAssessment.category || !newAssessment.name}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Add Category Dialog */}
      <Dialog open={showAddCategoryDialog} onOpenChange={setShowAddCategoryDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Category</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Category Name</label>
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g., Screening, Treatment, Follow-up"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddCategoryDialog(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleAddCategory} disabled={!newCategoryName}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Add Column Dialog */}
      <Dialog open={showAddColumnDialog} onOpenChange={setShowAddColumnDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Timepoint</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Timepoint Name</label>
              <Input
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="e.g., Day 1, Week 4, Month 3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddColumnDialog(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleAddColumn} disabled={!newColumnName}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>
              {deleteType === "assessment" && (
                <>Are you sure you want to delete this assessment?</>
              )}
              {deleteType === "category" && (
                <>
                  Are you sure you want to delete the category "{deleteInfo.category}"? All assessments
                  in this category will be removed.
                </>
              )}
              {deleteType === "column" && (
                <>
                  Are you sure you want to delete this timepoint? All data in this column will be
                  removed.
                </>
              )}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Generate Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={isGenerating ? undefined : setShowGenerateDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Generate Schedule with AI</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {isGenerating ? (
              <div className="space-y-4">
                <AIGenerationStatus sections={generationStatus} />
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm">
                  AI will analyze your protocol and generate a complete schedule of activities
                  with appropriate timepoints and assessments.
                </p>
                <p className="text-sm font-medium">What happens next:</p>
                <ol className="text-sm space-y-2 list-decimal list-inside">
                  <li>AI will read and parse your protocol synopsis</li>
                  <li>Generate appropriate study timepoints</li>
                  <li>Create assessment categories and items</li>
                  <li>Determine which assessments are performed at each timepoint</li>
                </ol>
                <div className="rounded-md bg-[#fff9db] p-3">
                  <AlertCircle size={16} className="text-[#f59f00] inline-block mr-2" />
                  <span className="text-sm">
                    This will replace your current schedule. Make sure to export your
                    current schedule first if you want to keep it.
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            {!isGenerating && (
              <>
                <Button type="button" variant="outline" onClick={() => setShowGenerateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="default"
                  onClick={() => handleGenerateWithAI("augment")}
                  className="bg-[#228be6] hover:bg-[#1864ab]"
                >
                  <Zap size={16} className="mr-1.5" />
                  {parsedTableHeaders.length > 0 || Object.keys(parsedTableData).length > 0 ? "Regenerate Schedule" : "Generate Schedule"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Burden Analysis Dialog */}
      <Dialog open={showBurdenDialog} onOpenChange={setShowBurdenDialog}>
        <DialogContent className="max-w-[800px]">
          <DialogHeader>
            <DialogTitle>Schedule Burden Analysis</DialogTitle>
          </DialogHeader>
          <div className="py-4 max-h-[80vh] overflow-auto">
            {burdenAnalysis ? (
              <div className="space-y-6">
                {/* Patient Burden Assessment */}
                {burdenAnalysis.patientBurdenAssessment && (
                  <div className="space-y-3">
                    <h4 className="text-lg font-semibold text-[#228be6]">Patient Burden Assessment</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-md bg-[#f8f9fa] p-3">
                        <div className="text-sm font-medium">Patient Burden Score</div>
                        <div className="text-2xl font-bold text-[#495057]">
                          {burdenAnalysis.patientBurdenAssessment.patientBurdenScore}/10
                        </div>
                        <div className="w-full h-2 bg-[#e9ecef] rounded-full mt-2">
                          <div
                            className={`h-full rounded-full ${
                              burdenAnalysis.patientBurdenAssessment.patientBurdenScore > 7
                                ? "bg-[#fa5252]"
                                : burdenAnalysis.patientBurdenAssessment.patientBurdenScore > 4
                                ? "bg-[#fcc419]"
                                : "bg-[#51cf66]"
                            }`}
                            style={{ width: `${(burdenAnalysis.patientBurdenAssessment.patientBurdenScore / 10) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="text-sm">
                          <span className="font-medium">Total Visits:</span> {burdenAnalysis.patientBurdenAssessment.totalVisits || 'N/A'}
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">Total Procedures:</span> {burdenAnalysis.patientBurdenAssessment.totalProcedures || 'N/A'}
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">Visit Frequency:</span> {burdenAnalysis.patientBurdenAssessment.visitFrequency || 'N/A'}
                        </div>
                      </div>
                    </div>
                    
                    {/* Population Context */}
                    {burdenAnalysis.patientBurdenAssessment.populationContext && (
                      <div className="rounded-md bg-[#e3f2fd] p-3">
                        <h5 className="text-sm font-semibold mb-2">Population Context</h5>
                        <p className="text-sm text-[#1565c0]">{burdenAnalysis.patientBurdenAssessment.populationContext}</p>
                      </div>
                    )}
                    
                    {/* Procedural Concerns */}
                    {burdenAnalysis.patientBurdenAssessment.proceduralConcerns && burdenAnalysis.patientBurdenAssessment.proceduralConcerns.length > 0 && (
                      <div>
                        <h5 className="text-sm font-semibold mb-2">Key Procedural Concerns</h5>
                        <ul className="space-y-1">
                          {burdenAnalysis.patientBurdenAssessment.proceduralConcerns.map((concern: string, index: number) => (
                            <li key={index} className="text-sm flex items-start">
                              <span className="text-[#f57c00] mr-2">⚠</span>
                              <span>{concern}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {burdenAnalysis.patientBurdenAssessment.recommendations && burdenAnalysis.patientBurdenAssessment.recommendations.length > 0 && (
                      <div>
                        <h5 className="text-sm font-semibold mb-2">Patient Burden Recommendations</h5>
                        <ul className="space-y-1">
                          {burdenAnalysis.patientBurdenAssessment.recommendations.map((rec: string, index: number) => (
                            <li key={index} className="text-sm flex items-start">
                              <span className="text-[#228be6] mr-2">•</span>
                              <span>{rec}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Site Burden Assessment */}
                {burdenAnalysis.siteBurdenAssessment && (
                  <div className="space-y-3">
                    <h4 className="text-lg font-semibold text-[#fa8500]">Site Burden Assessment</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-md bg-[#fff4e6] p-3">
                        <div className="text-sm font-medium">Site Workload Score</div>
                        <div className="text-2xl font-bold text-[#495057]">
                          {burdenAnalysis.siteBurdenAssessment.siteWorkloadScore}/10
                        </div>
                        <div className="w-full h-2 bg-[#e9ecef] rounded-full mt-2">
                          <div
                            className={`h-full rounded-full ${
                              burdenAnalysis.siteBurdenAssessment.siteWorkloadScore > 7
                                ? "bg-[#fa5252]"
                                : burdenAnalysis.siteBurdenAssessment.siteWorkloadScore > 4
                                ? "bg-[#fcc419]"
                                : "bg-[#51cf66]"
                            }`}
                            style={{ width: `${(burdenAnalysis.siteBurdenAssessment.siteWorkloadScore / 10) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="text-sm">
                          <span className="font-medium">Avg Procedures per Visit:</span> {burdenAnalysis.siteBurdenAssessment.avgProceduresPerVisit || 'N/A'}
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">Staff Time per Visit:</span> {burdenAnalysis.siteBurdenAssessment.staffTimeHoursPerVisit ? `${burdenAnalysis.siteBurdenAssessment.staffTimeHoursPerVisit}h` : 'N/A'}
                        </div>
                        {burdenAnalysis.siteBurdenAssessment.specialEquipment && burdenAnalysis.siteBurdenAssessment.specialEquipment.length > 0 && (
                          <div className="text-sm">
                            <span className="font-medium">Special Equipment:</span> {burdenAnalysis.siteBurdenAssessment.specialEquipment.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Operational Context */}
                    {burdenAnalysis.siteBurdenAssessment.operationalContext && (
                      <div className="rounded-md bg-[#fff3e0] p-3">
                        <h5 className="text-sm font-semibold mb-2">Operational Context</h5>
                        <p className="text-sm text-[#e65100]">{burdenAnalysis.siteBurdenAssessment.operationalContext}</p>
                      </div>
                    )}
                    
                    {/* Staffing Challenges */}
                    {burdenAnalysis.siteBurdenAssessment.staffingChallenges && burdenAnalysis.siteBurdenAssessment.staffingChallenges.length > 0 && (
                      <div>
                        <h5 className="text-sm font-semibold mb-2">Staffing Challenges</h5>
                        <ul className="space-y-1">
                          {burdenAnalysis.siteBurdenAssessment.staffingChallenges.map((challenge: string, index: number) => (
                            <li key={index} className="text-sm flex items-start">
                              <span className="text-[#d32f2f] mr-2">⚠</span>
                              <span>{challenge}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {burdenAnalysis.siteBurdenAssessment.recommendations && burdenAnalysis.siteBurdenAssessment.recommendations.length > 0 && (
                      <div>
                        <h5 className="text-sm font-semibold mb-2">Site Burden Recommendations</h5>
                        <ul className="space-y-1">
                          {burdenAnalysis.siteBurdenAssessment.recommendations.map((rec: string, index: number) => (
                            <li key={index} className="text-sm flex items-start">
                              <span className="text-[#fa8500] mr-2">•</span>
                              <span>{rec}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Protocol Efficiency */}
                {burdenAnalysis.protocolEfficiency && (
                  <div className="space-y-3">
                    <h4 className="text-lg font-semibold text-[#5c7cfa]">Protocol Efficiency</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {burdenAnalysis.protocolEfficiency.redundantAssessments && burdenAnalysis.protocolEfficiency.redundantAssessments.length > 0 && (
                        <div className="rounded-md bg-[#ffe8e8] p-3">
                          <h5 className="text-sm font-semibold mb-2">Redundant Assessments</h5>
                          <ul className="space-y-1">
                            {burdenAnalysis.protocolEfficiency.redundantAssessments.map((item: string, index: number) => (
                              <li key={index} className="text-sm">• {item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {burdenAnalysis.protocolEfficiency.missingAssessments && burdenAnalysis.protocolEfficiency.missingAssessments.length > 0 && (
                        <div className="rounded-md bg-[#fff3cd] p-3">
                          <h5 className="text-sm font-semibold mb-2">Missing Assessments</h5>
                          <ul className="space-y-1">
                            {burdenAnalysis.protocolEfficiency.missingAssessments.map((item: string, index: number) => (
                              <li key={index} className="text-sm">• {item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {burdenAnalysis.protocolEfficiency.optimizationOpportunities && burdenAnalysis.protocolEfficiency.optimizationOpportunities.length > 0 && (
                        <div className="rounded-md bg-[#d1ecf1] p-3">
                          <h5 className="text-sm font-semibold mb-2">Optimization Opportunities</h5>
                          <ul className="space-y-1">
                            {burdenAnalysis.protocolEfficiency.optimizationOpportunities.map((item: string, index: number) => (
                              <li key={index} className="text-sm">• {item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Overall Assessment */}
                {burdenAnalysis.overallAssessment && (
                  <div className="space-y-3">
                    <h4 className="text-lg font-semibold text-[#495057]">Overall Assessment</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-md bg-[#f8f9fa] p-3">
                        <div className="text-sm font-medium">Overall Burden Score</div>
                        <div className="text-2xl font-bold">{burdenAnalysis.overallAssessment.overallBurdenScore}/10</div>
                      </div>
                      <div className="rounded-md bg-[#f8f9fa] p-3">
                        <div className="text-sm font-medium">Schedule Quality Score</div>
                        <div className="text-2xl font-bold">{burdenAnalysis.overallAssessment.scheduleQualityScore}/10</div>
                      </div>
                    </div>
                    
                    {/* Contextual Summary */}
                    {burdenAnalysis.overallAssessment.contextualSummary && (
                      <div className="rounded-md bg-[#f5f5f5] p-3">
                        <h5 className="text-sm font-semibold mb-2">Overall Assessment Summary</h5>
                        <p className="text-sm text-[#424242]">{burdenAnalysis.overallAssessment.contextualSummary}</p>
                      </div>
                    )}

                    {burdenAnalysis.overallAssessment.riskFactorsAndMitigations && burdenAnalysis.overallAssessment.riskFactorsAndMitigations.length > 0 && (
                      <div>
                        <h5 className="text-sm font-semibold mb-2">Risk Factors & Mitigations</h5>
                        <ul className="space-y-1">
                          {burdenAnalysis.overallAssessment.riskFactorsAndMitigations.map((item: string, index: number) => (
                            <li key={index} className="text-sm flex items-start">
                              <span className="text-[#495057] mr-2">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <Activity size={36} className="mb-2 text-[#adb5bd]" />
                <p className="text-sm text-[#6c757d]">Analyzing schedule burden...</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setShowBurdenDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

export default ScheduleOfActivities
