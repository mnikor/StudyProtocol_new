import * as XLSX from 'xlsx';

/**
 * Exports data to Excel format and initiates download
 * @param data The data to export
 * @param filename The name of the file to download
 * @param sheetName The name of the sheet in the Excel file
 */
export function exportToExcel(
  data: any[][],
  filename: string = 'export.xlsx',
  sheetName: string = 'Sheet1'
) {
  // Create a new workbook
  const wb = XLSX.utils.book_new();
  
  // Convert data to a worksheet
  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // Add the worksheet to the workbook
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  
  // Write the workbook and download
  XLSX.writeFile(wb, filename);
}

/**
 * Exports a schedule of assessments to Excel with formatting
 * @param tableHeaders The headers for the schedule table
 * @param tableData The data for the schedule table
 * @param filename The name of the file to download
 */
export function exportScheduleToExcel(
  title: string,
  tableHeaders: string[],
  tableData: Record<string, Array<{ assessment: string; values: string[] }>>,
  filename: string = 'schedule_of_assessments.xlsx'
) {
  // Create header row
  const headerRow = ['Assessment', ...tableHeaders];
  
  // Initialize rows array with header
  const rows: any[][] = [headerRow];
  
  // Track row indices of category rows for styling
  const categoryRowIndices: number[] = [];
  
  // Process each category and its assessments
  Object.entries(tableData).forEach(([category, assessments]) => {
    // Add category row and track its index
    categoryRowIndices.push(rows.length);
    rows.push([category, ...Array(tableHeaders.length).fill('')]);
    
    // Add each assessment
    assessments.forEach(assessment => {
      rows.push([assessment.assessment, ...assessment.values]);
    });
  });
  
  // Create a new workbook
  const wb = XLSX.utils.book_new();
  
  // Convert data to a worksheet
  const ws = XLSX.utils.aoa_to_sheet(rows);
  
  // Add some styling
  // Range of all cells
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  
  // Set column widths
  const colWidths = [];
  for (let i = 0; i <= range.e.c; i++) {
    colWidths.push({ wch: i === 0 ? 40 : 15 }); // Assessment column wider
  }
  ws['!cols'] = colWidths;
  
  // Apply cell styles
  if (!ws['!rows']) ws['!rows'] = [];
  
  // Add styles to header row - make it bold with background
  for (let C = 0; C <= range.e.c; C++) {
    const headerCellRef = XLSX.utils.encode_cell({r: 0, c: C});
    if (!ws[headerCellRef]) continue;
    
    // Add style properties to the header cell
    if (!ws[headerCellRef].s) ws[headerCellRef].s = {};
    ws[headerCellRef].s = {
      font: { bold: true },
      fill: { fgColor: { rgb: "E6F0FD" } }, // Light blue background
      alignment: { horizontal: "center", vertical: "center" }
    };
  }
  
  // Style for category rows - make them bold with light gray background
  categoryRowIndices.forEach(rowIndex => {
    // Set row height if rows array exists
    if (!ws['!rows']) ws['!rows'] = [];
    if (!ws['!rows'][rowIndex]) ws['!rows'][rowIndex] = {};
    // TypeScript requires type assertion here
    (ws['!rows'][rowIndex] as any).hpt = 25; // Taller row height for categories
    
    for (let C = 0; C <= range.e.c; C++) {
      const cellRef = XLSX.utils.encode_cell({r: rowIndex, c: C});
      if (!ws[cellRef]) continue;
      
      // Add style properties to the category cell
      if (!ws[cellRef].s) ws[cellRef].s = {};
      ws[cellRef].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "F8F9FA" } }, // Light gray background
        alignment: { vertical: "center" }
      };
    }
  });
  
  // Add the worksheet to the workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Schedule of Activities');
  
  // Write the workbook and download
  XLSX.writeFile(wb, filename);
}

/**
 * Exports criteria (inclusion/exclusion) to Excel with formatting
 * @param inclusionCriteria Array of inclusion criteria items
 * @param exclusionCriteria Array of exclusion criteria items
 * @param filename The name of the file to download
 */
export function exportCriteriaToExcel(
  inclusionCriteria: Array<{ category: string; criteria: string[] }>,
  exclusionCriteria: Array<{ category: string; criteria: string[] }>,
  filename: string = 'inclusion_exclusion_criteria.xlsx'
) {
  // Create a new workbook
  const wb = XLSX.utils.book_new();

  // Process inclusion criteria
  const inclusionRows: any[][] = [['Category', 'Criterion']];
  const inclusionCategoryIndices: number[] = []; // Track category rows
  
  inclusionCriteria.forEach(category => {
    // Track category row for styling
    inclusionCategoryIndices.push(inclusionRows.length);
    inclusionRows.push([category.category, '']);
    
    category.criteria.forEach(criterion => {
      inclusionRows.push(['', criterion]);
    });
  });
  
  // Create inclusion worksheet
  const wsInclusion = XLSX.utils.aoa_to_sheet(inclusionRows);
  
  // Set column widths for inclusion
  wsInclusion['!cols'] = [
    { wch: 25 }, // Category column
    { wch: 70 }  // Criterion column
  ];
  
  // Apply styles to inclusion worksheet
  applyWorksheetStyles(wsInclusion, inclusionCategoryIndices);
  
  // Process exclusion criteria
  const exclusionRows: any[][] = [['Category', 'Criterion']];
  const exclusionCategoryIndices: number[] = []; // Track category rows
  
  exclusionCriteria.forEach(category => {
    // Track category row for styling
    exclusionCategoryIndices.push(exclusionRows.length);
    exclusionRows.push([category.category, '']);
    
    category.criteria.forEach(criterion => {
      exclusionRows.push(['', criterion]);
    });
  });
  
  // Create exclusion worksheet
  const wsExclusion = XLSX.utils.aoa_to_sheet(exclusionRows);
  
  // Set column widths for exclusion
  wsExclusion['!cols'] = [
    { wch: 25 }, // Category column
    { wch: 70 }  // Criterion column
  ];
  
  // Apply styles to exclusion worksheet
  applyWorksheetStyles(wsExclusion, exclusionCategoryIndices);
  
  // Add worksheets to the workbook
  XLSX.utils.book_append_sheet(wb, wsInclusion, 'Inclusion Criteria');
  XLSX.utils.book_append_sheet(wb, wsExclusion, 'Exclusion Criteria');
  
  // Write the workbook and download
  XLSX.writeFile(wb, filename);
}

/**
 * Helper function to apply consistent styles to worksheets
 * @param ws The worksheet to style
 * @param categoryIndices Array of row indices for category rows
 */
function applyWorksheetStyles(ws: XLSX.WorkSheet, categoryIndices: number[]) {
  // Get range of the worksheet
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  
  // Ensure rows array exists
  if (!ws['!rows']) ws['!rows'] = [];
  
  // Style header row (first row)
  for (let C = 0; C <= range.e.c; C++) {
    const headerCellRef = XLSX.utils.encode_cell({r: 0, c: C});
    if (!ws[headerCellRef]) continue;
    
    // Add style properties to header cells
    if (!ws[headerCellRef].s) ws[headerCellRef].s = {};
    ws[headerCellRef].s = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "228BE6" } }, // Blue header
      alignment: { horizontal: "center", vertical: "center" }
    };
  }
  
  // Style category rows
  categoryIndices.forEach(rowIndex => {
    // Increase row height
    if (!ws['!rows']) ws['!rows'] = [];
    if (!ws['!rows'][rowIndex]) ws['!rows'][rowIndex] = {};
    // TypeScript requires type assertion here
    (ws['!rows'][rowIndex] as any).hpt = 22; // Taller row height
    
    for (let C = 0; C <= range.e.c; C++) {
      const cellRef = XLSX.utils.encode_cell({r: rowIndex, c: C});
      if (!ws[cellRef]) continue;
      
      // Add style properties to category cells
      if (!ws[cellRef].s) ws[cellRef].s = {};
      ws[cellRef].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "F1F3F5" } }, // Light gray background
        alignment: { vertical: "center" }
      };
    }
  });
}

/**
 * Exports simple text to Excel
 * @param text The text to export (e.g., synopsis)
 * @param title The title for the text
 * @param filename The name of the file to download
 */
/**
 * Exports data variables to Excel with formatting
 * @param variables Array of data variables
 * @param filename The name of the file to download
 */
export function exportVariablesToExcel(
  variables: Array<{
    id: number;
    category: string;
    name: string;
    type: string;
    required: boolean;
    aiSuggestion?: string;
  }>,
  filename: string = 'data_variables.xlsx'
) {
  // Create a new workbook
  const wb = XLSX.utils.book_new();
  
  // Group variables by category for better organization
  const categorizedVariables: Record<string, any[]> = {};
  variables.forEach(variable => {
    const category = variable.category || 'Uncategorized';
    if (!categorizedVariables[category]) {
      categorizedVariables[category] = [];
    }
    categorizedVariables[category].push(variable);
  });
  
  // Create header row
  const headerRow = ['Variable Name', 'Data Type', 'Required', 'AI Suggestion'];
  
  // Initialize rows array with header
  const rows: any[][] = [headerRow];
  
  // Track category row indices for styling
  const categoryRowIndices: number[] = [];
  
  // Process each category and its variables
  Object.entries(categorizedVariables).forEach(([category, categoryVariables]) => {
    // Add category row and track its index
    categoryRowIndices.push(rows.length);
    rows.push([category, '', '', '']);
    
    // Add each variable
    categoryVariables.forEach(variable => {
      rows.push([
        variable.name,
        variable.type,
        variable.required ? 'Yes' : 'No',
        variable.aiSuggestion || ''
      ]);
    });
  });
  
  // Convert data to a worksheet
  const ws = XLSX.utils.aoa_to_sheet(rows);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 40 }, // Variable name
    { wch: 15 }, // Data type
    { wch: 10 }, // Required
    { wch: 60 }  // AI suggestion
  ];
  
  // Get range of the worksheet
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  
  // Apply styles to header row
  for (let C = 0; C <= range.e.c; C++) {
    const headerCellRef = XLSX.utils.encode_cell({r: 0, c: C});
    if (!ws[headerCellRef]) continue;
    
    // Add style properties to header cells
    if (!ws[headerCellRef].s) ws[headerCellRef].s = {};
    ws[headerCellRef].s = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "228BE6" } }, // Blue header
      alignment: { horizontal: "center", vertical: "center" }
    };
  }
  
  // Style category rows
  categoryRowIndices.forEach(rowIndex => {
    // Ensure rows array exists
    if (!ws['!rows']) ws['!rows'] = [];
    
    // Increase row height
    if (!ws['!rows'][rowIndex]) ws['!rows'][rowIndex] = {};
    // TypeScript requires type assertion here
    (ws['!rows'][rowIndex] as any).hpt = 22; // Taller row height
    
    // Style each cell in the category row
    for (let C = 0; C <= range.e.c; C++) {
      const cellRef = XLSX.utils.encode_cell({r: rowIndex, c: C});
      if (!ws[cellRef]) continue;
      
      // Add style properties to category cells
      if (!ws[cellRef].s) ws[cellRef].s = {};
      ws[cellRef].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "F1F3F5" } }, // Light gray background
        alignment: { vertical: "center" }
      };
    }
  });
  
  // Merge cells for category rows to span across all columns
  categoryRowIndices.forEach(rowIndex => {
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({
      s: { r: rowIndex, c: 0 },
      e: { r: rowIndex, c: range.e.c }
    });
  });
  
  // Add the worksheet to the workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Data Variables');
  
  // Write the workbook and download
  XLSX.writeFile(wb, filename);
}

export function exportTextToExcel(
  text: string,
  title: string = 'Text',
  filename: string = 'export.xlsx'
) {
  // Create a new workbook
  const wb = XLSX.utils.book_new();
  
  // Split text into paragraphs
  const paragraphs = text.split('\n').filter(p => p.trim().length > 0);
  
  // Create rows with title and paragraphs
  const rows: any[][] = [[title], ['']];
  paragraphs.forEach(paragraph => {
    rows.push([paragraph]);
    rows.push(['']); // Add an empty row after each paragraph
  });
  
  // Convert data to a worksheet
  const ws = XLSX.utils.aoa_to_sheet(rows);
  
  // Set column width
  ws['!cols'] = [{ wch: 120 }]; // Make column very wide for text
  
  // Get range of the worksheet
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  
  // Ensure rows array exists
  if (!ws['!rows']) ws['!rows'] = [];
  
  // Style title row
  const titleCellRef = XLSX.utils.encode_cell({r: 0, c: 0});
  if (ws[titleCellRef]) {
    if (!ws[titleCellRef].s) ws[titleCellRef].s = {};
    ws[titleCellRef].s = {
      font: { bold: true, sz: 14 },
      fill: { fgColor: { rgb: "E7F5FF" } }, // Light blue background
      alignment: { horizontal: "center", vertical: "center" }
    };
    
    // Make title row taller
    if (!ws['!rows'][0]) ws['!rows'][0] = {};
    // TypeScript requires type assertion here
    (ws['!rows'][0] as any).hpt = 30; // Taller row height for title
  }
  
  // Apply wrap text to all content cells
  for (let R = 2; R <= range.e.r; R++) {
    if (R % 2 === 0) { // Only text rows (not empty spacer rows)
      const cellRef = XLSX.utils.encode_cell({r: R, c: 0});
      if (!ws[cellRef]) continue;
      
      // Add style properties to content cells
      if (!ws[cellRef].s) ws[cellRef].s = {};
      ws[cellRef].s = {
        alignment: { wrapText: true, vertical: "top" }
      };
      
      // Make text rows taller
      if (!ws['!rows'][R]) ws['!rows'][R] = {};
      // TypeScript requires type assertion here
      (ws['!rows'][R] as any).hpt = 60; // Taller row height for text content
    }
  }
  
  // Add the worksheet to the workbook with the title as the sheet name
  XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31)); // Excel limits sheet names to 31 chars
  
  // Write the workbook and download
  XLSX.writeFile(wb, filename);
}