# Project Overview: Annotator AI

## 1. Project Summary
**Annotator AI** is a browser-based application designed to automate the evaluation of student image annotations against ground truth (GT) data. 
It solves the problem of manual, time-consuming grading by instantly comparing student bounding boxes, polygons, and skeletons to expert annotations, computing a comprehensive score based on localization, labels, and attributes. 
The intended users are trainers, data labelers, and instructors who need a scalable, transparent, and accurate way to evaluate annotation quality.

## 2. Tech Stack
- **Frontend Framework**: Next.js 15.3.8 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS with `shadcn/ui` components (Radix UI, Lucide React)
- **AI Integration**: `@genkit-ai/firebase`, `@genkit-ai/googleai`, `genkit` (Used for AI-enhanced schema extraction from GT files)
- **Math & Geometry Libraries**: `munkres-js` (Hungarian algorithm for optimal bipartite matching), `polygon-clipping`, `kdbush`
- **Database/Storage**: Fully serverless and browser-based (state and overrides stored in `localStorage`).

## 3. Folder & File Structure
```text
Ai_Annotator/
├── src/
│   ├── ai/          # Genkit AI flows (e.g., extracting schema using Gemini)
│   ├── app/         # Next.js App Router entry points (page.tsx, layout.tsx, globals.css)
│   ├── components/  # React components (ResultsDashboard, AnnotationViewer, UI components)
│   ├── hooks/       # Custom React hooks (use-mobile, use-toast)
│   └── lib/         # Core logic and evaluators (evaluator.ts, polygon-evaluator.ts, types.ts)
├── package.json     # Project dependencies and npm scripts
├── next.config.ts   # Next.js configuration
├── tailwind.config.ts # Tailwind styling rules
└── README.md & README1.md # General documentation and roadmaps
```

**Key Responsibilities**:
- `src/app`: Handles routing and overall layout of the application.
- `src/components`: Contains the interactive UI for uploading files, configuring rules, and visualizing feedback.
- `src/lib`: Contains the heavy-lifting logic for parsing XML/JSON and calculating IoU/scoring.
- `src/ai`: Houses the Google Gemini integration logic to dynamically generate evaluation schemas.

## 4. Architecture & Data Flow
- **Entry Point**: The application starts at `src/app/page.tsx`.
- **Data Flow**:
  1. **Upload**: User uploads a Ground Truth (GT) file (COCO JSON, CVAT XML, or ZIP).
  2. **Schema Extraction**: GT file content is passed to a Genkit flow (`src/ai/flows/genkit.ts`), which queries the Gemini API to extract an `EvalSchema` (labels, attributes, match keys).
  3. **Evaluation**: When student files are uploaded, the core engine (`src/lib/evaluator.ts`) uses a multi-stage process. First, it tries to match by ID. Then, it uses a bipartite matching algorithm (Intersection over Union + Hungarian Algorithm) to optimally pair student annotations to GT annotations.
  4. **Output**: The matched pairs, along with missed/extra annotations, are scored and rendered in the `ResultsDashboard.tsx`.
- **Design Pattern**: The application is highly client-centric (Serverless). Heavy computations are meant to be offloaded to Web Workers to keep the UI thread responsive.

## 5. Key Components / Modules
- **`src/app/page.tsx`**: 
  - *Responsibility*: The main dashboard page orchestrating file uploads, evaluation mode selection (Bounding Box, Polygon, Skeleton), and rendering results.
- **`src/lib/evaluator.ts`**:
  - *Responsibility*: The core scoring engine for bounding boxes.
  - *Key Functions*: `evaluateAnnotations` (runs the matching logic), `calculateIoU` (computes overlap), `findOptimalMatches` (applies the Hungarian algorithm).
  - *Dependencies*: Relies on `munkres-js` and schema types from `src/lib/types.ts`.
- **`src/components/AnnotationViewer.tsx`**:
  - *Responsibility*: Visualizes the original image with GT and student annotations overlaid. Provides instant rule-based feedback (e.g., highlighting gaps or cut-offs).
- **`src/ai/flows/genkit.ts`**:
  - *Responsibility*: Acts as the bridge between the application and Google Gemini to automatically derive evaluation schemas from raw annotation files.

## 6. Core Logic — "Evaluation Engine"
- **Step-by-Step Flow**:
  1. **Grouping**: Annotations are grouped by Image ID.
  2. **Direct Matching**: If a `matchKey` exists in the extracted schema, the engine attempts to directly match annotations.
  3. **Smart Matching**: For unmatched annotations, a cost matrix is built based on IoU (Intersection over Union). `munkres-js` is used to find the optimal assignment (lowest cost/highest overlap) between GT and student boxes.
  4. **Per-Annotation Scoring**: 
     - 50% Localization Accuracy (IoU)
     - 30% Label Match Accuracy
     - 20% Attribute Match Accuracy (using Levenshtein distance for string similarity).
  5. **Overall Score**: The final score blends the Average Match Quality (50%) with a Completeness metric (50%, measured via an F-beta score that penalizes missing or extra boxes).
- **Location**: `src/lib/evaluator.ts`
- **Known Limitations**: String similarity for attributes might be overly sensitive to typos if weights aren't adjusted. AI schema extraction depends strictly on the Gemini API availability.

## 7. Configuration & Environment
- **Environment Variables**:
  - `GEMINI_API_KEY`: Required in a `.env` file to power the AI schema extraction and feedback flows.
- **Run Instructions**:
  - Install dependencies: `npm install`
  - Start dev server: `npm run dev` (Runs Next.js on port 9002)

## 8. Known Issues / TODOs / Incomplete Parts
- **Web Worker Integration**: The README mentions utilizing Web Workers for high-performance processing, but the roadmap also lists "Move heavy-duty file parsing and evaluation logic into a Web Worker" as an incomplete task. The exact state is unclear from the code, needs confirmation.
- **Backend Setup**: `package.json` references a `server/index.ts` script for `dev:server`, but the `server` directory does not currently exist in the codebase.
- **Advanced Skeleton Evaluation**: Support for custom keypoint sigmas is listed as a future roadmap item.
- **Project History**: Storing previous sessions in local storage is incomplete.

## 9. Glossary
- **GT (Ground Truth)**: The verified, expert-created annotations used as the gold standard.
- **IoU (Intersection over Union)**: A geometric measurement of how well two bounding boxes or polygons overlap. 1.0 is a perfect match.
- **F-beta Score**: A metric that combines Precision (avoiding extra/false annotations) and Recall (avoiding missed annotations), balanced to weigh precision slightly higher.
- **Levenshtein Distance**: An algorithm used to calculate how similar two text attributes are by counting the number of edits needed to change one into the other.

## 10. Suggested Next Steps
- **Implement Web Workers**: If not fully implemented, move `evaluateAnnotations` calls into a background worker to prevent UI freezing on large datasets.
- **Persist State**: Implement the project history feature using `localStorage` or `IndexedDB` so users don't lose progress on page refresh.
- **Cleanup package.json**: Remove scripts targeting the non-existent `server` directory (e.g., `npm:dev:server`) if the project is strictly serverless.
