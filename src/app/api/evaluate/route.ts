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
        const cvatTaskIds = formData.get('cvatTaskIds') as string;
        const scoreOverridesStr = formData.get('scoreOverrides') as string;
        const cvatApiUrl = formData.get('cvatApiUrl') as string;
        const cvatApiKey = formData.get('cvatApiKey') as string;

        if (!gtFileContent || !evalSchemaStr || !cvatTaskIds || !cvatApiUrl || !cvatApiKey) {
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

        const job = await evaluationQueue.add('evaluateBatch', {
            gtFileContent,
            evalSchema,
            toolType,
            scoreOverrides,
            cvatTaskIds,
            cvatApiUrl,
            cvatApiKey
        });

        return NextResponse.json({ jobId: job.id, status: 'queued' });
    } catch (e: any) {
        console.error('Error in evaluation route:', e);
        return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
    }
}
