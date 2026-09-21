import { Queue, Worker } from 'bullmq';
import { evaluateAnnotations, recalculateOverallScore } from './evaluator';
import { parseCvatXml } from './cvat-xml-parser';
import { parseUniversalBboxDataset } from './universal-bbox-parser';
import fs from 'fs/promises';
import path from 'path';
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
    cvatTaskIds: string;
    cvatApiUrl: string;
    cvatApiKey: string;
    extractedStudentFiles?: { name: string, content: string }[];
}

export const evaluationWorker = globalForBullMQ.evaluationWorker || new Worker('EvaluationQueue', async (job) => {
    const data = job.data as EvaluationJobData;
    const { gtFileContent, evalSchema, toolType, scoreOverrides, cvatTaskIds, cvatApiUrl, cvatApiKey, extractedStudentFiles } = data;
    
    const isXmlFile = (content: string) => content.trim().startsWith('<?xml');

    let gtAnnotations: CocoJson;
    if (toolType === 'cvat_xml' || isXmlFile(gtFileContent)) {
        gtAnnotations = parseCvatXml(gtFileContent);
    } else {
        gtAnnotations = await parseUniversalBboxDataset(gtFileContent);
    }

    const batchResults: EvaluationResult[] = [];
    
    let studentFiles: { name: string; content: string; extractedImages?: {name: string, url: string}[] }[] = [];
    
    if (extractedStudentFiles && extractedStudentFiles.length > 0) {
        studentFiles = extractedStudentFiles;
    } else {
        const taskIds = cvatTaskIds.split(',').map(id => id.trim()).filter(Boolean);
        const totalFilesApi = taskIds.length;

        // We'll dynamically import JSZip since it might not be imported at the top
        const JSZip = (await import('jszip')).default;
        
        for (const taskId of taskIds) {
            await job.updateProgress(Math.round(((taskIds.indexOf(taskId)) / totalFilesApi) * 50));
            
            let fileBuffer: ArrayBuffer | null = null;
            let attempts = 0;
            
            while (attempts < 20) {
                // Change to fetch the full dataset instead of just annotations to get images
                const res = await fetch(`${cvatApiUrl}/api/tasks/${taskId}/dataset?format=COCO%201.0&action=download`, {
                    headers: {
                        'Authorization': `Bearer ${cvatApiKey}`
                    }
                });
                
                if (res.status === 200 || res.status === 201) {
                    fileBuffer = await res.arrayBuffer();
                    break;
                } else if (res.status === 202) {
                    // Accepted, still processing. Wait 2 seconds and retry.
                    await new Promise(r => setTimeout(r, 2000));
                    attempts++;
                } else {
                    throw new Error(`CVAT API Error for Task ${taskId}: ${res.statusText}`);
                }
            }
            
            if (!fileBuffer) {
                throw new Error(`Timed out waiting for CVAT Task ${taskId} annotations export.`);
            }

            const zip = await JSZip.loadAsync(fileBuffer);
            let content: string | null = null;
            const extractedImages: {name: string, url: string}[] = [];
            
            // Create a dedicated folder for this job and task
            const jobImagesDir = path.join(process.cwd(), 'public', 'cvat-images', String(job.id), String(taskId));
            await fs.mkdir(jobImagesDir, { recursive: true });
            
            for (const filename in zip.files) {
                if (filename.endsWith('.json') || filename.endsWith('.xml')) {
                    content = await zip.files[filename].async('string');
                } else if (!zip.files[filename].dir && filename.match(/\.(jpe?g|png|gif|webp)$/i)) {
                    // Extract image
                    const imageBuffer = await zip.files[filename].async('nodebuffer');
                    const basename = path.basename(filename);
                    const destPath = path.join(jobImagesDir, basename);
                    await fs.writeFile(destPath, imageBuffer);
                    
                    // The URL is relative to the public directory
                    extractedImages.push({
                        name: basename,
                        url: `/cvat-images/${job.id}/${taskId}/${basename}`
                    });
                }
            }
            
            if (!content) {
                throw new Error(`Could not find an annotation file in the export for Task ${taskId}.`);
            }
            
            studentFiles.push({ 
                name: `Task_${taskId}`, 
                content,
                extractedImages
            });
        }
    }

    const totalFiles = studentFiles.length || 1;

    for (let i = 0; i < studentFiles.length; i++) {
        await job.updateProgress(50 + Math.round((i / studentFiles.length) * 50));
        const studentFile = studentFiles[i];
        const studentFileContent = studentFile.content;
        let studentAnnotations: CocoJson;

        if (toolType === 'cvat_xml' || isXmlFile(studentFileContent)) {
            studentAnnotations = parseCvatXml(studentFileContent);
        } else {
            studentAnnotations = await parseUniversalBboxDataset(studentFileContent);
        }
    
        const initialResult = evaluateAnnotations(gtAnnotations, evalSchema, studentAnnotations);
        
        // Pass the extracted images through to the final result if they exist
        const finalResult = recalculateOverallScore({
             ...initialResult,
            studentFilename: studentFile.name,
            extractedImages: (studentFile as any).extractedImages || []
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
