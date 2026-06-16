import { 
  Document, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  AlignmentType,
  SectionType,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  LevelFormat,
  convertInchesToTwip
} from "docx";
import { Packer } from "docx";
import { Protocol, BoilerplateSection } from "@shared/schema";
import showdown from "showdown";

/**
 * Helper to get protocol field by name, handling various field patterns
 */
function getProtocolFieldByName(protocol: any, fieldName: string): any {
  // Direct field match
  if (protocol[fieldName] !== undefined) {
    return protocol[fieldName];
  }
  
  // Common field patterns
  const camelCaseField = fieldName.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
  if (protocol[camelCaseField] !== undefined) {
    return protocol[camelCaseField];
  }
  
  // Plural to singular conversions (for array fields)
  if (fieldName.endsWith('s') && protocol[fieldName.slice(0, -1)] !== undefined) {
    return protocol[fieldName.slice(0, -1)];
  }
  
  // Special mappings
  const specialFieldMappings: Record<string, string[]> = {
    'criteria': ['inclusion_criteria', 'exclusion_criteria', 'inclusionCriteria', 'exclusionCriteria'],
    'schedule': ['tableData', 'tableHeaders', 'schedule_of_activities'],
    'objectives': ['studyObjectives', 'objectives', 'objective'],
    'design': ['studyDesign', 'design'],
    'population': ['studyPopulation', 'population'],
    'statistics': ['statisticalConsiderations', 'statistics', 'statisticalAnalysis', 'analysisPlan']
  };
  
  // Check special mappings
  if (specialFieldMappings[fieldName]) {
    for (const mappedField of specialFieldMappings[fieldName]) {
      if (protocol[mappedField] !== undefined) {
        return protocol[mappedField];
      }
    }
  }
  
  // Check if field exists in components
  if (protocol.components) {
    let components = protocol.components;
    if (typeof components === 'string') {
      try {
        components = JSON.parse(components);
      } catch (e) {
        // Not valid JSON
        return undefined;
      }
    }
    
    if (components[fieldName] !== undefined) {
      return components[fieldName];
    }
  }
  
  // Check if field exists in generatedProtocol
  if (protocol.generatedProtocol) {
    let generatedSections = protocol.generatedProtocol;
    if (typeof generatedSections === 'string') {
      try {
        generatedSections = JSON.parse(generatedSections);
      } catch (e) {
        // Not valid JSON
        return undefined;
      }
    }
    
    if (Array.isArray(generatedSections)) {
      const matchingSection = generatedSections.find(s => s.id === fieldName);
      if (matchingSection && matchingSection.content) {
        return matchingSection.content;
      }
    }
  }
  
  return undefined;
}

/**
 * Function to strip HTML tags from content
 */
function stripHtmlTags(content: string): string {
  if (!content) return '';
  
  // Remove all HTML tags
  const withoutTags = content.replace(/<[^>]*>/g, '');
  
  // Fix common HTML entities
  return withoutTags
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '--');
}

function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/^#{1,6}\s+/, '')
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .trim();
}

function sanitizeMarkdownForDocx(content: string): string {
  return String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/^\s*```(?:markdown|md)?\s*$/gim, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizedTitle(text: string): string {
  return stripMarkdownFormatting(text)
    .replace(/^\d+(\.\d+)*\s+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function createTextRunsFromMarkdown(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  text = String(text || "").replace(/`([^`]+)`/g, "$1");
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      runs.push(new TextRun({ text: text.slice(cursor, match.index) }));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true }));
    } else {
      runs.push(new TextRun({ text: token.slice(1, -1), italics: true }));
    }

    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    runs.push(new TextRun({ text: text.slice(cursor) }));
  }

  return runs.length > 0 ? runs : [new TextRun({ text })];
}

function isPlainHeadingLine(line: string): boolean {
  const trimmed = stripMarkdownFormatting(line);
  if (!trimmed || trimmed.length > 90) return false;
  if (/[.;]$/.test(trimmed)) return false;
  return /^(primary|secondary|exploratory|other|key|inclusion|exclusion|objectives|background|rationale|trial|study|safety|efficacy|statistical|estimand|endpoint|population|intervention|concomitant|discontinuation|assessment|procedure|data|administrative)/i.test(trimmed);
}

function prepareContentForM11Docx(content: string, sectionDisplayTitle: string): string {
  const sectionPrefix = sectionDisplayTitle.match(/^(\d+(?:\.\d+)*)/)?.[1] || "";
  const sectionTitleNormalized = normalizedTitle(sectionDisplayTitle);
  let h2Counter = 0;
  let h3Counter = 0;

  const lines = sanitizeMarkdownForDocx(content)
    .split("\n")
    .filter((line) => !/the schema is based on the study design as described/i.test(line));

  const prepared: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    let line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      prepared.push(line);
      continue;
    }

    if (index === 0 && normalizedTitle(trimmed) === sectionTitleNormalized) {
      continue;
    }

    if (/^#\s+/.test(trimmed)) {
      line = trimmed.replace(/^#\s+/, "## ");
    } else if (!/^#{2,6}\s+/.test(trimmed) && isPlainHeadingLine(trimmed)) {
      const level = /^(primary|secondary|exploratory|other|key)\b/i.test(trimmed) ? "###" : "##";
      line = `${level} ${trimmed}`;
    }

    line = line.replace(/^(#{2,3})\s+(.+)$/, (_match, hashes, heading) => {
      const cleanHeading = stripMarkdownFormatting(heading).replace(/^\d+(\.\d+)*\s+/, "");
      if (!sectionPrefix) return `${hashes} ${cleanHeading}`;

      if (hashes === "##") {
        h2Counter += 1;
        h3Counter = 0;
        return `## ${sectionPrefix}.${h2Counter} ${cleanHeading}`;
      }

      if (hashes === "###") {
        if (h2Counter === 0) h2Counter = 1;
        h3Counter += 1;
        return `### ${sectionPrefix}.${h2Counter}.${h3Counter} ${cleanHeading}`;
      }

      return `${hashes} ${cleanHeading}`;
    });

    prepared.push(line);
  }

  return prepared.join("\n").trim();
}

// Define proper type for bullet list items with level
interface BulletItem {
  text: string;
  level: number;
}

/**
 * Helper to create a bullet list with proper indentation levels
 */
function createBulletList(items: Array<BulletItem | string>): Paragraph[] {
  return items.map(item => {
    if (typeof item === 'string') {
      // Handle string items (legacy support)
      return new Paragraph({
        children: createTextRunsFromMarkdown(item),
        bullet: { level: 0 },
        spacing: { before: 80, after: 80 }
      });
    } else {
      // Handle BulletItem objects with level information
      return new Paragraph({
        children: createTextRunsFromMarkdown(item.text),
        bullet: { level: item.level || 0 },
        spacing: { before: 80, after: 80 }
      });
    }
  });
}

/**
 * Helper to create a numbered list
 */
function createNumberedList(items: string[]): Paragraph[] {
  return items.map((item, index) => new Paragraph({
    children: createTextRunsFromMarkdown(item),
    numbering: {
      reference: "default-numbering",
      level: 0
    },
    spacing: { before: 80, after: 80 }
  }));
}

/**
 * Enhanced function to convert markdown content to docx paragraphs with consistent formatting
 */
function convertMarkdownToParagraphs(content: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = sanitizeMarkdownForDocx(content).split("\n");
  
  // Define standardized spacing for consistent formatting
  const SPACING = {
    HEADING_1: { before: 280, after: 120 },
    HEADING_2: { before: 220, after: 100 },
    HEADING_3: { before: 180, after: 80 },
    HEADING_4: { before: 140, after: 80 },
    PARAGRAPH: { before: 0, after: 120 },
    LIST_ITEM: { before: 0, after: 90 },
    EMPTY: { before: 0, after: 60 }
  };
  
  let currentList: BulletItem[] = [];
  let inBulletList = false;
  let inNumberedList = false;
  let listLevel = 0;
  let sectionStarted = false;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (/^```/.test(trimmedLine)) {
      continue;
    }

    // Skip empty lines but maintain modest paragraph spacing
    if (!trimmedLine) {
      if (inBulletList) {
        // Add the bullet list that was being built with proper indentation
        currentList.forEach(item => {
          // Use the item's level if available, fallback to 0
          const bulletLevel = typeof item === 'string' ? 0 : item.level || 0;
          const bulletText = typeof item === 'string' ? item : item.text;
          
          paragraphs.push(new Paragraph({
            children: createTextRunsFromMarkdown(bulletText),
            bullet: {
              level: bulletLevel
            },
            spacing: SPACING.LIST_ITEM
          }));
        });
        currentList = [];
        inBulletList = false;
      }
      continue;
    }
    
    // Check for headers with consistent formatting
    if (trimmedLine.startsWith("# ")) {
      // Add extra spacing before major sections
      if (sectionStarted) {
        paragraphs.push(new Paragraph({
          text: "",
          spacing: SPACING.EMPTY
        }));
      }
      sectionStarted = true;
      
      paragraphs.push(new Paragraph({
        children: createTextRunsFromMarkdown(trimmedLine.substring(2)),
        heading: HeadingLevel.HEADING_1,
        spacing: SPACING.HEADING_1
      }));
      continue;
    } else if (trimmedLine.startsWith("## ")) {
      // Add extra spacing before sections
      if (sectionStarted) {
        paragraphs.push(new Paragraph({
          text: "",
          spacing: SPACING.EMPTY
        }));
      }
      sectionStarted = true;
      
      paragraphs.push(new Paragraph({
        children: createTextRunsFromMarkdown(trimmedLine.substring(3)),
        heading: HeadingLevel.HEADING_2,
        spacing: SPACING.HEADING_2
      }));
      continue;
    } else if (trimmedLine.startsWith("### ")) {
      paragraphs.push(new Paragraph({
        children: createTextRunsFromMarkdown(trimmedLine.substring(4)),
        heading: HeadingLevel.HEADING_3,
        spacing: SPACING.HEADING_3,
        pageBreakBefore: false // Ensure subsections don't create page breaks
      }));
      continue;
    }
    
    // Check for bullet points with improved indentation detection
    // Match any kind of bullet indication and capture the indentation
    const bulletMatch = line.match(/^(\s*)([*\-•]|\d+[.)])\s+(.*)/);
    if (bulletMatch) {
      const indentation = bulletMatch[1].length;
      const bulletType = bulletMatch[2];
      const bulletText = bulletMatch[3].trim();
      
      // Calculate indentation level - every 2 spaces = 1 level
      const level = Math.floor(indentation / 2);
      
      // Check if this is a numbered bullet or regular bullet
      if (/^\d+[.)]$/.test(bulletType)) {
        // Handle numbered list
        if (inBulletList) {
          // Process any bullet list before starting a numbered list
          currentList.forEach(item => {
            const bulletItem = typeof item === 'string' ? { text: item, level: 0 } : item;
            paragraphs.push(new Paragraph({
              children: createTextRunsFromMarkdown(bulletItem.text),
              bullet: { level: bulletItem.level || 0 },
              spacing: SPACING.LIST_ITEM
            }));
          });
          currentList = [];
          inBulletList = false;
        }
        
        // Add the numbered item directly
        paragraphs.push(new Paragraph({
          children: createTextRunsFromMarkdown(bulletText),
          numbering: {
            reference: "default-numbering",
            level: level
          },
          spacing: SPACING.LIST_ITEM
        }));
      } else {
        // Regular bullet point
        inBulletList = true;
        
        // Store bullet text and level together in a standard way
        currentList.push({ 
          text: bulletText,
          level: level 
        });
      }
      
      continue;
    }
    
    // Removed the duplicate numbered list handling block since we now handle it in the bulletMatch section
    
    // If we're in a bullet list but this line isn't a bullet, process the list
    if (inBulletList) {
      // Process bullet list items with proper indentation
      currentList.forEach(item => {
        const bulletItem = typeof item === 'string' ? { text: item, level: 0 } : item;
        paragraphs.push(new Paragraph({
          children: createTextRunsFromMarkdown(bulletItem.text),
          bullet: {
            level: bulletItem.level || 0
          },
          spacing: SPACING.LIST_ITEM
        }));
      });
      currentList = [];
      inBulletList = false;
    }
    
    // Regular paragraph with consistent spacing
    paragraphs.push(new Paragraph({
      children: createTextRunsFromMarkdown(trimmedLine),
      spacing: SPACING.PARAGRAPH
    }));
  }
  
  // Process any remaining bullet list at the end of the document
  if (inBulletList && currentList.length > 0) {
    currentList.forEach(item => {
      const bulletItem = typeof item === 'string' ? { text: item, level: 0 } : item;
      paragraphs.push(new Paragraph({
        children: createTextRunsFromMarkdown(bulletItem.text),
        bullet: {
          level: bulletItem.level || 0
        },
        spacing: SPACING.LIST_ITEM
      }));
    });
  }
  
  return paragraphs;
}

/**
 * Generate a DOCX document from protocol data
 */
export async function generateDocxDocument(
  protocol: Protocol,
  sections: { id: string, title: string }[],
  boilerplateContent: Record<string, string> = {},
  processedComponents: Record<string, string> = {}
): Promise<Buffer> {
  // Debug protocol and components structure
  console.log("Protocol Document Generation Debug:");
  console.log("Protocol keys:", Object.keys(protocol));
  console.log("Has components:", !!protocol.components);
  console.log("Protocol type:", protocol.protocolType);
  console.log("Protocol ID:", protocol.id);
  
  // Extract generated protocol content if available
  if (protocol.generatedProtocol) {
    console.log("Protocol has generatedProtocol field");
    
    try {
      // If it's a string, try to parse it
      let generatedContent = protocol.generatedProtocol;
      if (typeof generatedContent === 'string') {
        generatedContent = JSON.parse(generatedContent);
      }
      
      if (Array.isArray(generatedContent)) {
        console.log(`Found ${generatedContent.length} generated sections`);
        
        // Transfer generated sections to processedComponents for use in document
        generatedContent.forEach((section: any) => {
          if (section.id && section.content) {
            console.log(`Adding generated section: ${section.id}`);
            processedComponents[section.id] = section.content;
          }
        });
      }
    } catch (e) {
      console.error("Error processing generatedProtocol:", e);
    }
  }
  
  // Debug components structure
  if (protocol.components) {
    if (typeof protocol.components === 'string') {
      try {
        console.log("Components is a string, attempting to parse");
        const parsed = JSON.parse(protocol.components);
        console.log("Parsed component keys:", Object.keys(parsed));
        
        // Add parsed components to processedComponents for use in document
        Object.entries(parsed).forEach(([key, value]) => {
          if (typeof value === 'string') {
            console.log(`Adding component from parsed components: ${key}`);
            processedComponents[key] = value;
          } else if (value !== null && typeof value === 'object') {
            console.log(`Adding stringified object component: ${key}`);
            processedComponents[key] = JSON.stringify(value, null, 2);
          }
        });
      } catch (e) {
        console.log("Failed to parse components string:", e.message);
      }
    } else if (typeof protocol.components === 'object') {
      console.log("Components is an object with keys:", Object.keys(protocol.components));
      
      // Add components directly to processedComponents for use in document
      Object.entries(protocol.components).forEach(([key, value]) => {
        if (typeof value === 'string') {
          console.log(`Adding component from object: ${key}`);
          processedComponents[key] = value;
        } else if (value !== null && typeof value === 'object') {
          console.log(`Adding stringified object component: ${key}`);
          processedComponents[key] = JSON.stringify(value, null, 2);
        }
      });
    } else {
      console.log("Components is a", typeof protocol.components);
    }
  }
  
  // Make sure required section IDs are in processedComponents
  // Add fallbacks for common sections
  if (!processedComponents['synopsis'] && protocol.synopsis) {
    console.log("Adding synopsis from protocol field");
    processedComponents['synopsis'] = protocol.synopsis;
  }
  
  if (!processedComponents['title']) {
    console.log("Adding title section");
    processedComponents['title'] = `## ${protocol.title}\n\nProtocol ID: ${protocol.id}${protocol.indication ? `\nIndication: ${protocol.indication}` : ''}${protocol.phase ? `\nPhase: ${protocol.phase}` : ''}`;
  }
  
  // Handle inclusion/exclusion criteria specially
  if (!processedComponents['criteria'] && (protocol.inclusionCriteria || protocol.exclusionCriteria)) {
    console.log("Adding criteria from protocol fields");
    
    let criteriaContent = "## Inclusion/Exclusion Criteria\n\n";
    
    if (protocol.inclusionCriteria) {
      criteriaContent += "### Inclusion Criteria\n\n";
      let inclusionList: any[] = [];
      
      if (typeof protocol.inclusionCriteria === 'string') {
        try {
          inclusionList = JSON.parse(protocol.inclusionCriteria);
        } catch (e) {
          inclusionList = protocol.inclusionCriteria.split('\n').filter(Boolean);
        }
      } else if (Array.isArray(protocol.inclusionCriteria)) {
        inclusionList = protocol.inclusionCriteria;
      }
      
      if (inclusionList.length > 0) {
        criteriaContent += inclusionList.map((c: any) => {
          if (typeof c === 'object' && c.text) return `- ${c.text}`;
          return `- ${c}`;
        }).join('\n');
      }
    }
    
    if (protocol.exclusionCriteria) {
      criteriaContent += "\n\n### Exclusion Criteria\n\n";
      let exclusionList: any[] = [];
      
      if (typeof protocol.exclusionCriteria === 'string') {
        try {
          exclusionList = JSON.parse(protocol.exclusionCriteria);
        } catch (e) {
          exclusionList = protocol.exclusionCriteria.split('\n').filter(Boolean);
        }
      } else if (Array.isArray(protocol.exclusionCriteria)) {
        exclusionList = protocol.exclusionCriteria;
      }
      
      if (exclusionList.length > 0) {
        criteriaContent += exclusionList.map((c: any) => {
          if (typeof c === 'object' && c.text) return `- ${c.text}`;
          return `- ${c}`;
        }).join('\n');
      }
    }
    
    processedComponents['criteria'] = criteriaContent;
  }
  
  // Debug section selection after preprocessing
  console.log("Sections to process:", sections.map(s => s.id).join(', '));
  console.log("Boilerplate sections:", Object.keys(boilerplateContent).join(', '));
  console.log("Processed components after enrichment:", Object.keys(processedComponents).join(', '));

  // Before writing the table of contents, align the protocol order to the M11
  // interventional protocol structure where applicable.
  const sectionOrdering = [
    "title",
    "synopsis",
    "trial_schema",
    "schedule",
    "schedule_of_activities",
    "introduction",
    "objectives",
    "design",
    "population",
    "criteria",
    "treatments",
    "discontinuation",
    "assessments",
    "safety",
    "safetyDrugHandling",
    "data_management",
    "statistics",
    "monitoring",
    "ethical",
    "administrative",
    "exposure_assessment",
    "outcome_assessment",
    "data_collection",
    "follow_up",
    "bias_management",
    "conclusion"
  ];

  sections.sort((a, b) => {
    const indexA = sectionOrdering.indexOf(a.id);
    const indexB = sectionOrdering.indexOf(b.id);

    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return 0;
  });

  console.log("Sections after ordering:", sections.map(s => s.id).join(', '));

  const getDisplaySectionTitle = (section: { id: string, title: string }, fallbackNumber: number) => {
    const m11Titles: Record<string, string> = {
      title: "Title Page and Protocol Identifiers",
      synopsis: "1 Protocol Summary",
      trial_schema: "1.2 Trial Schema",
      schedule: "1.3 Schedule of Activities",
      schedule_of_activities: "1.3 Schedule of Activities",
      introduction: "2 Introduction",
      objectives: "3 Trial Objectives and Associated Estimands",
      design: "4 Trial Design",
      population: "5 Trial Population",
      treatments: "6 Trial Intervention and Concomitant Therapy",
      discontinuation: "7 Trial Intervention and Participant Discontinuation",
      assessments: "8 Trial Assessments and Procedures",
      safety: "9 Safety Reporting and Product Complaints",
      statistics: "10 Statistical Considerations",
      ethical: "11 Trial Oversight and Other General Considerations",
      administrative: "12 Administrative and Reference Appendices"
    };

    if (m11Titles[section.id]) return m11Titles[section.id];
    if (/^\d+(\.\d+)*\s+/.test(section.title)) return section.title;
    return `${fallbackNumber}. ${section.title}`;
  };

  // Document-level children array
  const children: Paragraph[] = [];
  
  // Title page with consistent spacing
  children.push(
    new Paragraph({
      text: protocol.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 480, after: 240 }
    })
  );
  
  children.push(
    new Paragraph({
      text: `Protocol ID: ${protocol.id}`,
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 120 }
    })
  );
  
  if (protocol.indication) {
    children.push(
      new Paragraph({
        text: `Indication: ${protocol.indication}`,
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 120 }
      })
    );
  }
  
  if (protocol.phase) {
    children.push(
      new Paragraph({
        text: `Phase: ${protocol.phase}`,
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 120 }
      })
    );
  }

  children.push(
    new Paragraph({
      text: "Template: ICH M11 CeSHarP final structure (19 Nov 2025)",
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 120 }
    })
  );

  children.push(
    new Paragraph({
      text: "Sponsor: [Sponsor name]",
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 120 }
    })
  );
  
  // Start the table of contents on a clean page after the title page.
  children.push(
    new Paragraph({
      text: "",
      pageBreakBefore: true,
      spacing: { before: 0, after: 0 }
    })
  );
  
  // Table of Contents with consistent formatting
  children.push(
    new Paragraph({
      text: "Table of Contents",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 160 }
    })
  );
  
  // After sorting the sections, update the table of contents to match
  // Add table of contents entries with consistent spacing
  for (let i = 0; i < sections.length; i++) {
    const sectionTitle = getDisplaySectionTitle(sections[i], i + 1);
    
    children.push(
      new Paragraph({
        text: sectionTitle,
        spacing: { before: 0, after: 80 },
        indent: { left: sectionTitle.match(/^\d+\.\d+/) ? 360 : 0 }
      })
    );
  }
  
  // Add page break before content with proper spacing
  children.push(
    new Paragraph({ 
      text: "", 
      pageBreakBefore: true,
      spacing: { before: 240, after: 240 }
    })
  );
  
  // Now process each section in the correct order
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const sectionId = section.id;
    if (sectionId === 'title') {
      continue;
    }
    const sectionNumber = i + 1;
    const sectionDisplayTitle = getDisplaySectionTitle(section, sectionNumber);
    
    // Special handling for Schedule of Activities section
    if (sectionId === 'schedule' || sectionId === 'schedule_of_assessments') {
      console.log(`Special handling for Schedule section ${sectionId}`);
      
      // Add section heading with consistent spacing
      children.push(
        new Paragraph({
          text: getDisplaySectionTitle(section, sectionNumber),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 360, after: 240 }
        })
      );
      
      // Add description text
      children.push(
        new Paragraph({
          text: "The following table outlines the schedule of activities for the study:",
          spacing: { before: 120, after: 120 }
        })
      );
      
      // Get actual content if available but strip HTML
      let scheduleContent = "";
      if (processedComponents && processedComponents[sectionId]) {
        scheduleContent = stripHtmlTags(processedComponents[sectionId]);
        
        // Only include if it's meaningful content
        if (scheduleContent && scheduleContent.length > 20) {
          const scheduleContentParagraphs = convertMarkdownToParagraphs(scheduleContent);
          children.push(...scheduleContentParagraphs);
        }
      }
      
      // Always add a note about the table being separate (with italics formatting)
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 240 },
          children: [
            new TextRun({
              text: "Note: A detailed schedule of activities table is also provided as a separate attachment for improved readability.",
              italics: true
            })
          ]
        })
      );
      
      // Add extra spacing after this section
      children.push(new Paragraph({
        text: "",
        spacing: { before: 120, after: 240 }
      }));
      
      // Skip the normal content processing for this section
      continue;
    }
    
    // For all other sections, process normally
    // Add section heading with consistent spacing
    children.push(
      new Paragraph({
        text: sectionDisplayTitle,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 360, after: 240 }
      })
    );
    
    // Get content for the section
    let sectionContent = "";

    // Debug content sources
    console.log(`Getting content for section ${sectionId}:`, {
      hasBoilerplate: !!boilerplateContent[sectionId],
      hasProcessedComponent: !!processedComponents[sectionId],
      protocolComponentType: protocol.components ? typeof protocol.components : "none",
      hasDirectField: !!(protocol[sectionId]),
    });
    
    // Try to get content from boilerplate first
    if (boilerplateContent && boilerplateContent[sectionId]) {
      console.log(`Using boilerplate content for ${sectionId}`);
      sectionContent = boilerplateContent[sectionId];
    }
    // Then try processed components 
    else if (processedComponents && processedComponents[sectionId]) {
      console.log(`Using processed component for ${sectionId}`);
      sectionContent = processedComponents[sectionId];
    }
    // Otherwise try to get from protocol components directly
    else if (protocol.components) {
      console.log(`Attempting to extract content for ${sectionId} from protocol components`);
      
      try {
        let componentsObj = protocol.components;
        
        // Parse components if it's a string
        if (typeof componentsObj === 'string') {
          try {
            componentsObj = JSON.parse(componentsObj);
            console.log(`Parsed components object has keys:`, Object.keys(componentsObj));
          } catch (e) {
            console.log(`Failed to parse components:`, e);
          }
        }
        
        // If we have a valid object, try to get the section's content
        if (typeof componentsObj === 'object' && componentsObj !== null) {
          const componentData = componentsObj[sectionId];
          
          if (componentData) {
            console.log(`Found component data for ${sectionId}`);
            if (typeof componentData === 'string') {
              sectionContent = componentData;
            } else {
              // For objects, stringify them
              sectionContent = JSON.stringify(componentData, null, 2);
            }
          }
        }
      } catch (error) {
        console.error(`Error accessing component ${sectionId}:`, error);
      }
    }
    
    // Check for special content by section ID
    if (!sectionContent) {
      console.log(`No component content found for ${sectionId}, checking for special content`);
      
      // Try alternative section IDs that might contain relevant content
      const alternativeSectionIds: Record<string, string[]> = {
        'synopsis': ['overview', 'introduction'],
        'objectives': ['studyObjectives', 'objective', 'study_objectives'],
        'design': ['studyDesign', 'study_design', 'trial_design'],
        'population': ['studyPopulation', 'study_population', 'subjects', 'demographics'],
        'criteria': ['inclusionCriteria', 'exclusionCriteria', 'inclusion_criteria', 'exclusion_criteria'],
        'schedule': ['scheduleOfAssessments', 'schedule_of_assessments', 'assessments', 'visits'],
        'statistical': ['statistics', 'statisticalAnalysis', 'statistical_considerations', 'analysisPlan'],
        'ethical': ['ethicalConsiderations', 'ethical_considerations', 'irb', 'ethics'],
        'procedures': ['study_procedures', 'studyProcedures', 'methodology'],
        'data': ['dataCollection', 'data_collection', 'datacollection'],
        'outcome_assessment': ['outcomeAssessment', 'outcomes', 'assessments', 'endpoints'],
        'exposure_assessment': ['exposureAssessment', 'exposure'],
        'follow_up': ['followUp', 'follow_up_procedures', 'followup'],
        'bias_management': ['biasManagement', 'bias_control', 'bias']
      };
      
      // Check alternative section IDs
      if (alternativeSectionIds[sectionId]) {
        for (const altId of alternativeSectionIds[sectionId]) {
          if (processedComponents[altId]) {
            console.log(`Using alternative section ID ${altId} for ${sectionId}`);
            sectionContent = processedComponents[altId];
            break;
          }
        }
      }
    }
    
    // Special handling for common section types
    if (!sectionContent) {
      switch(sectionId) {
        case 'synopsis':
          if (protocol.synopsis) {
            console.log("Using protocol synopsis field");
            sectionContent = protocol.synopsis;
          }
          break;
          
        case 'criteria':
          // This logic will create a criteria section from inclusion/exclusion criteria
          if (protocol.inclusionCriteria || protocol.exclusionCriteria) {
            console.log("Building criteria section from protocol fields");
            let criteriaContent = "## Inclusion and Exclusion Criteria\n\n";
            
            // Process inclusion criteria with improved formatting
            if (protocol.inclusionCriteria) {
              criteriaContent += "### Inclusion Criteria\n\n";
              let criteria = protocol.inclusionCriteria;
              
              if (typeof criteria === 'string') {
                // Try to parse as JSON first
                try {
                  const parsed = JSON.parse(criteria);
                  if (Array.isArray(parsed)) {
                    criteria = parsed;
                  } else {
                    // Split by newlines if not an array
                    criteria = criteria.split('\n').filter(Boolean);
                  }
                } catch (e) {
                  // If not valid JSON, split by newlines
                  criteria = criteria.split('\n').filter(Boolean);
                }
              }
              
              // Format criteria as bullet points with improved spacing
              if (Array.isArray(criteria)) {
                criteria.forEach((item: any, index: number) => {
                  const criterionText = typeof item === 'object' && item.text 
                    ? item.text.trim() 
                    : String(item).trim();
                  
                  // Add proper bullet point formatting
                  criteriaContent += `- ${criterionText}\n`;
                });
                
                // Add an extra line after the list
                criteriaContent += "\n";
              } else {
                criteriaContent += criteria.toString() + "\n\n";
              }
            }
            
            // Process exclusion criteria with improved formatting
            if (protocol.exclusionCriteria) {
              criteriaContent += "### Exclusion Criteria\n\n";
              let criteria = protocol.exclusionCriteria;
              
              if (typeof criteria === 'string') {
                // Try to parse as JSON first
                try {
                  const parsed = JSON.parse(criteria);
                  if (Array.isArray(parsed)) {
                    criteria = parsed;
                  } else {
                    // Split by newlines if not an array
                    criteria = criteria.split('\n').filter(Boolean);
                  }
                } catch (e) {
                  // If not valid JSON, split by newlines
                  criteria = criteria.split('\n').filter(Boolean);
                }
              }
              
              // Format criteria as bullet points with improved spacing
              if (Array.isArray(criteria)) {
                criteria.forEach((item: any, index: number) => {
                  const criterionText = typeof item === 'object' && item.text 
                    ? item.text.trim() 
                    : String(item).trim();
                  
                  // Add proper bullet point formatting
                  criteriaContent += `- ${criterionText}\n`;
                });
                
                // Add an extra line after the list
                criteriaContent += "\n";
              } else {
                criteriaContent += criteria.toString() + "\n\n";
              }
            }
            
            sectionContent = criteriaContent;
          }
          break;
          
        case 'schedule':
        case 'schedule_of_assessments':
          console.log("Creating clean Schedule of Activities section");
          
          // We have HTML content in this section that we need to handle differently
          if (typeof processedComponents['schedule'] === 'string' && 
              processedComponents['schedule'].includes('<')) {
            // Get the HTML content and strip the tags
            let htmlContent = processedComponents['schedule'];
            sectionContent = "## Schedule of Activities\n\n" + stripHtmlTags(htmlContent);
            
            // Replace common HTML artifacts with clean text
            sectionContent = sectionContent.replace(/\s*<\/tr>\s*/g, '\n')
              .replace(/\s*<\/td>\s*/g, ' ')
              .replace(/\s*<\/th>\s*/g, ' ');
            
            console.log("Cleaned HTML from schedule section");
          } else if (protocol.tableData && protocol.tableHeaders) {
            sectionContent = "## Schedule of Activities\n\n";
            sectionContent += "The following table outlines the schedule of activities for the study. ";
            sectionContent += "A detailed schedule is provided as an attachment.";
          } else {
            sectionContent = "## Schedule of Activities\n\n";
            sectionContent += "A detailed schedule of activities will be provided.";
          }
          break;
      }
    }
    
    // Add special handling for sections that are not addressed yet
    if (!sectionContent && sectionId === 'inclusion_criteria' && protocol.inclusionCriteria) {
      console.log(`Using protocol inclusionCriteria for section ${sectionId}`);
      let criteriaArray = [];
      
      // Handle multiple possible formats for inclusionCriteria
      if (typeof protocol.inclusionCriteria === 'string') {
        try {
          criteriaArray = JSON.parse(protocol.inclusionCriteria);
        } catch (e) {
          criteriaArray = protocol.inclusionCriteria.split('\n').filter(Boolean);
        }
      } else if (Array.isArray(protocol.inclusionCriteria)) {
        criteriaArray = protocol.inclusionCriteria;
      }
      
      if (criteriaArray.length > 0) {
        // Format inclusion criteria as bullet points
        sectionContent = "## Inclusion Criteria:\n\n" + 
          criteriaArray.map(c => {
            // Extract text from criterion objects if needed
            if (typeof c === 'object' && c.text) return `- ${c.text}`;
            return `- ${c}`;
          }).join('\n');
      }
    }
    
    if (!sectionContent && sectionId === 'exclusion_criteria' && protocol.exclusionCriteria) {
      console.log(`Using protocol exclusionCriteria for section ${sectionId}`);
      let criteriaArray = [];
      
      // Handle multiple possible formats for exclusionCriteria
      if (typeof protocol.exclusionCriteria === 'string') {
        try {
          criteriaArray = JSON.parse(protocol.exclusionCriteria);
        } catch (e) {
          criteriaArray = protocol.exclusionCriteria.split('\n').filter(Boolean);
        }
      } else if (Array.isArray(protocol.exclusionCriteria)) {
        criteriaArray = protocol.exclusionCriteria;
      }
      
      if (criteriaArray.length > 0) {
        // Format exclusion criteria as bullet points
        sectionContent = "## Exclusion Criteria:\n\n" + 
          criteriaArray.map(c => {
            // Extract text from criterion objects if needed
            if (typeof c === 'object' && c.text) return `- ${c.text}`;
            return `- ${c}`;
          }).join('\n');
      }
    }
    
    // Add special handling for schedule section
    if (!sectionContent && sectionId === 'schedule' && protocol.tableData && protocol.tableHeaders) {
      console.log(`Using protocol tableData for section ${sectionId}`);
      let tableData = {};
      let tableHeaders = [];
      
      // Parse string formats if needed
      if (typeof protocol.tableData === 'string') {
        try {
          tableData = JSON.parse(protocol.tableData);
        } catch (e) {
          console.error("Error parsing tableData:", e);
        }
      } else if (typeof protocol.tableData === 'object') {
        tableData = protocol.tableData;
      }
      
      if (typeof protocol.tableHeaders === 'string') {
        try {
          tableHeaders = JSON.parse(protocol.tableHeaders);
        } catch (e) {
          console.error("Error parsing tableHeaders:", e);
        }
      } else if (Array.isArray(protocol.tableHeaders)) {
        tableHeaders = protocol.tableHeaders;
      }
      
      if (Object.keys(tableData).length > 0 && tableHeaders.length > 0) {
        sectionContent = "## Schedule of Activities\n\n(See attached schedule table)";
      }
    }
    
    // Special case for section types when using protocol fields
    if (!sectionContent) {
      console.log(`No content found for ${sectionId}, checking protocol fields`);
      
      // Map section IDs to protocol fields
      switch(sectionId) {
        case 'synopsis':
          sectionContent = protocol.synopsis || "";
          break;
        case 'title':
          sectionContent = `## ${protocol.title}\n\nProtocol ID: ${protocol.id}\nIndication: ${protocol.indication || 'Not specified'}\nPhase: ${protocol.phase || 'Not specified'}`;
          break;
        case 'schedule':
          if (protocol.tableData && protocol.tableHeaders) {
            sectionContent = "## Schedule of Activities\n\n(See attached schedule table)";
          }
          break;
        case 'criteria':
          if (protocol.inclusionCriteria || protocol.exclusionCriteria) {
            let criteriaContent = "## Inclusion Criteria\n\n";
            if (Array.isArray(protocol.inclusionCriteria)) {
              criteriaContent += protocol.inclusionCriteria.map(c => `- ${c}`).join('\n');
            }
            criteriaContent += "\n\n## Exclusion Criteria\n\n";
            if (Array.isArray(protocol.exclusionCriteria)) {
              criteriaContent += protocol.exclusionCriteria.map(c => `- ${c}`).join('\n');
            }
            sectionContent = criteriaContent;
          }
          break;
      }
    }
    
    // If no content found, add placeholder with consistent formatting
    if (!sectionContent) {
      sectionContent = `No content currently available for this section.`;
    }
    
    // Ensure the content doesn't have any HTML
    if (sectionContent.includes('<') && sectionContent.includes('>')) {
      console.log(`Stripping HTML from section ${sectionId}`);
      sectionContent = stripHtmlTags(sectionContent);
    }
    
    // Normalize content into M11-style Level 2/Level 3 headings under the section heading.
    sectionContent = prepareContentForM11Docx(sectionContent, sectionDisplayTitle);
    
    // Convert content to paragraphs with consistent formatting
    const contentParagraphs = convertMarkdownToParagraphs(sectionContent);
    children.push(...contentParagraphs);
    
    // Add consistent spacing after each section
    children.push(
      new Paragraph({
        text: "",
        spacing: { before: 120, after: 240 }
      })
    );
  }
  
  // Create document
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Arial",
            size: 22,
            color: "111827"
          },
          paragraph: {
            spacing: { before: 0, after: 120 },
          }
        }
      },
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 32, bold: true, color: "111827", font: "Arial" },
          paragraph: { spacing: { before: 360, after: 180 }, alignment: AlignmentType.CENTER }
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 28, bold: true, color: "1F2937", font: "Arial" },
          paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 0 }
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 24, bold: true, color: "1F2937", font: "Arial" },
          paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 1 }
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 22, bold: true, color: "374151", font: "Arial" },
          paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2 }
        }
      ]
    },
    numbering: {
      config: [
        {
          reference: "default-numbering",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 }
                }
              }
            }
          ]
        }
      ]
    },
    sections: [
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            }
          }
        },
        children: children
      }
    ]
  });
  
  // Generate buffer
  try {
    return await Packer.toBuffer(doc);
  } catch (error) {
    console.error("Error generating document:", error);
    throw error;
  }
}

/**
 * Generate a HTML preview
 */
export function generateHtmlPreview(
  protocol: Protocol,
  sections: { id: string, title: string }[],
  boilerplateContent: Record<string, string> = {},
  processedComponents: Record<string, string> = {}
): string {
  const converter = new showdown.Converter();
  let html = `
    <div class="protocol-document">
      <div class="protocol-title-page">
        <h1 class="protocol-title">${protocol.title}</h1>
        <p class="protocol-id"><strong>Protocol ID:</strong> ${protocol.id}</p>
  `;
  
  if (protocol.indication) {
    html += `<p class="protocol-indication"><strong>Indication:</strong> ${protocol.indication}</p>`;
  }
  
  if (protocol.phase) {
    html += `<p class="protocol-phase"><strong>Phase:</strong> ${protocol.phase}</p>`;
  }
  
  html += `
      </div>
      
      <div class="protocol-toc">
        <h2>Table of Contents</h2>
        <ol class="toc-list">
  `;
  
  for (let i = 0; i < sections.length; i++) {
    html += `<li><a href="#section-${i+1}">${sections[i].title}</a></li>`;
  }
  
  html += `
        </ol>
      </div>
      
      <div class="protocol-content">
  `;
  
  // Process each section
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const sectionId = section.id;
    
    // Get content for the section
    let sectionContent = "";
    
    // Try to get content from boilerplate first
    if (boilerplateContent && boilerplateContent[sectionId]) {
      sectionContent = boilerplateContent[sectionId];
    }
    // Then try processed components
    else if (processedComponents && processedComponents[sectionId]) {
      sectionContent = processedComponents[sectionId];
    }
    
    // Add special handling for sections that are not addressed yet
    if (!sectionContent && sectionId === 'inclusion_criteria' && protocol.inclusionCriteria) {
      let criteriaArray = [];
      
      // Handle multiple possible formats for inclusionCriteria
      if (typeof protocol.inclusionCriteria === 'string') {
        try {
          criteriaArray = JSON.parse(protocol.inclusionCriteria);
        } catch (e) {
          criteriaArray = protocol.inclusionCriteria.split('\n').filter(Boolean);
        }
      } else if (Array.isArray(protocol.inclusionCriteria)) {
        criteriaArray = protocol.inclusionCriteria;
      }
      
      if (criteriaArray.length > 0) {
        // Format inclusion criteria as bullet points
        sectionContent = "## Inclusion Criteria:\n\n" + 
          criteriaArray.map(c => {
            // Extract text from criterion objects if needed
            if (typeof c === 'object' && c.text) return `- ${c.text}`;
            return `- ${c}`;
          }).join('\n');
      }
    }
    
    if (!sectionContent && sectionId === 'exclusion_criteria' && protocol.exclusionCriteria) {
      let criteriaArray = [];
      
      // Handle multiple possible formats for exclusionCriteria
      if (typeof protocol.exclusionCriteria === 'string') {
        try {
          criteriaArray = JSON.parse(protocol.exclusionCriteria);
        } catch (e) {
          criteriaArray = protocol.exclusionCriteria.split('\n').filter(Boolean);
        }
      } else if (Array.isArray(protocol.exclusionCriteria)) {
        criteriaArray = protocol.exclusionCriteria;
      }
      
      if (criteriaArray.length > 0) {
        // Format exclusion criteria as bullet points
        sectionContent = "## Exclusion Criteria:\n\n" + 
          criteriaArray.map(c => {
            // Extract text from criterion objects if needed
            if (typeof c === 'object' && c.text) return `- ${c.text}`;
            return `- ${c}`;
          }).join('\n');
      }
    }
    
    // Add special handling for schedule section
    if (!sectionContent && sectionId === 'schedule' && protocol.tableData && protocol.tableHeaders) {
      let tableData = {};
      let tableHeaders = [];
      
      // Parse string formats if needed
      if (typeof protocol.tableData === 'string') {
        try {
          tableData = JSON.parse(protocol.tableData);
        } catch (e) {
          console.error("Error parsing tableData:", e);
        }
      } else if (typeof protocol.tableData === 'object') {
        tableData = protocol.tableData;
      }
      
      if (typeof protocol.tableHeaders === 'string') {
        try {
          tableHeaders = JSON.parse(protocol.tableHeaders);
        } catch (e) {
          console.error("Error parsing tableHeaders:", e);
        }
      } else if (Array.isArray(protocol.tableHeaders)) {
        tableHeaders = protocol.tableHeaders;
      }
      
      if (Object.keys(tableData).length > 0 && tableHeaders.length > 0) {
        sectionContent = "## Schedule of Activities\n\n(See attached schedule table)";
      }
    }
    
    // Special case for section types when using protocol fields
    if (!sectionContent) {
      // Map section IDs to protocol fields
      switch(sectionId) {
        case 'synopsis':
          sectionContent = protocol.synopsis || "";
          break;
        case 'title':
          sectionContent = `## ${protocol.title}\n\nProtocol ID: ${protocol.id}\nIndication: ${protocol.indication || 'Not specified'}\nPhase: ${protocol.phase || 'Not specified'}`;
          break;
        case 'criteria':
          if (protocol.inclusionCriteria || protocol.exclusionCriteria) {
            let criteriaContent = "## Inclusion Criteria\n\n";
            if (Array.isArray(protocol.inclusionCriteria)) {
              criteriaContent += protocol.inclusionCriteria.map(c => `- ${c}`).join('\n');
            }
            criteriaContent += "\n\n## Exclusion Criteria\n\n";
            if (Array.isArray(protocol.exclusionCriteria)) {
              criteriaContent += protocol.exclusionCriteria.map(c => `- ${c}`).join('\n');
            }
            sectionContent = criteriaContent;
          }
          break;
      }
    }
    
    // If no content found, add placeholder
    if (!sectionContent) {
      sectionContent = `[No content available for ${section.title}]`;
    }
    
    // Convert markdown to HTML
    const contentHtml = converter.makeHtml(sectionContent);
    
    html += `
      <div class="protocol-section" id="section-${i+1}">
        <h2 class="section-title">${i+1}. ${section.title}</h2>
        <div class="section-content">
          ${contentHtml}
        </div>
      </div>
    `;
  }
  
  html += `
      </div>
    </div>
  `;
  
  return html;
}
