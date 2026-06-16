"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { Pill } from "lucide-react"

export function TreatmentNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#e6fcf5" icon={Pill} />
}