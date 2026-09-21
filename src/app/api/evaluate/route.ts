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
        const cvatTaskIds = formData.get('cvatTaskIds') as string | null;
        const scoreOverridesStr = formData.get('scoreOverrides') as string;
        const cvatApiUrl = formData.get('cvatApiUrl') as string | null;
        const cvatApiKey = formData.get('cvatApiKey') as string | null;
        const studentFilesData = formData.getAll('studentFiles') as File[];
        
        const gtDownloadedPath = formData.get('gtDownloadedPath') as string | null;
        const studentDownloadedPaths = formData.getAll('studentDownloadedPaths') as string[];

        if (!gtFileContent && !gtDownloadedPath) {
            return NextResponse.json({ error: 'Missing GT file content or downloaded path' }, { status: 400 });
        }
        
        if (studentFilesData.length === 0 && studentDownloadedPaths.length === 0 && (!cvatTaskIds || !cvatApiUrl || !cvatApiKey)) {
             return NextResponse.json({ error: 'Missing CVAT API details, Student Files, or Downloaded Paths' }, { status: 400 });
        }

        const evalSchema = JSON.parse(evalSchemaStr) as EvalSchema;
        const scoreOverrides = scoreOverridesStr ? JSON.parse(scoreOverridesStr) as ScoreOverrides : {};
        
        let extractedStudentFiles: { name: string, content: string }[] = [];
        for (const file of studentFilesData) {
            if (file.name.endsWith('.zip')) {
                const zip = await JSZip.loadAsync(await file.arrayBuffer());
                for (const filename in zip.files) {
                    const fileInZip = zip.files[filename];
                    if (!fileInZip.dir && (filename.endsWith('.json') || filename.endsWith('.xml'))) {
                        const content = await fileInZip.async('string');
                        extractedStudentFiles.push({ name: filename, content });
                    }
                }
            } else {
                 extractedStudentFiles.push({ name: file.name, content: await file.text() });
            }
        }

        const job = await evaluationQueue.add('evaluateBatch', {
            gtFileContent,
            evalSchema,
            toolType,
            scoreOverrides,
            cvatTaskIds: cvatTaskIds || '',
            cvatApiUrl: cvatApiUrl || '',
            cvatApiKey: cvatApiKey || '',
            extractedStudentFiles,
            gtDownloadedPath: gtDownloadedPath || undefined,
            studentDownloadedPaths: studentDownloadedPaths.length > 0 ? studentDownloadedPaths : undefined
        });

        return NextResponse.json({ jobId: job.id, status: 'queued' });
    } catch (e: any) {
        console.error('Error in evaluation route:', e);
        return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
    }
}
