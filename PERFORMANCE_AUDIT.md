# Annotator AI: Deep Performance Audit

This audit evaluates the real-world performance bottlenecks of Annotator AI, focusing on algorithmic complexity, memory management, and architectural constraints as the application transitions from a browser-only client to a containerized VM deployment.

---

## 1. How It Currently Works (Execution Path)
Currently, the entire application logic—including heavy file parsing and spatial calculations—runs synchronously on the client-side UI thread.

1. **File Upload & Unzipping**: `src/components/EvaluationForm.tsx` collects the files. If a ZIP is provided, `jszip` unzips all contents into memory entirely.
2. **Schema Extraction**: `src/ai/flows/extract-eval-schema.ts` is called asynchronously to hit the Gemini API and deduce the `EvalSchema`.
3. **Synchronous Evaluation Loop**: In `src/app/page.tsx` (`handleEvaluate`), a single `for...of` loop (lines ~337–358) iterates over every student file:
   - **Parsing**: `parseCvatXml` or `JSON.parse` is called per file.
   - **Routing**: Routes to `evaluateAnnotations`, `evaluatePolygons`, or `evaluateSkeletons`.
   - **Pass 1 (ID Match)**: O(N) lookup using a Map.
   - **Pass 2 (Fallback Match)**: Expensive NxM matching (IoU + Hungarian or Greedy).
   - **Scoring**: Calculates Attribute similarity, IoU scoring, and F-beta scores.
4. **Rendering**: `setResults(batchResults)` pushes the massive results array into React state, triggering `ResultsDashboard.tsx` to render everything.
5. **Feedback Caching**: `prefetchAndCacheFeedback(batchResults)` fires off to cache geometric rule feedback.

---

## 2. Algorithmic Complexity Analysis

- **IoU (Bounding Box)**: `calculateIoU` is **O(1)**.
- **Polygon Clipping (IoU)**: `calculatePolygonIoU` uses `polygon-clipping` (`pc.intersection`). Time complexity is **O(V log V)** to **O(V²)** per comparison (where V is the number of vertices). 
- **Polygon Deviation**: `computeDeviations` builds a `KDBush` tree **O(V_gt log V_gt)** and searches it **O(V_ann log V_gt)**. However, if no nearest neighbor is found (radius too small), it falls back to a brute-force loop **O(V_gt × V_ann)**.
- **String Similarity**: `levenshteinDistance` is **O(L1 × L2)** (string lengths).
- **Hungarian Matching (munkres-js)**: `munkres(costMatrix)` runs in **O(K³)** time, where K is `max(N, M)` (number of unmatched GT vs Student annotations per image). 
- **Polygon Greedy Matching**: `evaluatePolygons` uses a nested loop testing every unmatched GT polygon against every unmatched Student polygon **O(N × M × V²)**.

---

## 3. Actual Bottlenecks (Ranked by Impact)

### 🔴 1. CRITICAL: Hungarian Matching O(N³) Scaling
- **Location:** `src/lib/evaluator.ts` -> `findOptimalMatches` (line ~85)
- **Why it's slow:** `munkres-js` is a pure JS implementation of the Hungarian algorithm (O(N³)).
- **Degradation:** If an image has 200 unmapped annotations, it builds a 200x200 matrix (40,000 IoU calculations) and then runs Munkres, which takes `200³ = 8,000,000` operations. Past 300-500 annotations in a single image (e.g., dense crowd detection), this will hang the CPU indefinitely.

### 🔴 2. CRITICAL: Main Thread Blocking (Synchronous Loop)
- **Location:** `src/app/page.tsx` -> `handleEvaluate` (lines ~337-358)
- **Why it's slow:** The `for (const studentFile of studentFiles)` loop executes completely synchronously. 
- **Degradation:** Since there are no Web Workers implemented (despite mentions in the README), evaluating 50 student files will completely freeze the browser/UI thread until finished.

### 🟠 3. HIGH: O(N²) Polygon Clipping without Bounding Box Pre-checks
- **Location:** `src/lib/polygon-evaluator.ts` -> `evaluatePolygons` (Pass 2, line ~162)
- **Why it's slow:** It runs `calculatePolygonIoU(gtPoly.segmentation[0], studentPoly.segmentation[0])` for *every possible pair* of unmatched polygons. Polygon clipping is mathematically intense.
- **Degradation:** Grows geometrically. 100 GT polygons × 100 student polygons = 10,000 full geometry clippings. 
- **Fix:** Missing an AABB (Axis-Aligned Bounding Box) fast-path check. If bounding boxes don't overlap, polygon intersection is impossible (IoU=0).

### 🟡 4. MEDIUM: Memory Bloat via `jszip` and Large State Arrays
- **Location:** `src/app/page.tsx`
- **Why it's slow:** `studentFiles = await Promise.all(filePromises);` loads all extracted string contents of every JSON/XML into RAM simultaneously. Pushing `batchResults` (which includes copies of all annotations) to React state causes massive memory footprint and slow re-renders.

---

## 4. Docker/VM-Specific Considerations

Moving from a browser constraint to a containerized backend unlocks new possibilities but breaks some current paradigms:

1. **Client-Side Heavy Lifting is Anti-Pattern here:** You have VM compute available. The evaluation logic (`evaluator.ts`) and XML parsing should move to Node.js backend routes (e.g., Next.js API Routes or a standalone worker). Sending MBs of JSONs back and forth to the client just to evaluate is unnecessary.
2. **State & Overrides (`localStorage`):** The `ScoreOverrides` logic relies heavily on browser `localStorage`. In a centralized deployment, if a trainer logs into a different machine, they lose all overrides. This needs to move to a PostgreSQL/MongoDB database.
3. **Missing Concurrency Queue:** If 5 trainers upload 5 batches simultaneously, a Node.js server attempting to synchronously parse and `munkres` match all of them will block the Node Event Loop, taking down the whole server. You *must* implement a job queue (like BullMQ + Redis) or use separate Worker Threads to isolate evaluation tasks.
4. **Gemini API Throttling:** Client-side requests were dispersed by user IPs. Moving to a VM means all Gemini traffic originates from one IP. Ensure exponential backoff/retries are in place for schema extraction.

---

## 5. Quick Wins vs Structural Fixes

### Quick Wins (Low Effort, High Impact)
*   **AABB Pre-check for Polygons:** Before calling `pc.intersection` in `polygon-evaluator.ts`, calculate the Min/Max X/Y for both polygons. If they don't intersect, `continue`.
*   **Yield the Main Thread:** In `page.tsx`, add `await new Promise(r => setTimeout(r, 0))` inside the `studentFiles` loop to briefly yield the thread, preventing the "Page Unresponsive" browser crash.
*   **Cap Munkres Execution:** Add a safety check in `evaluator.ts`. If `remainingGt.length > 250`, skip the Hungarian algorithm and fallback to O(N²) Greedy matching to prevent infinite hangs.

### Structural Fixes (High Effort, Required for Scale)
*   **Backend Evaluation:** Move the `evaluateAnnotations` logic out of React and into a Next.js Server Action or API Route.
*   **Job Queue (BullMQ/Redis):** Wrap the evaluation in a background job system so the API responds instantly with a `jobId` and the frontend polls for completion.
*   **Database Migration:** Move user sessions, ground truth storage, and `ScoreOverrides` out of the browser and into a relational database.

---

## 6. Suggested Fix Order

1. **(Quick Win)** Add the AABB overlap pre-check in `polygon-evaluator.ts`. This instantly saves massive CPU cycles for polygon tasks.
2. **(Quick Win)** Add an annotation cap or greedy fallback to `findOptimalMatches` in `evaluator.ts` so dense datasets don't crash the tab/server.
3. **(Structural)** Extract `evaluateAnnotations` into an API route `/api/evaluate` and use native Node.js `worker_threads` to process them off the main event loop.
4. **(Structural)** Add a PostgreSQL database (Prisma/Drizzle) to persist `EvaluationResults` and `ScoreOverrides` persistently, phasing out `localStorage`.
5. **(Structural)** Implement BullMQ/Redis for queuing if the deployment anticipates concurrent users.
