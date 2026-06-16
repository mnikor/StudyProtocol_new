# replit.md

## Overview

This is a full-stack clinical protocol development application built with React, Express, and PostgreSQL. The system enables users to create, edit, and generate clinical research protocols with AI assistance. It features a modern web architecture with comprehensive database integration for managing protocols, design states, boilerplate texts, and user data.

## System Architecture

### Frontend Architecture
- **React 18** with TypeScript for type safety and modern development
- **Vite** as the build tool for fast development and optimized production builds
- **TailwindCSS** with Radix UI components for consistent design system
- **React Query** for server state management and caching
- **Wouter** for lightweight client-side routing
- **React Resizable Panels** for flexible UI layouts

### Backend Architecture
- **Express.js** server with TypeScript
- **RESTful API** design with comprehensive route handling
- **File upload handling** with Multer for document processing
- **AI service integration** with OpenAI GPT-4o model for protocol generation
- **External API integration** with ClinicalTrials.gov for trial comparison

### Database Architecture
- **PostgreSQL** as the primary database
- **Drizzle ORM** for type-safe database operations
- **Neon Database** serverless PostgreSQL hosting
- **Schema-driven design** with proper migrations support

## Key Components

### Core Data Models
1. **Users** - User authentication and profile management
2. **Protocols** - Main protocol documents with versioning
3. **Design States** - Different design iterations for protocols
4. **Protocol Components** - Individual sections of protocols
5. **Boilerplate Texts** - Reusable content templates

### AI Integration
- **OpenAI GPT-4o** for content generation and analysis
- **Design quality analysis** with scientific scoring
- **Alternative design generation** for protocol optimization
- **Clinical trial comparison** using ClinicalTrials.gov API
- **Real-time AI chat assistant** for user guidance

### File Processing
- **PDF parsing** with custom text extraction
- **DOCX processing** using Mammoth.js
- **Document generation** to DOCX format with proper formatting
- **Multi-format export** capabilities

## Data Flow

1. **User Authentication** → Database user lookup and session management
2. **Protocol Creation** → Database storage with design state initialization
3. **AI Generation** → OpenAI API calls with response processing and storage
4. **File Upload** → Server-side parsing and text extraction
5. **Document Export** → Dynamic document generation from database content
6. **External Comparisons** → ClinicalTrials.gov API integration with result analysis

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless** - Serverless PostgreSQL connection
- **drizzle-orm** - Type-safe ORM with PostgreSQL dialect
- **@anthropic-ai/sdk** - AI service integration (alternative to OpenAI)
- **axios** - HTTP client for external API calls
- **multer** - File upload middleware

### UI Dependencies
- **@radix-ui/react-*** - Comprehensive UI component library
- **@tanstack/react-query** - Server state management
- **tailwindcss** - Utility-first CSS framework
- **lucide-react** - Icon library

### Document Processing
- **pdf-parse** - PDF text extraction
- **mammoth** - DOCX file processing
- **docx** - Document generation library
- **showdown** - Markdown to HTML conversion

## Deployment Strategy

### Development Environment
- **Vite dev server** with hot module replacement
- **Express server** with TypeScript compilation via tsx
- **Database migrations** via Drizzle Kit push command
- **Environment variables** for API keys and database configuration

### Production Build
- **Frontend**: Vite build generates optimized static assets
- **Backend**: ESBuild bundles server code for Node.js execution
- **Database**: Migrations applied via `drizzle-kit push`
- **Environment**: Production environment variables required

### Required Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - OpenAI API access (optional but recommended)

## Changelog

```
Changelog:
- August 26, 2025. Major Study Schema component overhaul with professional-grade clinical study visualization
  - Implemented semantic meta-model with TypeScript interfaces for clinical entities (phases, arms, visits, procedures, endpoints)
  - Added Dagre-based automatic layout system with protocol-type-specific positioning and swimlane support
  - Implemented connection validation rules preventing invalid study design connections between nodes
  - Enhanced export capabilities: SVG (scalable vector), PNG (raster), JSON (semantic model), SPIRIT-style procedure matrix CSV
  - Added real-time validation system with error/warning feedback for study design compliance
  - Introduced business ID tracking for semantic persistence and comment system integration
  - Created protocol-type-aware node categories with contextual node type availability
  - Added auto-layout toggle and improved manual layout controls with vertical/horizontal orientation
  - Implemented collapsible validation panel showing design rule violations and suggestions
  - Enhanced AI generation to work with semantic model for more accurate schema generation
- August 19, 2025. Implemented comprehensive exposure modeling and protocol-type-specific form fields
  - Added Exposure Definition sections for studies requiring exposure-outcome relationships:
    * Prospective Cohort: Exposure name, definition, ascertainment, categories, exposure window
    * Retrospective Cohort: Exposure name, definition, ascertainment, categories, lookback period  
    * MAIC Studies: Target/comparator treatments, population sources, matching variables
    * Secondary Data Analysis: Exposure optional (often descriptive studies)
  - Enhanced protocol-type-specific form fields for all endpoint/outcome types:
    * Interventional: Time Point, Assessment Method, Statistical Approach
    * Observational: Data Source, Outcome Ascertainment, Validation Approach
    * Survey: Measurement Instrument, Scale/Scoring, Reliability/Validity
    * Delphi: Consensus Threshold, Maximum Rounds, Stability Measure
    * MAIC: Effect Measure, Weighting Approach, Sensitivity Analysis
  - Improved scientific accuracy with study-type-appropriate data collection
- August 17, 2025. Implemented protocol-type-aware terminology in Statistical Analysis Plan
  - Fixed incorrect use of "Endpoints" terminology for all study types
  - Statistical Analysis Plan now uses correct terminology based on protocol type:
    * Interventional trials: "Primary/Secondary/Exploratory Endpoints"
    * Observational studies (cohort, secondary data): "Primary/Secondary/Exploratory Outcomes"  
    * Survey/qualitative studies: "Primary/Secondary/Exploratory Measures"
    * Delphi consensus studies: "Primary/Secondary/Exploratory Questions"
    * MAIC studies: "Primary/Secondary/Exploratory Outcomes"
  - Enhanced user experience with contextually appropriate terminology
- August 15, 2025. Fixed file upload and protocol persistence issues
  - Fixed critical database constraint violations by creating default system user
  - Resolved timestamp serialization issues in protocol updates
  - Fixed design state storage and retrieval from JSON fields in PostgreSQL
  - Restored TITAN protocol data (EV-2825) with proper design state linking
  - File upload functionality now works correctly for all supported file types (.txt, .pdf, .doc, .docx)
  - Protocols now persist properly between sessions with active design states
- August 15, 2025. Completed Word-like commenting system across entire application
  - Extended CommentTrigger implementation to all remaining tabs (Study Schema, Generate Protocol, Statistical Analysis Plan)
  - Added strategic comment placement at key user interaction points including node editing, protocol sections, sample size configuration, and endpoint management
  - Implemented floating overlay commenting system that preserves layout integrity while providing Word-like functionality
  - Resolved activeDesignState prop passing to ensure proper comment integration across all components
  - Commenting system now fully functional across Schedule of Activities, Statistical Analysis Plan, Study Schema, Generate Protocol, Inclusion/Exclusion Criteria, and Data Variables tabs
- July 2, 2025. Enhanced AI generation with exploratory endpoints and estimands for interventional trials
  - Updated OpenAI service to generate exploratory endpoints alongside primary and secondary endpoints
  - Added comprehensive estimands support following ICH E9(R1) guidelines with four key components: population, variable, population-level summary, and intercurrent event handling strategy
  - Enhanced AI prompts to provide specific guidance for endpoint and estimand generation including intercurrent event strategies (treatment_policy, composite, hypothetical, while_on_treatment, principal_stratum)
  - Updated response processing to handle new exploratory endpoints and estimands fields
  - Enhanced fallback plans to include exploratory endpoints and sample estimands for robust error handling
- July 2, 2025. Extended interim analysis support to prospective observational studies
  - Added interim analysis capability for prospective cohort studies with monitoring for baseline characteristics, recruitment progress, safety, and data quality
  - Enhanced monitoring criteria to include recruitment/enrollment and baseline characteristics monitoring options
  - Updated AI generation logic to include interim analysis planning for prospective studies
  - Added manual "Add Interim Analysis" and "Add Bias Assessment" buttons for user-initiated additions during protocol development
- July 2, 2025. Enhanced bias assessment and interim analysis with full user editability
  - Created comprehensive editable bias assessment interface in SAP tab allowing modification of risk levels, confounders, mitigation strategies, propensity score analysis, and negative controls
  - Added editable interim analysis component for interventional studies with customizable stopping rules, alpha spending functions, and data monitoring committee details
  - Enhanced Generate tab integration to automatically incorporate both bias assessment and interim analysis data into protocol generation
  - All edits automatically save to statistical analysis plan and flow into generated protocol documents
- July 2, 2025. Implemented bias assessment integration from SAP tab into Generate tab
  - Statistical Considerations and Bias Management sections now automatically incorporate bias assessment data
  - Added visual indicators showing bias assessment integration status for observational studies
  - Enhanced protocol generation with specific bias types, mitigation strategies, propensity score methods, and negative controls
- June 29, 2025. Initial setup
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```