"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { Stethoscope } from "lucide-react"

export function AssessmentNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#fff4e6" icon={Stethoscope} />
}