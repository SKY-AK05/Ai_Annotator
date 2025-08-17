# Annotator AI: Business Overview & Recent Enhancements

## 1\. Purpose of the Tool

Annotator AI was built to **save trainers’ time** by automating the evaluation of student annotations.

* Before: Trainers had to write code, install packages, and manually check results.
* Now: Trainers simply upload the ground truth (GT) and student work → the tool produces scores, results, and reports automatically.

---

## 2\. Key Business Improvements

### ✅ Faster & More Reliable

* Handles **large datasets** (thousands of images × many students) without freezing.
* Trainers see a **progress bar** while evaluations run.

### ✅ Trainer Control

* Trainers can **edit any score** if the automated system gets it wrong.
* Both the system score and trainer’s final score are shown → ensuring transparency and fairness.

### ✅ Accuracy Upgraded

* Old system (“Greedy”) sometimes gave unfair matches → wrong scores.
* New system ensures the **best possible matching** between GT and student work → higher trust in results.

### ✅ Professional Reporting

* Results now include:  
   * Original system scores  
   * Trainer overrides  
   * Final overall scores
* Data can be exported for record-keeping and audits.

---

## 3\. How Scores Are Calculated (High Level)

1. **Annotation Matching**  
   * System matches each GT annotation with the student’s best attempt.  
   * If labels/attributes don’t match, penalties are applied.
2. **Per-Annotation Score (0–100)**  
   * **Overlap accuracy (50%)** – how well the student’s box matches the GT box.  
   * **Label accuracy (30%)** – correct category (car, person, etc.).  
   * **Attribute accuracy (20%)** – extra details (like color, occlusion).
3. **Overall Student Score**  
   * **Quality (50%)** → average of all annotation scores.  
   * **Completeness (50%)** → checks if students found all GT objects and avoided extras (precision/recall balance).

👉 Trainers can override at any step if they disagree.

---

# 📘 How the Evaluation & Scoring Works (Easy Version)

### 1\. What the tool does

* Trainers upload the **Ground Truth (GT)**.
* Students upload their annotations.
* The tool compares them and gives each student a score.

---

### 2\. How the matching works

**Step 1: ID Matching** → if IDs exist, match directly.  
**Step 2: Smart Matching** → system compares all boxes (IoU) and finds the best overall matches.

---

### 3\. How scoring works

* **50 points → IoU (overlap quality)**
* **30 points → Label match**
* **20 points → Attribute match**

Trainer can override scores any time.

---

### 4\. Final Student Score

Overall Score = **Quality (50%) + Completeness (50%)**

* Quality → average match scores.
* Completeness → checks for missing or extra boxes (Precision/Recall).

---

### 5\. Why we stopped using the old Greedy algorithm

Old Greedy = unfair, one-by-one matches.  
New Algorithm = looks at the **whole picture**, ensures fair results.

---

## 4\. Why This Matters for the Organization

* **Efficiency:** Saves trainers hours of manual work.
* **Scalability:** Handles thousands of annotations.
* **Fairness:** Combines AI automation with trainer judgment.
* **Trust:** Transparent scoring system builds confidence.
* **Professionalism:** Enterprise-ready with reports & audits.

---

## 5\. Next Steps

* Expand support to **polygons and skeletons**.
* Add **multi-trainer collaboration features**.
* Explore **backend deployment** for even larger datasets.

---

## 6\. Flow Diagram: How Annotator AI Works

```mermaid
flowchart TD
    A[Trainer uploads GT file] --> B[Students upload their annotations]
    B --> C[System prepares files for evaluation]
    C --> D{Annotation Matching}
    D -->|Step 1: ID Match| E[Direct ID-based matching]
    D -->|Step 2: Smart Match| F[IoU + Hungarian Algorithm]
    E --> G[Per-Annotation Scoring]
    F --> G[Per-Annotation Scoring]
    G --> H[System calculates overall student score]
    H --> I[Trainer reviews & can override scores]
    I --> J[Final Results + Reports Export]




    
