"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { Users } from "lucide-react"

export function PanelRecruitmentNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#f3f0ff" icon={Users} />
}