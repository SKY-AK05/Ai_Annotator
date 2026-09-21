import { NextResponse } from 'next/server';
import JSZip from 'jszip';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { cvatApiUrl, cvatApiKey, taskId } = body;

        if (!cvatApiUrl || !cvatApiKey || !taskId) {
            return NextResponse.json({ error: 'Missing cvatApiUrl, cvatApiKey, or taskId' }, { status: 400 });
        }

        let fileBuffer: ArrayBuffer | null = null;
        let attempts = 0;
        
        while (attempts < 20) {
            const res = await fetch(`${cvatApiUrl}/api/tasks/${taskId}/annotations?format=COCO%201.0&action=download`, {
                headers: {
                    'Authorization': `Bearer ${cvatApiKey}`
                }
            });
            
            if (res.status === 200 || res.status === 201) {
                fileBuffer = await res.arrayBuffer();
                break;
            } else if (res.status === 202) {
                await new Promise(r => setTimeout(r, 2000));
                attempts++;
            } else {
                throw new Error(`CVAT API Error: ${res.statusText}`);
            }
        }
        
        if (!fileBuffer) {
            throw new Error(`Timed out waiting for CVAT annotations export.`);
        }

        const zip = await JSZip.loadAsync(fileBuffer);
        let content: string | null = null;
        let filename: string | null = null;
        
        for (const fn in zip.files) {
            if (fn.endsWith('.json') || fn.endsWith('.xml')) {
                content = await zip.files[fn].async('string');
                filename = fn;
                break;
            }
        }
        
        if (!content) {
            throw new Error(`Could not find a COCO JSON or CVAT XML file in the export.`);
        }

        return NextResponse.json({ content, filename });
    } catch (e: any) {
        console.error('Error fetching CVAT export:', e);
        return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
    }
}
