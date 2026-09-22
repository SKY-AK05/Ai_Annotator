

import type { CocoJson, BboxAnnotation, CocoCategory, CocoImage, PolygonAnnotation, Point } from './types';
import { DOMParser } from '@xmldom/xmldom';

export function parseCvatXml(xmlString: string): CocoJson {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    if (xmlDoc.getElementsByTagName("parsererror").length) {
        throw new Error("Failed to parse XML: The provided file is not valid XML.");
    }

    const images: CocoImage[] = [];
    const annotations: BboxAnnotation[] = [];
    const categories: CocoCategory[] = [];
    const tasks: { id: number, name: string }[] = [];
    let annotationIdCounter = 1;
    const categoryMap = new Map<string, number>();
    let categoryIdCounter = 1;

    // Parse tasks metadata
    const taskNodes = xmlDoc.getElementsByTagName("task");
    if (taskNodes && taskNodes.length > 0) {
        Array.from(taskNodes).forEach((taskNode: Element) => {
            const idNode = taskNode.getElementsByTagName("id")[0];
            const nameNode = taskNode.getElementsByTagName("name")[0];
            if (idNode && nameNode) {
                tasks.push({
                    id: parseInt(idNode.textContent || "0", 10),
                    name: nameNode.textContent || ""
                });
            }
        });
    }

    const getCategoryId = (name: string): number => {
        if (!categoryMap.has(name)) {
            const newId = categoryIdCounter++;
            categoryMap.set(name, newId);
            categories.push({ id: newId, name: name });
        }
        return categoryMap.get(name)!;
    };

    Array.from(xmlDoc.getElementsByTagName("image")).forEach((imageNode: Element) => {
        const imageId = parseInt(imageNode.getAttribute("id") || "0", 10);
        let imageName = imageNode.getAttribute("name") || "";
        const imageWidth = parseInt(imageNode.getAttribute("width") || "0", 10);
        const imageHeight = parseInt(imageNode.getAttribute("height") || "0", 10);
        const taskIdAttr = imageNode.getAttribute("task_id");
        const taskId = taskIdAttr ? parseInt(taskIdAttr, 10) : undefined;

        images.push({
            id: imageId,
            file_name: imageName,
            width: imageWidth,
            height: imageHeight,
            task_id: taskId
        });

        Array.from(imageNode.getElementsByTagName("box")).forEach((boxNode: Element) => {
            const label = boxNode.getAttribute("label") || "unknown";
            const xtl = parseFloat(boxNode.getAttribute("xtl") || "0");
            const ytl = parseFloat(boxNode.getAttribute("ytl") || "0");
            const xbr = parseFloat(boxNode.getAttribute("xbr") || "0");
            const ybr = parseFloat(boxNode.getAttribute("ybr") || "0");

            const width = xbr - xtl;
            const height = ybr - ytl;

            const categoryId = getCategoryId(label);
            
            const attributes: { [key: string]: string } = { label: label };

            Array.from(boxNode.getElementsByTagName('attribute')).forEach((attributeNode: Element) => {
                const attrName = attributeNode.getAttribute('name');
                const attrValue = attributeNode.textContent || "";
                if (attrName) {
                    attributes[attrName] = attrValue;
                }
            });

            const annotation: BboxAnnotation = {
                id: annotationIdCounter++,
                image_id: imageId,
                category_id: categoryId,
                bbox: [xtl, ytl, width, height],
                attributes: attributes,
            };
            
            annotations.push(annotation);
        });
    });

    return {
        images,
        annotations,
        categories,
        tasks
    };
}


export function parseCvatXmlForPolygons(xmlString: string): CocoJson {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    if (xmlDoc.getElementsByTagName("parsererror").length) {
        throw new Error("Failed to parse XML: The provided file is not valid XML.");
    }

    const images: CocoImage[] = [];
    const annotations: PolygonAnnotation[] = [];
    const categories: CocoCategory[] = [];
    const tasks: { id: number, name: string }[] = [];
    let annotationIdCounter = 1;
    const categoryMap = new Map<string, number>();
    let categoryIdCounter = 1;

    // Parse tasks metadata
    const taskNodes = xmlDoc.getElementsByTagName("task");
    if (taskNodes && taskNodes.length > 0) {
        Array.from(taskNodes).forEach((taskNode: Element) => {
            const idNode = taskNode.getElementsByTagName("id")[0];
            const nameNode = taskNode.getElementsByTagName("name")[0];
            if (idNode && nameNode) {
                tasks.push({
                    id: parseInt(idNode.textContent || "0", 10),
                    name: nameNode.textContent || ""
                });
            }
        });
    }

    const getCategoryId = (name: string): number => {
        if (!categoryMap.has(name)) {
            const newId = categoryIdCounter++;
            categoryMap.set(name, newId);
            categories.push({ id: newId, name: name });
        }
        return categoryMap.get(name)!;
    };
    
    Array.from(xmlDoc.getElementsByTagName("image")).forEach((imageNode: Element) => {
        const imageId = parseInt(imageNode.getAttribute("id") || "0", 10);
        let imageName = imageNode.getAttribute("name") || "";
        const imageWidth = parseInt(imageNode.getAttribute("width") || "0", 10);
        const imageHeight = parseInt(imageNode.getAttribute("height") || "0", 10);
        const taskIdAttr = imageNode.getAttribute("task_id");
        const taskId = taskIdAttr ? parseInt(taskIdAttr, 10) : undefined;

        if (!images.some(img => img.id === imageId)) {
            images.push({
                id: imageId,
                file_name: imageName,
                width: imageWidth,
                height: imageHeight,
                task_id: taskId
            });
        }

        Array.from(imageNode.getElementsByTagName("polygon")).forEach((polyNode: Element) => {
            const label = polyNode.getAttribute("label") || "unknown";
            const pointsStr = polyNode.getAttribute("points") || "";
            const points: Point[] = pointsStr.split(';').map(p => {
                const parts = p.split(',');
                return [parseFloat(parts[0]), parseFloat(parts[1])];
            });

            const categoryId = getCategoryId(label);
            const attributes: { [key: string]: string } = { label: label };

            Array.from(polyNode.getElementsByTagName('attribute')).forEach((attributeNode: Element) => {
                const attrName = attributeNode.getAttribute('name');
                const attrValue = attributeNode.textContent || "";
                if (attrName) {
                    attributes[attrName] = attrValue;
                }
            });
            
            const xs = points.map(p => p[0]);
            const ys = points.map(p => p[1]);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const maxX = Math.max(...xs);
            const maxY = Math.max(...ys);
            const width = maxX - minX;
            const height = maxY - minY;

            const annotation: PolygonAnnotation = {
                id: annotationIdCounter++,
                image_id: imageId,
                category_id: categoryId,
                segmentation: [points],
                area: width * height, // This is bbox area, not polygon area, but it's a reasonable approximation for COCO format
                bbox: [minX, minY, width, height],
                attributes: attributes,
            };
            
            annotations.push(annotation);
        });
    });

    return {
        images,
        annotations,
        categories,
        tasks
    };
}
