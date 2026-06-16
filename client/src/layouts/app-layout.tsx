"use client"

import React from "react"
import { Link, useLocation } from "wouter"
import {
  Home,
  Search,
  BookOpen,
} from "lucide-react"

interface AppLayoutProps {
  children: React.ReactNode
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [location] = useLocation()
  
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <div className="w-16 md:w-64 bg-white border-r border-[#dee2e6] min-h-screen flex flex-col">
        {/* Logo */}
        <div className="px-4 py-6 border-b border-[#dee2e6] flex items-center">
          <div className="w-8 h-8 bg-[#228be6] rounded-md flex items-center justify-center text-white font-bold">E</div>
          <div className="hidden md:block ml-3 font-semibold text-lg">Evidence Copilot</div>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-1">
            <li>
              <Link href="/" className={`flex items-center px-3 py-2 text-sm rounded-md ${location === "/" ? "bg-[#f8f9fa] text-[#228be6] font-medium" : "hover:bg-[#f8f9fa]"}`}>
                <Home size={16} className={`mr-2 md:mr-3 ${location === "/" ? "text-[#228be6]" : ""}`} />
                <span className="hidden md:inline">Dashboard</span>
              </Link>
            </li>
            <li>
              <Link href="/search" className={`flex items-center px-3 py-2 text-sm rounded-md ${location === "/search" ? "bg-[#f8f9fa] text-[#228be6] font-medium" : "hover:bg-[#f8f9fa]"}`}>
                <Search size={16} className={`mr-2 md:mr-3 ${location === "/search" ? "text-[#228be6]" : ""}`} />
                <span className="hidden md:inline">Search</span>
              </Link>
            </li>
            <li>
              <Link href="/protocols" className={`flex items-center px-3 py-2 text-sm rounded-md ${location.startsWith("/protocol") ? "bg-[#f8f9fa] text-[#228be6] font-medium" : "hover:bg-[#f8f9fa]"}`}>
                <BookOpen size={16} className={`mr-2 md:mr-3 ${location.startsWith("/protocol") ? "text-[#228be6]" : ""}`} />
                <span className="hidden md:inline">Protocols</span>
              </Link>
            </li>
            {/* Removed Documents, Clipboard, Analytics, and AI Assistant menu items as requested */}
          </ul>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  )
}

export default AppLayout
