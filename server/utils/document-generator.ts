import { 
  Document, Packer, Paragraph, TextRun, HeadingLevel, 
  AlignmentType, UnderlineType, BorderStyle, WidthType, TableCell, 
  TableRow, Table, Footer, Header, ISectionOptions
} from 'docx';
import { Protocol } from '@shared/schema';

interface ProtocolSection {
  title: string;
  content: string;
}

/**
 * Converts markdown text to formatted paragraphs for the docx library
 * 
 * @param text The markdown text to convert
 * @param sectionNumber The section number prefix (e.g., "1." for section 1)
 */
function convertMarkdownToDocxParagraphs(text: string, sectionNumber: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = text.split('\n');
  
  // Track subsection and sub-subsection numbering
  let h2Counter = 0;
  let h3Counter = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty lines but ensure there's spacing in the document
    if (!line.trim()) {
      paragraphs.push(new Paragraph({}));
      continue;
    }
    
    // Handle headings (# Heading)
    if (line.startsWith('# ')) {
      // Main heading already has section number from the section title
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(line.substring(2))],
          heading: HeadingLevel.HEADING_1,
        })
      );
      continue;
    }
    
    if (line.startsWith('## ')) {
      // Increment subsection counter and reset sub-subsection counter
      h2Counter++;
      h3Counter = 0;
      
      // Format as: "1.1 Subsection Title"
      const subsectionNumber = `${sectionNumber}${h2Counter}`;
      
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(`${subsectionNumber} ${line.substring(3)}`)],
          heading: HeadingLevel.HEADING_2,
        })
      );
      continue;
    }
    
    if (line.startsWith('### ')) {
      // Increment sub-subsection counter
      h3Counter++;
      
      // Format as: "1.1.1 Sub-subsection Title"
      const subSubsectionNumber = `${sectionNumber}${h2Counter}.${h3Counter}`;
      
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(`${subSubsectionNumber} ${line.substring(4)}`)],
          heading: HeadingLevel.HEADING_3,
        })
      );
      continue;
    }
    
    // Handle bullet points
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const bulletText = line.trim().substring(2);
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(bulletText)],
          bullet: {
            level: 0
          }
        })
      );
      continue;
    }
    
    // Handle nested bullet points (indented with spaces)
    if (line.trim().startsWith('  - ') || line.trim().startsWith('  * ')) {
      const bulletText = line.trim().substring(4);
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(bulletText)],
          bullet: {
            level: 1
          }
        })
      );
      continue;
    }
    
    // Handle numbered lists
    if (/^\d+\.\s/.test(line)) {
      const matches = line.match(/^(\d+)\.\s(.+)$/);
      if (matches && matches.length >= 3) {
        const number = matches[1];
        const text = matches[2];
        
        paragraphs.push(
          new Paragraph({
            children: [new TextRun(`${number}. ${text}`)],
            numbering: {
              reference: "default",
              level: 0,
            },
          })
        );
      }
      continue;
    }
    
    // Regular paragraph
    paragraphs.push(
      new Paragraph({
        children: [new TextRun(line)]
      })
    );
  }
  
  return paragraphs;
}

/**
 * Creates a DOCX document from protocol sections
 */
export async function generateDocxDocument(
  protocol: Protocol, 
  sections: ProtocolSection[]
): Promise<Buffer> {
  // Create the document structure
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Title page
          new Paragraph({
            children: [new TextRun(protocol.title)],
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: {
              before: 240,
              after: 240,
            },
          }),
          new Paragraph({
            children: [new TextRun(`Protocol ID: ${protocol.id}`)],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [new TextRun(`Version: 1.0`)],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [new TextRun(`Date: ${new Date().toISOString().split('T')[0]}`)],
            alignment: AlignmentType.CENTER,
          }),
          
          // Add Table of Contents on a new page
          new Paragraph({
            children: [new TextRun("")],
            pageBreakBefore: true,
          }),
          new Paragraph({
            children: [new TextRun("Table of Contents")],
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: {
              after: 400,
            },
          }),
          // Word will automatically create a TOC based on headings when opened
          new Paragraph({
            children: [new TextRun("TOC PLACEHOLDER - Will be generated automatically when opened in Word")]
          }),
          
          // Main content
          ...sections.flatMap((section, index) => {
            const sectionNumber = index + 1;
            return [
              new Paragraph({
                children: [new TextRun(`${sectionNumber}. ${section.title}`)], 
                heading: HeadingLevel.HEADING_1,
                pageBreakBefore: index > 0, // No page break for first section
              }),
              ...convertMarkdownToDocxParagraphs(section.content, `${sectionNumber}.`)
            ];
          }),
        ],
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [new TextRun(protocol.id)],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [new TextRun("This document was generated by Evidence Copilot™")],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
      }
    ]
  });
  
  // Generate buffer from document
  const buffer = await Packer.toBuffer(doc);
  
  return buffer;
}