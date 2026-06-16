import { PDFDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse';

/**
 * Custom PDF parsing function that extracts text from PDF files
 * Using pdf-parse for text extraction and pdf-lib for metadata
 * @param buffer PDF file buffer
 * @returns Extracted text
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // First use pdf-lib to get metadata
    const pdfDoc = await PDFDocument.load(buffer);
    const numPages = pdfDoc.getPageCount();
    const title = pdfDoc.getTitle() || 'Untitled Document';
    
    console.log(`Processing PDF: ${title} with ${numPages} pages`);
    
    // Then use pdf-parse to extract the actual text content
    const data = await pdfParse(buffer);
    
    const extractedText = data.text.trim();
    
    // If the extraction failed to get meaningful content, provide fallback
    if (!extractedText || extractedText.length < 50) {
      console.warn("PDF text extraction yielded minimal content, using fallback");
      return `PDF Document: ${title} (${numPages} pages)\n\nThe text extraction was not successful. The document may contain scanned images that require OCR processing, or the text may be embedded in a non-standard way. Please review the document and manually enter the synopsis.`;
    }
    
    // Add some metadata at the beginning
    return `${title}\n\n${extractedText}`;
  } catch (error) {
    console.error('Error parsing PDF:', error);
    // Try a fallback method
    try {
      // Just try to get some basic info using pdf-lib if pdf-parse fails
      const pdfDoc = await PDFDocument.load(buffer);
      const numPages = pdfDoc.getPageCount();
      const title = pdfDoc.getTitle() || 'Untitled Document';
      
      return `PDF Document: ${title} (${numPages} pages)\n\nFailed to extract text content. The document may contain scanned images or protected content. Please review the document and manually enter the synopsis.`;
    } catch (fallbackError) {
      console.error('Fallback PDF parsing also failed:', fallbackError);
      throw new Error('Failed to parse PDF content');
    }
  }
}