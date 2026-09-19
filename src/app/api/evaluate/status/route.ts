import { NextResponse } from 'next/server';
import { evaluationQueue } from '@/lib/queue';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const jobId = searchParams.get('jobId');

        if (!jobId) {
            return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
        }

        const job = await evaluationQueue.getJob(jobId);

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        const state = await job.getState();
        const progress = job.progress;

        if (state === 'completed') {
            return NextResponse.json({
                status: 'completed',
                batchResults: job.returnvalue
            });
        }

        if (state === 'failed') {
            return NextResponse.json({
                status: 'failed',
                error: job.failedReason || 'Job failed during execution'
            });
        }

        return NextResponse.json({
            status: state,
            progress: progress
        });
    } catch (e: any) {
        console.error('Error fetching job status:', e);
        return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
    }
}
