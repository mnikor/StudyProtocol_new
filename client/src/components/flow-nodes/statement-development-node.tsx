"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { FileText } from "lucide-react"

export function StatementDevelopmentNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#fff9db" icon={FileText} />
}