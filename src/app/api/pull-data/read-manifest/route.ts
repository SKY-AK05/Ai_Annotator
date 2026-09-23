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
        if (manifestPath) {
            // Prefer the absolute disk path passed directly
            targetPath = path.normalize(manifestPath);
            const expectedDir = path.normalize(path.join(process.cwd(), 'public', 'cvat-data')).toLowerCase();
            if (!targetPath.toLowerCase().startsWith(expectedDir)) {
                return NextResponse.json({ error: 'Invalid manifest path' }, { status: 403 });
            }
        } else if (manifestUrl) {
            const relativeUrl = manifestUrl.startsWith('/') ? manifestUrl.slice(1) : manifestUrl;
            targetPath = path.join(process.cwd(), 'public', relativeUrl);
        }

        const data = await fs.readFile(targetPath, 'utf-8');
        const manifest = JSON.parse(data);

        // Hydrate each entry: if it has an xmlPath, read the XML content from disk
        const hydratedManifest = await Promise.all(
            manifest.map(async (entry: any) => {
                if (entry.xmlPath) {
                    try {
                        const content = await fs.readFile(entry.xmlPath, 'utf-8');
                        // Build extractedImages list from imagesDir
                        let extractedImages: { name: string, url: string }[] = [];
                        if (entry.imagesDir && entry.imagesUrlBase) {
                            const files = await fs.readdir(entry.imagesDir).catch(() => [] as string[]);
                            extractedImages = files.map((f: string) => ({
                                name: f,
                                url: `${entry.imagesUrlBase}/${f}`
                            }));
                        }
                        return { ...entry, content, extractedImages };
                    } catch (readErr: any) {
                        console.error(`Failed to read xml from ${entry.xmlPath}:`, readErr);
                        return { ...entry, content: '', extractedImages: [] };
                    }
                }
                return entry;
            })
        );

        return NextResponse.json({ manifest: hydratedManifest });
    } catch (e: any) {
        console.error('Error reading manifest:', e);
        return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
    }
}
