"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { ClipboardList } from "lucide-react"

export function EnrollmentNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#e3fafc" icon={ClipboardList} />
}