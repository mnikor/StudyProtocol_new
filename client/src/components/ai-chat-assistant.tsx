"use client"

import React, { useState, useRef, useEffect } from "react"
import { Bot, X, Lightbulb, AlertTriangle, CheckCircle, Zap, Send, Loader2, Maximize2, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useMutation } from "@tanstack/react-query"
import { apiRequest } from "@/lib/queryClient"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Protocol } from "@/types"
import { useAIChat, Message } from "@/contexts/ai-chat-context"
import ReactMarkdown from "react-markdown"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"

interface AIChatAssistantProps {
  isOpen: boolean
  onClose: () => void
  protocol?: Protocol
}

export const AIChatAssistant: React.FC<AIChatAssistantProps> = ({ isOpen, onClose, protocol }) => {
  const [userInput, setUserInput] = useState("")
  const [isExpanded, setIsExpanded] = useState(false)
  const messagesEndRef = useRef<null | HTMLDivElement>(null)
  const { toast } = useToast()
  const { getMessages, addMessage } = useAIChat()
  
  // Get messages for the current protocol
  const protocolId = protocol?.id || "unknown"
  
  // Use useMemo to avoid triggering the React Hook Form warning
  const messages = React.useMemo(() => {
    const retrievedMessages = getMessages(protocolId);
    
    // If no messages at all, create a welcome message
    if (retrievedMessages.length === 0) {
      return [{
        role: "assistant",
        content: "Hello! I'm your AI assistant for protocol development. How can I help you today?",
        timestamp: new Date()
      }];
    }
    
    return retrievedMessages;
  }, [getMessages, protocolId])
  
  // Toggle expand/collapse
  const toggleExpand = () => {
    setIsExpanded(!isExpanded)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }
  
  // Scroll to bottom when messages change or when component opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(scrollToBottom, 100)
    }
  }, [isOpen, messages.length])

  const assistantMutation = useMutation({
    mutationFn: async (query: string) => {
      if (!protocol) {
        throw new Error("No protocol data available")
      }
      
      // Create a simplified protocol object to send to the server
      const simplifiedProtocol = {
        id: protocol.id,
        title: protocol.title,
        phase: protocol.phase,
        indication: protocol.indication,
        status: protocol.status,
        synopsis: protocol.synopsis || "No synopsis available"
      }
      
      console.log("Simplified protocol:", simplifiedProtocol.id, simplifiedProtocol.title)
      
      // Create a simple context string with recent messages
      const recentContext = messages.length 
        ? messages.slice(-5).map(m => `${m.role}: ${m.content}`).join("\n") 
        : "No previous context"
      
      // Go directly to the server with a simpler approach
      try {
        // Create a very explicit request with simple data types
        const requestData = {
          query: query.trim(),
          protocol: {
            id: simplifiedProtocol.id,
            title: simplifiedProtocol.title,
            type: protocol.protocolType || "unknown"
          },
          context: recentContext
        }
        
        console.log("Sending request with data:", JSON.stringify(requestData).substring(0, 100) + "...")
        
        // Make a direct fetch request with minimal data
        const response = await fetch("/api/assistant-response", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestData)
        })
        
        if (!response.ok) {
          throw new Error(`Server error: ${response.status} ${response.statusText}`)
        }
        
        // Get the raw text response
        const responseText = await response.text()
        console.log("Raw server response:", responseText.substring(0, 100) + "...")
        
        // Handle empty responses
        if (!responseText || responseText.trim() === "") {
          console.error("Empty response received from server")
          return { 
            response: "I apologize, but I received an empty response from the server. Please try again with a different question." 
          }
        }
        
        // Try to parse as JSON
        try {
          const jsonData = JSON.parse(responseText)
          console.log("Parsed JSON data:", Object.keys(jsonData))
          
          // Verify we have a response field with content
          if (jsonData && jsonData.response && typeof jsonData.response === "string") {
            return jsonData
          } else {
            console.error("Invalid JSON structure, missing response field")
            return { 
              response: "The server response was in an unexpected format. Please try again." 
            }
          }
        } catch (jsonError) {
          // If not JSON, use the raw text as response
          console.error("Failed to parse response as JSON:", jsonError)
          return { response: responseText }
        }
      } catch (error) {
        console.error("Error in assistant mutation:", error)
        throw error
      }
    },
    onSuccess: (data: any) => {
      console.log("Assistant response received successfully");
      
      // Extract the response text from the data object
      let responseText = "";
      
      // Handle the simplified response format from our endpoint
      if (data && typeof data === 'object' && typeof data.response === 'string') {
        responseText = data.response;
        console.log("Valid response extracted:", responseText.substring(0, 50) + "...");
      } else {
        console.error("Unexpected response format:", typeof data, data);
        responseText = "I had trouble understanding the server's response. Please try again with a different question.";
      }
      
      // Add the assistant's response to the chat history
      addMessage(protocolId, {
        role: "assistant",
        content: responseText,
        timestamp: new Date(),
      });
      
      // Scroll to the bottom of the chat to show the new message
      setTimeout(scrollToBottom, 100);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to get assistant response: ${error.message}`,
        variant: "destructive",
      })
      
      // Add error message to the context
      addMessage(protocolId, {
        role: "assistant",
        content: "I'm sorry, I encountered an error processing your request. Please try again.",
        timestamp: new Date(),
      })
    },
  })

  const handleSendMessage = () => {
    if (!userInput.trim()) return
    
    console.log("Sending message to assistant:", userInput)
    
    // Add user message to the context
    addMessage(protocolId, {
      role: "user",
      content: userInput,
      timestamp: new Date(),
    })
    
    // Create a fallback response in case the server takes too long
    const fallbackTimer = setTimeout(() => {
      if (assistantMutation.isPending) {
        console.log("Adding fallback response due to timeout")
        addMessage(protocolId, {
          role: "assistant",
          content: "I'm still processing your request. If this takes too long, please try a shorter query.",
          timestamp: new Date(),
        })
      }
    }, 10000) // 10 second timeout
    
    // Send to API
    assistantMutation.mutate(userInput)
    
    // Clear input
    setUserInput("")
    
    // Clear fallback timer when component unmounts
    return () => clearTimeout(fallbackTimer)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  if (!isOpen) return null

  // Determine size classes based on expanded state
  const sizeClasses = isExpanded 
    ? "w-[600px] h-[80vh]" 
    : "w-[400px] h-[70vh]";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pt-16 pr-6 pointer-events-none">
      <div 
        className={`${sizeClasses} bg-white rounded-md border border-[#dee2e6] shadow-lg 
                    flex flex-col pointer-events-auto transition-all duration-300 resize-chat`}
      >
        {/* Header */}
        <div className="p-3 border-b border-[#dee2e6] flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-[#228be6]" />
            <h3 className="font-medium">AI Assistant</h3>
          </div>
          <div className="flex items-center">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700" 
              onClick={toggleExpand}
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 w-8 p-0" 
              onClick={onClose}
            >
              <X size={16} />
            </Button>
          </div>
        </div>

        {/* Message area - scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <div 
              key={index} 
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div 
                className={`max-w-[85%] p-3 rounded-lg ${
                  message.role === "user" 
                    ? "bg-[#228be6] text-white" 
                    : "bg-[#e7f5ff] text-gray-800"
                }`}
              >
                {message.role === "user" ? (
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                ) : (
                  <div className="markdown-content text-sm prose-sm prose-headings:font-semibold prose-headings:mt-2 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                    <ReactMarkdown>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                )}
                <div className={`text-xs mt-1 ${message.role === "user" ? "text-blue-100" : "text-gray-500"}`}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          
          {assistantMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-[#e7f5ff] p-3 rounded-lg flex items-center space-x-2">
                <Loader2 size={16} className="animate-spin text-[#228be6]" />
                <span className="text-sm text-gray-600">AI Assistant is thinking...</span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
          
        {/* Quick actions */}
        <div className="p-3 border-t border-[#dee2e6]">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Zap size={16} className="text-[#228be6]" />
            Quick Prompts
          </h4>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Button 
              size="sm" 
              variant="outline" 
              className="justify-start text-xs" 
              onClick={() => setUserInput("How can I improve my inclusion criteria?")}
            >
              Improve inclusion criteria
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="justify-start text-xs"
              onClick={() => setUserInput("What assessments am I missing?")}
            >
              Missing assessments
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="justify-start text-xs"
              onClick={() => setUserInput("Help with statistical considerations")}
            >
              Statistical help
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="justify-start text-xs"
              onClick={() => setUserInput("Regulatory compliance tips")}
            >
              Regulatory compliance
            </Button>
          </div>
        </div>
        
        {/* Input area */}
        <div className="p-3 border-t border-[#dee2e6]">
          <div className="flex space-x-2">
            <Textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your question here..."
              className="min-h-[60px] resize-none flex-1"
            />
            <Button 
              onClick={handleSendMessage} 
              disabled={assistantMutation.isPending || !userInput.trim()} 
              className="h-auto"
            >
              {assistantMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}