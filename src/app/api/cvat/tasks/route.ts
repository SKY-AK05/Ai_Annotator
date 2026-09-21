import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { cvatApiUrl, cvatApiKey, projectId, org } = body;

        if (!cvatApiUrl || !cvatApiKey || !projectId) {
            return NextResponse.json({ error: 'Missing credentials or project ID' }, { status: 400 });
        }

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${cvatApiKey}`
        };
        
        if (org) {
            headers['X-Organization'] = org;
        }

        const res = await fetch(`${cvatApiUrl}/api/tasks?project_id=${projectId}`, {
            headers
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`CVAT API responded with ${res.status}: ${errorText}`);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Proxy error fetching tasks:", error);
        return NextResponse.json({ error: error.message || 'Failed to fetch tasks' }, { status: 500 });
    }
}
