"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { CheckCircle } from "lucide-react"

export function ConsensusAnalysisNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#f8f0fc" icon={CheckCircle} />
}