"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { Target } from "lucide-react"

export function EndpointNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#fff5f5" icon={Target} />
}