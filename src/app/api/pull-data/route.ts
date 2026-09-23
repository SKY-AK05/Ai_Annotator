import { NextResponse } from 'next/server';
import { downloadQueue } from '@/lib/queue';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { cvatProjectId, cvatApiUrl, cvatApiKey, type, taskIds } = body;

        if (!cvatProjectId || !cvatApiUrl || !cvatApiKey || !type) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        const job = await downloadQueue.add('download_cvat_dataset', {
            cvatProjectId,
            cvatApiUrl,
            cvatApiKey,
            type,
            taskIds
        });

        return NextResponse.json({ jobId: job.id });
    } catch (error: any) {
        console.error("Error queueing download job:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
