import { parseUniversalBboxDataset } from './src/lib/universal-bbox-parser';

const mockYoloLikeDataset = [
    {
        filename: "image1.jpg",
        class_id: "Car",
        color: "red",
        // CenterX, CenterY, Width, Height (normalized)
        bounding_box: { x: 0.5, y: 0.5, width: 0.2, height: 0.1 } 
    },
    {
        filename: "image1.jpg",
        class_id: "Person",
        // cxcywh format, normalized
        bounding_box: { x: 0.1, y: 0.1, width: 0.05, height: 0.2 } 
    }
];

const mockPascalLikeDataset = {
    images: [
        {
            name: "img2.jpg",
            width: 800,
            height: 600,
            objects: [
                {
                    label: "Dog",
                    // xmin, ymin, xmax, ymax (absolute)
                    box: { xmin: 100, ymin: 100, xmax: 200, ymax: 300 }
                }
            ]
        }
    ]
};

async function runTests() {
    console.log("=== Testing Mock YOLO-like Dataset ===");
    try {
        const result1 = await parseUniversalBboxDataset(JSON.stringify(mockYoloLikeDataset));
        console.log("Success! Extracted annotations:", result1.annotations.length);
        console.dir(result1.annotations[0].bbox, { depth: null });
    } catch (e: any) {
        console.error("Failed YOLO test:", e.message);
    }

    console.log("\n=== Testing Mock Pascal-like Dataset ===");
    try {
        const result2 = await parseUniversalBboxDataset(JSON.stringify(mockPascalLikeDataset));
        console.log("Success! Extracted annotations:", result2.annotations.length);
        console.dir(result2.annotations[0].bbox, { depth: null });
    } catch (e: any) {
        console.error("Failed Pascal test:", e.message);
    }
}

// execute if running directly
runTests();
