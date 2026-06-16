"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { LineChart } from "lucide-react"

export function AnalysisNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#f8f0fc" icon={LineChart} />
}