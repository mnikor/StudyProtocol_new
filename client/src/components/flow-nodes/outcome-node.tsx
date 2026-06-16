"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { BarChart2 } from "lucide-react"

export function OutcomeNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#fff4e6" icon={BarChart2} />
}