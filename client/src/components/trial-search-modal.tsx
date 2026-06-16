import React, { useState, useEffect } from "react"
import { 
  AlertCircle, 
  ChevronRight, 
  Loader2, 
  Search, 
  Filter, 
  Check 
} from "lucide-react"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

interface TrialSearchModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (trials: any[]) => void
  indication?: string
  phase?: string
  protocolId: string
}

export function TrialSearchModal({
  open,
  onOpenChange,
  onSelect,
  indication = "",
  phase = "",
  protocolId
}: TrialSearchModalProps) {
  const { toast } = useToast()
  
  // Search state
  const [searchTerms, setSearchTerms] = useState("")
  const [selectedPhase, setSelectedPhase] = useState<string>(phase || "any")
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedTrials, setSelectedTrials] = useState<any[]>([])
  
  // Settings and flags
  const [autoSearch, setAutoSearch] = useState(true)
  
  // Auto-populate search field with indication when modal opens
  useEffect(() => {
    if (open && indication && autoSearch) {
      setSearchTerms(indication)
      handleSearch(indication, selectedPhase)
      setAutoSearch(false) // Only auto-search once
    }
  }, [open, indication, autoSearch, selectedPhase])
  
  // Handle searching clinical trials
  const handleSearch = async (terms = searchTerms, phaseFilter = selectedPhase) => {
    if (!terms.trim()) {
      toast({
        title: "Search terms required",
        description: "Please enter a disease or indication to search for.",
        variant: "destructive"
      })
      return
    }
    
    setIsSearching(true)
    setSearchResults([])
    
    try {
      const response = await fetch('/api/search-clinical-trials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          indication: terms,
          phase: phaseFilter === "any" ? "" : phaseFilter,
          additionalTerms: "",
          maxResults: 50
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to search clinical trials')
      }
      
      const data = await response.json()
      console.log('Search results:', data)
      setSearchResults(data.trials || [])
      
      // Show message if no results
      if (!data.trials || data.trials.length === 0) {
        toast({
          title: "No trials found",
          description: `No clinical trials found for "${terms}". Try broader search terms.`,
        })
      }
    } catch (error) {
      console.error('Error searching clinical trials:', error)
      toast({
        title: "Search Failed",
        description: "Failed to search clinical trials. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSearching(false)
    }
  }
  
  // Handle selection of a trial
  const toggleTrialSelection = (trial: any) => {
    setSelectedTrials(prev => {
      // Check if this trial is already selected
      const isSelected = prev.some(t => t.nctId === trial.nctId)
      
      if (isSelected) {
        // Remove it from selected trials
        return prev.filter(t => t.nctId !== trial.nctId)
      } else {
        // Add it to selected trials (limit to 5)
        if (prev.length >= 5) {
          toast({
            title: "Selection Limit Reached",
            description: "You can select up to 5 trials for comparison.",
          })
          return prev
        }
        return [...prev, trial]
      }
    })
  }
  
  // Handle final selection confirm
  const handleConfirmSelection = () => {
    if (selectedTrials.length === 0) {
      toast({
        title: "No Trials Selected",
        description: "Please select at least one trial to compare.",
      })
      return
    }
    
    onSelect(selectedTrials)
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Compare with Similar Trials</DialogTitle>
          <DialogDescription>
            Search for similar clinical trials to compare criteria with your protocol
          </DialogDescription>
        </DialogHeader>
        
        {/* Search Controls */}
        <div className="flex gap-2 my-4">
          <div className="flex-1 relative">
            <Input
              placeholder="Search by disease or condition..."
              value={searchTerms}
              onChange={(e) => setSearchTerms(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pr-10"
            />
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute right-1 top-1 h-8 w-8" 
              onClick={() => handleSearch()}
            >
              <Search size={16} />
            </Button>
          </div>
          
          <Select value={selectedPhase} onValueChange={setSelectedPhase}>
            <SelectTrigger className="w-[180px]">
              <div className="flex items-center gap-2">
                <Filter size={14} />
                <SelectValue placeholder="Select phase" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any Phase</SelectItem>
              <SelectItem value="Phase 1">Phase 1</SelectItem>
              <SelectItem value="Phase 2">Phase 2</SelectItem>
              <SelectItem value="Phase 3">Phase 3</SelectItem>
              <SelectItem value="Phase 4">Phase 4</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" onClick={() => handleSearch()}>
            Search
          </Button>
        </div>
        
        {/* Results */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="text-sm text-muted-foreground mb-2">
            {selectedTrials.length > 0 ? 
              `${selectedTrials.length} trials selected` : 
              "Select up to 5 trials to compare with your protocol"
            }
          </div>
          
          <div className="flex-1 overflow-y-auto border rounded-md">
            {isSearching ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-primary mb-2" />
                <p className="text-sm text-muted-foreground">Searching clinical trials...</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search size={24} className="text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground max-w-md">
                  Search for clinical trials to compare with your protocol.
                  {indication ? ` We recommend searching for "${indication}".` : ""}
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {searchResults.map((trial) => {
                  const isSelected = selectedTrials.some(t => t.nctId === trial.nctId)
                  
                  return (
                    <li 
                      key={trial.nctId}
                      className={`p-3 hover:bg-muted/30 transition-colors cursor-pointer ${
                        isSelected ? "bg-primary/10" : ""
                      }`}
                      onClick={() => toggleTrialSelection(trial)}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isSelected ? "bg-primary text-primary-foreground" : "border border-input"
                        }`}>
                          {isSelected && <Check size={12} />}
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <h4 className="text-sm font-medium">
                              {trial.briefTitle || "Untitled Trial"}
                            </h4>
                            <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                              {trial.phase || "Unknown Phase"}
                            </span>
                          </div>
                          
                          <p className="text-xs mt-1 text-muted-foreground line-clamp-2">
                            {trial.briefSummary || "No summary available"}
                          </p>
                          
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <span className="bg-muted px-1.5 py-0.5 rounded">
                              {trial.nctId}
                            </span>
                            <span className="flex items-center">
                              <span className="font-medium mr-1">Status:</span> 
                              {trial.overallStatus || "Unknown"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirmSelection} disabled={selectedTrials.length === 0}>
            {selectedTrials.length > 0 ? `Compare ${selectedTrials.length} Trials` : "Compare"} 
            <ChevronRight size={16} className="ml-1" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}