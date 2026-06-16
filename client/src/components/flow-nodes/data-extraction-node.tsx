"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { Filter } from "lucide-react"

export function DataExtractionNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#edf2ff" icon={Filter} />
}