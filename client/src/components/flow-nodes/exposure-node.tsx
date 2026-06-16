"use client"

import React from "react"
import { BaseNode, BaseNodeProps } from "./base-node"
import { Microscope } from "lucide-react"

export function ExposureNode(props: BaseNodeProps) {
  return <BaseNode {...props} color="#e3fafc" icon={Microscope} />
}