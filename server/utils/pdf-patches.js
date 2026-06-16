// This file fixes the issues with the pdf-parse package that's looking for test files
const fs = require('fs');
const path = require('path');

// Create the test directory structure if it doesn't exist
const testDir = path.join(process.cwd(), 'test');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir);
}

const dataDir = path.join(testDir, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// Create an empty PDF file to satisfy the pdf-parse package
const testPdfPath = path.join(dataDir, '05-versions-space.pdf');
if (!fs.existsSync(testPdfPath)) {
  // Create a simple valid PDF file
  const minimalPdf = '%PDF-1.3\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 0 >>\nstream\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000198 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n248\n%%EOF';
  fs.writeFileSync(testPdfPath, minimalPdf);
  console.log(`Created test PDF file: ${testPdfPath}`);
}

console.log('PDF patch applied successfully');