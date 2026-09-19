'use server';

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'zod';

const DatasetStructureSchema = z.object({
    annotationsStructureType: z.enum(['flat_root', 'flat_nested', 'nested_in_images'])
        .describe("flat_root: The root of JSON is an array of boxes. flat_nested: Root is an object with an array like .annotations. nested_in_images: Root has .images array, and each image contains its boxes."),
    annotationsArrayKey: z.string().optional()
        .describe("The key containing the annotations array (e.g. 'annotations'). Empty if root is array."),
    boxesArrayKeyInImage: z.string().optional()
        .describe("If nested_in_images, the key inside each image object containing the boxes (e.g. 'boxes', 'objects')."),
    bboxKeyInAnnotation: z.string().optional()
        .describe("The key inside an annotation object containing the bounding box coordinates (e.g. 'bbox', 'box'). Empty if the annotation itself is the array of coordinates."),
    coordinateFormat: z.enum(['xywh', 'x1y1x2y2', 'cxcywh'])
        .describe("xywh: [x,y,width,height], x1y1x2y2: [xmin,ymin,xmax,ymax], cxcywh: [center_x,center_y,width,height]."),
    isNormalized: z.boolean()
        .describe("True if the coordinates are represented as fractions from 0.0 to 1.0 (like YOLO), False if they are absolute pixels."),
    categoryIdKey: z.string().optional()
        .describe("The key containing the class label or category id (e.g. 'category_id', 'label', 'class', 'name')."),
    imageIdKey: z.string().optional()
        .describe("The key containing the image ID or filename (e.g. 'image_id', 'filename'). Only required if not nested_in_images.")
});

export type DatasetStructure = z.infer<typeof DatasetStructureSchema>;

const detectStructurePrompt = ai.definePrompt({
    name: 'detectStructurePrompt',
    input: { schema: z.object({ jsonSnippet: z.string() }) },
    output: { schema: DatasetStructureSchema },
    prompt: `You are an expert data engineer. Analyze the following JSON snippet representing a bounding box dataset.
Your task is to identify its structural format and how the bounding box coordinates are represented.

Determine the coordinate format:
- xywh: Top-left X, Top-left Y, Width, Height
- x1y1x2y2: Top-left X, Top-left Y, Bottom-right X, Bottom-right Y
- cxcywh: Center X, Center Y, Width, Height

Determine if coordinates are normalized (0 to 1) or absolute pixels.
Determine where the annotations live.

JSON Snippet (Truncated):
\`\`\`json
{{jsonSnippet}}
\`\`\`
`,
});

export const detectDatasetStructureFlow = ai.defineFlow(
    {
        name: 'detectDatasetStructureFlow',
        inputSchema: z.object({ jsonSnippet: z.string() }),
        outputSchema: DatasetStructureSchema,
    },
    async (input) => {
        try {
            const { output } = await detectStructurePrompt({ ...input }, { model: 'openai/gpt-5.6-luna' });
            if (!output) {
                throw new Error("AI failed to extract dataset structure.");
            }
            return output;
        } catch (e) {
            console.error("detectDatasetStructureFlow error:", e);
            throw new Error("Failed to detect dataset structure via AI fallback.");
        }
    }
);
