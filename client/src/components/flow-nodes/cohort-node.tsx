"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { Users } from "lucide-react"

export function CohortNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#fff0f6" icon={Users} />
}