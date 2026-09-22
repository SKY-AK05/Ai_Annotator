import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { manifestPath } = body;

        if (!manifestPath) {
            return NextResponse.json({ error: 'Missing manifestPath' }, { status: 400 });
        }

        // Basic safety check: ensure the path is within public/cvat-images
        const normalizedPath = path.normalize(manifestPath);
        const expectedDir = path.normalize(path.join(process.cwd(), 'public', 'cvat-images'));
        
        if (!normalizedPath.startsWith(expectedDir)) {
            return NextResponse.json({ error: 'Invalid manifest path' }, { status: 403 });
        }

        const data = await fs.readFile(normalizedPath, 'utf-8');
        const manifest = JSON.parse(data);

        return NextResponse.json({ manifest });
    } catch (e: any) {
        console.error('Error reading manifest:', e);
        return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
    }
}
