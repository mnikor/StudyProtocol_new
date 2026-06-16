"use client"

import React, { useState, useRef, useEffect } from "react"
import { Handle, Position, NodeResizer } from "reactflow"

export interface BaseNodeProps {
  data: {
    label: string
    description?: string
    width?: number
    height?: number
    [key: string]: any
  }
  selected: boolean
  isConnectable: boolean
}

export function BaseNode({ 
  data, 
  selected, 
  isConnectable,
  color = "#e7f5ff",
  icon: Icon = null,
}: BaseNodeProps & { color?: string, icon?: React.ElementType | null }) {
  // Default dimensions if not specified
  const defaultWidth = 180;
  const defaultHeight = data.description ? 90 : 60;
  
  // Initialize with data dimensions or defaults
  const [dimensions, setDimensions] = useState({
    width: data.width || defaultWidth,
    height: data.height || defaultHeight
  });
  
  // Update dimensions in the node data when they change
  useEffect(() => {
    if (data.width !== dimensions.width || data.height !== dimensions.height) {
      data.width = dimensions.width;
      data.height = dimensions.height;
    }
  }, [dimensions, data]);
  
  // Handle resize events
  const onResize = (_: any, newDimensions: { width: number; height: number }) => {
    const { width, height } = newDimensions;
    setDimensions({ width, height });
  };

  return (
    <div 
      className={`
        px-4 py-2 rounded-lg border shadow-sm relative
        ${selected ? 'ring-2 ring-[#228be6]' : 'ring-0'}
      `}
      style={{ 
        backgroundColor: color,
        width: dimensions.width,
        height: dimensions.height,
        minWidth: 120,
        minHeight: 50,
      }}
    >
      {selected && (
        <NodeResizer 
          minWidth={120}
          minHeight={50}
          isVisible={selected}
          onResize={onResize}
          handleStyle={{ 
            width: 8, 
            height: 8, 
            borderColor: '#228be6',
            backgroundColor: 'white'
          }}
          lineStyle={{ borderWidth: 1, borderColor: '#228be6' }}
        />
      )}
      
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-[#228be6]"
      />
      
      <div className="flex items-start gap-2 h-full flex-col justify-center">
        <div className="flex items-center gap-2 w-full">
          {Icon && <Icon size={16} className="shrink-0 mt-0.5" />}
          <div className="font-medium text-sm break-words">{data.label}</div>
        </div>
        
        {data.description && (
          <div className="text-xs text-[#495057] break-words w-full">{data.description}</div>
        )}
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-[#228be6]"
      />
    </div>
  )
}