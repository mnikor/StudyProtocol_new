"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { FileSpreadsheet } from "lucide-react"

export function DataCollectionNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#e7f5ff" icon={FileSpreadsheet} />
}