import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { FileText, Check, Search, FilterX, Tag, Plus, Edit, Save, X, Trash } from "lucide-react";
import { apiRequest } from "../lib/apiRequest";
import { useToast } from "@/hooks/use-toast";

export interface BoilerplateText {
  id: string;
  title: string;
  content: string;
  section: string;
  protocolType: string;
}

interface BoilerplateTextSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionId: string;
  sectionTitle: string;
  protocolType: string;
  onSelectBoilerplate: (boilerplateText: BoilerplateText) => void;
}

export function BoilerplateTextSelector({
  open,
  onOpenChange,
  sectionId,
  sectionTitle,
  protocolType,
  onSelectBoilerplate,
}: BoilerplateTextSelectorProps) {
  const { toast } = useToast();
  const [boilerplateTexts, setBoilerplateTexts] = useState<BoilerplateText[]>([]);
  const [filteredTexts, setFilteredTexts] = useState<BoilerplateText[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedBoilerplate, setSelectedBoilerplate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // State for creating/editing boilerplate texts
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");

  // Map section IDs to section names used in the API
  const sectionIdToApiSection: Record<string, string> = {
    title: "title_id",
    synopsis: "synopsis",
    objectives: "objectives",
    design: "study_design",
    population: "study_population",
    ethical: "ethics_approval",
    administrative: "administrative",
    procedures: "procedures",
    treatments: "treatments",
    assessments: "assessments",
    safety: "safety_monitoring",
    statistics: "statistical_considerations",
    data_management: "data_management",
    monitoring: "study_monitoring",
    data_source: "data_source",
    variable_definitions: "variable_definitions",
    quality_control: "quality_control",
    limitations: "limitations",
    exposure_assessment: "exposure_assessment",
    outcome_assessment: "outcome_assessment",
    data_collection: "data_collection",
    follow_up: "follow_up",
    bias_management: "bias_management",
    expert_panel: "expert_panel",
    consensus_methodology: "consensus_methodology",
    statement_development: "statement_development",
    round_procedures: "round_procedures",
    data_analysis: "data_analysis",
    dissemination: "dissemination",
    sampling_strategy: "sampling_strategy",
    survey_instrument: "survey_instrument",
  };

  // Load boilerplate texts when the dialog opens
  useEffect(() => {
    if (open) {
      loadBoilerplateTexts();
    }
  }, [open, sectionId, protocolType]);

  // Filter texts when search query changes
  useEffect(() => {
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      setFilteredTexts(
        boilerplateTexts.filter(
          (text) =>
            text.title.toLowerCase().includes(lowerQuery) ||
            text.content.toLowerCase().includes(lowerQuery)
        )
      );
    } else {
      setFilteredTexts(boilerplateTexts);
    }
  }, [searchQuery, boilerplateTexts]);

  const loadBoilerplateTexts = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get section name from mapping
      const sectionName = sectionIdToApiSection[sectionId] || sectionId;
      
      // Construct URL with query parameters for filtering
      const url = `/api/boilerplate-texts?section=${sectionName}`;
      
      const response = await apiRequest(url);
      if (response) {
        setBoilerplateTexts(response);
        setFilteredTexts(response);
      } else {
        setError("Failed to load boilerplate texts");
      }
    } catch (err) {
      console.error("Error loading boilerplate texts:", err);
      setError("An error occurred while loading boilerplate texts");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBoilerplate = () => {
    if (selectedBoilerplate) {
      const selectedText = boilerplateTexts.find(text => text.id === selectedBoilerplate);
      if (selectedText) {
        onSelectBoilerplate(selectedText);
        onOpenChange(false);
      }
    }
  };
  
  // Start creating a new boilerplate text
  const startCreating = () => {
    setIsCreating(true);
    setIsEditing(false);
    setEditingId(null);
    setFormTitle("");
    setFormContent("");
  };
  
  // Start editing an existing boilerplate text
  const startEditing = (text: BoilerplateText) => {
    setIsEditing(true);
    setIsCreating(false);
    setEditingId(text.id);
    setFormTitle(text.title);
    setFormContent(text.content);
    setSelectedBoilerplate(text.id);
  };
  
  // Cancel creating/editing
  const cancelEdit = () => {
    setIsCreating(false);
    setIsEditing(false);
    setEditingId(null);
    setFormTitle("");
    setFormContent("");
  };
  
  // Save a new boilerplate text
  const createBoilerplateText = async () => {
    if (!formTitle.trim() || !formContent.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide both a title and content for your boilerplate text.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      // Get section name from mapping
      const sectionName = sectionIdToApiSection[sectionId] || sectionId;
      
      // Generate a unique ID
      const newId = `BPT-${Date.now().toString().slice(-6)}`;
      
      const newBoilerplateText: BoilerplateText = {
        id: newId,
        title: formTitle,
        content: formContent,
        section: sectionName,
        protocolType: protocolType
      };
      
      const response = await apiRequest(
        '/api/boilerplate-texts',
        'POST',
        newBoilerplateText
      );
      
      if (response) {
        // Add to list and select it
        setBoilerplateTexts(prev => [...prev, newBoilerplateText]);
        setSelectedBoilerplate(newId);
        
        toast({
          title: "Boilerplate Text Created",
          description: "Your boilerplate text has been created successfully.",
          variant: "default"
        });
        
        // Reset form
        setIsCreating(false);
        setFormTitle("");
        setFormContent("");
      } else {
        throw new Error("Failed to create boilerplate text");
      }
    } catch (err) {
      console.error("Error creating boilerplate text:", err);
      toast({
        title: "Creation Failed",
        description: "Failed to create boilerplate text. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  // Update an existing boilerplate text
  const updateBoilerplateText = async () => {
    if (!editingId || !formTitle.trim() || !formContent.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide both a title and content for your boilerplate text.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      const updatedFields = {
        title: formTitle,
        content: formContent
      };
      
      const response = await apiRequest(
        `/api/boilerplate-texts/${editingId}`,
        'PUT',
        updatedFields
      );
      
      if (response) {
        // Update in list
        setBoilerplateTexts(prev => 
          prev.map(text => 
            text.id === editingId 
              ? { ...text, ...updatedFields } 
              : text
          )
        );
        
        toast({
          title: "Boilerplate Text Updated",
          description: "Your boilerplate text has been updated successfully.",
          variant: "default"
        });
        
        // Reset form
        setIsEditing(false);
        setEditingId(null);
        setFormTitle("");
        setFormContent("");
      } else {
        throw new Error("Failed to update boilerplate text");
      }
    } catch (err) {
      console.error("Error updating boilerplate text:", err);
      toast({
        title: "Update Failed",
        description: "Failed to update boilerplate text. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  // Delete a boilerplate text
  const deleteBoilerplateText = async (id: string) => {
    try {
      await apiRequest(
        `/api/boilerplate-texts/${id}`,
        'DELETE'
      );
      
      // Delete returns 204 No Content, so we won't have a response body
      // Remove from list
      setBoilerplateTexts(prev => prev.filter(text => text.id !== id));
      
      // Clear selection if needed
      if (selectedBoilerplate === id) {
        setSelectedBoilerplate(null);
      }
      
      toast({
        title: "Boilerplate Text Deleted",
        description: "The boilerplate text has been deleted successfully.",
        variant: "default"
      });
    } catch (err) {
      console.error("Error deleting boilerplate text:", err);
      toast({
        title: "Deletion Failed",
        description: "Failed to delete boilerplate text. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <span>Boilerplate Text for {sectionTitle}</span>
          </DialogTitle>
          <DialogDescription>
            Select boilerplate text to use in your protocol document
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex items-center gap-2 my-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search boilerplate texts..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 h-7 w-7 p-0"
                onClick={() => setSearchQuery("")}
              >
                <FilterX className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          <Badge variant="outline" className="px-2 py-1">
            <Tag className="h-3.5 w-3.5 mr-1" />
            {protocolType.replace(/_/g, " ")}
          </Badge>
          
          {!isCreating && !isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={startCreating}
              className="flex items-center gap-1"
            >
              <Plus className="h-4 w-4" />
              Create New
            </Button>
          )}
        </div>
        
        <Separator />
        
        {/* Create/Edit Form */}
        {(isCreating || isEditing) && (
          <div className="my-4 p-4 border rounded-md bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">
                {isCreating ? "Create New Boilerplate Text" : "Edit Boilerplate Text"}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelEdit}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium mb-1">
                  Title
                </label>
                <Input
                  id="title"
                  placeholder="Enter a descriptive title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>
              
              <div>
                <label htmlFor="content" className="block text-sm font-medium mb-1">
                  Content
                </label>
                <Textarea
                  id="content"
                  placeholder="Enter the boilerplate text content"
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  rows={5}
                  className="resize-none"
                />
              </div>
              
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelEdit}
                  className="mr-2"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={isCreating ? createBoilerplateText : updateBoilerplateText}
                  disabled={!formTitle.trim() || !formContent.trim()}
                >
                  <Save className="h-4 w-4 mr-1" />
                  {isCreating ? "Create" : "Update"}
                </Button>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex-1 overflow-y-auto mt-2">
          {loading ? (
            <div className="flex justify-center items-center h-60">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent"></div>
            </div>
          ) : error ? (
            <div className="text-center text-red-500 py-6">{error}</div>
          ) : filteredTexts.length === 0 && !isCreating ? (
            <div className="text-center p-6">
              <div className="text-gray-500 mb-4">
                {searchQuery
                  ? "No boilerplate texts match your search"
                  : "No boilerplate texts available for this section"}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTexts.map((text) => (
                <div
                  key={text.id}
                  className={`p-3 border rounded-md transition-colors ${
                    selectedBoilerplate === text.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 
                      className="font-medium cursor-pointer"
                      onClick={() => setSelectedBoilerplate(text.id)}
                    >
                      {text.title}
                    </h3>
                    <div className="flex items-center gap-1">
                      {selectedBoilerplate === text.id && (
                        <Check className="h-5 w-5 text-blue-500" />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(text);
                        }}
                      >
                        <Edit className="h-4 w-4 text-blue-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Are you sure you want to delete this boilerplate text?")) {
                            deleteBoilerplateText(text.id);
                          }
                        }}
                      >
                        <Trash className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <p 
                    className="text-sm text-gray-600 line-clamp-3 cursor-pointer"
                    onClick={() => setSelectedBoilerplate(text.id)}
                  >
                    {text.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <DialogFooter className="pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={!selectedBoilerplate}
            onClick={handleSelectBoilerplate}
          >
            Use Selected Text
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}