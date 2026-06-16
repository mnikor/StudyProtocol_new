"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { Flag } from "lucide-react"

export function StudyPhaseNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#e7f5ff" icon={Flag} />
}