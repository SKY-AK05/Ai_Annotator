import { genkit } from 'genkit';
import { openAI } from 'genkitx-openai';
import { config } from 'dotenv';
config();

const ai = genkit({
  plugins: [
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
          }
        }
      ]
    }),
  ]
});

async function main() {
  try {
    const response = await ai.generate({
      model: 'openai/gpt-5.6-luna',
      prompt: 'Hello, world!',
    });
    console.log("Success:", response.text);
  } catch (err) {
    console.error("Error occurred:", err);
  }
}
main();
