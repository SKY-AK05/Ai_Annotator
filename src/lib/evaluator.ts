
import type { EvaluationResult, CocoJson, BboxAnnotation, LabelAccuracy, AttributeAccuracy, Match, ImageEvaluationResult, SkeletonEvaluationResult, SkeletonMatch, PolygonAnnotation, ScoreOverrides } from './types';
import type { EvalSchema } from './types';
import munkres from 'munkres-js';


// Simple IoU (Intersection over Union) calculation for bounding boxes
function calculateIoU(boxA: number[], boxB: number[]): number {
    const [ax1, ay1, aw, ah] = boxA;
    const [bx1, by1, bw, bh] = boxB;
    const ax2 = ax1 + aw;
    const ay2 = ay1 + ah;
    const bx2 = bx1 + bw;
    const b2y2 = by1 + bh;

    const x_left = Math.max(ax1, bx1);
    const y_top = Math.max(ay1, by1);
    const x_right = Math.min(ax2, bx2);
    const y_bottom = Math.min(ay2, b2y2);

    if (x_right < x_left || y_bottom < y_top) {
        return 0.0;
    }

    const intersection_area = (x_right - x_left) * (y_bottom - y_top);
    const boxA_area = aw * ah;
    const boxB_area = bw * bh;
    const union_area = boxA_area + boxB_area - intersection_area;

    return union_area > 0 ? intersection_area / union_area : 0;
}

// Levenshtein distance for string similarity
function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}


function getStringSimilarity(str1: string, str2: string): number {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;
    const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    return (maxLength - distance) / maxLength;
}

function getAnnotationAttribute(annotation: BboxAnnotation | PolygonAnnotation, key: string): string | undefined {
    return annotation.attributes?.[key];
}

const MAX_MUNKRES_ANNOTATIONS = 250;

function findOptimalMatches(
    gtAnns: BboxAnnotation[],
    studentAnns: BboxAnnotation[],
    iouThreshold: number
): { gtIndex: number; studentIndex: number; iou: number }[] {
    if (!gtAnns.length || !studentAnns.length) {
        return [];
    }

    const matches: { gtIndex: number; studentIndex: number; iou: number }[] = [];

    // Fallback: If annotation count is too high, Munkres (O(N^3)) will hang the thread.
    // Use a Greedy O(N^2 log N) fallback instead.
    if (Math.max(gtAnns.length, studentAnns.length) > MAX_MUNKRES_ANNOTATIONS) {
        console.warn(`[Performance Warning] High annotation count detected (${gtAnns.length} GT, ${studentAnns.length} Student). Falling back to Greedy matching to prevent UI freeze.`);
        
        const possibleMatches: { gtIndex: number; studentIndex: number; iou: number }[] = [];
        for (let i = 0; i < gtAnns.length; i++) {
            for (let j = 0; j < studentAnns.length; j++) {
                const iou = calculateIoU(gtAnns[i].bbox, studentAnns[j].bbox);
                if (iou >= iouThreshold) {
                    possibleMatches.push({ gtIndex: i, studentIndex: j, iou });
                }
            }
        }
        
        // Sort by highest IoU first
        possibleMatches.sort((a, b) => b.iou - a.iou);
        
        const gtUsed = new Set<number>();
        const studentUsed = new Set<number>();
        
        for (const match of possibleMatches) {
            if (!gtUsed.has(match.gtIndex) && !studentUsed.has(match.studentIndex)) {
                matches.push(match);
                gtUsed.add(match.gtIndex);
                studentUsed.add(match.studentIndex);
            }
        }
        return matches;
    }

    // Standard Hungarian Algorithm
    const costMatrix = gtAnns.map(gt =>
        studentAnns.map(student => {
            const iou = calculateIoU(gt.bbox, student.bbox);
            // Cost is 1 - IoU. Lower cost is better. High cost for pairs below threshold.
            return iou >= iouThreshold ? 1 - iou : 1_000_000;
        })
    );

    const assignments = munkres(costMatrix) as [number, number][];

    for (const [gtIndex, studentIndex] of assignments) {
        const cost = costMatrix[gtIndex][studentIndex];
        if (cost < 1_000_000) {
            matches.push({
                gtIndex,
                studentIndex,
                iou: 1 - cost,
            });
        }
    }
    return matches;
}


function calculateMatchScore(iou: number, isLabelMatch: boolean, attributeSimilarity: number): number {
    const iouWeight = 0.5;
    const labelWeight = 0.3;
    const attrWeight = 0.2;

    const iouScore = iou * 100;
    const labelScore = isLabelMatch ? 100 : 0;
    const attrScore = attributeSimilarity * 100;

    return (iouScore * iouWeight) + (labelScore * labelWeight) + (attrScore * attrWeight);
}


export function recalculateOverallScore(results: EvaluationResult, overrides: ScoreOverrides): EvaluationResult {
    const studentOverrides = overrides[results.studentFilename] || {};
    let totalScoreFromMatches = 0;
    let matchedCount = 0;
    
    // Deep clone to avoid direct state mutation
    const newResults = JSON.parse(JSON.stringify(results)) as EvaluationResult;

    newResults.image_results.forEach(ir => {
        ir.matched.forEach(match => {
            const override = studentOverrides[ir.imageId]?.[match.gt.id];
            if (override !== undefined && override !== null) {
                match.overrideScore = override;
            } else {
                match.overrideScore = null; // Ensure it's reset if override is removed
            }
            totalScoreFromMatches += match.overrideScore ?? match.originalScore;
            matchedCount++;
        });
    });

    const averageMatchScore = matchedCount > 0 ? totalScoreFromMatches / matchedCount : 0;

    // Apply penalties for missed/extra annotations
    const totalGt = newResults.matched.length + newResults.missed.length;
    const totalStudent = newResults.matched.length + newResults.extra.length;
    const precision = totalStudent > 0 ? matchedCount / totalStudent : 0;
    const recall = totalGt > 0 ? matchedCount / totalGt : 0;

    // F-beta score with beta=0.5 to weigh precision more than recall
    const fbetaScore = (precision > 0 || recall > 0) ? (1.25 * precision * recall) / (0.25 * precision + recall) * 100 : 0;

    // Recalculate final score with the new average match score
    newResults.score = Math.round((fbetaScore * 0.5) + (averageMatchScore * 0.5));
    
    return newResults;
}


export function evaluateAnnotations(gtJson: CocoJson, schema: EvalSchema, studentJson: CocoJson): Omit<EvaluationResult, 'studentFilename'> {
    const IOU_THRESHOLD = 0.5;
    const matchKey = schema.matchKey;

    const allGtAnnotations = gtJson.annotations as BboxAnnotation[];
    const allStudentAnnotations = studentJson.annotations as BboxAnnotation[];

    const gtCategories = new Map((gtJson.categories || []).map(c => [c.id, c.name]));
    const studentCategories = new Map((studentJson.categories || []).map(c => [c.id, c.name]));
    
    const gtImages = new Map((gtJson.images || []).map(i => [i.id, i.file_name.split('/').pop()!]));
    const studentImages = new Map((studentJson.images || []).map(i => [i.id, i.file_name.split('/').pop()!]));

    const matched: Match[] = [];
    
    const studentMatchedIds = new Set<number>();
    const gtMatchedIds = new Set<number>();
    
    let totalIou = 0;
    let correctLabelCount = 0;
    let totalAttributeSimilaritySum = 0;
    let attributeComparisonsCount = 0;

    // Group annotations by image base name instead of internal image ID
    const gtAnnsByImageName = allGtAnnotations.reduce((acc, ann) => {
        const imgName = gtImages.get(ann.image_id);
        if (imgName) {
            (acc[imgName] = acc[imgName] || []).push(ann);
        }
        return acc;
    }, {} as Record<string, BboxAnnotation[]>);

    const studentAnnsByImageName = allStudentAnnotations.reduce((acc, ann) => {
        const imgName = studentImages.get(ann.image_id);
        if (imgName) {
            (acc[imgName] = acc[imgName] || []).push(ann);
        }
        return acc;
    }, {} as Record<string, BboxAnnotation[]>);
    
    // We evaluate over all images present in the GT
    const imageNames = Array.from(new Set(gtImages.values()));
    const image_results: ImageEvaluationResult[] = [];

    for (const imageName of imageNames) {
        const gtAnnotations = gtAnnsByImageName[imageName] || [];
        const studentAnnotations = studentAnnsByImageName[imageName] || [];
        const imageUsedStudentIds = new Set<number>();
        
        // Find the corresponding GT image ID for reporting
        let imageId = -1;
        for (const [id, name] of gtImages.entries()) {
            if (name === imageName) { imageId = id; break; }
        }

        const imageMatched: Match[] = [];

        // First pass: Match using the unique key if it exists
        if (matchKey) {
            const studentMap = new Map<string, BboxAnnotation>();
            studentAnnotations.forEach(ann => {
                if (studentMatchedIds.has(ann.id)) return;
                const key = getAnnotationAttribute(ann, matchKey);
                if(key) studentMap.set(key, ann);
            });

            for (const gt of gtAnnotations) {
                if (gtMatchedIds.has(gt.id)) continue;
                const key = getAnnotationAttribute(gt, matchKey);
                if (key && studentMap.has(key)) {
                    const student = studentMap.get(key)!;
                    
                    gtMatchedIds.add(gt.id);
                    studentMatchedIds.add(student.id);
                    imageUsedStudentIds.add(student.id);

                    const iou = calculateIoU(gt.bbox, student.bbox);
                    totalIou += iou;

                    const gtLabel = gtCategories.get(gt.category_id);
                    const studentLabel = studentCategories.get(student.category_id);
                    const isLabelMatch = gtLabel === studentLabel;
                    if(isLabelMatch) correctLabelCount++;

                    let pairAttributeSimilarity = 0;
                    const labelSchema = schema.labels.find(l => l.name === gtLabel);
                    if (labelSchema && labelSchema.attributes.length > 0) {
                        let currentPairSimilaritySum = 0;
                        let currentPairAttributeCount = 0;
                        for (const attrName of labelSchema.attributes) {
                             if (attrName === matchKey || attrName === 'label') continue;
                            const gtAttr = getAnnotationAttribute(gt, attrName) || '';
                            const studentAttr = getAnnotationAttribute(student, attrName) || '';
                            currentPairSimilaritySum += getStringSimilarity(gtAttr, studentAttr);
                            currentPairAttributeCount++;
                        }
                        if (currentPairAttributeCount > 0) {
                            pairAttributeSimilarity = currentPairSimilaritySum / currentPairAttributeCount;
                            totalAttributeSimilaritySum += currentPairSimilaritySum;
                            attributeComparisonsCount += currentPairAttributeCount;
                        }
                    }

                    const originalScore = calculateMatchScore(iou, isLabelMatch, pairAttributeSimilarity);
                    const matchResult = { gt, student, iou, isLabelMatch, attributeSimilarity: pairAttributeSimilarity, originalScore };
                    matched.push(matchResult);
                    imageMatched.push(matchResult);
                    studentMap.delete(key);
                }
            }
        }
        
        // Fallback pass: For annotations not matched by key
        const remainingGt = gtAnnotations.filter(ann => !gtMatchedIds.has(ann.id));
        const remainingStudent = studentAnnotations.filter(ann => !studentMatchedIds.has(ann.id));

        const optimalMatches = findOptimalMatches(remainingGt, remainingStudent, IOU_THRESHOLD);

        for (const { gtIndex, studentIndex, iou } of optimalMatches) {
            const gt = remainingGt[gtIndex];
            const student = remainingStudent[studentIndex];
            
            gtMatchedIds.add(gt.id);
            studentMatchedIds.add(student.id);
            imageUsedStudentIds.add(student.id);

            totalIou += iou;

            const gtLabel = gtCategories.get(gt.category_id);
            const studentLabel = studentCategories.get(student.category_id);
            const isLabelMatch = gtLabel === studentLabel;
            if (isLabelMatch) correctLabelCount++;
            
            let pairAttributeSimilarity = 0;
            const labelSchema = schema.labels.find(l => l.name === gtLabel);

            if (labelSchema && labelSchema.attributes.length > 0) {
                let currentPairSimilaritySum = 0;
                let currentPairAttributeCount = 0;
                for (const attrName of labelSchema.attributes) {
                    if (attrName === matchKey || attrName === 'label') continue;
                    const gtAttr = getAnnotationAttribute(gt, attrName) || '';
                    const studentAttr = getAnnotationAttribute(student, attrName) || '';
                    currentPairSimilaritySum += getStringSimilarity(gtAttr, studentAttr);
                    currentPairAttributeCount++;
                }
                if (currentPairAttributeCount > 0) {
                    pairAttributeSimilarity = currentPairSimilaritySum / currentPairAttributeCount;
                    totalAttributeSimilaritySum += currentPairSimilaritySum;
                    attributeComparisonsCount += currentPairAttributeCount;
                }
            }
            const originalScore = calculateMatchScore(iou, isLabelMatch, pairAttributeSimilarity);
            const matchResult = { gt, student, iou, isLabelMatch, attributeSimilarity: pairAttributeSimilarity, originalScore };
            matched.push(matchResult);
            imageMatched.push(matchResult);
        }
        
        const imageGtIds = new Set(gtAnnotations.map(a => a.id));
        const imageStudentIds = new Set(studentAnnotations.map(a => a.id));

        const imageMissed = gtAnnotations
            .filter(g => !gtMatchedIds.has(g.id))
            .map(gt => ({ gt }));

        const imageExtra = studentAnnotations
            .filter(s => !imageUsedStudentIds.has(s.id) && !studentMatchedIds.has(s.id))
            .map(student => ({ student }));
        
        if (imageMatched.length > 0 || imageMissed.length > 0 || imageExtra.length > 0) {
             image_results.push({
                imageId: imageId,
                imageName: imageName,
                matched: imageMatched,
                missed: imageMissed,
                extra: imageExtra,
            });
        }
    }


    const missed = allGtAnnotations
        .filter(g => !gtMatchedIds.has(g.id))
        .map(gt => ({ gt }));

    const extra = allStudentAnnotations
        .filter(s => !studentMatchedIds.has(s.id))
        .map(student => ({ student }));

    const totalGt = allGtAnnotations.length;
    const totalStudent = allStudentAnnotations.length;

    const label_accuracy: LabelAccuracy = {
        correct: correctLabelCount,
        total: matched.length,
        accuracy: matched.length > 0 ? (correctLabelCount / matched.length) * 100 : 0,
    };

    const attribute_accuracy: AttributeAccuracy = {
        average_similarity: attributeComparisonsCount > 0 ? (totalAttributeSimilaritySum / attributeComparisonsCount) * 100 : 100,
        total: attributeComparisonsCount,
    };
    
    const averageMatchScore = matched.length > 0 ? matched.reduce((acc, m) => acc + m.originalScore, 0) / matched.length : 0;
    
    const precision = totalStudent > 0 ? matched.length / totalStudent : 0;
    const recall = totalGt > 0 ? matched.length / totalGt : 0;
    
    // Using F-beta score with beta=0.5 to weigh precision more than recall
    const fbetaScore = (precision > 0 || recall > 0) ? (1.25 * precision * recall) / (0.25 * precision + recall) * 100 : 0;

    const finalScore = (fbetaScore * 0.5) + (averageMatchScore * 0.5);
    
    const feedback: string[] = [];
    feedback.push(`Detected ${matched.length} out of ${totalGt} ground truth annotations.`);
    if (missed.length > 0) feedback.push(`You missed ${missed.length} annotations.`);
    if (extra.length > 0) feedback.push(`You added ${extra.length} extra annotations.`);
    const mislabeledCount = matched.length - correctLabelCount;
    if (mislabeledCount > 0) feedback.push(`You mislabeled ${mislabeledCount} annotations.`);
    feedback.push(`Average IoU for matched items is ${((matched.length > 0 ? totalIou / matched.length : 0) * 100).toFixed(1)}%.`);
    if(attributeComparisonsCount > 0) feedback.push(`Attribute text accuracy for matched items is ${attribute_accuracy.average_similarity.toFixed(1)}%.`);

    const critical_issues: string[] = [];
    if (recall < 0.5 && totalGt > 5) critical_issues.push(`High number of missed annotations (${missed.length}). Review the GT carefully.`);
    if (precision < 0.5 && totalStudent > 5) critical_issues.push(`High number of extra annotations (${extra.length}). Ensure you only annotate required objects.`);
    if(label_accuracy.accuracy < 70 && label_accuracy.total > 5) critical_issues.push(`Low label accuracy: ${label_accuracy.accuracy.toFixed(1)}%. Double-check object classes.`);
    if(attribute_accuracy.average_similarity < 70 && attribute_accuracy.total > 0) critical_issues.push(`Low attribute accuracy: ${attribute_accuracy.average_similarity.toFixed(1)}%. Check for typos or incorrect text.`);

    return {
        source: 'rule-based',
        score: Math.round(finalScore),
        feedback,
        matched,
        missed,
        extra,
        average_iou: matched.length > 0 ? totalIou / matched.length : 0,
        label_accuracy,
        attribute_accuracy,
        critical_issues,
        image_results,
    };
}


// COCO sigmas for OKS calculation (for human keypoints)
const COCO_SIGMAS = [
    0.026, 0.025, 0.025, 0.035, 0.035, 0.079, 0.079, 0.072, 0.072, 0.062,
    0.062, 0.107, 0.107, 0.087, 0.087, 0.089, 0.089
];


function calculateOKS(gt: BboxAnnotation, student: BboxAnnotation, sigmas: number[]): number {
    const gtKpts = gt.keypoints || [];
    const studentKpts = student.keypoints || [];
    const area = gt.bbox[2] * gt.bbox[3];
    let totalOks = 0;
    let visibleKptsCount = 0;

    for (let i = 0; i < gtKpts.length; i += 3) {
        const gt_v = gtKpts[i + 2];
        if (gt_v > 0) { // Only consider visible GT keypoints
            const gt_x = gtKpts[i];
            const gt_y = gtKpts[i + 1];
            const student_x = studentKpts[i];
            const student_y = studentKpts[i + 1];
            const student_v = studentKpts[i + 2];

            if (student_v > 0) {
                const dx = gt_x - student_x;
                const dy = gt_y - student_y;
                const sigma = sigmas[i / 3];
                const variance = (sigma * 2) ** 2;
                const exponent = (dx ** 2 + dy ** 2) / (2 * area * variance + 1e-9);
                totalOks += Math.exp(-exponent);
            }
            visibleKptsCount++;
        }
    }

    return visibleKptsCount > 0 ? totalOks / visibleKptsCount : 0;
}


export function evaluateSkeletons(gtJson: CocoJson, studentJson: CocoJson): Omit<SkeletonEvaluationResult, 'studentFilename'> {
    const IOU_THRESHOLD = 0.5;

    const allGtAnnotations = gtJson.annotations as BboxAnnotation[];
    const allStudentAnnotations = studentJson.annotations as BboxAnnotation[];
    
    // Assuming a single category for skeletons in this simplified version
    const sigmas = gtJson.categories[0]?.keypoints ? COCO_SIGMAS : [];

    const matched: SkeletonMatch[] = [];
    const studentMatchedIds = new Set<number>();
    
    let totalOks = 0;

    // TODO (Stage 2): Move this synchronous evaluation loop to a server-side backend queue 
    // to prevent blocking the UI thread and to support concurrent users.
    for (const gt of allGtAnnotations) {
        let bestMatch: { student: BboxAnnotation; iou: number } | null = null;
        for (const student of allStudentAnnotations) {
            if (studentMatchedIds.has(student.id)) continue;
            const iou = calculateIoU(gt.bbox, student.bbox);
            if (iou > IOU_THRESHOLD) {
                if (!bestMatch || iou > bestMatch.iou) {
                    bestMatch = { student, iou };
                }
            }
        }
        
        if (bestMatch) {
            studentMatchedIds.add(bestMatch.student.id);
            const oks = calculateOKS(gt, bestMatch.student, sigmas);
            totalOks += oks;
            
            const originalScore = calculateMatchScore(bestMatch.iou, true, 1);
            matched.push({
                gt,
                student: bestMatch.student,
                iou: bestMatch.iou,
                oks,
                isLabelMatch: true, // Simplified for this version
                attributeSimilarity: 1, // Simplified for this version
                originalScore
            });
        }
    }
    
    const missed = allGtAnnotations
        .filter(gt => !matched.some(m => m.gt.id === gt.id))
        .map(gt => ({ gt }));

    const extra = allStudentAnnotations
        .filter(s => !studentMatchedIds.has(s.id))
        .map(student => ({ student }));

    const averageOks = matched.length > 0 ? totalOks / matched.length : 0;
    const score = Math.round(averageOks * 100);

    const feedback = [
        `Evaluation complete. Average Object Keypoint Similarity (OKS) is ${averageOks.toFixed(3)}.`,
        `Matched ${matched.length} skeletons.`,
        `Found ${missed.length} missed and ${extra.length} extra skeletons.`
    ];

    return {
        score,
        feedback,
        averageOks,
        matched,
        missed,
        extra
    };
}
