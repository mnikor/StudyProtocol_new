import React, { createContext, useState, useContext, ReactNode, useCallback } from "react"
import { Protocol } from "@/types"

export type Message = {
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

type ChatHistoryMap = {
  [protocolId: string]: Message[]
}

interface AIChatContextType {
  getMessages: (protocolId: string) => Message[]
  addMessage: (protocolId: string, message: Message) => void
  clearMessages: (protocolId: string) => void
}

const AIChatContext = createContext<AIChatContextType | undefined>(undefined)

export function AIChatProvider({ children }: { children: ReactNode }) {
  const [chatHistoryMap, setChatHistoryMap] = useState<ChatHistoryMap>({})

    // Safe version of getting messages that doesn't try to update state during render
  const getMessages = useCallback((protocolId: string): Message[] => {
    // If we already have messages for this protocol, return them
    if (chatHistoryMap[protocolId] && chatHistoryMap[protocolId].length > 0) {
      return chatHistoryMap[protocolId];
    }
    
    // For empty/undefined protocols, just return an empty array
    // The AI chat component should handle showing a welcome message
    return [];
  }, [chatHistoryMap])

  const addMessage = (protocolId: string, message: Message) => {
    setChatHistoryMap(prev => {
      // If this protocol doesn't have a history yet, initialize it
      const initialMessage: Message = {
        role: "assistant",
        content: "Hello! I'm your AI assistant for protocol development. How can I help you today?",
        timestamp: new Date(),
      }
      
      const currentMessages = prev[protocolId] || [initialMessage]
      
      return {
        ...prev,
        [protocolId]: [...currentMessages, message],
      }
    })
  }

  const clearMessages = (protocolId: string) => {
    setChatHistoryMap(prev => {
      const newMap = { ...prev }
      delete newMap[protocolId]
      return newMap
    })
  }

  return (
    <AIChatContext.Provider value={{ getMessages, addMessage, clearMessages }}>
      {children}
    </AIChatContext.Provider>
  )
}

export function useAIChat() {
  const context = useContext(AIChatContext)
  if (context === undefined) {
    throw new Error("useAIChat must be used within an AIChatProvider")
  }
  return context
}