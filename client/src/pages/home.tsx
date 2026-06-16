"use client"

import React, { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useLocation } from "wouter"
import {
  Search,
  Plus,
  FileText,
  Clock,
  User,
  ChevronRight,
  FilterX
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { safeSetLocalStorageItem } from "@/lib/browser-storage-recovery"

// Define protocol interface for better type checking
interface ProtocolListItem {
  id: string;
  title: string;
  phase: string;
  indication: string;
  status: string;
  lastEdited: string;
  createdBy: string;
  protocolType?: string;
}

const HomePage: React.FC = () => {
  const [, setLocation] = useLocation()
  
  // Fetch protocols
  const { data: protocols = [], isLoading, refetch } = useQuery<ProtocolListItem[]>({
    queryKey: ['/api/protocols'],
    queryFn: async ({ queryKey }) => {
      const endpoint = '/api/protocols';
      const response = await fetch(endpoint)
      if (!response.ok) {
        throw new Error("Failed to fetch protocols")
      }
      return response.json() as Promise<ProtocolListItem[]>
    },
    staleTime: 5000, // Refresh after 5 seconds to ensure newly created protocols appear
    refetchOnWindowFocus: true
  })
  
  // State for filtering
  const [searchQuery, setSearchQuery] = useState("")
  const [filterPhase, setFilterPhase] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterType, setFilterType] = useState<string>("all")
  
  // State for new protocol dialog
  const [showNewProtocolDialog, setShowNewProtocolDialog] = useState(false)
  const [newProtocolData, setNewProtocolData] = useState({
    title: "",
    phase: "Phase 2",
    indication: "",
    synopsis: "",
    protocolType: "interventional_clinical_trial"
  })
  
  // State for protocol management - removed AI generation state

  const locallyCachedProtocols = useMemo(() => {
    if (typeof window === "undefined") return [] as ProtocolListItem[];

    const cached: ProtocolListItem[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("protocol_")) continue;

      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "{}");
        if (!parsed?.id || !parsed?.title) continue;

        cached.push({
          id: parsed.id,
          title: parsed.title,
          phase: parsed.phase || "N/A",
          indication: parsed.indication || "Not specified",
          status: parsed.status || "Draft",
          lastEdited: parsed.lastEdited || parsed.createdAt || new Date().toISOString(),
          createdBy: parsed.createdBy || "Current User",
          protocolType: parsed.protocolType
        });
      } catch (error) {
        console.warn("Failed to read cached protocol", key, error);
      }
    }

    return cached;
  }, [protocols.length]);

  const visibleProtocols = useMemo(() => {
    const byId = new Map<string, ProtocolListItem>();
    for (const protocol of locallyCachedProtocols) {
      byId.set(protocol.id, protocol);
    }
    for (const protocol of protocols) {
      byId.set(protocol.id, protocol);
    }
    return Array.from(byId.values()).sort((a, b) => {
      return new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime();
    });
  }, [locallyCachedProtocols, protocols]);
  
  // Filter protocols based on search and filters
  const filteredProtocols = visibleProtocols.filter((protocol: ProtocolListItem) => {
    // Filter by search query
    if (
      searchQuery && 
      !protocol.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !protocol.id.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false
    }
    
    // Filter by phase
    if (filterPhase !== "all" && protocol.phase !== filterPhase) {
      return false
    }
    
    // Filter by status
    if (filterStatus !== "all" && protocol.status !== filterStatus) {
      return false
    }
    
    // Filter by protocol type
    if (filterType !== "all" && protocol.protocolType !== filterType) {
      return false
    }
    
    return true
  })
  
  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) {
      return "Unknown"
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date)
  }
  
  // Handle create new protocol
  const handleCreateProtocol = async () => {
    if (!newProtocolData.title.trim()) return
    
    try {
      // Generate a random ID for the new protocol
      const newId = `EV-${Math.floor(Math.random() * 10000)}`
      
      // Create protocol data object
      const protocolData = {
        id: newId,
        title: newProtocolData.title,
        phase: !newProtocolData.protocolType.includes("interventional") ? "N/A" : newProtocolData.phase,
        indication: newProtocolData.indication || "Not specified",
        status: "Draft",
        synopsis: newProtocolData.synopsis || "",
        protocolType: newProtocolData.protocolType,
        supplementaryInfo: "[]",
        tableData: "{}",
        tableHeaders: "[]",
        inclusionCriteria: "[]",
        exclusionCriteria: "[]",
        dataVariables: "[]",
        generatedProtocol: null,
        userId: 1,
        createdBy: "Current User"
      }

      safeSetLocalStorageItem(`protocol_${newId}`, JSON.stringify({
        ...protocolData,
        createdAt: new Date().toISOString(),
        lastEdited: new Date().toISOString()
      }));
      
      // Create protocol via API
      const response = await fetch('/api/protocols', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(protocolData)
      })
      
      if (!response.ok) {
        throw new Error('Failed to create protocol')
      }
      
      // Clear form and close dialog
      setNewProtocolData({
        title: "",
        phase: "Phase 2",
        indication: "",
        synopsis: "",
        protocolType: "interventional_clinical_trial"
      })
      setShowNewProtocolDialog(false)
      
      // Refetch protocols to update the list
      refetch()
      
      // Navigate to the new protocol
      const createdProtocol = await response.json()
      setLocation(`/protocol/${createdProtocol.id}`)
    } catch (error) {
      console.error('Error creating protocol:', error)
      alert('Failed to create protocol. Please try again.')
    }
  }
  
  // Handler for AI functionality has been removed
  
  // Get status badge styling
  const getStatusBadge = (status: string) => {
    switch(status) {
      case "Draft":
        return "bg-[#e7f5ff] text-[#1864ab]"
      case "Review":
        return "bg-[#fff3bf] text-[#e67700]"
      case "Final":
        return "bg-[#d3f9d8] text-[#2b8a3e]"
      default:
        return "bg-[#f1f3f5] text-[#495057]"
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-white p-4 border-b border-[#dee2e6] flex justify-between items-center">
        <h1 className="text-xl font-semibold">Protocol Management</h1>
        <div className="flex items-center">
          <Button
            className="text-sm bg-[#228be6] hover:bg-[#1864ab] text-white"
            onClick={() => setShowNewProtocolDialog(true)}
          >
            <Plus size={16} className="mr-1.5" />
            New Protocol
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6">
        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#adb5bd]" size={16} />
            <Input
              placeholder="Search protocols..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <Select
            value={filterPhase}
            onValueChange={setFilterPhase}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="All Phases" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Phases</SelectItem>
              <SelectItem value="Phase 1">Phase 1</SelectItem>
              <SelectItem value="Phase 2">Phase 2</SelectItem>
              <SelectItem value="Phase 3">Phase 3</SelectItem>
              <SelectItem value="Phase 4">Phase 4</SelectItem>
            </SelectContent>
          </Select>
          
          <Select
            value={filterStatus}
            onValueChange={setFilterStatus}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Review">Review</SelectItem>
              <SelectItem value="Final">Final</SelectItem>
            </SelectContent>
          </Select>
          
          <Select
            value={filterType}
            onValueChange={setFilterType}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Protocol Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Protocol Types</SelectItem>
              <SelectItem value="interventional_clinical_trial">Interventional Trial</SelectItem>
              <SelectItem value="prospective_cohort_study">Prospective Cohort</SelectItem>
              <SelectItem value="retrospective_cohort_study">Retrospective Cohort</SelectItem>
              <SelectItem value="secondary_data_analysis">Secondary Data/RWE</SelectItem>
              <SelectItem value="delphi_consensus">Delphi Consensus</SelectItem>
              <SelectItem value="cross_sectional_survey">Cross-Sectional Survey</SelectItem>
              <SelectItem value="qualitative_study">Qualitative Study</SelectItem>
              <SelectItem value="mixed_methods">Mixed Methods</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setSearchQuery("")
              setFilterPhase("all")
              setFilterStatus("all")
              setFilterType("all")
            }}
            className="h-10 w-10"
          >
            <FilterX size={16} />
          </Button>
        </div>
        
        {/* Protocols List */}
        <div className="bg-white rounded-md border border-[#dee2e6] overflow-hidden">
          <div className="p-3 border-b border-[#dee2e6] bg-[#f8f9fa] flex items-center">
            <h2 className="font-medium">Protocols</h2>
          </div>
          
          {filteredProtocols.length > 0 ? (
            <div>
              {filteredProtocols.map((protocol: ProtocolListItem) => (
                <div 
                  key={protocol.id} 
                  className="border-b border-[#dee2e6] p-4 hover:bg-[#f8f9fa] cursor-pointer"
                  onClick={() => setLocation(`/protocol/${protocol.id}`)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-[#228be6]">{protocol.title}</h3>
                      <div className="text-sm text-[#6c757d] mt-1">
                        <span>{protocol.id}</span>
                        <span className="mx-2">•</span>
                        <span>{protocol.indication}</span>
                        <span className="mx-2">•</span>
                        <span>{protocol.phase}</span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(protocol.status)}`}>
                      {protocol.status}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-8 mt-3 text-xs text-[#868e96]">
                    <div className="flex items-center gap-1.5">
                      <Clock size={14} />
                      <span>Last updated: {formatDate(protocol.lastEdited)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <User size={14} />
                      <span>Created by: {protocol.createdBy}</span>
                    </div>
                    <div className="flex-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs hover:text-[#228be6]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocation(`/protocol/${protocol.id}`);
                        }}
                      >
                        View Protocol
                        <ChevronRight size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <FileText size={40} className="mx-auto mb-3 text-[#adb5bd]" />
              <h3 className="text-lg font-medium mb-1">No protocols found</h3>
              <p className="text-sm text-[#868e96] mb-4">
                {searchQuery || filterPhase !== "all" || filterStatus !== "all"
                  ? "No protocols match your search criteria. Try adjusting your filters."
                  : "You don't have any protocols yet. Create a new one to get started."}
              </p>
              <Button
                onClick={() => setShowNewProtocolDialog(true)}
                className="bg-[#228be6] hover:bg-[#1864ab]"
              >
                <Plus size={16} className="mr-1.5" />
                Create Protocol
              </Button>
            </div>
          )}
        </div>
      </main>
      
      {/* New Protocol Dialog */}
      <Dialog open={showNewProtocolDialog} onOpenChange={setShowNewProtocolDialog}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Create New Protocol</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right text-sm">Protocol Title</label>
              <Input
                className="col-span-3"
                value={newProtocolData.title}
                onChange={(e) => setNewProtocolData({ ...newProtocolData, title: e.target.value })}
                placeholder="Enter protocol title"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right text-sm">Protocol Type</label>
              <div className="col-span-3">
                <Select
                  value={newProtocolData.protocolType}
                  onValueChange={(value) => setNewProtocolData({ ...newProtocolData, protocolType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interventional_clinical_trial">Interventional Clinical Trial</SelectItem>
                    <SelectItem value="prospective_cohort_study">Observational Prospective Cohort</SelectItem>
                    <SelectItem value="retrospective_cohort_study">Retrospective Cohort Study</SelectItem>
                    <SelectItem value="secondary_data_analysis">Secondary Data Analysis/RWE</SelectItem>
                    <SelectItem value="delphi_consensus">Delphi Consensus Study</SelectItem>
                    <SelectItem value="cross_sectional_survey">Cross-Sectional Survey</SelectItem>
                    <SelectItem value="qualitative_study">Qualitative Study</SelectItem>
                    <SelectItem value="mixed_methods">Mixed Methods Study</SelectItem>
                    <SelectItem value="maic">Matching-Adjusted Indirect Comparison (MAIC)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right text-sm">Phase</label>
              <div className="col-span-3">
                <Select
                  value={newProtocolData.phase}
                  onValueChange={(value) => setNewProtocolData({ ...newProtocolData, phase: value })}
                  disabled={!newProtocolData.protocolType.includes("interventional")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Phase 1">Phase 1</SelectItem>
                    <SelectItem value="Phase 2">Phase 2</SelectItem>
                    <SelectItem value="Phase 3">Phase 3</SelectItem>
                    <SelectItem value="Phase 4">Phase 4</SelectItem>
                    <SelectItem value="N/A">N/A</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right text-sm">Indication</label>
              <Input
                className="col-span-3"
                value={newProtocolData.indication}
                onChange={(e) => setNewProtocolData({ ...newProtocolData, indication: e.target.value })}
                placeholder="E.g., Lung Cancer, Diabetes"
              />
            </div>
            
            <div className="grid grid-cols-4 items-start gap-4">
              <label className="text-right text-sm pt-2">Synopsis</label>
              <Textarea
                className="col-span-3 min-h-[100px]"
                value={newProtocolData.synopsis}
                onChange={(e) => setNewProtocolData({ ...newProtocolData, synopsis: e.target.value })}
                placeholder="Brief description of the protocol"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewProtocolDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateProtocol} 
              disabled={!newProtocolData.title.trim() || !newProtocolData.indication.trim()} 
              className="bg-[#228be6] hover:bg-[#1864ab]"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* AI generation dialog removed */}
    </div>
  )
}

export default HomePage
