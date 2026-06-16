import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AIGeneratedBadge } from "@/components/ai-generated-badge";
import { RefreshCw } from "lucide-react";

interface DelphiProtocolViewProps {
  overviewData: {
    summary: string;
    clinicalContext: string;
    objectives: string;
    endpoints: string;
    design: string;
    targetPopulation: string;
    significance: string;
  };
  onRefresh: () => void;
}

export function DelphiProtocolView({ overviewData, onRefresh }: DelphiProtocolViewProps) {
  return (
    <div className="space-y-6">
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Delphi Consensus Study Parameters</CardTitle>
              <CardDescription>Key elements of your consensus methodology</CardDescription>
            </div>
            <div className="flex items-center">
              <AIGeneratedBadge className="mr-2" />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onRefresh}
                className="flex items-center text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1" /> Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-800 mb-1">Clinical Context</h3>
                <Separator className="my-1" />
                <div className="p-3 bg-gray-50 rounded-md text-sm">
                  {overviewData.clinicalContext}
                </div>
              </div>
              
              <div>
                <h3 className="font-medium text-gray-800 mb-1">Consensus Methodology</h3>
                <Separator className="my-1" />
                <div className="p-3 bg-gray-50 rounded-md text-sm">
                  {overviewData.design}
                </div>
              </div>
              
              <div>
                <h3 className="font-medium text-gray-800 mb-1">Expert Panel</h3>
                <Separator className="my-1" />
                <div className="p-3 bg-gray-50 rounded-md text-sm">
                  {overviewData.targetPopulation}
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-800 mb-1">Consensus Objectives</h3>
                <Separator className="my-1" />
                <div className="p-3 bg-gray-50 rounded-md text-sm">
                  {overviewData.objectives}
                </div>
              </div>
              
              <div>
                <h3 className="font-medium text-gray-800 mb-1">Consensus Outcomes</h3>
                <Separator className="my-1" />
                <div className="p-3 bg-gray-50 rounded-md text-sm">
                  {overviewData.endpoints}
                </div>
              </div>
              
              <div>
                <h3 className="font-medium text-gray-800 mb-1">Clinical Significance</h3>
                <Separator className="my-1" />
                <div className="p-3 bg-gray-50 rounded-md text-sm">
                  {overviewData.significance}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Delphi Study Summary</CardTitle>
          <CardDescription>At-a-glance overview of your consensus study</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm mb-4">{overviewData.summary}</p>
        </CardContent>
      </Card>
    </div>
  );
}