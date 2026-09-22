import { NextResponse } from 'next/server';
import { downloadQueue } from '@/lib/queue';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { cvatProjectId, cvatTaskIds, cvatApiUrl, cvatApiKey, type } = body;

        if ((!cvatTaskIds && !cvatProjectId) || !cvatApiUrl || !cvatApiKey || !type) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        const job = await downloadQueue.add('download_cvat_dataset', {
            cvatProjectId,
            cvatTaskIds,
            cvatApiUrl,
            cvatApiKey,
            type
        });

        return NextResponse.json({ jobId: job.id });
    } catch (error: any) {
        console.error("Error queueing download job:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
