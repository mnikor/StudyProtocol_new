import { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, AlignmentType, TableLayoutType, WidthType, ShadingType, UnderlineType, ParagraphStyle, ImageRun, TabStopType, TabStopPosition } from 'docx';
import { Protocol, BoilerplateSection, DesignState } from '@shared/schema';
import { Packer } from 'docx';
import showdown from 'showdown';

/**
 * Interface for a document section with title and content
 */
interface DocumentSection {
  title: string;
  content: string;
  level: number;
}

/**
 * Converts markdown bullet points to structured arrays for docx generation
 */
function extractBulletPoints(text: string): string[] {
  const bulletRegex = /^\s*[-*]\s+(.+)$/gm;
  const matches = [];
  let match;
  
  while ((match = bulletRegex.exec(text)) !== null) {
    matches.push(match[1].trim());
  }
  
  return matches;
}

/**
 * Converts markdown numbered list to structured arrays for docx generation
 */
function extractNumberedItems(text: string): string[] {
  const numberedRegex = /^\s*\d+\.\s+(.+)$/gm;
  const matches = [];
  let match;
  
  while ((match = numberedRegex.exec(text)) !== null) {
    matches.push(match[1].trim());
  }
  
  return matches;
}

/**
 * Converts complex markdown content with headers to structured data for docx
 */
function parseContentToSections(content: string): DocumentSection[] {
  const headerRegex = /^(#{1,6})\s+(.+)$/gm;
  const contentSections: DocumentSection[] = [];
  let currentSection: DocumentSection | null = null;
  const lines = content.split("\n");
  let buffer = "";
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(headerRegex);
    
    if (headerMatch) {
      // If we have a current section, save it before starting a new one
      if (currentSection) {
        currentSection.content = buffer.trim();
        contentSections.push(currentSection);
        buffer = "";
      }
      
      // Start a new section
      currentSection = {
        title: headerMatch[2].trim(),
        content: "",
        level: headerMatch[1].length
      };
    } else {
      // Add content to buffer
      buffer += line + "\n";
    }
  }
  
  // Add the last section if exists
  if (currentSection) {
    currentSection.content = buffer.trim();
    contentSections.push(currentSection);
  } else if (buffer.trim()) {
    // If no sections were created but there is content, create a default section
    contentSections.push({
      title: "",
      content: buffer.trim(),
      level: 0
    });
  }
  
  return contentSections;
}

/**
 * Creates a docx paragraph from markdown text
 */
function createParagraphFromText(text: string, indent: number = 0): Paragraph {
  // Check for bold and italic formatting
  let formattedText = text;
  const boldItalicRegex = /\*\*\*([^*]+)\*\*\*/g;
  const boldRegex = /\*\*([^*]+)\*\*/g;
  const italicRegex = /\*([^*]+)\*/g;
  
  const textRuns: TextRun[] = [];
  
  // Split text into segments based on formatting
  let lastIndex = 0;
  let textToProcess = text;
  
  // Process bold+italic text
  const boldItalicMatches = Array.from(text.matchAll(boldItalicRegex));
  for (const match of boldItalicMatches) {
    // Add text before the match
    if (match.index && match.index > lastIndex) {
      const beforeText = text.substring(lastIndex, match.index);
      textRuns.push(new TextRun({ text: beforeText }));
    }
    
    // Add the bold+italic text
    textRuns.push(new TextRun({ 
      text: match[1], 
      bold: true,
      italics: true 
    }));
    
    lastIndex = (match.index || 0) + match[0].length;
    textToProcess = textToProcess.replace(match[0], " ".repeat(match[0].length));
  }
  
  // Process bold text
  const boldMatches = Array.from(textToProcess.matchAll(boldRegex));
  for (const match of boldMatches) {
    // Add text before the match
    if (match.index && match.index > lastIndex) {
      const beforeText = text.substring(lastIndex, match.index);
      textRuns.push(new TextRun({ text: beforeText }));
    }
    
    // Add the bold text
    textRuns.push(new TextRun({ 
      text: match[1], 
      bold: true 
    }));
    
    lastIndex = (match.index || 0) + match[0].length;
  }
  
  // Process italic text
  const italicMatches = Array.from(text.matchAll(italicRegex));
  for (const match of italicMatches) {
    // Skip if already processed as bold or bold+italic
    if (textToProcess[match.index || 0] === " ") continue;
    
    // Add text before the match
    if (match.index && match.index > lastIndex) {
      const beforeText = text.substring(lastIndex, match.index);
      textRuns.push(new TextRun({ text: beforeText }));
    }
    
    // Add the italic text
    textRuns.push(new TextRun({ 
      text: match[1], 
      italics: true 
    }));
    
    lastIndex = (match.index || 0) + match[0].length;
  }
  
  // Add any remaining text
  if (lastIndex < text.length) {
    textRuns.push(new TextRun({ text: text.substring(lastIndex) }));
  }
  
  // If no formatting was found, just add the text as is
  if (textRuns.length === 0) {
    textRuns.push(new TextRun({ text }));
  }
  
  return new Paragraph({
    children: textRuns,
    indent: indent > 0 ? { left: indent * 360 } : undefined
  });
}

/**
 * Processes markdown content into docx paragraphs
 */
function processContentToParagraphs(content: string, indent: number = 0): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = content.split("\n");
  
  let inList = false;
  let currentList: string[] = [];
  let isBulletList = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line) {
      // Empty line
      if (inList) {
        // End of list
        if (isBulletList) {
          paragraphs.push(new Paragraph({
            text: "",
            bullet: { level: 0 }
          }));
          
          for (const item of currentList) {
            paragraphs.push(new Paragraph({
              children: [new TextRun(item)],
              bullet: { level: 0 },
              indent: { left: (indent + 1) * 360 }
            }));
          }
        } else {
          // Numbered list
          for (let j = 0; j < currentList.length; j++) {
            paragraphs.push(new Paragraph({
              children: [new TextRun(currentList[j])],
              numbering: {
                reference: "numbering-reference",
                level: 0
              },
              indent: { left: (indent + 1) * 360 }
            }));
          }
        }
        
        inList = false;
        currentList = [];
      }
      
      paragraphs.push(new Paragraph(""));
      continue;
    }
    
    // Check if this is a bullet point
    if (line.match(/^\s*[-*]\s+/)) {
      if (!inList || !isBulletList) {
        // Start of a new bullet list
        if (inList) {
          // End the previous list
          for (let j = 0; j < currentList.length; j++) {
            paragraphs.push(new Paragraph({
              children: [new TextRun(currentList[j])],
              numbering: {
                reference: "numbering-reference",
                level: 0
              },
              indent: { left: (indent + 1) * 360 }
            }));
          }
        }
        
        inList = true;
        isBulletList = true;
        currentList = [];
      }
      
      currentList.push(line.replace(/^\s*[-*]\s+/, ""));
      continue;
    }
    
    // Check if this is a numbered item
    if (line.match(/^\s*\d+\.\s+/)) {
      if (!inList || isBulletList) {
        // Start of a new numbered list
        if (inList) {
          // End the previous list
          paragraphs.push(new Paragraph({
            text: "",
            bullet: { level: 0 }
          }));
          
          for (const item of currentList) {
            paragraphs.push(new Paragraph({
              children: [new TextRun(item)],
              bullet: { level: 0 },
              indent: { left: (indent + 1) * 360 }
            }));
          }
        }
        
        inList = true;
        isBulletList = false;
        currentList = [];
      }
      
      currentList.push(line.replace(/^\s*\d+\.\s+/, ""));
      continue;
    }
    
    if (inList) {
      // End of list
      if (isBulletList) {
        paragraphs.push(new Paragraph({
          text: "",
          bullet: { level: 0 }
        }));
        
        for (const item of currentList) {
          paragraphs.push(new Paragraph({
            children: [new TextRun(item)],
            bullet: { level: 0 },
            indent: { left: (indent + 1) * 360 }
          }));
        }
      } else {
        // Numbered list
        for (let j = 0; j < currentList.length; j++) {
          paragraphs.push(new Paragraph({
            children: [new TextRun(currentList[j])],
            numbering: {
              reference: "numbering-reference",
              level: 0
            },
            indent: { left: (indent + 1) * 360 }
          }));
        }
      }
      
      inList = false;
      currentList = [];
    }
    
    // Regular paragraph
    paragraphs.push(createParagraphFromText(line, indent));
  }
  
  // Process any remaining list
  if (inList) {
    if (isBulletList) {
      paragraphs.push(new Paragraph({
        text: "",
        bullet: { level: 0 }
      }));
      
      for (const item of currentList) {
        paragraphs.push(new Paragraph({
          children: [new TextRun(item)],
          bullet: { level: 0 },
          indent: { left: (indent + 1) * 360 }
        }));
      }
    } else {
      // Numbered list
      for (let j = 0; j < currentList.length; j++) {
        paragraphs.push(new Paragraph({
          children: [new TextRun(currentList[j])],
          numbering: {
            reference: "numbering-reference",
            level: 0
          },
          indent: { left: (indent + 1) * 360 }
        }));
      }
    }
  }
  
  return paragraphs;
}

/**
 * Creates a section heading paragraph
 */
function createHeading(text: string, level: number): Paragraph {
  // Handle heading levels properly
  const headingLevel = level >= 1 && level <= 6 
    ? `HEADING_${level}` as keyof typeof HeadingLevel 
    : "HEADING_1";
    
  return new Paragraph({
    text: text,
    heading: HeadingLevel[headingLevel],
    spacing: { after: 200 }
  });
}

/**
 * Main function to generate a DOCX document from protocol data
 */
export async function generateDocxDocument(
  protocol: Protocol,
  sections: { id: string, title: string }[],
  boilerplateContent?: Record<string, string>,
  designState?: DesignState
): Promise<Buffer> {
  console.log(`Starting document generation with ${sections.length} sections`);
  
  // Create document with basic settings
  const doc = new Document({
    creator: "Clinical Design Lab",
    title: `${protocol.id} - Protocol Document`,
    description: "Research Protocol Document",
    sections: [], // Initialize with empty sections, we'll add content later
    styles: {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          run: {
            size: 24,  // 12pt font
            font: "Calibri",
          },
          paragraph: {
            spacing: { after: 120, line: 276 },  // 6pt after, 1.15 line spacing
          },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          run: {
            size: 32,  // 16pt font
            bold: true,
            font: "Calibri",
          },
          paragraph: {
            spacing: { before: 240, after: 120 }  // 12pt before, 6pt after
          },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          run: {
            size: 28,  // 14pt font
            bold: true,
            font: "Calibri",
          },
          paragraph: {
            spacing: { before: 240, after: 120 }  // 12pt before, 6pt after
          },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          run: {
            size: 26,  // 13pt font
            bold: true,
            font: "Calibri",
          },
          paragraph: {
            spacing: { before: 240, after: 120 }  // 12pt before, 6pt after
          },
        },
      ],
    },
  });

  const contentSections = [];
  
  // Title page
  contentSections.push(
    new Paragraph({
      children: [
        new TextRun({ text: protocol.title, bold: true, size: 36 })
      ],
      spacing: { after: 400 },
      alignment: AlignmentType.CENTER
    })
  );
  
  contentSections.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Protocol ID: ${protocol.id}`, bold: true, size: 28 })
      ],
      spacing: { after: 200 },
      alignment: AlignmentType.CENTER
    })
  );
  
  if (protocol.indication) {
    contentSections.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Indication: ${protocol.indication}`, size: 28 })
        ],
        spacing: { after: 200 },
        alignment: AlignmentType.CENTER
      })
    );
  }
  
  if (protocol.phase) {
    contentSections.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Phase: ${protocol.phase}`, size: 28 })
        ],
        spacing: { after: 400 },
        alignment: AlignmentType.CENTER
      })
    );
  }
  
  // Date
  contentSections.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Date: ${new Date().toLocaleDateString()}`, size: 24 })
      ],
      spacing: { after: 200 },
      alignment: AlignmentType.CENTER
    })
  );
  
  contentSections.push(
    new Paragraph({
      text: "",
      pageBreakBefore: true,
    })
  );
  
  // Table of Contents header
  contentSections.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Table of Contents", bold: true, size: 32 })
      ],
      spacing: { after: 400 },
      alignment: AlignmentType.CENTER
    })
  );
  
  // Add TOC place holder - not a real TOC for now
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    
    contentSections.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${i+1}. ${section.title}` }),
        ],
        spacing: { after: 120 },
        tabStops: [
          {
            type: TabStopType.RIGHT,
            position: TabStopPosition.MAX,
          },
        ],
      })
    );
  }
  
  // Page break before main content
  contentSections.push(
    new Paragraph({
      text: "",
      pageBreakBefore: true,
    })
  );
  
  // Process each section
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    
    // Get component data from protocol
    const componentId = section.id;
    const componentData = protocol.components && protocol.components[componentId as keyof typeof protocol.components];
    
    // Add section heading with numbering
    contentSections.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${i+1}. ${section.title}`, bold: true, size: 32 })
        ],
        spacing: { after: 200 },
        heading: HeadingLevel.HEADING_1,
        keepNext: true
      })
    );
    
    let sectionContent = "";
    
    // Check for boilerplate text first from the boilerplateContent param
    if (boilerplateContent && boilerplateContent[componentId]) {
      console.log(`Using boilerplate content for section ${componentId}`);
      sectionContent = boilerplateContent[componentId];
    } else if (componentData && typeof componentData === 'string') {
      console.log(`Using component data (string) for section ${componentId}`);
      sectionContent = componentData;
    } else if (componentData && typeof componentData === 'object') {
      // Convert object to string representation
      console.log(`Using component data (object) for section ${componentId}`);
      if (componentId === 'schedule') {
        // Special handling for schedule of assessments
        // This would be a table in the real implementation
        sectionContent = `Schedule of Activities for ${protocol.title}`;
      } else {
        sectionContent = JSON.stringify(componentData, null, 2);
      }
    } else {
      console.log(`No content found for section ${componentId}`);
      sectionContent = `[No content for ${section.title}]`;
    }
    
    // Parse and add content
    const parsedSections = parseContentToSections(sectionContent);
    
    if (parsedSections.length > 0) {
      for (const parsedSection of parsedSections) {
        if (parsedSection.title) {
          const subHeadingLevel = Math.min(parsedSection.level + 1, 3);
          contentSections.push(
            new Paragraph({
              children: [
                new TextRun({ text: parsedSection.title, bold: true, size: 32 - (subHeadingLevel * 2) })
              ],
              spacing: { after: 200, before: 200 },
              heading: HeadingLevel[`HEADING_${subHeadingLevel}`],
              keepNext: true
            })
          );
        }
        
        const paragraphs = processContentToParagraphs(parsedSection.content);
        contentSections.push(...paragraphs);
      }
    } else {
      // If no parsed sections, just add the content as is
      const paragraphs = processContentToParagraphs(sectionContent);
      contentSections.push(...paragraphs);
    }
  }

  // Create a section for all the content
  const section = {
    properties: {},
    children: contentSections
  };
  
  // Update the document with our section
  doc.addSection(section);
  
  // Export document to buffer
  console.log("Packing document to buffer");
  try {
    return await Packer.toBuffer(doc);
  } catch (error) {
    console.error("Error packing document:", error);
    throw error;
  }
}

/**
 * Generates a HTML preview of the document for browser display
 */
export function generateHtmlPreview(
  protocol: Protocol, 
  sections: { id: string, title: string }[],
  boilerplateContent: Record<string, string> = {}
): string {
  const converter = new showdown.Converter({
    tables: true,
    tasklists: true,
    strikethrough: true,
    simplifiedAutoLink: true,
    parseImgDimensions: true,
    simpleLineBreaks: true
  });
  
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
        <p class="protocol-date"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>
      
      <div class="protocol-toc">
        <h2>Table of Contents</h2>
        <ul class="toc-list">
  `;
  
  // Add TOC entries
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    html += `<li><a href="#section-${i+1}">${i+1}. ${section.title}</a></li>`;
  }
  
  html += `
        </ul>
      </div>
      
      <div class="protocol-content">
  `;
  
  // Process each section
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const sectionId = section.id;
    
    // Get component data
    let sectionContent = "";
    
    // Check for boilerplate content first
    if (boilerplateContent && boilerplateContent[sectionId]) {
      sectionContent = boilerplateContent[sectionId];
    } else {
      // Otherwise use component data
      const componentData = protocol.components && protocol.components[sectionId as keyof typeof protocol.components];
      
      if (componentData && typeof componentData === 'string') {
        sectionContent = componentData;
      } else if (componentData && typeof componentData === 'object') {
        // Special handling for structured data
        if (sectionId === 'schedule') {
          // For schedule, we would generate an HTML table
          sectionContent = `Schedule of Activities for ${protocol.title}`;
        } else {
          // Default object to string conversion - could be improved
          sectionContent = "```json\n" + JSON.stringify(componentData, null, 2) + "\n```";
        }
      } else {
        sectionContent = `[No content for ${section.title}]`;
      }
    }
    
    // Convert section content to HTML
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

/**
 * Simple markdown to HTML converter
 */
function convertMarkdownToHtml(markdown: string): string {
  const converter = new showdown.Converter({
    tables: true,
    tasklists: true,
    strikethrough: true
  });
  
  return converter.makeHtml(markdown);
}