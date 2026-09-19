import { NextResponse } from 'next/server';
import { getAnnotationFeedback } from '@/ai/flows/annotation-feedback-flow';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { gt, student } = body;
        
        if (!gt || !student) {
            return NextResponse.json({ error: 'Missing gt or student annotations' }, { status: 400 });
        }

        const feedback = await getAnnotationFeedback({ gt, student });
        return NextResponse.json(feedback);
    } catch (e: any) {
        console.error('Error generating feedback:', e);
        return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
    }
}
