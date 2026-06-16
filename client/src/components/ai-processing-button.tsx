"use client"

import { useState } from "react"
import { Bot, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AIProcessingButtonProps {
  onProcess: () => Promise<void>
  disabled?: boolean
}

export function AIProcessingButton({ onProcess, disabled = false }: AIProcessingButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false)

  const handleProcess = async () => {
    setIsProcessing(true)
    try {
      await onProcess()
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Button
      onClick={handleProcess}
      disabled={isProcessing || disabled}
      className="bg-[#228be6] hover:bg-[#1864ab] w-full"
    >
      {isProcessing ? (
        <>
          <Loader2 size={16} className="mr-2 animate-spin" />
          Processing with AI...
        </>
      ) : (
        <>
          <Bot size={16} className="mr-2" />
          Generate All Protocol Sections
        </>
      )}
    </Button>
  )
}
