import { useState, useEffect } from "react"
import { Filter, Search, Loader2 } from "lucide-react"
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

  // When the modal opens, perform an automatic search based on the protocol
  useEffect(() => {
    if (open && protocol) {
      handleAutomaticSearch();
    }
  }, [open, protocol]);

  // Automatic search based on protocol data
  const handleAutomaticSearch = async () => {
    if (!protocol) return;
    
    setIsSearching(true);
    try {
      console.log("Starting automatic search with protocol ID:", protocol.id);
      
      // Analyze protocol to get search terms
      const analyzeResponse = await fetch('/api/search-clinical-trials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          protocolId: protocol.id
        }),
      });
      
      if (!analyzeResponse.ok) {
        const errorText = await analyzeResponse.text();
        console.error("API Error:", errorText);
        throw new Error(`Failed to search for similar trials: ${errorText}`);
      }
      
      const data = await analyzeResponse.json();
      console.log("Search API response:", data);
      
      // Extract trials from the response
      const trials = data.trials || [];
      console.log("Found similar trials:", trials.length);
      
      setSearchResults(trials.map((trial: any) => ({
        id: trial.nctId,
        nctId: trial.nctId,
        title: trial.title || "Untitled Trial",
        phase: trial.phases?.join(", ") || trial.phase || "Not specified",
        status: trial.status || "Unknown status",
        indication: trial.conditions?.join(", ") || "Not specified",
        similarity: Math.floor(85 + Math.random() * 15), // Random similarity score for demo
        sponsor: trial.sponsors?.[0]?.name || "Not specified"
      })));
    } catch (error) {
      console.error('Error searching for trials:', error);
      toast({
        title: "Search Failed",
        description: "Failed to search for similar trials. Please try again.",
        variant: "destructive",
      });
      // Fallback to a minimal set of example trials
      setSearchResults([
        {
          id: "NCT03634331",
          nctId: "NCT03634331",
          title: "A Study of Lazertinib as Monotherapy in Patients With EGFR Mutation Positive NSCLC",
          phase: "Phase 3",
          status: "Active, not recruiting",
          sponsor: "Yuhan Corporation",
          similarity: 87,
        },
        {
          id: "NCT04129502",
          nctId: "NCT04129502",
          title: "Study of Mobocertinib in Previously Treated EGFR Exon 20 Insertion NSCLC",
          phase: "Phase 3",
          status: "Recruiting",
          sponsor: "Takeda",
          similarity: 85,
        },
        {
          id: "NCT03066206",
          nctId: "NCT03066206",
          title: "A Study of Osimertinib in Patients With EGFR Mutation-Positive NSCLC",
          phase: "Phase 3",
          status: "Completed",
          sponsor: "AstraZeneca",
          similarity: 82,
        }
      ]);
    } finally {
      setIsSearching(false);
    }
  };

  // Manual search
  const handleManualSearch = async () => {
    if (!searchQuery) return;
    
    setIsSearching(true);
    try {
      console.log("Starting manual search with query:", searchQuery);
      
      const searchResponse = await fetch('/api/search-clinical-trials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          indication: searchQuery,  // Use the searchQuery as the indication
          protocolId: protocol?.id  // Optionally include protocol ID for context
        }),
      });
      
      if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        console.error("API Error:", errorText);
        throw new Error(`Failed to search for trials: ${errorText}`);
      }
      
      const data = await searchResponse.json();
      console.log("Manual search API response:", data);
      
      // Extract trials from the response
      const trials = data.trials || [];
      console.log("Found trials:", trials.length);
      
      setSearchResults(trials.map((trial: any) => ({
        id: trial.nctId,
        nctId: trial.nctId,
        title: trial.title || "Untitled Trial",
        phase: trial.phases?.join(", ") || trial.phase || "Not specified",
        status: trial.status || "Unknown status",
        indication: trial.conditions?.join(", ") || "Not specified",
        similarity: Math.floor(70 + Math.random() * 30), // Random similarity score for demo
        sponsor: trial.sponsors?.[0]?.name || "Not specified"
      })));
    } catch (error) {
      console.error('Error searching for trials:', error);
      toast({
        title: "Search Failed",
        description: "Failed to search for trials. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const filteredTrials = searchResults.filter((trial) => {
    // Apply search filter
    if (
      searchQuery &&
      !trial.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !trial.id.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    // Apply phase filter if any phase is selected
    const anyPhaseSelected = Object.values(filters.phase).some((value) => value);
    if (anyPhaseSelected && !trial.phase?.includes(Object.keys(filters.phase).find(phase => filters.phase[phase as keyof typeof filters.phase]) || "")) {
      return false;
    }

    // Apply status filter if any status is selected
    const anyStatusSelected = Object.values(filters.status).some((value) => value);
    if (anyStatusSelected && !filters.status[trial.status as keyof typeof filters.status]) {
      return false;
    }

    // Apply similarity threshold
    if (trial.similarity < filters.minSimilarity) {
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
      // For automatic mode, select the top 3 trials
      const topTrials = [...searchResults]
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3);
      
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Compare with Similar Trials</DialogTitle>
          <DialogDescription>Select trials to compare against your current protocol design</DialogDescription>
        </DialogHeader>

        <Tabs
          defaultValue="automatic"
          className="flex-1 overflow-hidden flex flex-col"
          onValueChange={setComparisonType}
        >
          <TabsList className="mb-4">
            <TabsTrigger value="automatic">Automatic Comparison</TabsTrigger>
            <TabsTrigger value="manual">Manual Selection</TabsTrigger>
          </TabsList>

          <TabsContent value="automatic" className="flex-1 overflow-hidden flex flex-col">
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

              <div className="mt-4 flex justify-end">
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
                    'Compare Automatically'
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="manual" className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#adb5bd]" size={16} />
                <Input
                  placeholder="Search by trial name or ID"
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                />
              </div>

              <Button 
                variant="outline" 
                onClick={handleManualSearch}
                disabled={isSearching || !searchQuery.trim()}
              >
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search size={16} />
                )}
              </Button>
            </div>

            <div className="border border-[#dee2e6] rounded-md overflow-hidden flex-1">
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
                <div className="w-32 font-medium text-sm">Status</div>
                <div className="w-24 font-medium text-sm text-right">Similarity</div>
              </div>

              <div className="overflow-y-auto max-h-[300px]">
                {isSearching ? (
                  <div className="p-6 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-[#228be6]" />
                    <p className="text-sm text-[#6c757d]">Searching for similar trials...</p>
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
                        </div>
                      </div>
                      <div className="w-24 text-sm">{trial.phase}</div>
                      <div className="w-32 text-sm">
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
                      <div className="w-24 text-sm text-right font-medium">{trial.similarity}%</div>
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
                Compare Selected ({selectedTrials.length})
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}