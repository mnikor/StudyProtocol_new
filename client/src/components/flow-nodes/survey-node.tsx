"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { ClipboardList } from "lucide-react"

export function SurveyNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#fff9db" icon={ClipboardList} />
}