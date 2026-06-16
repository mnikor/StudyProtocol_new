import dagre from "dagre";
import type { Node, Edge } from "reactflow";

export interface LayoutConfig {
  direction: 'LR' | 'TB';
  nodeSpacing: number;
  rankSpacing: number;
  marginX: number;
  marginY: number;
  swimLanes?: boolean;
  armColors?: Record<string, string>;
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  direction: 'TB',
  nodeSpacing: 80,
  rankSpacing: 150,
  marginX: 50,
  marginY: 50,
  swimLanes: false
};

/**
 * Auto-layout nodes using Dagre algorithm
 */
export function layoutNodes(
  nodes: Node[], 
  edges: Edge[], 
  config: Partial<LayoutConfig> = {}
): { nodes: Node[]; edges: Edge[] } {
  const finalConfig = { ...DEFAULT_LAYOUT_CONFIG, ...config };
  
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: finalConfig.direction,
    nodesep: finalConfig.nodeSpacing,
    ranksep: finalConfig.rankSpacing,
    marginx: finalConfig.marginX,
    marginy: finalConfig.marginY,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes to graph
  nodes.forEach(node => {
    const width = (node.style?.width as number) || 200;
    const height = (node.style?.height as number) || 80;
    g.setNode(node.id, { width, height });
  });

  // Add edges to graph
  edges.forEach(edge => {
    g.setEdge(edge.source, edge.target);
  });

  // Run layout algorithm
  dagre.layout(g);

  // Apply new positions
  const layoutedNodes = nodes.map(node => {
    const position = g.node(node.id);
    return {
      ...node,
      position: {
        x: position.x - (node.style?.width as number || 200) / 2,
        y: position.y - (node.style?.height as number || 80) / 2,
      },
      draggable: true,
    };
  });

  return { nodes: layoutedNodes, edges };
}

/**
 * Layout nodes with swimlanes for arms
 */
export function layoutWithSwimLanes(
  nodes: Node[], 
  edges: Edge[], 
  arms: Array<{id: string; name: string; color?: string}>,
  config: Partial<LayoutConfig> = {}
): { nodes: Node[]; edges: Edge[]; swimLanes: SwimLane[] } {
  const finalConfig = { ...DEFAULT_LAYOUT_CONFIG, ...config };
  
  // Group nodes by arm
  const nodesByArm: Record<string, Node[]> = {};
  const sharedNodes: Node[] = [];
  
  nodes.forEach(node => {
    const armId = node.data?.armId;
    if (armId && arms.find(arm => arm.id === armId)) {
      if (!nodesByArm[armId]) nodesByArm[armId] = [];
      nodesByArm[armId].push(node);
    } else {
      sharedNodes.push(node);
    }
  });

  // Calculate lane widths
  const laneWidth = 300;
  const laneSpacing = 50;
  
  // Layout shared nodes first (screening, randomization, etc.)
  let currentY = finalConfig.marginY;
  const layoutedNodes: Node[] = [];
  
  // Place shared nodes in center column
  const centerX = (arms.length * (laneWidth + laneSpacing)) / 2;
  sharedNodes.forEach((node, index) => {
    layoutedNodes.push({
      ...node,
      position: {
        x: centerX - (node.style?.width as number || 200) / 2,
        y: currentY + index * (finalConfig.rankSpacing || 150)
      }
    });
  });
  
  // Update Y position for arm-specific nodes
  currentY += sharedNodes.length * (finalConfig.rankSpacing || 150);
  
  // Layout nodes within each arm lane
  const swimLanes: SwimLane[] = [];
  arms.forEach((arm, armIndex) => {
    const laneX = armIndex * (laneWidth + laneSpacing);
    const armNodes = nodesByArm[arm.id] || [];
    
    swimLanes.push({
      id: arm.id,
      name: arm.name,
      color: arm.color || '#e3f2fd',
      x: laneX,
      y: currentY,
      width: laneWidth,
      height: Math.max(200, armNodes.length * 120 + 40)
    });
    
    // Layout nodes within this lane
    armNodes.forEach((node, index) => {
      layoutedNodes.push({
        ...node,
        position: {
          x: laneX + laneWidth/2 - (node.style?.width as number || 200) / 2,
          y: currentY + 20 + index * 120
        }
      });
    });
  });

  return { nodes: layoutedNodes, edges, swimLanes };
}

/**
 * Timeline layout for time-based studies
 */
export function layoutWithTimeline(
  nodes: Node[], 
  edges: Edge[],
  timeline: Array<{name: string; day: number; window?: string}>,
  config: Partial<LayoutConfig> = {}
): { nodes: Node[]; edges: Edge[]; timeline: TimelinePoint[] } {
  const finalConfig = { ...DEFAULT_LAYOUT_CONFIG, ...config };
  
  // Find min and max days for scaling
  const days = timeline.map(t => t.day).filter(d => d != null);
  const minDay = Math.min(...days, 0);
  const maxDay = Math.max(...days, 365);
  const timeRange = maxDay - minDay;
  
  // Timeline configuration
  const timelineHeight = 60;
  const chartWidth = 800;
  const timeScale = chartWidth / timeRange;
  
  // Position nodes based on their day values
  const layoutedNodes = nodes.map(node => {
    const nodeDay = node.data?.day;
    let x = finalConfig.marginX || 50;
    
    if (nodeDay != null) {
      x = ((nodeDay - minDay) * timeScale) + (finalConfig.marginX || 50);
    }
    
    return {
      ...node,
      position: {
        x: x - (node.style?.width as number || 200) / 2,
        y: (node.position?.y || 0) + timelineHeight + 20
      }
    };
  });
  
  // Create timeline points
  const timelinePoints: TimelinePoint[] = timeline.map(point => ({
    ...point,
    x: ((point.day - minDay) * timeScale) + (finalConfig.marginX || 50)
  }));
  
  return { nodes: layoutedNodes, edges, timeline: timelinePoints };
}

export interface SwimLane {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TimelinePoint {
  name: string;
  day: number;
  window?: string;
  x: number;
}

/**
 * Validate node connections based on study type rules
 */
export function canConnect(
  sourceType: string, 
  targetType: string, 
  connectionRules: Record<string, string[]>
): boolean {
  const allowedTargets = connectionRules[sourceType] || [];
  return allowedTargets.includes(targetType);
}

/**
 * Auto-arrange nodes by protocol type with sensible defaults
 */
export function getProtocolTypeLayout(
  protocolType: string,
  nodes: Node[],
  edges: Edge[],
  layoutDirection: 'vertical' | 'horizontal' = 'vertical'
): { nodes: Node[]; edges: Edge[] } {
  const direction = layoutDirection === 'vertical' ? 'TB' : 'LR';
  
  switch (protocolType) {
    case 'interventional_clinical_trial':
    case 'dose_escalation_study':
      return layoutNodes(nodes, edges, { 
        direction, 
        rankSpacing: layoutDirection === 'vertical' ? 120 : 200,
        nodeSpacing: 60
      });
      
    case 'prospective_cohort_study':
    case 'retrospective_cohort_study':
      return layoutNodes(nodes, edges, { 
        direction, 
        rankSpacing: layoutDirection === 'vertical' ? 100 : 180,
        nodeSpacing: 80
      });
      
    case 'secondary_data_analysis':
    case 'maic':
      return layoutNodes(nodes, edges, { 
        direction, 
        rankSpacing: layoutDirection === 'vertical' ? 120 : 180,
        nodeSpacing: 60
      });
      
    case 'delphi_consensus':
      return layoutNodes(nodes, edges, { 
        direction, 
        rankSpacing: layoutDirection === 'vertical' ? 100 : 180,
        nodeSpacing: 40
      });
      
    default:
      return layoutNodes(nodes, edges, { 
        direction, 
        rankSpacing: layoutDirection === 'vertical' ? 100 : 180 
      });
  }
}