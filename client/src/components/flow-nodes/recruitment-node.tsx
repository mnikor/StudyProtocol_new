"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { UserPlus } from "lucide-react"

export function RecruitmentNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#e3fafc" icon={UserPlus} />
}