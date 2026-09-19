import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { extractEvalSchema } from '@/ai/flows/extract-eval-schema';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const gtFile = formData.get('gtFile') as File | null;
        const gtFileContentParam = formData.get('gtFileContent') as string | null;
        
        let fileContent = '';

        if (gtFile) {
            if (gtFile.name.endsWith('.zip')) {
                const zip = await JSZip.loadAsync(await gtFile.arrayBuffer());
                let foundFile: JSZip.JSZipObject | null = null;
                
                for (const filename in zip.files) {
                    const fileInZip = zip.files[filename];
                    if (!fileInZip.dir && (filename.endsWith('.xml') || filename.endsWith('.json'))) {
                        foundFile = fileInZip;
                        break;
                    }
                }

                if (!foundFile) {
                    return NextResponse.json({ error: 'No .xml or .json annotation file found inside the Ground Truth ZIP archive.' }, { status: 400 });
                }
                fileContent = await foundFile.async('string');
            } else {
                fileContent = await gtFile.text();
            }
        } else if (gtFileContentParam) {
            fileContent = gtFileContentParam;
        } else {
            return NextResponse.json({ error: 'Ground Truth file or content is required' }, { status: 400 });
        }

        const userInstructions = formData.get('userInstructions') as string | null;
        const pseudoCode = formData.get('pseudoCode') as string | null;

        const input: any = { gtFileContent: fileContent };
        if (userInstructions) input.userInstructions = userInstructions;
        if (pseudoCode) input.pseudoCode = pseudoCode;

        const schema = await extractEvalSchema(input);
        
        return NextResponse.json({ schema, gtFileContent: fileContent });
    } catch (e: any) {
        console.error('Error extracting schema:', e);
        return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
    }
}
