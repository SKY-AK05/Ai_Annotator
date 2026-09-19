import { Queue, Worker } from 'bullmq';
import { evaluateAnnotations, recalculateOverallScore } from './evaluator';
import { parseCvatXml } from './cvat-xml-parser';
import { parseUniversalBboxDataset } from './universal-bbox-parser';
import type { CocoJson, EvalSchema, EvaluationResult, ScoreOverrides } from './types';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

// Singleton pattern for Next.js dev environment to avoid duplicate queues/workers
const globalForBullMQ = global as unknown as {
    evaluationQueue?: Queue;
    evaluationWorker?: Worker;
};

export const evaluationQueue = globalForBullMQ.evaluationQueue || new Queue('EvaluationQueue', { connection });
if (process.env.NODE_ENV !== 'production') globalForBullMQ.evaluationQueue = evaluationQueue;

export interface EvaluationJobData {
    gtFileContent: string;
    evalSchema: EvalSchema;
    toolType: string;
    scoreOverrides: ScoreOverrides;
    studentFiles: { name: string; content: string }[];
}

export const evaluationWorker = globalForBullMQ.evaluationWorker || new Worker('EvaluationQueue', async (job) => {
    const data = job.data as EvaluationJobData;
    const { gtFileContent, evalSchema, toolType, scoreOverrides, studentFiles } = data;
    
    const isXmlFile = (content: string) => content.trim().startsWith('<?xml');

    let gtAnnotations: CocoJson;
    if (toolType === 'cvat_xml' || isXmlFile(gtFileContent)) {
        gtAnnotations = parseCvatXml(gtFileContent);
    } else {
        gtAnnotations = await parseUniversalBboxDataset(gtFileContent);
    }

    const batchResults: EvaluationResult[] = [];
    const totalFiles = studentFiles.length;

    for (let i = 0; i < studentFiles.length; i++) {
        const studentFile = studentFiles[i];
        const studentFileContent = studentFile.content;
        let studentAnnotations: CocoJson;

        if (toolType === 'cvat_xml' || isXmlFile(studentFileContent)) {
            studentAnnotations = parseCvatXml(studentFileContent);
        } else {
            studentAnnotations = await parseUniversalBboxDataset(studentFileContent);
        }
    
        const initialResult = evaluateAnnotations(gtAnnotations, evalSchema, studentAnnotations);
        const finalResult = recalculateOverallScore({
             ...initialResult,
            studentFilename: studentFile.name,
        }, scoreOverrides);

        batchResults.push(finalResult);
        
        // Update job progress
        await job.updateProgress(Math.round(((i + 1) / totalFiles) * 100));
    }

    return batchResults;
}, { connection, concurrency: 4 }); // Limit concurrency to 4 simultaneous heavy jobs
if (process.env.NODE_ENV !== 'production') globalForBullMQ.evaluationWorker = evaluationWorker;

// Handle worker events for logging
evaluationWorker.on('completed', job => {
  console.log(`${job.id} has completed!`);
});

evaluationWorker.on('failed', (job, err) => {
  console.log(`${job?.id} has failed with ${err.message}`);
});
