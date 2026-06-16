import type { Node, Edge } from 'reactflow';
import type { StudySchemaModel } from './types';

/**
 * Export study schema as SVG (scalable vector graphics)
 */
export async function exportToSVG(
  nodes: Node[], 
  edges: Edge[], 
  containerRef: React.RefObject<HTMLElement>
): Promise<string> {
  if (!containerRef.current) {
    throw new Error('Container reference is not available');
  }

  // Get the viewport dimensions
  const container = containerRef.current;
  const bbox = container.getBoundingClientRect();
  
  // Calculate the bounds of all nodes
  const nodeBounds = nodes.reduce((bounds, node) => {
    const x = node.position.x;
    const y = node.position.y;
    const width = (node.style?.width as number) || 200;
    const height = (node.style?.height as number) || 80;
    
    return {
      minX: Math.min(bounds.minX, x),
      minY: Math.min(bounds.minY, y),
      maxX: Math.max(bounds.maxX, x + width),
      maxY: Math.max(bounds.maxY, y + height)
    };
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  
  // Add padding
  const padding = 40;
  const svgWidth = nodeBounds.maxX - nodeBounds.minX + padding * 2;
  const svgHeight = nodeBounds.maxY - nodeBounds.minY + padding * 2;
  const offsetX = -nodeBounds.minX + padding;
  const offsetY = -nodeBounds.minY + padding;
  
  // Create SVG string
  let svg = `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Add styles
  svg += `<defs>
    <style>
      .node { fill: #ffffff; stroke: #dee2e6; stroke-width: 1; rx: 8; }
      .node-text { font-family: system-ui, -apple-system, sans-serif; font-size: 14px; fill: #495057; dominant-baseline: middle; text-anchor: middle; }
      .node-title { font-weight: 600; }
      .node-description { font-size: 12px; fill: #6c757d; }
      .edge { stroke: #adb5bd; stroke-width: 2; fill: none; marker-end: url(#arrowhead); }
      .phase-node { fill: #e7f5ff; stroke: #228be6; }
      .endpoint-node { fill: #fff3cd; stroke: #ffc107; }
      .treatment-node { fill: #d1ecf1; stroke: #17a2b8; }
    </style>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#adb5bd"/>
    </marker>
  </defs>`;
  
  // Add background
  svg += `<rect width="100%" height="100%" fill="#f8f9fa"/>`;
  
  // Draw edges first (so they appear behind nodes)
  edges.forEach(edge => {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    
    if (sourceNode && targetNode) {
      const sourceX = sourceNode.position.x + offsetX + ((sourceNode.style?.width as number) || 200) / 2;
      const sourceY = sourceNode.position.y + offsetY + ((sourceNode.style?.height as number) || 80) / 2;
      const targetX = targetNode.position.x + offsetX + ((targetNode.style?.width as number) || 200) / 2;
      const targetY = targetNode.position.y + offsetY + ((targetNode.style?.height as number) || 80) / 2;
      
      // Simple straight line for now (could be enhanced with curves)
      svg += `<line x1="${sourceX}" y1="${sourceY}" x2="${targetX}" y2="${targetY}" class="edge"/>`;
    }
  });
  
  // Draw nodes
  nodes.forEach(node => {
    const x = node.position.x + offsetX;
    const y = node.position.y + offsetY;
    const width = (node.style?.width as number) || 200;
    const height = (node.style?.height as number) || 80;
    
    // Determine node class based on type
    let nodeClass = 'node';
    if (node.type === 'studyPhase') nodeClass += ' phase-node';
    else if (node.type === 'endpoint') nodeClass += ' endpoint-node';
    else if (node.type === 'treatment') nodeClass += ' treatment-node';
    
    // Draw node rectangle
    svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" class="${nodeClass}"/>`;
    
    // Draw node text
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const label = node.data?.label || 'Untitled';
    const description = node.data?.description;
    
    if (description) {
      svg += `<text x="${centerX}" y="${centerY - 8}" class="node-text node-title">${label}</text>`;
      svg += `<text x="${centerX}" y="${centerY + 8}" class="node-text node-description">${description}</text>`;
    } else {
      svg += `<text x="${centerX}" y="${centerY}" class="node-text node-title">${label}</text>`;
    }
  });
  
  svg += '</svg>';
  return svg;
}

/**
 * Export to PNG using canvas (fallback method)
 */
export async function exportToPNG(
  containerRef: React.RefObject<HTMLElement>,
  filename: string = 'study-schema.png'
): Promise<void> {
  const html2canvas = (await import('html2canvas')).default;
  
  if (!containerRef.current) {
    throw new Error('Container reference is not available');
  }

  const canvas = await html2canvas(containerRef.current, {
    backgroundColor: '#f8f9fa',
    scale: 2, // Higher resolution
    useCORS: true,
    allowTaint: true,
  });

  // Create download link
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Export study schema model as JSON
 */
export function exportModelAsJSON(model: StudySchemaModel): string {
  return JSON.stringify(model, null, 2);
}

/**
 * Export as SPIRIT-style procedure matrix (CSV format)
 */
export function exportAsSPIRITMatrix(model: StudySchemaModel): string {
  const visits = model.entities.filter(e => e.kind === 'Visit');
  const procedures = model.entities.filter(e => e.kind === 'Procedure');
  
  // Create header row
  let csv = 'Procedure,' + visits.map(v => v.name).join(',') + '\n';
  
  // Group procedures by type
  const proceduresByType: Record<string, any[]> = {};
  procedures.forEach(proc => {
    const type = proc.type || 'Other';
    if (!proceduresByType[type]) proceduresByType[type] = [];
    proceduresByType[type].push(proc);
  });
  
  // Add rows for each procedure type
  Object.entries(proceduresByType).forEach(([type, procs]) => {
    procs.forEach(proc => {
      let row = `"${proc.details || type}"`;
      visits.forEach(visit => {
        // Check if this procedure is associated with this visit
        const isAssociated = proc.visitId === visit.id;
        row += ',' + (isAssociated ? 'X' : '');
      });
      csv += row + '\n';
    });
  });
  
  return csv;
}

/**
 * Export as CONSORT-style flow diagram data
 */
export function exportAsCONSORTFlow(model: StudySchemaModel): Record<string, any> {
  const counts = model.entities.filter(e => e.kind === 'Count');
  const arms = model.entities.filter(e => e.kind === 'Arm');
  
  return {
    enrollment: {
      assessed: counts.find(c => c.label.toLowerCase().includes('assessed'))?.n || 0,
      excluded: counts.find(c => c.label.toLowerCase().includes('excluded'))?.n || 0,
      randomized: counts.find(c => c.label.toLowerCase().includes('randomized'))?.n || 0
    },
    allocation: arms.map(arm => ({
      name: arm.name,
      allocated: counts.find(c => c.relatesToId === arm.id)?.n || 0
    })),
    followUp: {
      // This would need more sophisticated logic based on actual study structure
    },
    analysis: {
      // This would need more sophisticated logic based on actual study structure
    }
  };
}

/**
 * Create a downloadable file from content
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}