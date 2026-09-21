

import { z } from "zod";

const EvalLabelSchema = z.object({
    name: z.string().describe("The name of the object class label, e.g., 'Person' or 'licence_plates'."),
    attributes: z.array(z.string()).describe("A list of attributes associated with this label, e.g., ['Mask', 'Age group']. If no attributes exist, return an empty array."),
});

const EvalSchemaSchema = z.object({
    labels: z.array(EvalLabelSchema).describe("A list of all unique object labels found in the ground truth file and their associated attributes."),
    matchKey: z.string().optional().describe("The specific attribute name that should be used as a unique key to match annotations between the GT and student files. This is often 'Annotation No' or a similar unique identifier. If no clear key exists, this can be omitted."),
    pseudoCode: z.string().describe("Human-readable pseudocode that summarizes the evaluation logic derived from the ground truth file schema. This should be editable by a user to adjust the evaluation logic."),
    biDirectionalMatching: z.boolean().optional().describe("Whether to use bi-directional bipartite matching for the fallback evaluation."),
});

export type EvalSchema = z.infer<typeof EvalSchemaSchema>;

const EvalSchemaInputSchema = z.object({
  gtFileContent: z
    .string()
    .describe('The full text content of the ground truth (GT) annotation file.'),
  userInstructions: z.string().optional().describe("Optional plain-text instructions from the user on how to modify the evaluation logic. This should take precedence over the derived logic from the file content."),
  pseudoCode: z.string().optional().describe("Optional user-edited pseudocode. If userInstructions are absent, this pseudocode should be used to regenerate the structured schema.")
});
export type EvalSchemaInput = z.infer<typeof EvalSchemaInputSchema>;


export interface FormValues {
  gtSourceMode: 'file' | 'api';
  studentSourceMode: 'file' | 'api';
  gtFile?: FileList;
  gtCvatTaskIds?: string;
  studentFiles?: FileList;
  cvatTaskIds?: string;
  cvatApiUrl: string;
  cvatApiKey: string;
  imageFiles?: FileList;
  toolType?: string;
  gtDownloadedPath?: string | null;
  studentDownloadedPaths?: string[];
}

export interface CocoCategory {
    id: number;
    name: string;
    supercategory?: string;
    keypoints?: string[];
    skeleton?: number[][];
}

export interface CocoImage {
    id: number;
    file_name: string;
    height: number;
    width: number;
}

// Point is a [number, number] tuple for [x, y]
export type Point = [number, number];

// Polygon is an array of points
export type Polygon = Point[];


export interface PolygonAnnotation {
    id: number;
    image_id: number;
    category_id: number;
    segmentation: Polygon[];
    area: number;
    bbox: [number, number, number, number];
    attributes?: {
        [key: string]: string | undefined;
    };
}


export interface BboxAnnotation {
    id: number;
    image_id: number;
    category_id: number;
    bbox: [number, number, number, number]; // [x,y,width,height]
    attributes?: {
        [key:string]: string | undefined;
    };
    keypoints?: number[];
    num_keypoints?: number;
    segmentation?: Polygon[];
}

export interface CocoJson {
    images: CocoImage[];
    annotations: BboxAnnotation[] | PolygonAnnotation[];
    categories: CocoCategory[];
}

export interface LabelAccuracy {
    correct: number;
    total: number;
    accuracy: number;
}

export interface AttributeAccuracy {
    average_similarity: number;
    total: number;
}

export interface Match {
    gt: BboxAnnotation;
    student: BboxAnnotation;
    iou: number;
    isLabelMatch: boolean;
    attributeSimilarity: number;
    originalScore: number;
    overrideScore?: number | null;
}

export interface SelectedAnnotation {
    imageId: number;
    annotationId: number;
    type: 'match' | 'missed' | 'extra';
}

export interface PolygonMatch {
    gt: PolygonAnnotation;
    student: PolygonAnnotation;
    iou: number;
    deviation: number;
    polygonScore: number;
    attributeScore: number;
    finalScore: number;
}

export interface SkeletonMatch extends Match {
    oks: number;
}


export interface ImageEvaluationResult {
    imageId: number;
    imageName: string;
    matched: Match[];
    missed: { gt: BboxAnnotation }[];
    extra: { student: BboxAnnotation }[];
}


export interface EvaluationResult {
  studentFilename: string;
  source: 'rule-based';
  score: number;
  feedback: string[];
  matched: Match[];
  missed: { gt: BboxAnnotation }[];
  extra: { student: BboxAnnotation }[];
  average_iou: number;
  label_accuracy: LabelAccuracy;
  attribute_accuracy: AttributeAccuracy;
  critical_issues: string[];
  image_results: ImageEvaluationResult[];
  extractedImages?: {name: string, url: string}[];
}


export interface SkeletonEvaluationResult {
    studentFilename: string;
    score: number;
    feedback: string[];
    averageOks: number;
    matched: SkeletonMatch[];
    missed: { gt: BboxAnnotation }[];
    extra: { student: BboxAnnotation }[];
}

export interface PolygonEvaluationResult {
    studentFilename: string;
    score: number;
    feedback: string[];
    averageIoU: number;
    averageDeviation: number;
    averagePolygonScore: number;
    averageAttributeScore: number;
    matched: PolygonMatch[];
    missed: { gt: PolygonAnnotation }[];
    extra: { student: PolygonAnnotation }[];
}


export interface FeedbackIssue {
    edge: 'top' | 'bottom' | 'left' | 'right';
    status: 'gap' | 'cut_off' | 'aligned';
    message: string;
}

export interface Feedback {
    annotationId: number;
    feedbackId: string;
    issues: FeedbackIssue[];
}

export type ScoreOverrides = Record<string, Record<string, Record<string, number>>>;
