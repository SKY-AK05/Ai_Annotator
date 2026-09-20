
import type { CocoJson, BboxAnnotation, CocoCategory, CocoImage } from './types';
import { DOMParser } from '@xmldom/xmldom';

export function parseCvatXml(xmlString: string): CocoJson {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    if (xmlDoc.getElementsByTagName("parsererror").length) {
        throw new Error("Failed to parse XML");
    }

    const images: CocoImage[] = [];
    const annotations: BboxAnnotation[] = [];
    const categories: CocoCategory[] = [];
    let annotationIdCounter = 1;
    const categoryMap = new Map<string, number>();
    let categoryIdCounter = 1;

    const getCategoryId = (name: string): number => {
        if (!categoryMap.has(name)) {
            categoryMap.set(name, categoryIdCounter);
            categories.push({ id: categoryIdCounter, name: name });
            categoryIdCounter++;
        }
        return categoryMap.get(name)!;
    };

    Array.from(xmlDoc.getElementsByTagName("image")).forEach((imageNode: Element) => {
        const imageId = parseInt(imageNode.getAttribute("id") || "0");
        const imageName = imageNode.getAttribute("name") || "";
        const imageWidth = parseInt(imageNode.getAttribute("width") || "0");
        const imageHeight = parseInt(imageNode.getAttribute("height") || "0");

        images.push({
            id: imageId,
            file_name: imageName,
            width: imageWidth,
            height: imageHeight
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

            const annotation: BboxAnnotation = {
                id: annotationIdCounter++,
                image_id: imageId,
                category_id: categoryId,
                bbox: [xtl, ytl, width, height],
                attributes: {},
            };
            
            Array.from(boxNode.getElementsByTagName('attribute')).forEach((attributeNode: Element) => {
                const attrName = attributeNode.getAttribute('name');
                const attrValue = attributeNode.textContent || "";
                if (attrName && annotation.attributes) {
                    annotation.attributes[attrName] = attrValue;
                }
            });
            
            annotations.push(annotation);
        });
    });

    return {
        images,
        annotations,
        categories
    };
}
