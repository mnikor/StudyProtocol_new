"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { Filter } from "lucide-react"

export function ScreeningNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#fff9db" icon={Filter} />
}