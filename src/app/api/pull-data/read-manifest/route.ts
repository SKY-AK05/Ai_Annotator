import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { manifestUrl, manifestPath } = body;

        if (!manifestUrl && !manifestPath) {
            return NextResponse.json({ error: 'Missing manifestUrl or manifestPath' }, { status: 400 });
        }

        let targetPath = '';
        if (manifestUrl) {
            const relativeUrl = manifestUrl.startsWith('/') ? manifestUrl.slice(1) : manifestUrl;
            targetPath = path.join(process.cwd(), 'public', relativeUrl);
        } else {
            targetPath = path.normalize(manifestPath);
            const expectedDir = path.normalize(path.join(process.cwd(), 'public', 'cvat-images')).toLowerCase();
            if (!targetPath.toLowerCase().startsWith(expectedDir)) {
                return NextResponse.json({ error: 'Invalid manifest path' }, { status: 403 });
            }
        }

        const data = await fs.readFile(targetPath, 'utf-8');
        const manifest = JSON.parse(data);

        return NextResponse.json({ manifest });
    } catch (e: any) {
        console.error('Error reading manifest:', e);
        return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
    }
}
