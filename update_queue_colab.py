import sys

queue_path = r"c:\Users\Aakash\Documents\PROJECT WEB\orchvate\AI_ANNOTATE\Ai_Annotator\src\lib\queue.ts"
with open(queue_path, 'r', encoding='utf-8') as f:
    content = f.read()

# I need to completely replace downloadWorker and evaluationWorker.
# Let's locate downloadWorker:
start_idx = content.find("export const downloadWorker =")
if start_idx == -1:
    print("Could not find downloadWorker")
    sys.exit(1)

end_idx = content.find("if (process.env.NODE_ENV !== 'production') globalForBullMQ.downloadWorker = downloadWorker;")
end_idx = content.find("\n", end_idx) + 1

end_eval_idx = content.find("if (process.env.NODE_ENV !== 'production') globalForBullMQ.evaluationWorker = evaluationWorker;")
end_eval_idx = content.find("\n", end_eval_idx) + 1

if end_eval_idx == 0: # handle different formats
    print("Could not find end of evaluationWorker")
    sys.exit(1)

new_workers = """export const downloadWorker = globalForBullMQ.downloadWorker || new Worker('DownloadQueue', async (job) => {
    const data = job.data as DownloadJobData;
    const { cvatProjectId, cvatApiUrl, cvatApiKey, taskIds, type } = data;
    
    const JSZip = (await import('jszip')).default;
    const downloadedFiles: { name: string, xmlPath: string, imagesDir: string, imagesUrlBase: string }[] = [];
    
    if (!cvatProjectId) {
        throw new Error("Missing cvatProjectId in download job");
    }

    const itemsToExport = taskIds && taskIds.length > 0 
        ? taskIds.map(id => ({ type: 'task', id, urlPath: `/api/tasks/${id}` }))
        : [{ type: 'project', id: cvatProjectId, urlPath: `/api/projects/${cvatProjectId}` }];

    for (let i = 0; i < itemsToExport.length; i++) {
        const item = itemsToExport[i];
        const baseProgress = (i / itemsToExport.length) * 100;
        const nextProgress = ((i + 1) / itemsToExport.length) * 100;
        
        await job.updateProgress(Math.floor(baseProgress + 5));
        
        // 1. Trigger export
        const exportUrl = `${cvatApiUrl}${item.urlPath}/dataset/export`;
        const exportRes = await fetch(`${exportUrl}?format=CVAT%20for%20images%201.1&save_images=true`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${cvatApiKey}` }
        });
        
        if (!exportRes.ok) {
            throw new Error(`CVAT API Export Error for ${item.type} ${item.id}: ${exportRes.statusText} - ${await exportRes.text()}`);
        }
        
        const exportData = await exportRes.json().catch(() => ({}));
        const rq_id = exportData.rq_id;
        
        if (!rq_id) {
            throw new Error(`No rq_id returned from export request for ${item.type} ${item.id}.`);
        }
        
        // 2. Poll for completion
        let result_url = null;
        let attempts = 0;
        while (attempts < 60) {
            await job.updateProgress(Math.floor(baseProgress + 5 + Math.min(80, attempts * 2) * (nextProgress - baseProgress) / 100));
            
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
            throw new Error(`Timed out waiting for CVAT ${item.type} ${item.id} annotations export.`);
        }

        // 3. Download the ZIP file
        await job.updateProgress(Math.floor(baseProgress + 90 * (nextProgress - baseProgress) / 100));
        const full_url = result_url.startsWith('http') ? result_url : `${cvatApiUrl}${result_url}`;
        
        const dlRes = await fetch(full_url, {
            headers: { 'Authorization': `Bearer ${cvatApiKey}` }
        });
        
        if (!dlRes.ok) {
            throw new Error(`Failed to download result zip: ${dlRes.statusText}`);
        }
        
        const fileBuffer = await dlRes.arrayBuffer();

        // 4. Extract Zip into target folder structure
        const zip = await JSZip.loadAsync(fileBuffer);
        
        const safeName = `task_${item.id}`;
        
        // Determine structure exactly as requested
        // type === 'gt' -> ROOT/GT/
        // type === 'student' -> ROOT/STUDENTS/{safeName}/
        let subPath = '';
        if (type === 'gt') {
            subPath = 'GT';
        } else {
            subPath = path.join('STUDENTS', safeName);
        }
        
        const jobDir = path.join(process.cwd(), 'public', 'cvat-data', String(job.id), subPath);
        const imagesDir = path.join(jobDir, 'images');
        const xmlDir = path.join(jobDir, 'xml');
        const xmlPath = path.join(xmlDir, 'annotations.xml');
        
        // Delete if exists and recreate
        await fs.rm(jobDir, { recursive: true, force: true });
        await fs.mkdir(imagesDir, { recursive: true });
        await fs.mkdir(xmlDir, { recursive: true });
        
        let xmlSaved = false;
        const seenImageNames = new Set<string>();

        for (const filename in zip.files) {
            const ext = path.extname(filename).toLowerCase();
            
            if (ext === '.json' || ext === '.xml') {
                const targetName = !xmlSaved ? 'annotations.xml' : path.basename(filename);
                const targetPath = path.join(xmlDir, targetName);
                
                const contentStr = await zip.files[filename].async('string');
                await fs.writeFile(targetPath, contentStr, 'utf-8');
                xmlSaved = true;
            } else if (!zip.files[filename].dir && ['.jpg', '.jpeg', '.png', '.bmp', '.tif', '.tiff', '.webp'].includes(ext)) {
                let targetName = path.basename(filename);
                // Simple collision avoidance
                if (seenImageNames.has(targetName)) {
                    const base = path.basename(filename, ext);
                    const parent = path.basename(path.dirname(filename));
                    targetName = `${parent}_${base}${ext}`;
                }
                seenImageNames.add(targetName);
                
                const imageBuffer = await zip.files[filename].async('nodebuffer');
                const destPath = path.join(imagesDir, targetName);
                await fs.writeFile(destPath, imageBuffer);
            }
        }
        
        if (!xmlSaved) {
            throw new Error(`Could not find an annotation file in the export for ${item.type} ${item.id}.`);
        }
        
        downloadedFiles.push({ 
            name: safeName, 
            xmlPath,
            imagesDir,
            imagesUrlBase: `/cvat-data/${job.id}/${subPath.replace(/\\\\/g, '/')}/images`
        });
    }

    // Save manifest.json locally
    const manifestPath = path.join(process.cwd(), 'public', 'cvat-data', String(job.id), 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(downloadedFiles, null, 2));

    const manifestUrl = `/cvat-data/${job.id}/manifest.json`;

    await job.updateProgress(100);
    return { manifestPath, manifestUrl };
}, { connection, concurrency: 4 });
if (process.env.NODE_ENV !== 'production') globalForBullMQ.downloadWorker = downloadWorker;

export const evaluationWorker = globalForBullMQ.evaluationWorker || new Worker('EvaluationQueue', async (job) => {
    const data = job.data as EvaluationJobData;
    const { gtFileContent, evalSchema, toolType, scoreOverrides, cvatTaskIds, cvatApiUrl, cvatApiKey, extractedStudentFiles } = data;
    
    const isXmlFile = (content: string) => content.trim().startsWith('<?xml');
    
    let gtContentToParse = gtFileContent;

    // Load GT if it's a disk pointer
    if (data.gtDownloadedPath) {
        const manifestRaw = await fs.readFile(data.gtDownloadedPath, 'utf-8');
        const manifest = JSON.parse(manifestRaw);
        if (manifest.length > 0) {
            gtContentToParse = await fs.readFile(manifest[0].xmlPath, 'utf-8');
        }
    }

    let gtAnnotations: CocoJson;
    if (toolType === 'cvat_xml' || isXmlFile(gtContentToParse)) {
        gtAnnotations = parseCvatXml(gtContentToParse);
    } else {
        gtAnnotations = await parseUniversalBboxDataset(gtContentToParse);
    }

    const batchResults: EvaluationResult[] = [];
    
    let studentFiles: { name: string; xmlPath?: string; content?: string; imagesDir?: string; imagesUrlBase?: string; extractedImages?: {name: string, url: string}[] }[] = [];
    
    if (extractedStudentFiles && extractedStudentFiles.length > 0) {
        studentFiles = extractedStudentFiles;
    } else if (data.studentDownloadedPaths) {
        for (const p of data.studentDownloadedPaths) {
            const manifestRaw = await fs.readFile(p, 'utf-8');
            const manifest = JSON.parse(manifestRaw);
            studentFiles.push(...manifest);
        }
    }

    const totalFiles = studentFiles.length || 1;

    for (let i = 0; i < studentFiles.length; i++) {
        await job.updateProgress(50 + Math.round((i / studentFiles.length) * 50));
        const studentFile = studentFiles[i];
        
        let studentFileContent = studentFile.content || '';
        if (studentFile.xmlPath) {
            studentFileContent = await fs.readFile(studentFile.xmlPath, 'utf-8');
        }

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
            try {
                const initialResult = evaluateAnnotations(gtAnnotations, evalSchema, split.data);
                
                let finalImages: {id: string, url: string}[] = [];
                if (studentFile.imagesDir && studentFile.imagesUrlBase) {
                    const files = await fs.readdir(studentFile.imagesDir);
                    finalImages = files.map(f => ({
                        id: f,
                        url: `${studentFile.imagesUrlBase}/${f}`
                    }));
                } else if (studentFile.extractedImages) {
                    finalImages = studentFile.extractedImages.map(img => ({ id: img.name, url: img.url }));
                }

                const finalResult = recalculateOverallScore({
                     ...initialResult,
                    studentFilename: split.name,
                    extractedImages: finalImages
                }, scoreOverrides);

                batchResults.push(finalResult);
            } catch (err: any) {
                console.error(`Evaluation failed for ${split.name}:`, err);
                batchResults.push({
                    studentFilename: split.name,
                    error: err.message,
                    score: 0,
                    avgIou: 0,
                    labelAccuracy: 0,
                    attributeAccuracy: 0,
                    detailedFeedback: [],
                    matchedPairs: [],
                    unmatchedGt: [],
                    unmatchedStudent: []
                } as any);
            }
        }
        
        // Update job progress
        await job.updateProgress(50 + Math.round(((i + 1) / totalFiles) * 50));
    }

    return batchResults;
}, { connection, concurrency: 4 });
if (process.env.NODE_ENV !== 'production') globalForBullMQ.evaluationWorker = evaluationWorker;
"""

new_content = content[:start_idx] + new_workers + content[end_eval_idx:]

with open(queue_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Done")
