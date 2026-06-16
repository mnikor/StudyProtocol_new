"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { CircleDot } from "lucide-react"

export function DelphiRoundNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#e3fafc" icon={CircleDot} />
}