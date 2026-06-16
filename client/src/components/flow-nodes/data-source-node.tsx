"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { Database } from "lucide-react"

export function DataSourceNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#f3f0ff" icon={Database} />
}