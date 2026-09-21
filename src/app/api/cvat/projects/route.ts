import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { cvatApiUrl, cvatApiKey, org } = body;

        if (!cvatApiUrl || !cvatApiKey) {
            return NextResponse.json({ error: 'Missing CVAT credentials' }, { status: 400 });
        }

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${cvatApiKey}`
        };

        let url = `${cvatApiUrl}/api/projects`;
        if (org) {
            url += `?org=${encodeURIComponent(org)}`;
        }

        const res = await fetch(url, {
            headers
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`CVAT API responded with ${res.status}: ${errorText}`);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Proxy error fetching projects:", error);
        return NextResponse.json({ error: error.message || 'Failed to fetch projects' }, { status: 500 });
    }
}
