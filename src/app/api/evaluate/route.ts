import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { evaluateAnnotations, recalculateOverallScore } from '@/lib/evaluator';
import { parseCvatXml } from '@/lib/cvat-xml-parser';
import { evaluationQueue } from '@/lib/queue';
import type { CocoJson, EvalSchema, EvaluationResult, FormValues, ScoreOverrides } from '@/lib/types';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const gtFileContent = formData.get('gtFileContent') as string;
        const evalSchemaStr = formData.get('evalSchema') as string;
        const toolType = formData.get('toolType') as string;
        const studentFilesData = formData.getAll('studentFiles') as File[];
        const scoreOverridesStr = formData.get('scoreOverrides') as string;

        if (!gtFileContent || !evalSchemaStr || !studentFilesData.length) {
            return NextResponse.json({ error: 'Missing required fields for evaluation' }, { status: 400 });
        }

        const evalSchema = JSON.parse(evalSchemaStr) as EvalSchema;
        const scoreOverrides = scoreOverridesStr ? JSON.parse(scoreOverridesStr) as ScoreOverrides : {};
        
        const isXmlFile = (content: string) => content.trim().startsWith('<?xml');

        let gtAnnotations: CocoJson;
        if (toolType === 'cvat_xml' || isXmlFile(gtFileContent)) {
            gtAnnotations = parseCvatXml(gtFileContent);
        } else {
            gtAnnotations = JSON.parse(gtFileContent);
            gtAnnotations.images.forEach(image => {
                image.file_name = image.file_name.split('/').pop()!;
            });
        }

        let studentFiles: { name: string, content: string }[] = [];

        for (const file of studentFilesData) {
            if (file.name.endsWith('.zip')) {
                const zip = await JSZip.loadAsync(await file.arrayBuffer());
                for (const filename in zip.files) {
                    const fileInZip = zip.files[filename];
                    if (fileInZip.dir) continue;
                    
                    if (filename.endsWith('.zip')) {
                        try {
                            const nestedZip = await JSZip.loadAsync(await fileInZip.async('blob'));
                            for (const nestedFilename in nestedZip.files) {
                                const nestedFile = nestedZip.files[nestedFilename];
                                if (!nestedFile.dir && (nestedFilename.endsWith('.xml') || nestedFilename.endsWith('.json'))) {
                                    const content = await nestedFile.async('string');
                                    studentFiles.push({ name: filename, content });
                                }
                            }
                        } catch(e) {
                            console.error(`Skipping corrupted nested zip: ${filename}`, e);
                        }
                    } else if (filename.endsWith('.xml') || filename.endsWith('.json')) {
                        const content = await fileInZip.async('string');
                        studentFiles.push({ name: filename, content });
                    }
                }
            } else {
                studentFiles.push({
                    name: file.name,
                    content: await file.text()
                });
            }
        }

        if (studentFiles.length === 0) {
            return NextResponse.json({ error: 'No valid annotation files (.xml or .json) found in the upload.' }, { status: 400 });
        }

        const job = await evaluationQueue.add('evaluateBatch', {
            gtFileContent,
            evalSchema,
            toolType,
            scoreOverrides,
            studentFiles
        });

        return NextResponse.json({ jobId: job.id, status: 'queued' });
    } catch (e: any) {
        console.error('Error in evaluation route:', e);
        return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
    }
}
