import { Protocol } from '@shared/schema';
import showdown from 'showdown';
import HTMLtoDOCX from 'html-to-docx';
import fs from 'fs';
import path from 'path';

interface ProtocolSection {
  title: string;
  content: string;
}

/**
 * Converts markdown to HTML with proper formatting
 */
function markdownToHTML(markdown: string): string {
  // Pre-process the markdown
  let processedMarkdown = markdown;
  
  // Fix bullet points: ensure consistent bullet point format
  processedMarkdown = processedMarkdown.replace(/^\s*\*\s+/gm, '* ');
  processedMarkdown = processedMarkdown.replace(/^\s*-\s+/gm, '* ');
  
  // Fix bold text: ensure ** is converted to proper HTML strong tags
  processedMarkdown = processedMarkdown.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Initialize showdown converter
  const converter = new showdown.Converter({
    tables: true,
    tasklists: true,
    strikethrough: true,
    simplifiedAutoLink: true,
    excludeTrailingPunctuationFromURLs: true,
    literalMidWordUnderscores: true,
    literalMidWordAsterisks: false, // Disable this to allow our manual bold handling
    parseImgDimensions: true
  });
  
  // Convert markdown to HTML
  let html = converter.makeHtml(processedMarkdown);
  
  // Post-process HTML to fix common issues
  
  // Fix list styling and ensure proper nesting
  html = html.replace(/<ul>/g, '<ul style="margin-left: 20px; padding-left: 20px; font-weight: normal;">')
       .replace(/<ol>/g, '<ol style="margin-left: 20px; padding-left: 20px; font-weight: normal;">');
  
  // Ensure list items are not bold
  html = html.replace(/<li>/g, '<li style="font-weight: normal;">');
  
  // Fix any remaining bullet points that were not properly converted
  html = html.replace(/<p>\*\s+(.*?)<\/p>/g, '<ul style="margin-left: 20px; padding-left: 20px;"><li style="font-weight: normal;">$1</li></ul>');
  
  // Fix paragraphs to ensure they're not bold
  html = html.replace(/<p>/g, '<p style="font-weight: normal;">');
  
  return html;
}

/**
 * Generate a complete HTML document with proper section numbering
 */
function generateCompleteHTML(protocol: Protocol, sections: ProtocolSection[]): string {
  // Build table of contents
  let tocHtml = '<div class="toc"><h2>Table of Contents</h2><ul>';
  sections.forEach((section, index) => {
    const sectionNumber = index + 1;
    tocHtml += `<li><a href="#section-${sectionNumber}">${sectionNumber}. ${section.title}</a></li>`;
  });
  tocHtml += '</ul></div>';
  
  // Build content sections with proper numbering
  let contentHtml = '';
  sections.forEach((section, index) => {
    const sectionNumber = index + 1;
    
    // Process section content to add subsection numbering
    let processedContent = section.content;
    
    // Fix markdown formatting before adding numbering
    // Ensure proper bullet point formatting
    processedContent = processedContent.replace(/^\s*\*\s+/gm, '- ');
    processedContent = processedContent.replace(/^\s*-\s+(?=.*)/gm, '- ');
    
    // Add section number to h2 tags (## Heading)
    processedContent = processedContent.replace(/^## (.*?)$/gm, (_, heading) => {
      return `## ${sectionNumber}.1 ${heading}`;
    });
    
    // Add section numbers to h3 tags (### Heading)
    let h2Counter = 0;
    processedContent = processedContent.replace(/^## [\d\.]+\s+(.*?)$/gm, (match) => {
      h2Counter++;
      return match;
    });
    
    processedContent = processedContent.replace(/^### (.*?)$/gm, (_, heading) => {
      // Find the preceding h2 counter
      const h3Counter = (processedContent.match(/^### /gm) || []).length + 1;
      return `### ${sectionNumber}.${h2Counter}.${h3Counter} ${heading}`;
    });
    
    // Convert the processed markdown to HTML
    const sectionHtml = markdownToHTML(processedContent);
    
    // Add the section to the content with proper heading
    contentHtml += `
      <div class="section" id="section-${sectionNumber}">
        <h1>${sectionNumber}. ${section.title}</h1>
        ${sectionHtml}
      </div>
    `;
  });
  
  // Combine everything into a complete HTML document
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${protocol.title}</title>
      <style>
        body { font-family: 'Calibri', sans-serif; font-size: 11pt; line-height: 1.2; font-weight: normal; }
        .cover-page { text-align: center; margin-top: 150px; }
        .cover-page h1 { font-size: 24pt; margin-bottom: 50px; font-weight: bold; }
        .protocol-info { margin-bottom: 20px; }
        .toc { page-break-before: always; page-break-after: always; }
        .toc ul { list-style-type: none; }
        .section { page-break-before: always; }
        h1 { font-size: 16pt; margin-top: 24pt; margin-bottom: 12pt; font-weight: bold; }
        h2 { font-size: 14pt; margin-top: 18pt; margin-bottom: 12pt; font-weight: bold; }
        h3 { font-size: 12pt; margin-top: 14pt; margin-bottom: 8pt; font-weight: bold; }
        ul, ol { margin-left: 20px; padding-left: 20px; }
        ul li, ol li { font-weight: normal; margin-bottom: 6pt; }
        p { margin-bottom: 8pt; font-weight: normal; }
        strong { font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="cover-page">
        <h1>${protocol.title}</h1>
        <div class="protocol-info">
          <p><strong>Protocol ID:</strong> ${protocol.id}</p>
          <p><strong>Version:</strong> 1.0</p>
          <p><strong>Date:</strong> ${new Date().toISOString().split('T')[0]}</p>
        </div>
      </div>
      
      ${tocHtml}
      
      ${contentHtml}
      
      <div class="footer">
        <p>This document was generated by Evidence Copilot™</p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Creates a DOCX document from protocol sections
 * @param protocol Protocol object
 * @param sections Protocol content sections
 * @param boilerplateSelections Optional boilerplate text selections to include
 */
export async function generateDocxDocument(
  protocol: Protocol, 
  sections: ProtocolSection[],
  boilerplateSelections?: Record<string, string | null>
): Promise<Buffer> {
  // If we have boilerplate selections, we need to incorporate them
  let processedSections = [...sections];
  
  if (boilerplateSelections) {
    // For each boilerplate section, check if we already have a matching section
    // If not, create a new section; if yes, append the content
    for (const [sectionKey, content] of Object.entries(boilerplateSelections)) {
      if (!content) continue; // Skip if no content selected
      
      // Convert key to title format (e.g., safety_monitoring -> Safety Monitoring)
      const sectionTitle = sectionKey
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      // Check if this section already exists
      const existingSection = processedSections.find(s => 
        s.title.toLowerCase() === sectionTitle.toLowerCase()
      );
      
      if (existingSection) {
        // Append the boilerplate text to the existing section
        existingSection.content += `\n\n${content}`;
      } else {
        // Create a new section with the boilerplate text
        processedSections.push({
          title: sectionTitle,
          content: content
        });
      }
    }
  }
  
  // Generate the complete HTML document with all sections
  const htmlContent = generateCompleteHTML(protocol, processedSections);
  
  // Configure document options
  const options = {
    title: protocol.title,
    subject: `Protocol ${protocol.id}`,
    creator: 'Evidence Copilot',
    lastModifiedBy: 'Evidence Copilot',
    margins: {
      top: 1440, // 1 inch - in twips
      right: 1440,
      bottom: 1440,
      left: 1440,
      header: 720,
      footer: 720,
    },
    // Headers and footers
    header: `<p style="text-align: right;">${protocol.id}</p>`,
    footer: '<p style="text-align: center;">This document was generated by Evidence Copilot™</p>',
  };
  
  // Add some meta styling to fix font weight issues
  const styledHtmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: 'Calibri', Arial, sans-serif;
          font-size: 11pt;
          font-weight: normal;
          line-height: 1.15;
        }
        p, li, td, th {
          font-weight: normal !important;
        }
        h1, h2, h3, h4, h5, h6, strong, b {
          font-weight: bold !important;
        }
        ul, ol {
          margin-left: 20px;
          padding-left: 20px;
        }
      </style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>
  `;
  
  // Convert HTML to DOCX with extra styles
  const docxBuffer = await HTMLtoDOCX(styledHtmlContent, null, options);
  
  return docxBuffer;
}

/**
 * Generates HTML for preview within the app
 * @param protocol Protocol object
 * @param sections Protocol content sections
 * @param boilerplateSelections Optional boilerplate text selections to include
 */
export function generateHTMLPreview(
  protocol: Protocol, 
  sections: ProtocolSection[],
  boilerplateSelections?: Record<string, string | null>
): string {
  // If we have boilerplate selections, we need to incorporate them
  let processedSections = [...sections];
  
  if (boilerplateSelections) {
    // For each boilerplate section, check if we already have a matching section
    // If not, create a new section; if yes, append the content
    for (const [sectionKey, content] of Object.entries(boilerplateSelections)) {
      if (!content) continue; // Skip if no content selected
      
      // Convert key to title format (e.g., safety_monitoring -> Safety Monitoring)
      const sectionTitle = sectionKey
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      // Check if this section already exists
      const existingSection = processedSections.find(s => 
        s.title.toLowerCase() === sectionTitle.toLowerCase()
      );
      
      if (existingSection) {
        // Append the boilerplate text to the existing section
        existingSection.content += `\n\n${content}`;
      } else {
        // Create a new section with the boilerplate text
        processedSections.push({
          title: sectionTitle,
          content: content
        });
      }
    }
  }
  
  // This function generates a simplified HTML version
  // for preview in the browser, with proper formatting
  return generateCompleteHTML(protocol, processedSections);
}