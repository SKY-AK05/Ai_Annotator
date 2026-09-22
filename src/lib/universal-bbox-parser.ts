import type { CocoJson, BboxAnnotation, CocoImage, CocoCategory } from './types';
import { detectDatasetStructureFlow, type DatasetStructure } from '@/ai/flows/detect-dataset-structure';
import crypto from 'crypto';

// Simple in-memory cache for structure detection to avoid hitting Gemini repeatedly
const structureCache = new Map<string, DatasetStructure>();

export class InvalidDatasetError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidDatasetError';
    }
}

function generateHash(content: string): string {
    return crypto.createHash('sha256').update(content.slice(0, 5000)).digest('hex');
}

/**
 * Validates and normalizes bounding box coordinates into COCO [x, y, w, h] absolute pixels
 */
function normalizeCoordinates(
    coords: number[],
    format: 'xywh' | 'x1y1x2y2' | 'cxcywh',
    isNormalized: boolean,
    imageWidth: number,
    imageHeight: number
): [number, number, number, number] | null {
    if (!coords || coords.length < 4) return null;
    
    let [a, b, c, d] = coords.map(Number);
    if (isNaN(a) || isNaN(b) || isNaN(c) || isNaN(d)) return null;

    let x = 0, y = 0, w = 0, h = 0;

    if (format === 'xywh') {
        x = a; y = b; w = c; h = d;
    } else if (format === 'x1y1x2y2') {
        x = Math.min(a, c);
        y = Math.min(b, d);
        w = Math.abs(c - a);
        h = Math.abs(d - b);
    } else if (format === 'cxcywh') {
        w = c;
        h = d;
        x = a - (w / 2);
        y = b - (h / 2);
    }

    if (isNormalized) {
        x *= imageWidth;
        y *= imageHeight;
        w *= imageWidth;
        h *= imageHeight;
    }

    // Validation
    if (w <= 0 || h <= 0) return null;
    // Bounding boxes should at least be minimally sane (e.g., not extremely negative)
    if (x + w < -1000 || y + h < -1000) return null;

    return [x, y, w, h];
}

/**
 * Fast heuristics to guess the structure without AI
 */
function guessStructure(parsedJson: any): DatasetStructure | null {
    if (!parsedJson) return null;

    // Detect Flat Root Array
    if (Array.isArray(parsedJson) && parsedJson.length > 0) {
        const first = parsedJson[0];
        // Look for box key
        let boxKey = '';
        if (first.bbox) boxKey = 'bbox';
        else if (first.bounding_box) boxKey = 'bounding_box';
        else if (first.box) boxKey = 'box';

        if (boxKey || (Array.isArray(first) && first.length >= 4)) {
            return {
                annotationsStructureType: 'flat_root',
                bboxKeyInAnnotation: boxKey,
                categoryIdKey: first.category_id !== undefined ? 'category_id' : first.class_id !== undefined ? 'class_id' : 'label',
                imageIdKey: first.image_id !== undefined ? 'image_id' : first.filename !== undefined ? 'filename' : 'image',
                coordinateFormat: 'xywh', // Default guess, normalize later
                isNormalized: false // default guess
            };
        }
    }

    // Detect COCO format (flat_nested with 'annotations')
    if (Array.isArray(parsedJson.annotations) && Array.isArray(parsedJson.images)) {
        const firstAnn = parsedJson.annotations[0];
        if (firstAnn && firstAnn.bbox && Array.isArray(firstAnn.bbox)) {
            const bbox = firstAnn.bbox;
            let isNormalized = false;
            if (bbox.every((v: number) => v >= 0 && v <= 1)) {
                isNormalized = true;
            }
            return {
                annotationsStructureType: 'flat_nested',
                annotationsArrayKey: 'annotations',
                bboxKeyInAnnotation: 'bbox',
                categoryIdKey: 'category_id',
                imageIdKey: 'image_id',
                coordinateFormat: 'xywh',
                isNormalized: isNormalized
            };
        }
    }

    // Detect nested in images array
    if (Array.isArray(parsedJson.images) && parsedJson.images.length > 0) {
        const firstImg = parsedJson.images[0];
        // Look for array of objects in first image
        let boxesKey = '';
        if (Array.isArray(firstImg.boxes)) boxesKey = 'boxes';
        else if (Array.isArray(firstImg.objects)) boxesKey = 'objects';
        else if (Array.isArray(firstImg.annotations)) boxesKey = 'annotations';

        if (boxesKey && firstImg[boxesKey].length > 0) {
            const firstBox = firstImg[boxesKey][0];
            let boxKey = '';
            if (firstBox.bbox) boxKey = 'bbox';
            else if (firstBox.box) boxKey = 'box';
            
            return {
                annotationsStructureType: 'nested_in_images',
                boxesArrayKeyInImage: boxesKey,
                bboxKeyInAnnotation: boxKey,
                categoryIdKey: firstBox.category_id !== undefined ? 'category_id' : firstBox.label !== undefined ? 'label' : 'class',
                coordinateFormat: 'xywh',
                isNormalized: false
            };
        }
    }

    return null; // Fallback to AI
}

export async function parseUniversalBboxDataset(fileContent: string): Promise<CocoJson> {
    let parsed: any;
    try {
        parsed = JSON.parse(fileContent);
    } catch (e) {
        throw new InvalidDatasetError("Could not parse file as JSON.");
    }

    const hash = generateHash(fileContent);
    let structure = structureCache.get(hash);

    if (!structure) {
        structure = guessStructure(parsed);
    }

    if (!structure) {
        // AI Fallback
        const snippet = fileContent.slice(0, 3000) + (fileContent.length > 3000 ? '\n...[TRUNCATED]' : '');
        try {
            structure = await detectDatasetStructureFlow({ jsonSnippet: snippet });
            structureCache.set(hash, structure);
        } catch (e) {
            throw new InvalidDatasetError("Could not automatically detect the structure of this bounding box dataset.");
        }
    }

    if (!structure) {
        throw new InvalidDatasetError("Could not automatically detect the structure of this bounding box dataset.");
    }

    const cocoJson: CocoJson = { images: [], annotations: [], categories: [] };
    const categoryMap = new Map<string, number>();
    let categoryCounter = 1;
    let annotationCounter = 1;
    const imageMap = new Map<string, CocoImage>();
    let imageCounter = 1;

    let validBoxes = 0;
    let invalidBoxes = 0;

    const getCategoryId = (name: string) => {
        const key = String(name || "unknown");
        if (!categoryMap.has(key)) {
            const id = categoryCounter++;
            categoryMap.set(key, id);
            cocoJson.categories.push({ id, name: key });
        }
        return categoryMap.get(key)!;
    };

    const getImageId = (name: string, width: number = 1000, height: number = 1000) => {
        const key = String(name);
        if (!imageMap.has(key)) {
            const id = imageCounter++;
            const newImage = { id, file_name: key, width, height };
            imageMap.set(key, newImage);
            cocoJson.images.push(newImage);
        }
        return imageMap.get(key)!;
    };

    const processAnnotation = (rawAnn: any, imageObj: CocoImage) => {
        if (!rawAnn) return;

        let rawBbox = structure!.bboxKeyInAnnotation ? rawAnn[structure!.bboxKeyInAnnotation] : rawAnn;
        
        // Handle object style coordinates {x, y, w, h}
        if (rawBbox && !Array.isArray(rawBbox) && typeof rawBbox === 'object') {
            if ('x' in rawBbox && 'y' in rawBbox && 'width' in rawBbox && 'height' in rawBbox) {
                rawBbox = [rawBbox.x, rawBbox.y, rawBbox.width, rawBbox.height];
                structure!.coordinateFormat = 'xywh';
            } else if ('xmin' in rawBbox && 'ymin' in rawBbox && 'xmax' in rawBbox && 'ymax' in rawBbox) {
                rawBbox = [rawBbox.xmin, rawBbox.ymin, rawBbox.xmax, rawBbox.ymax];
                structure!.coordinateFormat = 'x1y1x2y2';
            }
        }

        const normalizedBbox = normalizeCoordinates(
            rawBbox,
            structure!.coordinateFormat,
            structure!.isNormalized,
            imageObj.width,
            imageObj.height
        );

        if (!normalizedBbox) {
            invalidBoxes++;
            return;
        }

        const categoryName = structure!.categoryIdKey ? rawAnn[structure!.categoryIdKey] : "unknown";
        const categoryId = getCategoryId(categoryName);

        const attributes: { [key: string]: string } = {};
        for (const key of Object.keys(rawAnn)) {
            if (key !== structure!.bboxKeyInAnnotation && key !== structure!.categoryIdKey && key !== structure!.imageIdKey) {
                attributes[key] = String(rawAnn[key]);
            }
        }

        cocoJson.annotations.push({
            id: annotationCounter++,
            image_id: imageObj.id,
            category_id: categoryId,
            bbox: normalizedBbox,
            attributes
        });
        validBoxes++;
    };

    // Extract based on structure type
    if (structure.annotationsStructureType === 'flat_root') {
        if (!Array.isArray(parsed)) throw new InvalidDatasetError("Expected root to be an array.");
        for (const item of parsed) {
            const imageName = structure.imageIdKey ? item[structure.imageIdKey] : "unknown.jpg";
            const img = getImageId(imageName);
            processAnnotation(item, img);
        }
    } else if (structure.annotationsStructureType === 'flat_nested') {
        const arr = structure.annotationsArrayKey ? parsed[structure.annotationsArrayKey] : null;
        if (!Array.isArray(arr)) throw new InvalidDatasetError(`Expected array at key ${structure.annotationsArrayKey}`);
        
        // Pre-populate images if they exist
        if (Array.isArray(parsed.images)) {
             for (const img of parsed.images) {
                 getImageId(img.file_name || img.name || img.id, img.width, img.height);
             }
        }

        for (const item of arr) {
            const imageName = structure.imageIdKey ? item[structure.imageIdKey] : "unknown.jpg";
            const img = getImageId(imageName);
            processAnnotation(item, img);
        }
    } else if (structure.annotationsStructureType === 'nested_in_images') {
        const imagesArr = parsed.images || parsed;
        if (!Array.isArray(imagesArr)) throw new InvalidDatasetError("Expected an array of images.");
        for (const imgNode of imagesArr) {
             const img = getImageId(imgNode.file_name || imgNode.name || imgNode.id || "unknown.jpg", imgNode.width, imgNode.height);
             const boxes = structure.boxesArrayKeyInImage ? imgNode[structure.boxesArrayKeyInImage] : null;
             if (Array.isArray(boxes)) {
                 for (const box of boxes) {
                     processAnnotation(box, img);
                 }
             }
        }
    }

    if (validBoxes === 0) {
        throw new InvalidDatasetError("Could not find any valid bounding boxes matching the detected structure. Coordinate format might be unrecognizable or data is corrupt.");
    }

    if (invalidBoxes > validBoxes && validBoxes < 10) {
        throw new InvalidDatasetError(`Dataset parsing failed: Too many invalid bounding boxes (${invalidBoxes} invalid, ${validBoxes} valid). Ensure coordinate format is correct and sizes are > 0.`);
    }

    return cocoJson;
}
