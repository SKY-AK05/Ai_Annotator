
'use server';
/**
 * @fileOverview An AI flow for extracting the evaluation schema from a ground truth file.
 *
 * - extractEvalSchema - A function that analyzes a GT file and returns its schema.
 * - EvalSchemaInput - The input type for the extractEvalSchema function.
 * - EvalSchema - The return type for the extractEvalSchema function.
 */

import {ai} from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import {z} from 'zod';
import type { EvalSchema, EvalSchemaInput } from '@/lib/types';


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

const EvalSchemaInputSchema = z.object({
  gtFileContent: z
    .string()
    .describe('The full text content of the ground truth (GT) annotation file.'),
  userInstructions: z.string().optional().describe("Optional plain-text instructions from the user on how to modify the evaluation logic. This should take precedence over the derived logic from the file content."),
  pseudoCode: z.string().optional().describe("Optional user-edited pseudocode. If userInstructions are absent, this pseudocode should be used to regenerate the structured schema.")
});



const extractEvalSchemaPrompt = ai.definePrompt({
  name: 'extractEvalSchemaPrompt',
  input: {schema: EvalSchemaInputSchema},
  output: {schema: EvalSchemaSchema},
  prompt: `You are an expert at analyzing annotation files (like COCO JSON or CVAT XML) and user instructions to create a structured evaluation schema for student assessments.

Your goal is to generate a valid JSON object matching the requested schema.

If user instructions are provided, they are the HIGHEST priority.
If user-edited pseudocode is provided (and instructions are not), that is the second highest priority.
If neither is provided, derive the logic from the Ground Truth file content.

Follow these steps:

1.  **Analyze Inputs**: Review the provided GT file content, and check for any overriding user instructions or edited pseudocode.

2.  **Determine Logic Source**:
    *   **If 'userInstructions' exists**: Generate the entire schema (labels, attributes, matchKey, and a NEW pseudocode) based *strictly* on these instructions. The GT file is only for context. Example: If the user says "ignore color", you must remove the 'color' attribute and update the pseudocode.
    *   **Else if 'pseudoCode' exists**: The user has edited the pseudocode. Your task is to reverse-engineer it. Parse this pseudocode to create the structured 'labels', 'attributes', and 'matchKey'. The provided pseudocode becomes the canonical source. The original GT file content should be ignored.
    *   **Else**: Derive the schema directly from the GT file content. Identify all unique labels, their attributes, a possible 'matchKey' (like "Annotation No"), and generate a clear, human-readable Python-like pseudocode describing the evaluation steps. For datasets with dense or overlapping annotations where a match key is absent, set 'biDirectionalMatching' to true.

3.  **Generate Pseudocode**: The pseudocode should be a simple, step-by-step summary of the evaluation logic. It will be displayed to a user and must be easy to understand.

This entire process is for the purpose of a temporary student evaluation ('evaluate_student_annotations') and the logic should be derived based on the priority order described above.

{{#if userInstructions}}
----------------
PRIMARY INSTRUCTIONS (HIGHEST PRIORITY):
The user has provided specific plain-text instructions. These MUST be followed and override all other logic.
User Instructions: "{{userInstructions}}"
You must re-generate the entire schema (labels, attributes, matchKey, and pseudocode) to reflect these instructions.
----------------
{{else if pseudoCode}}
----------------
PRIMARY INSTRUCTIONS (FROM PSEUDOCODE):
The user has provided edited pseudocode. This is now the source of truth. Analyze it to generate the structured schema (labels, attributes, matchKey).
User-Provided Pseudocode:
\`\`\`
{{{pseudoCode}}}
\`\`\`
----------------
{{/if}}

Ground Truth File Content (for context or initial generation):
\`\`\`
{{{gtFileContent}}}
\`\`\`
`,
});

const extractEvalSchemaFlow = ai.defineFlow(
  {
    name: 'extractEvalSchemaFlow',
    inputSchema: EvalSchemaInputSchema,
    outputSchema: EvalSchemaSchema,
  },
  async (input) => {
    try {
        const { output } = await extractEvalSchemaPrompt({ ...input }, { model: 'openai/gpt-5.6-luna' });
      
      if (!output) {
        throw new Error("The AI model failed to extract an evaluation schema.");
      }
      return output;
    } catch (error: any) {
        console.error("AI model failed:", error.message);
        // Check if the error is a service availability issue from the AI model
        if (error.cause?.status === 503 || (error.message && (error.message.includes('503') || error.message.includes('429')))) {
            throw new Error("The AI service is temporarily unavailable. Please try again in a few moments.");
        }
        throw new Error(`The AI model failed to process the request: ${error.message}`);
    }
  }
);

export async function extractEvalSchema(input: EvalSchemaInput): Promise<EvalSchema> {
  return await extractEvalSchemaFlow(input);
}
