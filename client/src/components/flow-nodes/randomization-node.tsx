"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { Shuffle } from "lucide-react"

export function RandomizationNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#f3f0ff" icon={Shuffle} />
}