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
    downloadQueue?: Queue;
    downloadWorker?: Worker;
};

export const evaluationQueue = globalForBullMQ.evaluationQueue || new Queue('EvaluationQueue', { connection });
if (process.env.NODE_ENV !== 'production') globalForBullMQ.evaluationQueue = evaluationQueue;

export const downloadQueue = globalForBullMQ.downloadQueue || new Queue('DownloadQueue', { connection });
if (process.env.NODE_ENV !== 'production') globalForBullMQ.downloadQueue = downloadQueue;

export interface EvaluationJobData {
    gtFileContent: string;
    evalSchema: EvalSchema;
    toolType: string;
    scoreOverrides: ScoreOverrides;
    cvatTaskIds: string;
    cvatApiUrl: string;
    cvatApiKey: string;
    extractedStudentFiles?: { name: string, content: string }[];
    gtDownloadedPath?: string;
    studentDownloadedPaths?: string[];
}

export interface DownloadJobData {
    cvatProjectId: string;
    cvatApiUrl: string;
    cvatApiKey: string;
    type: 'gt' | 'student';
}

export const downloadWorker = globalForBullMQ.downloadWorker || new Worker('DownloadQueue', async (job) => {
    const data = job.data as DownloadJobData;
    const { cvatProjectId, cvatApiUrl, cvatApiKey } = data;
    
    const JSZip = (await import('jszip')).default;
    const downloadedFiles: { name: string, content: string, extractedImages: {name: string, url: string}[] }[] = [];
    
    if (!cvatProjectId) {
        throw new Error("Missing cvatProjectId in download job");
    }

    await job.updateProgress(10);
    
    // 1. Trigger export
    const exportUrl = `${cvatApiUrl}/api/projects/${cvatProjectId}/dataset/export`;
    const exportRes = await fetch(`${exportUrl}?format=CVAT%20for%20images%201.1&save_images=true`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${cvatApiKey}` }
    });
    
    if (!exportRes.ok) {
        throw new Error(`CVAT API Export Error for Project ${cvatProjectId}: ${exportRes.statusText} - ${await exportRes.text()}`);
    }
    
    const exportData = await exportRes.json().catch(() => ({}));
    const rq_id = exportData.rq_id;
    
    if (!rq_id) {
        throw new Error(`No rq_id returned from export request for project ${cvatProjectId}.`);
    }
    
    // 2. Poll for completion
    let result_url = null;
    let attempts = 0;
    while (attempts < 60) {
        await job.updateProgress(10 + Math.min(80, attempts * 2));
        
        const statusRes = await fetch(`${cvatApiUrl}/api/requests/${rq_id}`, {
            headers: { 'Authorization': `Bearer ${cvatApiKey}` }
        });
        
        if (!statusRes.ok) {
            throw new Error(`Failed to check status for request ${rq_id}: ${statusRes.statusText}`);
        }
        
        const statusData = await statusRes.json();
        const status = statusData.status;
        
        if (status === 'finished') {
            result_url = statusData.result_url;
            if (!result_url) {
                throw new Error(`Finished but no result_url in response: ${JSON.stringify(statusData)}`);
            }
            break;
        } else if (status === 'failed') {
            throw new Error(`Export failed: ${statusData.message || JSON.stringify(statusData)}`);
        }
        
        await new Promise(r => setTimeout(r, 5000));
        attempts++;
    }
    
    if (!result_url) {
        throw new Error(`Timed out waiting for CVAT Project ${cvatProjectId} annotations export.`);
    }

    // 3. Download the ZIP file
    await job.updateProgress(90);
    const full_url = result_url.startsWith('http') ? result_url : `${cvatApiUrl}${result_url}`;
    
    const dlRes = await fetch(full_url, {
        headers: { 'Authorization': `Bearer ${cvatApiKey}` }
    });
    
    if (!dlRes.ok) {
        throw new Error(`Failed to download result zip: ${dlRes.statusText}`);
    }
    
    const fileBuffer = await dlRes.arrayBuffer();

    // 4. Extract Zip
    const zip = await JSZip.loadAsync(fileBuffer);
    let content: string | null = null;
    const extractedImages: {name: string, url: string}[] = [];
    
    const jobImagesDir = path.join(process.cwd(), 'public', 'cvat-images', String(job.id), `Project_${cvatProjectId}`);
    await fs.mkdir(jobImagesDir, { recursive: true });
    
    for (const filename in zip.files) {
        if (filename.endsWith('.json') || filename.endsWith('.xml')) {
            content = await zip.files[filename].async('string');
        } else if (!zip.files[filename].dir && filename.match(/\.(jpe?g|png|gif|webp)$/i)) {
            const imageBuffer = await zip.files[filename].async('nodebuffer');
            // Flatten the directory structure for the saved file to avoid creating deep directories,
            // but keep the full filename in the extractedImages metadata for matching later.
            const safeDestName = filename.replace(/[\/\\]/g, '_');
            const destPath = path.join(jobImagesDir, safeDestName);
            await fs.writeFile(destPath, imageBuffer);
            
            extractedImages.push({
                name: filename, // Original zip path (e.g. 'images/default/Task1/img.jpg')
                url: `/cvat-images/${job.id}/Project_${cvatProjectId}/${safeDestName}`
            });
        }
    }
    
    if (!content) {
        throw new Error(`Could not find an annotation file in the export for Project ${cvatProjectId}.`);
    }
    
    downloadedFiles.push({ 
        name: `Project_${cvatProjectId}`, 
        content,
        extractedImages
    });

    // Save metadata to disk instead of returning all strings in memory
    const manifestPath = path.join(process.cwd(), 'public', 'cvat-images', String(job.id), 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(downloadedFiles));

    const manifestUrl = `/cvat-images/${job.id}/manifest.json`;

    await job.updateProgress(100);
    return { manifestPath, manifestUrl };
}, { connection, concurrency: 4 });
if (process.env.NODE_ENV !== 'production') globalForBullMQ.downloadWorker = downloadWorker;

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
    } else if (data.studentDownloadedPaths) {
        for (const p of data.studentDownloadedPaths) {
            const manifestRaw = await fs.readFile(p, 'utf-8');
            const manifest = JSON.parse(manifestRaw);
            studentFiles.push(...manifest);
        }
    }

    if (data.gtDownloadedPath) {
        const manifestRaw = await fs.readFile(data.gtDownloadedPath, 'utf-8');
        const manifest = JSON.parse(manifestRaw);
        if (manifest.length > 0) {
            gtFileContent = manifest[0].content; // We only support one GT file logic
            if (toolType === 'cvat_xml' || isXmlFile(gtFileContent)) {
                gtAnnotations = parseCvatXml(gtFileContent);
            } else {
                gtAnnotations = await parseUniversalBboxDataset(gtFileContent);
            }
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

        // Group annotations by task if available
        const studentSplits: { name: string, data: CocoJson }[] = [];
        if (studentAnnotations.tasks && studentAnnotations.tasks.length > 0) {
            const taskMap = new Map<number, string>();
            studentAnnotations.tasks.forEach(t => taskMap.set(t.id, t.name));

            const grouped = new Map<number, { images: any[], annotations: any[] }>();
            const imageToTask = new Map<number, number>();

            studentAnnotations.images.forEach(img => {
                const tid = img.task_id;
                if (tid !== undefined) {
                    if (!grouped.has(tid)) grouped.set(tid, { images: [], annotations: [] });
                    grouped.get(tid)!.images.push(img);
                    imageToTask.set(img.id, tid);
                }
            });

            studentAnnotations.annotations.forEach(ann => {
                const tid = imageToTask.get(ann.image_id);
                if (tid !== undefined && grouped.has(tid)) {
                    grouped.get(tid)!.annotations.push(ann);
                }
            });

            grouped.forEach((group, tid) => {
                const taskName = taskMap.get(tid) || `Task_${tid}`;
                studentSplits.push({
                    name: taskName,
                    data: {
                        images: group.images,
                        annotations: group.annotations as any,
                        categories: studentAnnotations.categories
                    }
                });
            });
        } else {
            studentSplits.push({ name: studentFile.name, data: studentAnnotations });
        }
    
        for (const split of studentSplits) {
            const initialResult = evaluateAnnotations(gtAnnotations, evalSchema, split.data);
            
            // Pass the extracted images through to the final result if they exist
            const finalResult = recalculateOverallScore({
                 ...initialResult,
                studentFilename: split.name,
                extractedImages: (studentFile as any).extractedImages || []
            }, scoreOverrides);

            batchResults.push(finalResult);
        }
        
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
