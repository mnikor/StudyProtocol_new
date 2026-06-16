import { users, type User, type InsertUser, protocols, type Protocol, type InsertProtocol, type GenerateProtocol, type DesignState, type ProtocolComponent, boilerplateTexts, type BoilerplateSection, type BoilerplateText, type InsertBoilerplateText, comments, type Comment, type InsertComment } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import fs from "fs";
import path from "path";

// Modify the interface with any CRUD methods you might need
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Protocol methods
  getAllProtocols(): Promise<Protocol[]>;
  getProtocolById(id: string): Promise<Protocol | undefined>;
  getProtocolsByUserId(userId: number): Promise<Protocol[]>;
  createProtocol(protocol: InsertProtocol): Promise<Protocol>;
  updateProtocol(id: string, updates: Partial<InsertProtocol>): Promise<Protocol | undefined>;
  deleteProtocol(id: string): Promise<boolean>;
  
  // Design State methods
  getDesignStates(protocolId: string): Promise<DesignState[]>;
  getDesignState(protocolId: string, designStateId: string): Promise<DesignState | undefined>;
  getActiveDesignState(protocolId: string): Promise<DesignState | undefined>;
  createDesignState(protocolId: string, designState: DesignState): Promise<DesignState>;
  updateDesignState(protocolId: string, designStateId: string, updates: Partial<DesignState>): Promise<DesignState | undefined>;
  setActiveDesignState(protocolId: string, designStateId: string): Promise<Protocol | undefined>;
  deleteDesignState(protocolId: string, designStateId: string): Promise<boolean>;
  
  // Protocol Component methods
  getComponents(protocolId: string): Promise<ProtocolComponent[]>;
  getComponentsByDesignState(protocolId: string, designStateId: string): Promise<ProtocolComponent[]>;
  getComponentByTypeAndDesignState(protocolId: string, designStateId: string, type: string): Promise<ProtocolComponent | undefined>;
  createComponent(protocolId: string, component: ProtocolComponent): Promise<ProtocolComponent>;
  updateComponent(protocolId: string, component: ProtocolComponent): Promise<ProtocolComponent | undefined>;
  deleteComponent(protocolId: string, designStateId: string, type: string): Promise<boolean>;
  
  // AI generation
  generateProtocol(data: GenerateProtocol): Promise<Protocol>;
  analyzeDesignState(protocolId: string, designStateId: string): Promise<DesignState>;
  generateAlternativeDesigns(protocolId: string, designStateId: string, count: number): Promise<DesignState[]>;
  
  // Boilerplate text methods
  getAllBoilerplateTexts(): Promise<BoilerplateText[]>;
  getBoilerplateTextById(id: string): Promise<BoilerplateText | undefined>;
  getBoilerplateTextsBySection(section: string): Promise<BoilerplateText[]>;
  getBoilerplateTextsByProtocolType(protocolType: string): Promise<BoilerplateText[]>;
  getBoilerplateTextsBySectionAndType(section: string, protocolType: string): Promise<BoilerplateText[]>;
  createBoilerplateText(text: InsertBoilerplateText): Promise<BoilerplateText>;
  updateBoilerplateText(id: string, updates: Partial<InsertBoilerplateText>): Promise<BoilerplateText | undefined>;
  deleteBoilerplateText(id: string): Promise<boolean>;
  
  // Design state boilerplate text methods
  getDesignStateById(id: string): Promise<DesignState | undefined>;
  updateDesignStateBoilerplateSelections(
    designStateId: string, 
    boilerplateSelections: Record<BoilerplateSection, string | null>
  ): Promise<DesignState | undefined>;
  
  // Protocol document generation with boilerplate
  updateProtocolGeneratedContent(protocolId: string, content: any): Promise<Protocol | undefined>;
  
  // Comment methods
  getComments(protocolId: string, designStateId: string): Promise<Comment[]>;
  getCommentsBySection(protocolId: string, designStateId: string, section: string): Promise<Comment[]>;
  getCommentsBySectionItem(protocolId: string, designStateId: string, section: string, sectionItem: string): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;
  updateComment(id: string, updates: Partial<InsertComment>): Promise<Comment | undefined>;
  deleteComment(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private protocols: Map<string, Protocol>;
  private boilerplateTexts: Map<string, BoilerplateText>;
  private comments: Map<string, Comment>;
  private persistencePath: string;
  currentUserId: number;

  constructor() {
    this.users = new Map();
    this.protocols = new Map();
    this.boilerplateTexts = new Map();
    this.comments = new Map();
    this.persistencePath = process.env.MEM_STORAGE_FILE ||
      path.join(process.cwd(), ".data", "mem-storage.json");
    this.currentUserId = 1;
    
    // Initialize with sample data
    this.initializeSampleData();
    this.loadPersistedData();
  }

  private reviveDate(value: any): Date {
    if (value instanceof Date) return value;
    if (!value) return new Date();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private reviveProtocol(protocol: any): Protocol {
    return {
      ...protocol,
      createdAt: this.reviveDate(protocol.createdAt),
      lastEdited: this.reviveDate(protocol.lastEdited)
    } as Protocol;
  }

  private reviveComment(comment: any): Comment {
    return {
      ...comment,
      createdAt: this.reviveDate(comment.createdAt),
      updatedAt: this.reviveDate(comment.updatedAt)
    } as Comment;
  }

  private loadPersistedData(): void {
    try {
      if (!fs.existsSync(this.persistencePath)) {
        return;
      }

      const raw = fs.readFileSync(this.persistencePath, "utf8");
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed.protocols)) {
        for (const protocol of parsed.protocols) {
          const revived = this.reviveProtocol(protocol);
          this.protocols.set(revived.id, revived);
        }
      }

      if (Array.isArray(parsed.comments)) {
        for (const comment of parsed.comments) {
          const revived = this.reviveComment(comment);
          this.comments.set(revived.id, revived);
        }
      }

      if (Array.isArray(parsed.boilerplateTexts)) {
        for (const text of parsed.boilerplateTexts) {
          this.boilerplateTexts.set(text.id, {
            ...text,
            createdAt: this.reviveDate(text.createdAt),
            lastModified: this.reviveDate(text.lastModified)
          });
        }
      }

      console.log(`Loaded persisted memory storage from ${this.persistencePath}`);
    } catch (error) {
      console.error("Failed to load persisted memory storage:", error);
    }
  }

  private persistData(): void {
    try {
      fs.mkdirSync(path.dirname(this.persistencePath), { recursive: true });
      fs.writeFileSync(
        this.persistencePath,
        JSON.stringify({
          protocols: Array.from(this.protocols.values()),
          comments: Array.from(this.comments.values()),
          boilerplateTexts: Array.from(this.boilerplateTexts.values())
        }, null, 2)
      );
    } catch (error) {
      console.error("Failed to persist memory storage:", error);
    }
  }
  
  // Design State methods
  async getDesignStates(protocolId: string): Promise<DesignState[]> {
    const protocol = this.protocols.get(protocolId);
    if (!protocol) return [];

    if (!protocol.designStates) return [];
    if (Array.isArray(protocol.designStates)) return protocol.designStates as DesignState[];
    if (typeof protocol.designStates === "string") {
      try {
        const parsed = JSON.parse(protocol.designStates);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        console.error("Error parsing design states JSON:", error);
        return [];
      }
    }
    return [];
  }
  
  async getDesignState(protocolId: string, designStateId: string): Promise<DesignState | undefined> {
    const designStates = await this.getDesignStates(protocolId);
    return designStates.find(state => state.id === designStateId);
  }
  
  async getActiveDesignState(protocolId: string): Promise<DesignState | undefined> {
    const protocol = this.protocols.get(protocolId);
    if (!protocol || !protocol.activeDesignState) return undefined;
    
    return this.getDesignState(protocolId, protocol.activeDesignState);
  }
  
  async createDesignState(protocolId: string, designState: DesignState): Promise<DesignState> {
    const protocol = this.protocols.get(protocolId);
    if (!protocol) throw new Error("Protocol not found");
    
    const existingStates = await this.getDesignStates(protocolId);
    
    // Add the new design state
    const updatedStates = [...existingStates, designState];
    
    // Update the protocol with the new design states
    await this.updateProtocol(protocolId, {
      designStates: JSON.stringify(updatedStates),
      // If this is the first design state, make it active
      activeDesignState: !protocol.activeDesignState ? designState.id : protocol.activeDesignState
    });
    
    return designState;
  }
  
  async updateDesignState(protocolId: string, designStateId: string, updates: Partial<DesignState>): Promise<DesignState | undefined> {
    const designStates = await this.getDesignStates(protocolId);
    const stateIndex = designStates.findIndex(state => state.id === designStateId);
    
    if (stateIndex === -1) return undefined;
    
    // Update the design state
    const updatedState = {
      ...designStates[stateIndex],
      ...updates
    };
    
    // Replace in the array
    designStates[stateIndex] = updatedState;
    
    // Update the protocol
    await this.updateProtocol(protocolId, {
      designStates: JSON.stringify(designStates)
    });
    
    return updatedState;
  }
  
  async setActiveDesignState(protocolId: string, designStateId: string): Promise<Protocol | undefined> {
    const designState = await this.getDesignState(protocolId, designStateId);
    if (!designState) return undefined;
    
    return this.updateProtocol(protocolId, {
      activeDesignState: designStateId
    });
  }
  
  async deleteDesignState(protocolId: string, designStateId: string): Promise<boolean> {
    const protocol = this.protocols.get(protocolId);
    if (!protocol) return false;
    
    const designStates = await this.getDesignStates(protocolId);
    const filteredStates = designStates.filter(state => state.id !== designStateId);
    
    // If we're deleting the active state, we need to update that too
    const updates: Partial<InsertProtocol> = {
      designStates: JSON.stringify(filteredStates)
    };
    
    if (protocol.activeDesignState === designStateId) {
      updates.activeDesignState = filteredStates.length > 0 ? filteredStates[0].id : null;
    }
    
    await this.updateProtocol(protocolId, updates);
    return true;
  }
  
  async analyzeDesignState(protocolId: string, designStateId: string): Promise<DesignState> {
    const designState = await this.getDesignState(protocolId, designStateId);
    if (!designState) throw new Error("Design state not found");
    
    // For now, we'll just return a basic analysis
    // In a real implementation, this would call OpenAI to analyze the design
    return {
      ...designState,
      scientificValue: {
        innovationScore: 0.8,
        knowledgeGapRelevance: 0.7,
        potentialImpact: 0.9,
        evidenceQuality: 0.6
      },
      clinicalRelevance: {
        patientCenteredOutcomes: 0.75,
        translationalPotential: 0.8,
        unmetNeedAlignment: 0.85,
        adoptionLikelihood: 0.7
      }
    };
  }
  
  async generateAlternativeDesigns(protocolId: string, designStateId: string, count: number): Promise<DesignState[]> {
    const baseState = await this.getDesignState(protocolId, designStateId);
    if (!baseState) throw new Error("Base design state not found");
    
    try {
      // Import OpenAI service for AI-powered alternative designs
      const { generateAIAlternativeDesigns } = await import('./services/openai-service');
      
      console.log("Generating AI-powered alternative designs...");
      
      // Generate AI-powered alternatives based on the baseState
      return await generateAIAlternativeDesigns(baseState, count);
    } catch (error) {
      console.error("Error generating AI alternatives:", error);
      
      // Fall back to template-based alternatives if AI generation fails
      console.log("Falling back to template-based alternatives...");
      const { generateAlternativeDesigns } = await import('./utils/design-utils');
      return generateAlternativeDesigns(baseState, count);
    }
  }
  
  // Protocol Component methods
  async getComponents(protocolId: string): Promise<ProtocolComponent[]> {
    const protocol = this.protocols.get(protocolId);
    if (!protocol) return [];
    
    // Parse components from JSON or return empty array
    const components = protocol.components ? 
      (typeof protocol.components === 'string' ? 
        JSON.parse(protocol.components) : protocol.components) : [];
    
    return components;
  }
  
  async getComponentsByDesignState(protocolId: string, designStateId: string): Promise<ProtocolComponent[]> {
    const components = await this.getComponents(protocolId);
    
    // Filter components by design state ID
    return components.filter(component => component.designStateId === designStateId);
  }
  
  async getComponentByTypeAndDesignState(
    protocolId: string, 
    designStateId: string, 
    type: string
  ): Promise<ProtocolComponent | undefined> {
    const components = await this.getComponentsByDesignState(protocolId, designStateId);
    
    // Find component with matching type
    return components.find(component => component.type === type);
  }
  
  async createComponent(protocolId: string, component: ProtocolComponent): Promise<ProtocolComponent> {
    const protocol = this.protocols.get(protocolId);
    if (!protocol) throw new Error("Protocol not found");
    
    // Get existing components
    const existingComponents = await this.getComponents(protocolId);
    
    // Check if a component with the same design state and type already exists
    const existingIndex = existingComponents.findIndex(
      c => c.designStateId === component.designStateId && c.type === component.type
    );
    
    let updatedComponents;
    
    if (existingIndex !== -1) {
      // Replace existing component
      updatedComponents = [...existingComponents];
      updatedComponents[existingIndex] = {
        ...component,
        updatedAt: new Date() // Update timestamp
      };
    } else {
      // Add new component
      updatedComponents = [
        ...existingComponents,
        {
          ...component,
          createdAt: component.createdAt || new Date(),
          updatedAt: new Date()
        }
      ];
    }
    
    // Update protocol with updated components
    await this.updateProtocol(protocolId, {
      components: JSON.stringify(updatedComponents)
    });
    
    return component;
  }
  
  async updateComponent(protocolId: string, component: ProtocolComponent): Promise<ProtocolComponent | undefined> {
    const components = await this.getComponents(protocolId);
    
    // Find index of component to update
    const componentIndex = components.findIndex(
      c => c.designStateId === component.designStateId && c.type === component.type
    );
    
    if (componentIndex === -1) return undefined;
    
    // Update component with new data and timestamp
    const updatedComponent = {
      ...components[componentIndex],
      ...component,
      updatedAt: new Date()
    };
    
    // Replace in array
    components[componentIndex] = updatedComponent;
    
    // Update protocol
    await this.updateProtocol(protocolId, {
      components: JSON.stringify(components)
    });
    
    return updatedComponent;
  }
  
  async deleteComponent(protocolId: string, designStateId: string, type: string): Promise<boolean> {
    const components = await this.getComponents(protocolId);
    
    // Filter out the component to be deleted
    const filteredComponents = components.filter(
      c => !(c.designStateId === designStateId && c.type === type)
    );
    
    // If no components were removed, return false
    if (filteredComponents.length === components.length) return false;
    
    // Update protocol
    await this.updateProtocol(protocolId, {
      components: JSON.stringify(filteredComponents)
    });
    
    return true;
  }
  
  // Boilerplate text methods
  async getAllBoilerplateTexts(): Promise<BoilerplateText[]> {
    return Array.from(this.boilerplateTexts.values());
  }

  async getBoilerplateTextById(id: string): Promise<BoilerplateText | undefined> {
    return this.boilerplateTexts.get(id);
  }

  async getBoilerplateTextsBySection(section: string): Promise<BoilerplateText[]> {
    return Array.from(this.boilerplateTexts.values()).filter(
      text => text.section === section
    );
  }

  async getBoilerplateTextsByProtocolType(protocolType: string): Promise<BoilerplateText[]> {
    return Array.from(this.boilerplateTexts.values()).filter(
      text => text.protocolType === protocolType || text.protocolType === "all"
    );
  }

  async getBoilerplateTextsBySectionAndType(section: string, protocolType: string): Promise<BoilerplateText[]> {
    return Array.from(this.boilerplateTexts.values()).filter(
      text => (text.section === section) && 
              (text.protocolType === protocolType || text.protocolType === "all")
    );
  }

  async createBoilerplateText(text: InsertBoilerplateText): Promise<BoilerplateText> {
    const newBoilerplateText: BoilerplateText = {
      ...text,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.boilerplateTexts.set(text.id, newBoilerplateText);
    return newBoilerplateText;
  }

  async updateBoilerplateText(id: string, updates: Partial<InsertBoilerplateText>): Promise<BoilerplateText | undefined> {
    const existingText = this.boilerplateTexts.get(id);
    if (!existingText) return undefined;
    
    const updatedText: BoilerplateText = {
      ...existingText,
      ...updates,
      updatedAt: new Date()
    };
    
    this.boilerplateTexts.set(id, updatedText);
    return updatedText;
  }

  async deleteBoilerplateText(id: string): Promise<boolean> {
    return this.boilerplateTexts.delete(id);
  }

  // Design state boilerplate text methods
  async getDesignStateById(id: string): Promise<DesignState | undefined> {
    // Search through all protocols to find the design state with this ID
    for (const protocol of this.protocols.values()) {
      const designStates = protocol.designStates ? 
        JSON.parse(protocol.designStates as string) : [];
      
      const foundState = designStates.find((state: DesignState) => state.id === id);
      if (foundState) return foundState;
    }
    
    return undefined;
  }

  async updateDesignStateBoilerplateSelections(
    designStateId: string, 
    boilerplateSelections: Record<BoilerplateSection, string | null>
  ): Promise<DesignState | undefined> {
    // Find the protocol that contains this design state
    for (const protocol of this.protocols.values()) {
      const designStates = protocol.designStates ? 
        JSON.parse(protocol.designStates as string) : [];
      
      const stateIndex = designStates.findIndex((state: DesignState) => state.id === designStateId);
      
      if (stateIndex !== -1) {
        // Update the design state with boilerplate selections
        designStates[stateIndex] = {
          ...designStates[stateIndex],
          boilerplateSelections
        };
        
        // Update the protocol
        await this.updateProtocol(protocol.id, {
          designStates: JSON.stringify(designStates)
        });
        
        return designStates[stateIndex];
      }
    }
    
    return undefined;
  }

  // Protocol document generation with boilerplate
  async updateProtocolGeneratedContent(protocolId: string, content: any): Promise<Protocol | undefined> {
    const protocol = this.protocols.get(protocolId);
    if (!protocol) return undefined;
    
    const updatedProtocol: Protocol = {
      ...protocol,
      generatedProtocol: typeof content === 'string' ? content : JSON.stringify(content),
      lastEdited: new Date()
    };
    
    this.protocols.set(protocolId, updatedProtocol);
    this.persistData();
    return updatedProtocol;
  }
  
  private initializeSampleData() {
    // Add a sample user
    const sampleUser: User = {
      id: 1,
      username: "demo_user",
      password: "password123", // In a real app, this would be hashed
      email: "demo@example.com",
      fullName: "Demo User",
      createdAt: new Date()
    };
    this.users.set(sampleUser.id, sampleUser);
    
    // Add sample boilerplate texts
    const sampleBoilerplateTexts: BoilerplateText[] = [
      {
        id: "BPT-1000",
        title: "Standard Study ID Text",
        content: "Study ID: EV-TEST-1234\nClinical Protocol Number: CP-001-2025\nEudraCT Number: 2025-000123-45\nIND Number: 123456",
        section: "study_id",
        protocolType: "all",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "BPT-1001",
        title: "Standard Ethics Committee Approval Text",
        content: "This study will be conducted in accordance with the Declaration of Helsinki and Good Clinical Practice guidelines. The protocol, informed consent form, and all related documents will be reviewed and approved by the relevant Ethics Committee or Institutional Review Board prior to study initiation.",
        section: "ethics_approval",
        protocolType: "all",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "BPT-1002",
        title: "Standard Data Protection Statement",
        content: "All participant data will be handled in accordance with applicable data protection laws. Data will be pseudonymized and stored securely. Access to data will be restricted to authorized study personnel only.",
        section: "data_management",
        protocolType: "all",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "BPT-1003",
        title: "Clinical Trial Adverse Event Reporting",
        content: "All adverse events (AEs) will be recorded from the time of informed consent until 30 days after the last dose of study drug. Serious adverse events (SAEs) will be reported to the sponsor within 24 hours of the investigator becoming aware of the event. The investigator will assess the severity of each AE according to CTCAE v5.0 and its relationship to the study treatment.",
        section: "safety_monitoring",
        protocolType: "interventional_clinical_trial",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "BPT-1004",
        title: "Observational Study Data Analysis",
        content: "Descriptive statistics will be used to summarize baseline characteristics and outcome measures. Continuous variables will be presented as means, standard deviations, medians, and ranges. Categorical variables will be presented as frequencies and percentages. Missing data will be reported but not imputed in the primary analysis.",
        section: "statistical_methods",
        protocolType: "prospective_cohort_study",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "BPT-1005",
        title: "Standard Study Discontinuation Criteria",
        content: "Participants may withdraw from the study at any time without prejudice to their future care. The investigator may also withdraw participants if it is considered in the participant's best interest, if the participant significantly violates the study protocol, or if the participant is lost to follow-up despite reasonable efforts to maintain contact.",
        section: "study_procedures",
        protocolType: "all",
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    sampleBoilerplateTexts.forEach(text => {
      this.boilerplateTexts.set(text.id, text);
    });
    
    // Create initial design state for sample protocol
    const initialDesignState: DesignState = {
      id: "design-state-1",
      label: "Initial Design",
      timestamp: new Date(),
      synopsis: "A Phase 2 study of amivantamab in patients with NSCLC with EGFR exon 20 insertion mutations.",
      protocolType: "interventional_clinical_trial",
      boilerplateSelections: {
        study_id: "BPT-1000",
        ethics_approval: "BPT-1001",
        data_management: "BPT-1002",
        safety_monitoring: "BPT-1003",
        adverse_events: null,
        quality_control: null,
        statistical_methods: null,
        publication_policy: null,
        confidentiality: null,
        protocol_compliance: null,
        regulatory_considerations: null,
        sample_size_justification: null,
        informed_consent: null,
        subject_withdrawal: null,
        study_administration: null
      },
      studyParameters: {
        population: {
          ageRange: {
            min: 18,
            max: 75
          },
          gender: "both",
          healthStatus: "Patients with locally advanced or metastatic NSCLC with EGFR exon 20 insertion mutations",
          keyInclusion: [
            "Age ≥ 18 years",
            "Histologically or cytologically confirmed NSCLC with EGFR exon 20 insertion mutation",
            "ECOG performance status 0-1"
          ],
          keyExclusion: [
            "Prior treatment with EGFR-targeted therapy",
            "Known active CNS metastases",
            "Clinically significant cardiovascular disease"
          ]
        },
        intervention: {
          name: "Amivantamab",
          description: "EGFR-MET bispecific antibody",
          dosage: "1050 mg (patients <80 kg) or 1400 mg (patients ≥80 kg)",
          duration: "Until disease progression or unacceptable toxicity",
          frequency: "Weekly for first 4 weeks, then biweekly thereafter"
        },
        comparator: {
          type: "none",
          name: null,
          description: null
        },
        outcomes: {
          primary: [
            {
              name: "Objective Response Rate (ORR)",
              description: "Proportion of patients with complete or partial response according to RECIST v1.1",
              timepoint: "Week 24"
            }
          ],
          secondary: [
            {
              name: "Duration of Response (DOR)",
              description: "Time from initial response to progression or death",
              timepoint: "Up to 2 years"
            },
            {
              name: "Progression-Free Survival (PFS)",
              description: "Time from enrollment to progression or death",
              timepoint: "Up to 2 years"
            }
          ]
        },
        timing: {
          studyDuration: "24 months",
          visitFrequency: "Every 2 weeks for first 8 weeks, then every 3 weeks",
          followUpPeriod: "30 days after last dose for safety; every 2 months for survival up to 2 years"
        },
        design: {
          type: "single-arm",
          blinding: "open-label",
          allocation: "none",
          controlType: "none",
          adaptiveElements: false,
          phaseLevels: ["Phase 2"]
        }
      },
      scientificValue: {
        innovationScore: 0.8,
        knowledgeGapRelevance: 0.9,
        potentialImpact: 0.85,
        evidenceQuality: 0.75
      },
      clinicalRelevance: {
        patientCenteredOutcomes: 0.8,
        translationalPotential: 0.75,
        unmetNeedAlignment: 0.9,
        adoptionLikelihood: 0.7
      }
    };

    // Add sample protocols
    const sampleProtocol1: Protocol = {
      id: "EV-AMI-4538",
      title: "Amivantamab Phase 2 NSCLC Study",
      phase: "Phase 2",
      indication: "Non-small Cell Lung Cancer",
      status: "Draft",
      synopsis: "A Phase 2 study of amivantamab in patients with NSCLC with EGFR exon 20 insertion mutations.",
      supplementaryInfo: JSON.stringify(["Patients will be evaluated for response using RECIST v1.1 criteria.", "Primary endpoint is objective response rate (ORR)."]),
      lastEdited: new Date(),
      createdAt: new Date(),
      createdBy: "Demo User",
      userId: 1,
      tableData: JSON.stringify({
        "Administrative Procedures": [
          { assessment: "Informed Consent", values: ["X", "", "", "", "", "", "", "", "", "", ""] },
          { assessment: "Demographics", values: ["X", "", "", "", "", "", "", "", "", "", ""] },
          { assessment: "Medical History", values: ["X", "", "", "", "", "", "", "", "", "", ""] },
          { assessment: "Inclusion/Exclusion Criteria", values: ["X", "X", "", "", "", "", "", "", "", "", ""] }
        ],
        "Clinical Assessments": [
          { assessment: "Physical Examination", values: ["X", "X", "X", "", "", "X", "X", "X", "X", "X", ""] },
          { assessment: "Vital Signs", values: ["X", "X", "X", "X", "X", "X", "X", "X", "X", "X", ""] },
          { assessment: "ECOG Performance Status", values: ["X", "X", "", "", "", "X", "X", "X", "X", "X", ""] },
          { assessment: "12-Lead ECG", values: ["X", "X", "X", "", "", "X", "", "", "X", "", ""] }
        ]
      }),
      tableHeaders: JSON.stringify([
        "Screening\n(Day -28 to -1)",
        "Baseline\n(Day 1)",
        "Cycle 1\nWeek 1",
        "Cycle 1\nWeek 2",
        "Cycle 1\nWeek 3",
        "Cycle 2\nDay 1",
        "Cycle 3\nDay 1",
        "Cycle 4+\nDay 1",
        "End of\nTreatment",
        "Follow-up\n(30 days)",
        "Survival\nFollow-up"
      ]),
      inclusionCriteria: JSON.stringify([
        { id: 1, text: "Age ≥ 18 years", impact: "Standard", aiSuggestion: "" },
        { id: 2, text: "Histologically or cytologically confirmed NSCLC with EGFR exon 20 insertion mutation", impact: "Required", aiSuggestion: "" }
      ]),
      exclusionCriteria: JSON.stringify([
        { id: 1, text: "Prior treatment with EGFR-targeted therapy", impact: "Required", aiSuggestion: "" },
        { id: 2, text: "Known active CNS metastases", impact: "High", aiSuggestion: "Consider allowing stable, treated CNS metastases to increase eligibility" }
      ]),
      dataVariables: JSON.stringify([
        { id: 1, category: "Demographics", name: "Age", type: "Numeric", required: true, aiSuggestion: "" },
        { id: 2, category: "Demographics", name: "Sex", type: "Categorical", required: true, aiSuggestion: "" }
      ]),
      studySchema: JSON.stringify({
        nodes: [
          { id: "1", type: "screening", position: { x: 100, y: 100 }, data: { label: "Screening" } },
          { id: "2", type: "treatment", position: { x: 300, y: 100 }, data: { label: "Amivantamab Treatment" } },
          { id: "3", type: "assessment", position: { x: 500, y: 100 }, data: { label: "Response Assessment" } },
          { id: "4", type: "endpoint", position: { x: 700, y: 100 }, data: { label: "Primary Endpoint: ORR" } }
        ],
        edges: [
          { id: "e1-2", source: "1", target: "2" },
          { id: "e2-3", source: "2", target: "3" },
          { id: "e3-4", source: "3", target: "4" }
        ]
      }),
      statisticalAnalysisPlan: JSON.stringify({
        analysisSets: [
          { name: "Intent-to-Treat (ITT)", definition: "All patients who are enrolled in the study" },
          { name: "Safety Analysis Set", definition: "All patients who received at least one dose of study drug" },
          { name: "Response-Evaluable Set", definition: "All patients who received at least one dose of study drug and had at least one post-baseline tumor assessment" }
        ],
        primaryAnalysis: {
          endpoint: "Objective Response Rate (ORR)",
          method: "The ORR will be calculated as the proportion of patients with confirmed complete response (CR) or partial response (PR) according to RECIST v1.1 criteria.",
          population: "Response-Evaluable Set",
          timing: "24 weeks after last patient enrolled"
        },
        secondaryAnalyses: [
          {
            endpoint: "Duration of Response (DOR)",
            method: "Kaplan-Meier methods will be used to estimate the median DOR and associated 95% confidence intervals.",
            population: "Response-Evaluable Set with Confirmed Response",
            timing: "Final analysis"
          },
          {
            endpoint: "Progression-Free Survival (PFS)",
            method: "Kaplan-Meier methods will be used to estimate the median PFS and associated 95% confidence intervals.",
            population: "Intent-to-Treat",
            timing: "Final analysis"
          }
        ],
        sampleSizeJustification: "A sample size of 40 patients will provide 80% power to detect an improvement in ORR from 20% (historical control) to 40% with a one-sided alpha of 0.05."
      }),
      generatedProtocol: JSON.stringify({}),
      designStates: JSON.stringify([initialDesignState]),
      activeDesignState: "design-state-1"
    };
    
    const sampleProtocol2: Protocol = {
      id: "EV-OSI-2297",
      title: "Osimertinib Combination in EGFR+ NSCLC",
      phase: "Phase 3",
      indication: "Non-small Cell Lung Cancer",
      status: "Final",
      synopsis: "A Phase 3 randomized trial of osimertinib combination therapy in EGFR-mutated NSCLC.",
      supplementaryInfo: JSON.stringify(["The trial will randomize patients 1:1 to osimertinib monotherapy or combination therapy.", "Primary endpoint is progression-free survival."]),
      lastEdited: new Date(),
      createdAt: new Date(),
      createdBy: "Demo User",
      userId: 1,
      tableData: JSON.stringify({}),
      tableHeaders: JSON.stringify([]),
      inclusionCriteria: JSON.stringify([]),
      exclusionCriteria: JSON.stringify([]),
      dataVariables: JSON.stringify([]),
      studySchema: JSON.stringify({}),
      statisticalAnalysisPlan: JSON.stringify({}),
      generatedProtocol: JSON.stringify({}),
      designStates: JSON.stringify([]),
      activeDesignState: null
    };
    
    this.protocols.set(sampleProtocol1.id, sampleProtocol1);
    this.protocols.set(sampleProtocol2.id, sampleProtocol2);
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { 
      ...insertUser, 
      id,
      createdAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }
  
  // Protocol methods
  async getAllProtocols(): Promise<Protocol[]> {
    return Array.from(this.protocols.values());
  }
  
  async getProtocolById(id: string): Promise<Protocol | undefined> {
    return this.protocols.get(id);
  }
  
  async getProtocolsByUserId(userId: number): Promise<Protocol[]> {
    return Array.from(this.protocols.values()).filter(
      (protocol) => protocol.userId === userId
    );
  }
  
  async createProtocol(insertProtocol: InsertProtocol): Promise<Protocol> {
    const now = new Date();
    
    // Ensure designStates and components have default values
    const protocol: Protocol = {
      ...insertProtocol,
      lastEdited: now,
      createdAt: now,
      designStates: insertProtocol.designStates || JSON.stringify([]),
      components: insertProtocol.components || JSON.stringify([]),
      activeDesignState: insertProtocol.activeDesignState || null,
      studySchema: insertProtocol.studySchema || null,
      statisticalAnalysisPlan: insertProtocol.statisticalAnalysisPlan || null,
    };
    
    // Create protocol in storage
    this.protocols.set(protocol.id, protocol);
    this.persistData();
    return protocol;
  }
  
  async updateProtocol(id: string, updates: Partial<InsertProtocol>): Promise<Protocol | undefined> {
    const protocol = this.protocols.get(id);
    if (!protocol) return undefined;
    
    const updatedProtocol: Protocol = {
      ...protocol,
      ...updates,
      lastEdited: new Date()
    };
    
    this.protocols.set(id, updatedProtocol);
    this.persistData();
    return updatedProtocol;
  }
  
  async deleteProtocol(id: string): Promise<boolean> {
    const deleted = this.protocols.delete(id);
    if (deleted) this.persistData();
    return deleted;
  }
  
  // AI generation
  async generateProtocol(data: GenerateProtocol): Promise<Protocol> {
    const id = `EV-AI-${Math.floor(Math.random() * 10000)}`;
    
    // Get protocol type from data or default to interventional clinical trial
    const protocolType = data.protocolType || "interventional_clinical_trial";
    
    let designStructure: any;
    let tableStructure: any;
    let criteriaStructure: any;
    
    // Configure design state based on protocol type
    if (protocolType.includes("cohort") || protocolType.includes("observational")) {
      // Cohort study design parameters
      designStructure = {
        population: {
          ageRange: {
            min: 18,
            max: 75
          },
          gender: "both",
          healthStatus: "Not specified",
          keyInclusion: [
            "Age ≥ 18 years",
            "Provides written informed consent"
          ],
          keyExclusion: [
            "Unable to provide reliable data",
            "Conditions preventing long-term follow-up"
          ]
        },
        intervention: {
          name: "Primary Exposure",
          description: "Main exposure of interest",
          dosage: "N/A - Observational study",
          duration: "Entire follow-up period",
          frequency: "Per observation schedule"
        },
        comparator: {
          type: "none",
          name: "Unexposed/Reference Group",
          description: "Population without exposure of interest"
        },
        outcomes: {
          primary: [
            {
              name: "Primary Outcome",
              description: "Primary outcome measure",
              timepoint: "End of follow-up period"
            }
          ],
          secondary: [
            {
              name: "Secondary Outcome",
              description: "Secondary outcome measure",
              timepoint: "Throughout follow-up period"
            }
          ]
        },
        timing: {
          studyDuration: protocolType.includes("retrospective") ? "Data extraction period" : "24 months",
          visitFrequency: protocolType.includes("retrospective") ? "N/A" : "Every 6 months",
          followUpPeriod: "Entire study period"
        },
        design: {
          type: "observational",
          blinding: "none",
          allocation: "none",
          controlType: "none",
          adaptiveElements: false,
          phaseLevels: []
        }
      };
      
      // Cohort study assessment schedule
      if (protocolType.includes("prospective")) {
        tableStructure = {
          headers: [
            "Baseline",
            "Month 6",
            "Month 12",
            "Month 18",
            "Month 24",
            "Unscheduled\nVisit",
            "End of\nFollow-up"
          ],
          data: {
            "Administrative Procedures": [
              { assessment: "Informed Consent", values: ["X", "", "", "", "", "", ""] },
              { assessment: "Demographics", values: ["X", "", "", "", "", "", ""] },
              { assessment: "Medical History", values: ["X", "", "", "", "", "", ""] }
            ],
            "Exposure Assessment": [
              { assessment: "Primary Exposure Data", values: ["X", "X", "X", "X", "X", "X", "X"] },
              { assessment: "Confounder Assessment", values: ["X", "X", "X", "", "X", "", "X"] }
            ],
            "Outcome Measures": [
              { assessment: "Primary Outcome", values: ["X", "X", "X", "X", "X", "X", "X"] },
              { assessment: "Secondary Outcomes", values: ["X", "X", "X", "", "X", "", "X"] }
            ]
          }
        };
      } else if (protocolType.includes("retrospective")) {
        tableStructure = {
          headers: [
            "Pre-Index\nPeriod",
            "Index\nDate",
            "Follow-up\nPeriod 1",
            "Follow-up\nPeriod 2",
            "End of\nObservation"
          ],
          data: {
            "Data Collection": [
              { assessment: "Baseline Characteristics", values: ["X", "X", "", "", ""] },
              { assessment: "Exposure Data", values: ["", "X", "X", "X", ""] },
              { assessment: "Outcome Assessment", values: ["", "", "X", "X", "X"] },
              { assessment: "Confounder Variables", values: ["X", "X", "X", "X", ""] }
            ]
          }
        };
      }
      
      // Cohort study criteria
      criteriaStructure = {
        inclusion: [
          { id: 1, text: "Age ≥ 18 years", impact: "Standard", aiSuggestion: "" },
          { id: 2, text: "Available for follow-up", impact: "Required", aiSuggestion: "" },
          { id: 3, text: protocolType.includes("retrospective") ? "Complete data available" : "Willing to participate in follow-up visits", impact: "Required", aiSuggestion: "" }
        ],
        exclusion: [
          { id: 1, text: "Conditions preventing adequate follow-up", impact: "Required", aiSuggestion: "" },
          { id: 2, text: "Inability to provide reliable data", impact: "Required", aiSuggestion: "" }
        ]
      };
    } else {
      // Interventional trial design parameters
      designStructure = {
        population: {
          ageRange: {
            min: 18,
            max: 75
          },
          gender: "both",
          healthStatus: "Not specified",
          keyInclusion: [
            "Age ≥ 18 years",
            "Provides written informed consent"
          ],
          keyExclusion: [
            "Prior participation in this study",
            "Pregnancy or breastfeeding"
          ]
        },
        intervention: {
          name: "Study Treatment",
          description: "Investigational Product",
          dosage: "To be determined based on study phase",
          duration: "Until disease progression or unacceptable toxicity",
          frequency: "According to protocol schedule"
        },
        comparator: {
          type: "placebo",
          name: "Placebo",
          description: "Matching placebo"
        },
        outcomes: {
          primary: [
            {
              name: "Primary Endpoint",
              description: "To be determined based on study objectives",
              timepoint: "Study completion"
            }
          ],
          secondary: [
            {
              name: "Secondary Endpoint",
              description: "To be determined based on study objectives",
              timepoint: "Study completion"
            }
          ]
        },
        timing: {
          studyDuration: "12 months",
          visitFrequency: "Every 4 weeks",
          followUpPeriod: "30 days after last dose"
        },
        design: {
          type: "randomized",
          blinding: "double-blind",
          allocation: "parallel",
          controlType: "placebo",
          adaptiveElements: false,
          phaseLevels: ["Phase 2"]
        }
      };
      
      // Interventional trial assessment schedule
      tableStructure = {
        headers: [
          "Screening\n(Day -28 to -1)",
          "Baseline\n(Day 1)",
          "Cycle 1\nWeek 1",
          "Cycle 1\nWeek 2",
          "Cycle 1\nWeek 3",
          "Cycle 2\nDay 1",
          "Cycle 3\nDay 1",
          "Cycle 4+\nDay 1",
          "End of\nTreatment",
          "Follow-up\n(30 days)",
          "Survival\nFollow-up"
        ],
        data: {
          "Administrative Procedures": [
            { assessment: "Informed Consent", values: ["X", "", "", "", "", "", "", "", "", "", ""] },
            { assessment: "Demographics", values: ["X", "", "", "", "", "", "", "", "", "", ""] },
            { assessment: "Medical History", values: ["X", "", "", "", "", "", "", "", "", "", ""] },
            { assessment: "Inclusion/Exclusion Criteria", values: ["X", "X", "", "", "", "", "", "", "", "", ""] }
          ]
        }
      };
      
      // Interventional trial criteria
      criteriaStructure = {
        inclusion: [
          { id: 1, text: "Age ≥ 18 years", impact: "Standard", aiSuggestion: "" },
          { id: 2, text: "Provides written informed consent", impact: "Required", aiSuggestion: "" }
        ],
        exclusion: [
          { id: 1, text: "Prior participation in this study", impact: "Required", aiSuggestion: "" },
          { id: 2, text: "Pregnancy or breastfeeding", impact: "Standard", aiSuggestion: "" }
        ]
      };
    }
    
    // Create an initial design state 
    const initialDesignState: DesignState = {
      id: "design-state-1",
      label: "Initial Design",
      timestamp: new Date(),
      synopsis: data.synopsis,
      studyParameters: designStructure
    };
    
    // Generate study schema based on protocol type
    let schemaNodes = [];
    let schemaEdges = [];
    
    if (protocolType.includes("cohort") || protocolType.includes("observational")) {
      if (protocolType.includes("prospective")) {
        schemaNodes = [
          { id: "1", type: "screening", position: { x: 100, y: 100 }, data: { label: "Subject Recruitment" } },
          { id: "2", type: "studyPhase", position: { x: 300, y: 100 }, data: { label: "Cohort Assignment" } },
          { id: "3", type: "treatment", position: { x: 500, y: 50 }, data: { label: "Exposed Group" } },
          { id: "4", type: "treatment", position: { x: 500, y: 150 }, data: { label: "Unexposed Group" } },
          { id: "5", type: "assessment", position: { x: 700, y: 100 }, data: { label: "Follow-up Assessments" } },
          { id: "6", type: "endpoint", position: { x: 900, y: 100 }, data: { label: "Outcome Assessment" } }
        ];
        
        schemaEdges = [
          { id: "e1-2", source: "1", target: "2" },
          { id: "e2-3", source: "2", target: "3" },
          { id: "e2-4", source: "2", target: "4" },
          { id: "e3-5", source: "3", target: "5" },
          { id: "e4-5", source: "4", target: "5" },
          { id: "e5-6", source: "5", target: "6" }
        ];
      } else if (protocolType.includes("retrospective")) {
        schemaNodes = [
          { id: "1", type: "studyPhase", position: { x: 100, y: 100 }, data: { label: "Data Source Identification" } },
          { id: "2", type: "studyPhase", position: { x: 300, y: 100 }, data: { label: "Index Date Definition" } },
          { id: "3", type: "treatment", position: { x: 500, y: 50 }, data: { label: "Exposed Cohort" } },
          { id: "4", type: "treatment", position: { x: 500, y: 150 }, data: { label: "Unexposed Cohort" } },
          { id: "5", type: "assessment", position: { x: 700, y: 100 }, data: { label: "Retrospective Data Collection" } },
          { id: "6", type: "endpoint", position: { x: 900, y: 100 }, data: { label: "Outcome Analysis" } }
        ];
        
        schemaEdges = [
          { id: "e1-2", source: "1", target: "2" },
          { id: "e2-3", source: "2", target: "3" },
          { id: "e2-4", source: "2", target: "4" },
          { id: "e3-5", source: "3", target: "5" },
          { id: "e4-5", source: "4", target: "5" },
          { id: "e5-6", source: "5", target: "6" }
        ];
      }
    } else {
      // Default interventional trial schema
      schemaNodes = [
        { id: "1", type: "screening", position: { x: 100, y: 100 }, data: { label: "Screening" } },
        { id: "2", type: "randomization", position: { x: 300, y: 100 }, data: { label: "Randomization" } },
        { id: "3", type: "treatment", position: { x: 500, y: 50 }, data: { label: "Treatment Arm" } },
        { id: "4", type: "treatment", position: { x: 500, y: 150 }, data: { label: "Control Arm" } },
        { id: "5", type: "assessment", position: { x: 700, y: 100 }, data: { label: "Assessment" } },
        { id: "6", type: "endpoint", position: { x: 900, y: 100 }, data: { label: "Primary Endpoint" } }
      ];
      
      schemaEdges = [
        { id: "e1-2", source: "1", target: "2" },
        { id: "e2-3", source: "2", target: "3" },
        { id: "e2-4", source: "2", target: "4" },
        { id: "e3-5", source: "3", target: "5" },
        { id: "e4-5", source: "4", target: "5" },
        { id: "e5-6", source: "5", target: "6" }
      ];
    }
    
    // Statistical analysis plan based on protocol type
    let statisticalPlan: any;
    if (protocolType.includes("cohort") || protocolType.includes("observational")) {
      statisticalPlan = {
        analysisSets: [
          { name: "Full Cohort", definition: "All subjects meeting inclusion criteria" },
          { name: "Complete Case Analysis", definition: "Subjects with complete data for primary outcome" },
          { name: "Propensity Score Matched", definition: "Subjects matched on propensity for exposure" }
        ],
        primaryAnalysis: {
          endpoint: "Primary Outcome",
          method: protocolType.includes("prospective") ? 
            "Cox Proportional Hazards Model" : 
            "Logistic Regression with Propensity Score Adjustment",
          population: "Full Cohort",
          timing: "After follow-up completion"
        },
        secondaryAnalyses: [
          {
            endpoint: "Secondary Outcome",
            method: "Multivariable Regression",
            population: "Full Cohort",
            timing: "After follow-up completion"
          }
        ],
        sampleSizeJustification: "Sample size based on expected difference in outcome between exposed and unexposed groups"
      };
    } else {
      statisticalPlan = {
        analysisSets: [
          { name: "Intent-to-Treat (ITT)", definition: "All randomized patients" },
          { name: "Per-Protocol (PP)", definition: "All patients who complete the study without major protocol deviations" },
          { name: "Safety Analysis Set", definition: "All patients who received at least one dose of study drug" }
        ],
        primaryAnalysis: {
          endpoint: "Primary Endpoint",
          method: "To be determined based on endpoint type",
          population: "Intent-to-Treat (ITT)",
          timing: "After study completion"
        },
        secondaryAnalyses: [
          {
            endpoint: "Secondary Endpoint",
            method: "To be determined based on endpoint type",
            population: "Intent-to-Treat (ITT)",
            timing: "After study completion"
          }
        ],
        sampleSizeJustification: "Sample size to be determined based on study objectives and endpoints"
      };
    }
    
    // Create a new protocol with default values based on the synopsis and protocol type
    const protocol: Protocol = {
      id,
      title: `AI Generated Protocol - ${protocolType.replace(/_/g, ' ')} - ${new Date().toLocaleDateString()}`,
      phase: protocolType.includes("interventional") ? "Phase 2" : "N/A",
      indication: "Not Specified",
      status: "Draft",
      protocolType: protocolType,
      synopsis: data.synopsis,
      supplementaryInfo: JSON.stringify(data.supplementaryInfo || []),
      lastEdited: new Date(),
      createdAt: new Date(),
      createdBy: "AI Assistant",
      userId: 1, // Default user
      tableData: JSON.stringify(tableStructure.data),
      tableHeaders: JSON.stringify(tableStructure.headers),
      inclusionCriteria: JSON.stringify(criteriaStructure.inclusion),
      exclusionCriteria: JSON.stringify(criteriaStructure.exclusion),
      dataVariables: JSON.stringify([
        { id: 1, category: "Demographics", name: "Age", type: "Numeric", required: true, aiSuggestion: "" },
        { id: 2, category: "Demographics", name: "Sex", type: "Categorical", required: true, aiSuggestion: "" }
      ]),
      studySchema: JSON.stringify({
        nodes: schemaNodes,
        edges: schemaEdges
      }),
      statisticalAnalysisPlan: JSON.stringify(statisticalPlan),
      generatedProtocol: JSON.stringify({}),
      designStates: JSON.stringify([initialDesignState]),
      activeDesignState: initialDesignState.id,
      components: JSON.stringify([])
    };
    
    this.protocols.set(id, protocol);
    this.persistData();
    return protocol;
  }

  // Comment methods
  async getComments(protocolId: string, designStateId: string): Promise<Comment[]> {
    return Array.from(this.comments.values()).filter(
      comment => comment.protocolId === protocolId && comment.designStateId === designStateId
    );
  }

  async getCommentsBySection(protocolId: string, designStateId: string, section: string): Promise<Comment[]> {
    return Array.from(this.comments.values()).filter(
      comment => comment.protocolId === protocolId && 
                 comment.designStateId === designStateId && 
                 comment.section === section
    );
  }

  async getCommentsBySectionItem(protocolId: string, designStateId: string, section: string, sectionItem: string): Promise<Comment[]> {
    return Array.from(this.comments.values()).filter(
      comment => comment.protocolId === protocolId && 
                 comment.designStateId === designStateId && 
                 comment.section === section &&
                 comment.sectionItem === sectionItem
    );
  }

  async createComment(comment: InsertComment): Promise<Comment> {
    const id = comment.id || `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const fullComment: Comment = {
      ...comment,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.comments.set(id, fullComment);
    this.persistData();
    return fullComment;
  }

  async updateComment(id: string, updates: Partial<InsertComment>): Promise<Comment | undefined> {
    const comment = this.comments.get(id);
    if (!comment) return undefined;
    
    const updatedComment: Comment = {
      ...comment,
      ...updates,
      updatedAt: new Date(),
    };
    this.comments.set(id, updatedComment);
    this.persistData();
    return updatedComment;
  }

  async deleteComment(id: string): Promise<boolean> {
    const deleted = this.comments.delete(id);
    if (deleted) this.persistData();
    return deleted;
  }
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Protocol methods
  async getAllProtocols(): Promise<Protocol[]> {
    return await db.select().from(protocols);
  }

  async getProtocolById(id: string): Promise<Protocol | undefined> {
    const [protocol] = await db.select().from(protocols).where(eq(protocols.id, id));
    return protocol || undefined;
  }

  async getProtocolsByUserId(userId: number): Promise<Protocol[]> {
    return await db.select().from(protocols).where(eq(protocols.userId, userId));
  }

  async createProtocol(protocol: InsertProtocol): Promise<Protocol> {
    const [createdProtocol] = await db
      .insert(protocols)
      .values(protocol)
      .returning();
    return createdProtocol;
  }

  async updateProtocol(id: string, updates: Partial<InsertProtocol>): Promise<Protocol | undefined> {
    const [updatedProtocol] = await db
      .update(protocols)
      .set(updates)
      .where(eq(protocols.id, id))
      .returning();
    return updatedProtocol || undefined;
  }

  async deleteProtocol(id: string): Promise<boolean> {
    const result = await db.delete(protocols).where(eq(protocols.id, id));
    return result.rowCount > 0;
  }

  // Design State methods - handle as JSON in protocol
  async getDesignStates(protocolId: string): Promise<DesignState[]> {
    const protocol = await this.getProtocolById(protocolId);
    if (!protocol) return [];
    
    // Handle both JSON string and already parsed object cases
    let designStates: any[] = [];
    if (protocol.designStates) {
      if (typeof protocol.designStates === 'string') {
        try {
          designStates = JSON.parse(protocol.designStates, (key, value) => {
            // Convert ISO date strings back to Date objects
            if (key === 'timestamp' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
              return new Date(value);
            }
            return value;
          });
        } catch (error) {
          console.error('Error parsing design states JSON:', error);
          designStates = [];
        }
      } else if (Array.isArray(protocol.designStates)) {
        // Already parsed object/array
        designStates = protocol.designStates.map(state => ({
          ...state,
          timestamp: typeof state.timestamp === 'string' ? new Date(state.timestamp) : state.timestamp
        }));
      }
    }
    return designStates;
  }

  async getDesignState(protocolId: string, designStateId: string): Promise<DesignState | undefined> {
    const designStates = await this.getDesignStates(protocolId);
    return designStates.find(state => state.id === designStateId);
  }

  async getActiveDesignState(protocolId: string): Promise<DesignState | undefined> {
    const protocol = await this.getProtocolById(protocolId);
    if (!protocol || !protocol.activeDesignState) return undefined;
    
    return this.getDesignState(protocolId, protocol.activeDesignState);
  }

  async createDesignState(protocolId: string, designState: DesignState): Promise<DesignState> {
    const existingStates = await this.getDesignStates(protocolId);
    const updatedStates = [...existingStates, designState];
    
    // Store as JSON array directly (PostgreSQL json type)
    await this.updateProtocol(protocolId, {
      designStates: updatedStates as any,
      activeDesignState: designState.id
    });
    
    return designState;
  }

  async updateDesignState(protocolId: string, designStateId: string, updates: Partial<DesignState>): Promise<DesignState | undefined> {
    const designStates = await this.getDesignStates(protocolId);
    const stateIndex = designStates.findIndex(state => state.id === designStateId);
    
    if (stateIndex === -1) return undefined;
    
    const updatedState = { ...designStates[stateIndex], ...updates };
    designStates[stateIndex] = updatedState;
    
    // Custom JSON serialization that handles Date objects
    const serializedStates = JSON.stringify(designStates, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    });
    
    await this.updateProtocol(protocolId, {
      designStates: serializedStates
    });
    
    return updatedState;
  }

  async setActiveDesignState(protocolId: string, designStateId: string): Promise<Protocol | undefined> {
    const designState = await this.getDesignState(protocolId, designStateId);
    if (!designState) return undefined;
    
    return this.updateProtocol(protocolId, {
      activeDesignState: designStateId
    });
  }

  async deleteDesignState(protocolId: string, designStateId: string): Promise<boolean> {
    const protocol = await this.getProtocolById(protocolId);
    if (!protocol) return false;
    
    const designStates = await this.getDesignStates(protocolId);
    const filteredStates = designStates.filter(state => state.id !== designStateId);
    
    const updates: Partial<InsertProtocol> = {
      designStates: JSON.stringify(filteredStates)
    };
    
    if (protocol.activeDesignState === designStateId) {
      updates.activeDesignState = filteredStates.length > 0 ? filteredStates[0].id : null;
    }
    
    await this.updateProtocol(protocolId, updates);
    return true;
  }

  // Protocol Component methods - handle as JSON in protocol
  async getComponents(protocolId: string): Promise<ProtocolComponent[]> {
    const protocol = await this.getProtocolById(protocolId);
    if (!protocol) return [];
    
    const components = protocol.components ? 
      (typeof protocol.components === 'string' ? 
        JSON.parse(protocol.components) : protocol.components) : [];
    
    return components;
  }

  async getComponentsByDesignState(protocolId: string, designStateId: string): Promise<ProtocolComponent[]> {
    const components = await this.getComponents(protocolId);
    return components.filter(component => component.designStateId === designStateId);
  }

  async getComponentByTypeAndDesignState(
    protocolId: string, 
    designStateId: string, 
    type: string
  ): Promise<ProtocolComponent | undefined> {
    const components = await this.getComponentsByDesignState(protocolId, designStateId);
    return components.find(component => component.type === type);
  }

  async createComponent(protocolId: string, component: ProtocolComponent): Promise<ProtocolComponent> {
    const existingComponents = await this.getComponents(protocolId);
    const existingIndex = existingComponents.findIndex(
      c => c.designStateId === component.designStateId && c.type === component.type
    );
    
    let updatedComponents;
    
    if (existingIndex !== -1) {
      updatedComponents = [...existingComponents];
      updatedComponents[existingIndex] = {
        ...component,
        updatedAt: new Date()
      };
    } else {
      updatedComponents = [
        ...existingComponents,
        {
          ...component,
          createdAt: component.createdAt || new Date(),
          updatedAt: new Date()
        }
      ];
    }
    
    await this.updateProtocol(protocolId, {
      components: JSON.stringify(updatedComponents)
    });
    
    return component;
  }

  async updateComponent(protocolId: string, component: ProtocolComponent): Promise<ProtocolComponent | undefined> {
    const components = await this.getComponents(protocolId);
    const componentIndex = components.findIndex(
      c => c.designStateId === component.designStateId && c.type === component.type
    );
    
    if (componentIndex === -1) return undefined;
    
    const updatedComponent = {
      ...components[componentIndex],
      ...component,
      updatedAt: new Date()
    };
    
    components[componentIndex] = updatedComponent;
    
    await this.updateProtocol(protocolId, {
      components: JSON.stringify(components)
    });
    
    return updatedComponent;
  }

  async deleteComponent(protocolId: string, designStateId: string, type: string): Promise<boolean> {
    const components = await this.getComponents(protocolId);
    const filteredComponents = components.filter(
      c => !(c.designStateId === designStateId && c.type === type)
    );
    
    if (filteredComponents.length === components.length) return false;
    
    await this.updateProtocol(protocolId, {
      components: JSON.stringify(filteredComponents)
    });
    
    return true;
  }

  // AI generation methods - simplified for now
  async generateProtocol(data: GenerateProtocol): Promise<Protocol> {
    throw new Error("generateProtocol not implemented yet");
  }

  async analyzeDesignState(protocolId: string, designStateId: string): Promise<DesignState> {
    const designState = await this.getDesignState(protocolId, designStateId);
    if (!designState) throw new Error("Design state not found");
    
    return {
      ...designState,
      scientificValue: {
        innovationScore: 0.8,
        knowledgeGapRelevance: 0.7,
        potentialImpact: 0.9,
        evidenceQuality: 0.6
      },
      clinicalRelevance: {
        patientCenteredOutcomes: 0.75,
        translationalPotential: 0.8,
        unmetNeedAlignment: 0.85,
        adoptionLikelihood: 0.7
      }
    };
  }

  async generateAlternativeDesigns(protocolId: string, designStateId: string, count: number): Promise<DesignState[]> {
    const baseState = await this.getDesignState(protocolId, designStateId);
    if (!baseState) throw new Error("Base design state not found");
    
    try {
      const { generateAIAlternativeDesigns } = await import('./services/openai-service');
      return await generateAIAlternativeDesigns(baseState, count);
    } catch (error) {
      console.error("Error generating AI alternatives:", error);
      const { generateAlternativeDesigns } = await import('./utils/design-utils');
      return generateAlternativeDesigns(baseState, count);
    }
  }

  // Boilerplate text methods
  async getAllBoilerplateTexts(): Promise<BoilerplateText[]> {
    return await db.select().from(boilerplateTexts);
  }

  async getBoilerplateTextById(id: string): Promise<BoilerplateText | undefined> {
    const [text] = await db.select().from(boilerplateTexts).where(eq(boilerplateTexts.id, id));
    return text || undefined;
  }

  async getBoilerplateTextsBySection(section: string): Promise<BoilerplateText[]> {
    return await db.select().from(boilerplateTexts).where(eq(boilerplateTexts.section, section));
  }

  async getBoilerplateTextsByProtocolType(protocolType: string): Promise<BoilerplateText[]> {
    const allTexts = await db.select().from(boilerplateTexts);
    return allTexts.filter(text => {
      const types = JSON.parse(text.protocolTypes);
      return types.includes(protocolType) || types.includes("all");
    });
  }

  async getBoilerplateTextsBySectionAndType(section: string, protocolType: string): Promise<BoilerplateText[]> {
    const sectionTexts = await this.getBoilerplateTextsBySection(section);
    return sectionTexts.filter(text => {
      const types = JSON.parse(text.protocolTypes);
      return types.includes(protocolType) || types.includes("all");
    });
  }

  async createBoilerplateText(text: InsertBoilerplateText): Promise<BoilerplateText> {
    const [newText] = await db
      .insert(boilerplateTexts)
      .values(text)
      .returning();
    return newText;
  }

  async updateBoilerplateText(id: string, updates: Partial<InsertBoilerplateText>): Promise<BoilerplateText | undefined> {
    const [updatedText] = await db
      .update(boilerplateTexts)
      .set({ ...updates, lastModified: new Date() })
      .where(eq(boilerplateTexts.id, id))
      .returning();
    return updatedText || undefined;
  }

  async deleteBoilerplateText(id: string): Promise<boolean> {
    const result = await db.delete(boilerplateTexts).where(eq(boilerplateTexts.id, id));
    return result.rowCount > 0;
  }

  // Design state boilerplate text methods
  async getDesignStateById(id: string): Promise<DesignState | undefined> {
    const allProtocols = await this.getAllProtocols();
    for (const protocol of allProtocols) {
      const designStates = protocol.designStates ? 
        JSON.parse(protocol.designStates as string) : [];
      const found = designStates.find((state: DesignState) => state.id === id);
      if (found) return found;
    }
    return undefined;
  }

  async updateDesignStateBoilerplateSelections(
    designStateId: string, 
    boilerplateSelections: Record<BoilerplateSection, string | null>
  ): Promise<DesignState | undefined> {
    const allProtocols = await this.getAllProtocols();
    for (const protocol of allProtocols) {
      const designStates = protocol.designStates ? 
        JSON.parse(protocol.designStates as string) : [];
      const stateIndex = designStates.findIndex((state: DesignState) => state.id === designStateId);
      
      if (stateIndex !== -1) {
        designStates[stateIndex] = {
          ...designStates[stateIndex],
          boilerplateSelections
        };
        
        await this.updateProtocol(protocol.id, {
          designStates: JSON.stringify(designStates)
        });
        
        return designStates[stateIndex];
      }
    }
    return undefined;
  }

  async updateProtocolGeneratedContent(protocolId: string, content: any): Promise<Protocol | undefined> {
    return this.updateProtocol(protocolId, { generatedProtocol: typeof content === "string" ? content : JSON.stringify(content) });
  }

  // Comment methods
  async getComments(protocolId: string, designStateId: string): Promise<Comment[]> {
    return await db.select().from(comments).where(
      and(
        eq(comments.protocolId, protocolId),
        eq(comments.designStateId, designStateId)
      )
    );
  }

  async getCommentsBySection(protocolId: string, designStateId: string, section: string): Promise<Comment[]> {
    return await db.select().from(comments).where(
      and(
        eq(comments.protocolId, protocolId),
        eq(comments.designStateId, designStateId),
        eq(comments.section, section)
      )
    );
  }

  async getCommentsBySectionItem(protocolId: string, designStateId: string, section: string, sectionItem: string): Promise<Comment[]> {
    return await db.select().from(comments).where(
      and(
        eq(comments.protocolId, protocolId),
        eq(comments.designStateId, designStateId),
        eq(comments.section, section),
        eq(comments.sectionItem, sectionItem)
      )
    );
  }

  async createComment(comment: InsertComment): Promise<Comment> {
    const id = comment.id || `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullComment = {
      ...comment,
      id,
      userId: comment.userId || 1 // Default user ID
    };
    
    const [newComment] = await db
      .insert(comments)
      .values(fullComment)
      .returning();
    return newComment;
  }

  async updateComment(id: string, updates: Partial<InsertComment>): Promise<Comment | undefined> {
    const [updatedComment] = await db
      .update(comments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(comments.id, id))
      .returning();
    return updatedComment || undefined;
  }

  async deleteComment(id: string): Promise<boolean> {
    const result = await db.delete(comments).where(eq(comments.id, id));
    return result.rowCount > 0;
  }
}

export const storage = process.env.USE_MEM_STORAGE !== "false"
  ? new MemStorage()
  : new DatabaseStorage();
