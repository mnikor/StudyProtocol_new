import { useState, useEffect } from "react"
import { Filter, Search, Loader2, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/use-toast"

interface CompareTrialsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompare: (selectedTrials: any[], comparisonType: string) => void
  protocol: any
}

const phaseLabelMap: Record<string, string> = {
  EARLY_PHASE1: "Early Phase 1",
  PHASE1: "Phase 1",
  PHASE2: "Phase 2",
  PHASE3: "Phase 3",
  PHASE4: "Phase 4",
  PHASE1_PHASE2: "Phase 1/Phase 2",
  PHASE2_PHASE3: "Phase 2/Phase 3",
  PHASE3_PHASE4: "Phase 3/Phase 4",
  NA: "N/A",
}

const statusLabelMap: Record<string, string> = {
  RECRUITING: "Recruiting",
  ACTIVE_NOT_RECRUITING: "Active, not recruiting",
  COMPLETED: "Completed",
  NOT_YET_RECRUITING: "Not yet recruiting",
  TERMINATED: "Terminated",
  SUSPENDED: "Suspended",
  WITHDRAWN: "Withdrawn",
  UNKNOWN: "Unknown status",
  ENROLLING_BY_INVITATION: "Enrolling by invitation",
}

function formatPhase(value: any): string {
  if (Array.isArray(value)) {
    return value.map(formatPhase).filter(Boolean).join(", ") || "Not specified"
  }
  const phase = String(value || "").trim()
  return phaseLabelMap[phase] || phase || "Not specified"
}

function formatStatus(value: any): string {
  const status = String(value || "").trim()
  return statusLabelMap[status] || status || "Unknown status"
}

function isUsefulSearchTerm(value: any): boolean {
  const normalized = String(value || "").trim().toLowerCase()
  return Boolean(normalized) && !["unknown", "not specified", "n/a", "na", "none", "null"].includes(normalized)
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text()
  try {
    const parsed = JSON.parse(text)
    return parsed?.message || parsed?.error || text
  } catch {
    return text
  }
}

export function CompareTrialsModal({ open, onOpenChange, onCompare, protocol }: CompareTrialsModalProps) {
  const { toast } = useToast()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTrials, setSelectedTrials] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [filters, setFilters] = useState({
    phase: {
      "Phase 1": false,
      "Phase 2": false,
      "Phase 3": true,
    },
    status: {
      Completed: false,
      "Active, not recruiting": false,
      Recruiting: false,
    },
    timeframe: "last5years",
    minSimilarity: 75,
  })
  const [comparisonType, setComparisonType] = useState("automatic")
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchProfile, setSearchProfile] = useState<{
    indication?: string
    phase?: string
    additionalTerms?: string
  } | null>(null)

  // When the modal opens, perform an automatic search based on the protocol
  useEffect(() => {
    if (open && protocol) {
      // Attempt automatic search when modal opens
      handleAutomaticSearch();
    } else {
      // Reset state when modal closes
      setSearchResults([]);
      setSelectedTrials([]);
      setSearchError(null);
      setSearchProfile(null);
    }
  }, [open, protocol]);
  
  // Perform initial manual search if indication is available in the protocol
  useEffect(() => {
    if (comparisonType === "manual" && open && isUsefulSearchTerm(protocol?.indication)) {
      setSearchQuery(protocol.indication);
      setTimeout(() => {
        handleManualSearch();
      }, 500);
    }
  }, [comparisonType, open, protocol?.indication]);

  // Automatic search based on protocol data
  const handleAutomaticSearch = async () => {
    if (!protocol) {
      setSearchError("No protocol data available for search");
      toast({
        title: "Search Error",
        description: "No protocol data available for search. Please create a protocol first.",
        variant: "destructive",
      });
      return;
    }
    
    setIsSearching(true);
    setSearchError(null);
    setSearchProfile(null);
    
    try {
      console.log("Starting automatic search with protocol:", protocol);
      
      // Extract selected phases and statuses from filters
      const selectedPhases = Object.entries(filters.phase)
        .filter(([_, selected]) => selected)
        .map(([phase, _]) => phase);
      
      const selectedStatuses = Object.entries(filters.status)
        .filter(([_, selected]) => selected)
        .map(([status, _]) => status);
      
      // Prepare status filter object in expected format
      const statusFilter: { [key: string]: boolean } = {};
      selectedStatuses.forEach(status => {
        statusFilter[status] = true;
      });
      
      // For debugging - always show what we're searching for
      toast({
        title: "Searching similar trials",
        description: "Analyzing the protocol disease, population, intervention, and design.",
        duration: 3000,
      });
      
      // Automatic mode uses backend AI extraction and semantic ranking from the full protocol.
      const response = await fetch('/api/search-clinical-trials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          protocolId: protocol.id,
          phase: selectedPhases.length > 0 ? selectedPhases.join(", ") : undefined,
          title: protocol.title,
          synopsis: protocol.synopsis,
          inclusionCriteria: protocol.inclusionCriteria,
          exclusionCriteria: protocol.exclusionCriteria,
          filters: {
            status: statusFilter,
            timeframe: filters.timeframe
          },
          maxResults: 20,
        }),
      });
      
      if (!response.ok) {
        const errorText = await readErrorMessage(response);
        console.error("API Error:", errorText);
        throw new Error(errorText || "Failed to search for similar trials");
      }
      
      const data = await response.json();
      console.log("Search API response:", data);
      setSearchProfile(data.searchParams || null);
      
      // Check if response has the expected structure
      if (!data.trials || !Array.isArray(data.trials)) {
        throw new Error("Invalid response format from search API");
      }
      
      // Process the search results
      if (data.trials.length === 0) {
        setSearchError("No similar trials found. Try adjusting your search criteria.");
        toast({
          title: "No Results",
          description: "No trials found. Try different search terms.",
          variant: "destructive",
        });
        setSearchResults([]);
        return;
      }
      
      // Map API response to our expected format - without using random similarity
      const processedResults = data.trials.map((trial: any, index: number) => ({
        id: trial.nctId,
        nctId: trial.nctId,
        title: trial.title || "Untitled Trial",
        phase: formatPhase(trial.phases || trial.phase),
        status: formatStatus(trial.status),
        indication: Array.isArray(trial.conditions) 
          ? trial.conditions.join(", ") 
          : "Not specified",
        similarity: typeof trial.similarity === "number"
          ? trial.similarity
          : Math.max(50, 100 - index * 5),
        matchRationale: trial.matchRationale,
        sponsor: Array.isArray(trial.sponsors) && trial.sponsors.length > 0
          ? trial.sponsors[0].name
          : "Not specified"
      }));
      
      setSearchResults(processedResults);
    } catch (error: any) {
      console.error('Error searching for trials:', error);
      setSearchError(error.message || "Failed to search for similar trials");
      setSearchResults([]);
      
      toast({
        title: "Search Failed",
        description: error.message || "Failed to search for similar trials. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Manual search - allows searching for any indication/disease
  const handleManualSearch = async () => {
    if (!isUsefulSearchTerm(searchQuery)) {
      setSearchError("Please enter a search term");
      toast({
        title: "Search Error",
        description: "Please enter a disease or condition to search for.",
        variant: "destructive",
      });
      return;
    }
    
    setIsSearching(true);
    setSearchError(null);
    setSearchProfile(null);
    
    try {
      // For debugging - always show what we're searching for
      toast({
        title: "Searching trials",
        description: `Searching for: "${searchQuery}"`,
        duration: 3000,
      });
      
      // Extract selected phases and statuses
      const selectedPhases = Object.entries(filters.phase)
        .filter(([_, selected]) => selected)
        .map(([phase, _]) => phase);
      
      const selectedStatuses = Object.entries(filters.status)
        .filter(([_, selected]) => selected)
        .map(([status, _]) => status);
      
      // Prepare status filter object in expected format
      const statusFilter: { [key: string]: boolean } = {};
      selectedStatuses.forEach(status => {
        statusFilter[status] = true;
      });
      
      // Call the API to search for trials with the user's query and selected filters
      const response = await fetch('/api/search-clinical-trials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          indication: searchQuery,
          // Only include phase filter if selected in filters
          phase: selectedPhases.length > 0 ? selectedPhases.join(", ") : undefined,
          // Include the complete filters object
          filters: {
            status: statusFilter,
            timeframe: filters.timeframe
          }
        }),
      });
      
      if (!response.ok) {
        const errorText = await readErrorMessage(response);
        console.error("API Error:", errorText);
        throw new Error(errorText || "Search failed");
      }
      
      const data = await response.json();
      console.log("Manual search API response:", data);
      setSearchProfile(data.searchParams || null);
      
      // Check if response has the expected structure
      if (!data.trials || !Array.isArray(data.trials)) {
        throw new Error("Invalid response format from search API");
      }
      
      // Process the search results
      if (data.trials.length === 0) {
        setSearchError("No trials found matching your search. Try different keywords.");
        toast({
          title: "No Results",
          description: "No trials found. Try different search terms or broaden your search.",
          variant: "destructive",
        });
        setSearchResults([]);
        return;
      }
      
      // Map API response to our expected format (without random similarity scores)
      const processedResults = data.trials.map((trial: any) => ({
        id: trial.nctId,
        nctId: trial.nctId,
        title: trial.title || "Untitled Trial",
        phase: formatPhase(trial.phases || trial.phase),
        status: formatStatus(trial.status),
        indication: Array.isArray(trial.conditions) 
          ? trial.conditions.join(", ") 
          : "Not specified",
        similarity: typeof trial.similarity === "number" ? trial.similarity : undefined,
        matchRationale: trial.matchRationale,
        sponsor: Array.isArray(trial.sponsors) && trial.sponsors.length > 0
          ? trial.sponsors[0].name
          : "Not specified"
      }));
      
      setSearchResults(processedResults);
    } catch (error: any) {
      console.error('Error searching for trials:', error);
      setSearchError(error.message || "Failed to search for trials");
      setSearchResults([]);
      
      toast({
        title: "Search Failed",
        description: error.message || "Failed to search for trials. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const filteredTrials = searchResults.filter((trial) => {
    // Apply phase filter if any phase is selected
    const anyPhaseSelected = Object.values(filters.phase).some((value) => value);
    if (anyPhaseSelected) {
      const matchesPhase = Object.entries(filters.phase).some(([phase, isSelected]) => {
        return isSelected && trial.phase.includes(phase);
      });
      
      if (!matchesPhase) {
        return false;
      }
    }

    // Apply status filter if any status is selected
    const anyStatusSelected = Object.values(filters.status).some((value) => value);
    if (anyStatusSelected) {
      const matchesStatus = Object.entries(filters.status).some(([status, isSelected]) => {
        return isSelected && trial.status === status;
      });
      
      if (!matchesStatus) {
        return false;
      }
    }

    // Apply relevance/similarity threshold if the property exists
    if (typeof trial.similarity === "number" && trial.similarity < filters.minSimilarity) {
      return false;
    }

    return true;
  });

  const handleSelectTrial = (trial: any) => {
    setSelectedTrials((prev) => {
      if (prev.some(t => t.nctId === trial.nctId)) {
        return prev.filter(t => t.nctId !== trial.nctId);
      } else {
        // Limit selection to 5 trials
        if (prev.length >= 5) {
          toast({
            title: "Selection Limit",
            description: "You can select up to 5 trials for comparison.",
          });
          return prev;
        }
        return [...prev, trial];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedTrials.length === filteredTrials.length) {
      setSelectedTrials([]);
    } else {
      // Limit selection to 5 trials
      const trialsToSelect = filteredTrials.slice(0, 5);
      setSelectedTrials(trialsToSelect);
      
      if (filteredTrials.length > 5) {
        toast({
          title: "Selection Limit",
          description: "You can select up to 5 trials for comparison. Only the first 5 were selected.",
        });
      }
    }
  };

  const handleCompare = () => {
    console.log("Compare button clicked, type:", comparisonType);
    
    if (comparisonType === "automatic") {
      // For automatic mode, select the top 3 trials based on relevance or order
      const topTrials = [...searchResults]
        .sort((a, b) => {
          if (typeof a.similarity === "number" && typeof b.similarity === "number") {
            return b.similarity - a.similarity;
          } else {
            return 0;
          }
        })
        .slice(0, 3);
      
      if (topTrials.length === 0) {
        toast({
          title: "No Trials Available",
          description: "No trials found for comparison. First click 'Refresh Results' to search for trials, then try 'Compare Automatically'.",
          duration: 5000,
        });
        return;
      }
      
      console.log("Selected top trials for automatic comparison:", topTrials.length);
      onCompare(topTrials, comparisonType);
    } else {
      // For manual mode, use the user's selections
      if (selectedTrials.length === 0) {
        toast({
          title: "No Trials Selected",
          description: "Please select at least one trial to compare.",
        });
        return;
      }
      
      console.log("Selected trials for manual comparison:", selectedTrials.length);
      onCompare(selectedTrials, comparisonType);
    }
    
    // We'll let the parent component close the modal when appropriate
    // This prevents it from closing too early
    // onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto flex flex-col">
        <DialogHeader>
          <DialogTitle>Compare with Similar Trials</DialogTitle>
          <DialogDescription>Select trials to compare against your current protocol design</DialogDescription>
        </DialogHeader>

        <Tabs
          defaultValue="automatic"
          className="flex flex-col"
          onValueChange={setComparisonType}
        >
          <TabsList className="mb-4">
            <TabsTrigger value="automatic">Automatic Comparison</TabsTrigger>
            <TabsTrigger value="manual">Manual Selection</TabsTrigger>
          </TabsList>

          <TabsContent value="automatic" className="flex flex-col">
            <div className="mb-4 bg-[#f8f9fa] p-4 rounded-md border border-[#dee2e6]">
              <h3 className="text-sm font-medium mb-2">Automatic Comparison Settings</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Trial Phase</label>
                  <div className="space-y-2">
                    {Object.entries(filters.phase).map(([phase, checked]) => (
                      <div key={phase} className="flex items-center">
                        <Checkbox
                          id={`phase-${phase}`}
                          checked={checked}
                          onCheckedChange={(checked) =>
                            setFilters((prev) => ({
                              ...prev,
                              phase: { ...prev.phase, [phase]: !!checked },
                            }))
                          }
                          className="mr-2"
                        />
                        <label htmlFor={`phase-${phase}`} className="text-sm">
                          {phase}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">Timeframe</label>
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <Checkbox
                        id="timeframe-last5years"
                        checked={filters.timeframe === "last5years"}
                        onCheckedChange={(checked) =>
                          checked && setFilters((prev) => ({ ...prev, timeframe: "last5years" }))
                        }
                        className="mr-2"
                      />
                      <label htmlFor="timeframe-last5years" className="text-sm">
                        Last 5 years
                      </label>
                    </div>
                    <div className="flex items-center">
                      <Checkbox
                        id="timeframe-last10years"
                        checked={filters.timeframe === "last10years"}
                        onCheckedChange={(checked) =>
                          checked && setFilters((prev) => ({ ...prev, timeframe: "last10years" }))
                        }
                        className="mr-2"
                      />
                      <label htmlFor="timeframe-last10years" className="text-sm">
                        Last 10 years
                      </label>
                    </div>
                    <div className="flex items-center">
                      <Checkbox
                        id="timeframe-all"
                        checked={filters.timeframe === "all"}
                        onCheckedChange={(checked) => checked && setFilters((prev) => ({ ...prev, timeframe: "all" }))}
                        className="mr-2"
                      />
                      <label htmlFor="timeframe-all" className="text-sm">
                        All available data
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <label className="text-sm font-medium mb-1 block">Minimum Similarity Score</label>
                <div className="flex items-center">
                  <input
                    type="range"
                    min="50"
                    max="100"
                    value={filters.minSimilarity}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, minSimilarity: Number.parseInt(e.target.value) }))
                    }
                    className="w-full mr-2"
                  />
                  <span className="text-sm font-medium">{filters.minSimilarity}%</span>
                </div>
              </div>

              <div className="mt-4 flex justify-between">
                <Button 
                  onClick={handleAutomaticSearch} 
                  variant="outline"
                  disabled={isSearching}
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Refresh Results
                    </>
                  )}
                </Button>
                
                <Button 
                  onClick={handleCompare} 
                  className="bg-[#228be6] hover:bg-[#1864ab]"
                  disabled={isSearching || searchResults.length === 0}
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Compare Automatically
                    </>
                  )}
                </Button>
              </div>
            </div>
            
            {searchProfile && (
              <div className="mb-4 rounded-md border border-[#d0ebff] bg-[#f1f8ff] p-3 text-sm">
                <div className="font-medium text-[#1864ab]">Search profile used for matching</div>
                <div className="mt-1 text-[#495057]">
                  <span className="font-medium">Disease:</span>{" "}
                  {searchProfile.indication || "Not extracted"}
                  {searchProfile.phase ? (
                    <>
                      {" "}
                      <span className="font-medium">Phase:</span> {searchProfile.phase}
                    </>
                  ) : null}
                </div>
                {searchProfile.additionalTerms ? (
                  <div className="mt-1 text-[#6c757d]">
                    <span className="font-medium">Population, treatment, and design terms:</span>{" "}
                    {searchProfile.additionalTerms}
                  </div>
                ) : null}
              </div>
            )}

            {/* Results table for Automatic tab */}
            <div className="border border-[#dee2e6] rounded-md overflow-hidden">
              <div className="bg-[#f8f9fa] p-2 border-b border-[#dee2e6] flex items-center">
                <div className="flex-1 font-medium text-sm">Trial</div>
                <div className="w-24 font-medium text-sm">Phase</div>
                <div className="w-24 font-medium text-sm">Status</div>
                <div className="w-24 font-medium text-sm text-right">Similarity</div>
              </div>

              <div className="overflow-y-auto overscroll-contain max-h-[36vh] min-h-[220px]">
                {isSearching ? (
                  <div className="p-6 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-[#228be6]" />
                    <p className="text-sm text-[#6c757d]">Searching for similar trials...</p>
                  </div>
                ) : searchError ? (
                  <div className="p-4 text-center">
                    <p className="text-sm text-[#fa5252]">{searchError}</p>
                    <p className="text-xs mt-2 text-[#6c757d]">
                      Click <span className="font-semibold">"Refresh Results"</span> to search for clinical trials similar to your protocol. 
                      Make sure your protocol has an indication or disease specified.
                    </p>
                  </div>
                ) : filteredTrials.length > 0 ? (
                  filteredTrials
                    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
                    .map((trial) => (
                      <div key={trial.id} className="p-2 border-b border-[#dee2e6] flex items-center hover:bg-[#f8f9fa]">
                        <div className="flex-1 text-sm">
                          <div className="font-medium">{trial.title}</div>
                          <div className="text-xs text-[#6c757d]">
                            {trial.nctId} • {trial.sponsor}
                            {trial.matchRationale ? ` • ${trial.matchRationale}` : ""}
                          </div>
                        </div>
                        <div className="w-24 text-sm">{trial.phase}</div>
                        <div className="w-24 text-sm">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs ${
                              trial.status === "Completed"
                                ? "bg-[#d3f9d8] text-[#2b8a3e]"
                                : trial.status === "Recruiting"
                                  ? "bg-[#e7f5ff] text-[#1864ab]"
                                  : "bg-[#fff9db] text-[#e67700]"
                            }`}
                          >
                            {trial.status}
                          </span>
                        </div>
                        <div className="w-24 text-sm text-right font-medium">
                          {trial.similarity ? `${trial.similarity}%` : "N/A"}
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="p-4 text-center text-[#6c757d]">
                    <p className="text-sm">No trials match your criteria. Try adjusting your filters.</p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="manual" className="flex flex-col">
            <div className="mb-4 bg-[#f8f9fa] p-4 rounded-md border border-[#dee2e6]">
              <h3 className="text-sm font-medium mb-2">Search ClinicalTrials.gov Database</h3>
              <p className="text-xs text-[#6c757d] mb-4">
                Enter a disease or condition to search for relevant clinical trials. For example: "Prostate Cancer", "Type 2 Diabetes", "Alzheimer's Disease", etc.
              </p>
              
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#adb5bd]" size={16} />
                  <Input
                    placeholder="Enter disease or condition..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                  />
                </div>
                
                <Button 
                  variant="outline" 
                  onClick={handleManualSearch}
                  disabled={isSearching || !isUsefulSearchTerm(searchQuery)}
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Search Trials
                    </>
                  )}
                </Button>
              </div>
              
              <div className="mt-4">
                <label className="text-sm font-medium mb-1 block">Trial Phase</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {Object.entries(filters.phase).map(([phase, checked]) => (
                    <div key={phase} className="flex items-center">
                      <Checkbox
                        id={`manual-phase-${phase}`}
                        checked={checked}
                        onCheckedChange={(checked) =>
                          setFilters((prev) => ({
                            ...prev,
                            phase: { ...prev.phase, [phase]: !!checked },
                          }))
                        }
                        className="mr-1"
                      />
                      <label htmlFor={`manual-phase-${phase}`} className="text-xs">
                        {phase}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {searchProfile && (
              <div className="mb-4 rounded-md border border-[#d0ebff] bg-[#f1f8ff] p-3 text-sm">
                <div className="font-medium text-[#1864ab]">Search profile used for matching</div>
                <div className="mt-1 text-[#495057]">
                  <span className="font-medium">Disease:</span>{" "}
                  {searchProfile.indication || searchQuery}
                  {searchProfile.phase ? (
                    <>
                      {" "}
                      <span className="font-medium">Phase:</span> {searchProfile.phase}
                    </>
                  ) : null}
                </div>
                {searchProfile.additionalTerms ? (
                  <div className="mt-1 text-[#6c757d]">
                    <span className="font-medium">Additional terms:</span>{" "}
                    {searchProfile.additionalTerms}
                  </div>
                ) : null}
              </div>
            )}

            <div className="border border-[#dee2e6] rounded-md overflow-hidden">
              <div className="bg-[#f8f9fa] p-2 border-b border-[#dee2e6] flex items-center">
                <div className="flex items-center w-8">
                  <Checkbox
                    id="select-all"
                    checked={selectedTrials.length > 0 && selectedTrials.length === filteredTrials.length}
                    onCheckedChange={handleSelectAll}
                  />
                </div>
                <div className="flex-1 font-medium text-sm">Trial Name</div>
                <div className="w-24 font-medium text-sm">Phase</div>
                <div className="w-24 font-medium text-sm">Status</div>
                <div className="w-24 font-medium text-sm text-right">Similarity</div>
              </div>

              <div className="overflow-y-auto overscroll-contain max-h-[36vh] min-h-[220px]">
                {isSearching ? (
                  <div className="p-6 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-[#228be6]" />
                    <p className="text-sm text-[#6c757d]">Searching for trials...</p>
                  </div>
                ) : searchError ? (
                  <div className="p-4 text-center">
                    <p className="text-sm text-[#fa5252]">{searchError}</p>
                    <p className="text-xs mt-2 text-[#6c757d]">
                      Try entering a specific disease name or treatment type in the search box above.
                    </p>
                  </div>
                ) : filteredTrials.length > 0 ? (
                  filteredTrials.map((trial) => (
                    <div key={trial.id} className="p-2 border-b border-[#dee2e6] flex items-center hover:bg-[#f8f9fa]">
                      <div className="flex items-center w-8">
                        <Checkbox
                          id={`select-${trial.id}`}
                          checked={selectedTrials.some(t => t.nctId === trial.nctId)}
                          onCheckedChange={() => handleSelectTrial(trial)}
                        />
                      </div>
                      <div className="flex-1 text-sm">
                        <div className="font-medium">{trial.title}</div>
                        <div className="text-xs text-[#6c757d]">
                          {trial.nctId} • {trial.sponsor}
                          {trial.matchRationale ? ` • ${trial.matchRationale}` : ""}
                        </div>
                      </div>
                      <div className="w-24 text-sm">{trial.phase}</div>
                      <div className="w-24 text-sm">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            trial.status === "Completed"
                              ? "bg-[#d3f9d8] text-[#2b8a3e]"
                              : trial.status === "Recruiting"
                                ? "bg-[#e7f5ff] text-[#1864ab]"
                                : "bg-[#fff9db] text-[#e67700]"
                          }`}
                        >
                          {trial.status}
                        </span>
                      </div>
                      <div className="w-24 text-sm text-right font-medium">
                        {trial.similarity ? `${trial.similarity}%` : "N/A"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-[#6c757d]">
                    {searchQuery ? 'No trials match your search criteria' : 'Enter a search term to find trials'}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-[#6c757d]">{selectedTrials.length} trials selected</div>

              <Button
                onClick={handleCompare}
                disabled={selectedTrials.length === 0 || isSearching}
                className="bg-[#228be6] hover:bg-[#1864ab]"
              >
                <Zap className="mr-2 h-4 w-4" />
                Compare Selected ({selectedTrials.length})
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
