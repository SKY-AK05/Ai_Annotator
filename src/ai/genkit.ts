import { genkit } from 'genkit';
import { openAI } from 'genkitx-openai';
import { config } from 'dotenv';
import { z } from 'zod';

config();

const plugins = [
  openAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    baseURL: process.env.AZURE_OPENAI_ENDPOINT,
    models: [
      {
        name: 'gpt-5.6-luna',
        info: {
          label: 'Azure GPT-5.6 Luna',
          versions: ['2026-07-09'],
          supports: {
            multiturn: true,
            systemRole: true,
          }
        },
        configSchema: z.unknown()
      }
    ]
  }),
];

export const ai = genkit({
  plugins,
});
