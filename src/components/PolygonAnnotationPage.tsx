
'use client';

import React, { useState } from 'react';
import JSZip from 'jszip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { FormValues, CocoJson, PolygonEvaluationResult } from '@/lib/types';
import { evaluatePolygons } from '@/lib/polygon-evaluator';
import { parseCvatXmlForPolygons } from '@/lib/cvat-xml-parser';
import { EvaluationForm } from './EvaluationForm';
import { PolygonResultsDashboard } from './PolygonResultsDashboard';
import { Spline } from 'lucide-react';
import { RuleConfiguration } from './RuleConfiguration';
import { extractEvalSchema, type EvalSchema, type EvalSchemaInput } from '@/ai/flows/extract-eval-schema';

export default function PolygonAnnotationPage() {
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isGeneratingRules, setIsGeneratingRules] = useState<boolean>(false);
    const [results, setResults] = useState<PolygonEvaluationResult[] | null>(null);
    const [evalSchema, setEvalSchema] = useState<EvalSchema | null>(null);
    const [gtFileContent, setGtFileContent] = useState<string | null>(null);
    const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
    const { toast } = useToast();
    
    const handleGtFileChange = async (file: File | undefined) => {
        if (!file) {
            setEvalSchema(null);
            setGtFileContent(null);
            setImageUrls(new Map());
            return;
        }
        
        setIsGeneratingRules(true);
        setResults(null);
        setEvalSchema(null);
        setGtFileContent(null);
        setImageUrls(new Map());

        try {
            let fileContent: string;
            const newImageUrls = new Map<string, string>();

            if (file.name.endsWith('.zip')) {
                toast({ title: "Processing GT ZIP file...", description: "Extracting annotations and images." });
                const zip = await JSZip.loadAsync(file);
                let foundFile: JSZip.JSZipObject | null = null;
                
                const filePromises = Object.values(zip.files).map(async (fileInZip) => {
                    if (fileInZip.dir) return;
                    
                    const isAnnotationFile = fileInZip.name.endsWith('.xml') || fileInZip.name.endsWith('.json');

                    if (!foundFile && isAnnotationFile) {
                        foundFile = fileInZip;
                    } else if (fileInZip.name.match(/\.(jpe?g|png|gif|webp)$/i)) {
                        const blob = await fileInZip.async('blob');
                        const url = URL.createObjectURL(blob);
                        const filename = fileInZip.name.split('/').pop()!;
                        newImageUrls.set(filename, url);
                    }
                });

                await Promise.all(filePromises);

                if (!foundFile) {
                    throw new Error("No .xml or .json annotation file found inside the Ground Truth ZIP archive.");
                }
                fileContent = await foundFile.async('string');

            } else {
                fileContent = await file.text();
            }

            setGtFileContent(fileContent);
            setImageUrls(newImageUrls);
            const schema = await extractEvalSchema({ gtFileContent: fileContent });
            setEvalSchema(schema);
            toast({
                title: "Evaluation Rules Generated",
                description: "The evaluation schema has been extracted from your GT file.",
            });
        } catch (e: any) {
            console.error(e);
            toast({
                title: "Error Generating Rules",
                description: `Could not process the GT file: ${e.message}`,
                variant: "destructive",
            });
        } finally {
            setIsGeneratingRules(false);
        }
    }

    const handleEvaluate = async (data: FormValues) => {
        if (!evalSchema || !gtFileContent) {
            toast({
                title: "Evaluation Rules or GT File Missing",
                description: "Please upload a Ground Truth file first to generate rules.",
                variant: "destructive",
            });
            return;
        }
        setIsLoading(true);
        setResults(null);
    
        try {
            const studentFileInputs = Array.from(data.studentFiles);
            const imageFileInputs = data.imageFiles ? Array.from(data.imageFiles) : [];
            const batchResults: PolygonEvaluationResult[] = [];
            
            let studentFiles: { name: string, content: string }[] = [];
            const newImageUrls = new Map(imageUrls);

            if(imageFileInputs.length > 0) {
                const imagePromises = imageFileInputs.map(async file => {
                  if (file.name.endsWith('.zip')) {
                    const zip = await JSZip.loadAsync(file);
                    const imageInZipPromises = Object.values(zip.files).map(async (zipFile) => {
                      if (!zipFile.dir && zipFile.name.match(/\.(jpe?g|png|gif|webp)$/i)) {
                        const blob = await zipFile.async('blob');
                        return { name: zipFile.name.split('/').pop()!, url: URL.createObjectURL(blob) };
                      }
                      return null;
                    });
                    return Promise.all(imageInZipPromises);
                  } else {
                     return { name: file.name, url: URL.createObjectURL(file) };
                  }
                });

                const allImagesNested = await Promise.all(imagePromises);
                allImagesNested.flat().filter(Boolean).forEach(img => {
                    if (img) newImageUrls.set(img.name, img.url);
                });
            }
            
            if (newImageUrls.size === 0) {
                throw new Error("No image files found. Please upload images either in the GT ZIP or the dedicated image upload field.");
            }
            setImageUrls(newImageUrls);

            // Handle ZIP file upload for student files
            if (studentFileInputs.length === 1 && studentFileInputs[0].name.endsWith('.zip')) {
                toast({ title: "Processing Student ZIP file...", description: "Extracting submissions." });
                const zipFile = studentFileInputs[0];
                const zip = await JSZip.loadAsync(zipFile);
                const filePromises = [];

                for (const filename in zip.files) {
                    const fileInZip = zip.files[filename];
                    if (fileInZip.dir) continue;
                    
                    // Handle nested zips for CVAT batch exports
                    if (filename.endsWith('.zip')) {
                        const filePromise = async () => {
                            try {
                                const nestedZip = await JSZip.loadAsync(await fileInZip.async('blob'));
                                for (const nestedFilename in nestedZip.files) {
                                    const nestedFile = nestedZip.files[nestedFilename];
                                    if (!nestedFile.dir && (nestedFilename.endsWith('.xml') || nestedFilename.endsWith('.json'))) {
                                        const content = await nestedFile.async('string');
                                        return {
                                            name: filename, // Use the outer zip filename as student identifier
                                            content: content
                                        };
                                    }
                                }
                            } catch(e) {
                                console.error(`Skipping corrupted nested zip: ${filename}`, e);
                                return null;
                            }
                            return null;
                        };
                        filePromises.push(filePromise());
                    }
                    // Handle regular files at top level or in subdirectories
                    else if (filename.endsWith('.xml') || filename.endsWith('.json')) {
                        const filePromise = fileInZip.async('string').then(content => ({
                            name: filename,
                            content: content
                        }));
                        filePromises.push(filePromise);
                    }
                }
                const resolvedFiles = await Promise.all(filePromises);
                studentFiles = resolvedFiles.filter(f => f !== null) as { name: string, content: string }[];
            } else {
                studentFiles = await Promise.all(studentFileInputs.map(async file => ({
                    name: file.name,
                    content: await file.text()
                })));
            }

            if (studentFiles.length === 0) {
                throw new Error("No valid annotation files (.xml or .json) found in the upload.");
            }

            const isXmlFile = (content: string) => content.trim().startsWith('<?xml');
            let gtAnnotations: any;

            if (isXmlFile(gtFileContent)) {
                gtAnnotations = parseCvatXmlForPolygons(gtFileContent);
            } else {
                gtAnnotations = JSON.parse(gtFileContent);
            }

            for (const studentFile of studentFiles) {
                let studentAnnotations: any;
                if (isXmlFile(studentFile.content)) {
                    studentAnnotations = parseCvatXmlForPolygons(studentFile.content);
                } else {
                    studentAnnotations = JSON.parse(studentFile.content);
                }
            
                const manualResult = evaluatePolygons(gtAnnotations, studentAnnotations, evalSchema);
                batchResults.push({
                    ...manualResult,
                    studentFilename: studentFile.name,
                });
            }
            
            setResults(batchResults);

            toast({
                title: "Batch Evaluation Complete",
                description: `Successfully evaluated ${batchResults.length} student files.`,
            });

        } catch (e: any) {
            console.error(e);
            toast({
                title: "Evaluation Error",
                description: `${e.message}. Please check file formats and try again.`,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleRuleChange = async (instructions: { pseudoCode?: string; userInstructions?: string }) => {
        if (!gtFileContent) {
            toast({
                title: "Ground Truth File Missing",
                description: "Cannot regenerate rules without the original GT file.",
                variant: "destructive",
            });
            return;
        }
        setIsGeneratingRules(true);
        try {
            const input: EvalSchemaInput = { gtFileContent };
            if (instructions.userInstructions) {
                input.userInstructions = instructions.userInstructions;
            } else if (instructions.pseudoCode) {
                input.pseudoCode = instructions.pseudoCode;
            }
            
            const newSchema = await extractEvalSchema(input);
            setEvalSchema(newSchema);
            toast({
                title: "Rules Regenerated",
                description: "The evaluation schema has been updated based on your input.",
            });
        } catch (e: any) {
            console.error(e);
            toast({
                title: "Error Regenerating Rules",
                description: `Failed to update rules: ${e.message}`,
                variant: "destructive",
            });
        } finally {
            setIsGeneratingRules(false);
        }
    };


    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Spline className="w-6 h-6" />
                    New Polygon Annotation Evaluation
                </CardTitle>
                <CardDescription>
                    Upload CVAT XML or COCO Polygon files to evaluate polygon annotations.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
                 <EvaluationForm 
                    onEvaluate={handleEvaluate} 
                    isLoading={isLoading || isGeneratingRules} 
                    onGtFileChange={handleGtFileChange}
                    imageUrls={imageUrls}
                />
                 <RuleConfiguration 
                    schema={evalSchema} 
                    loading={isGeneratingRules} 
                    onRuleChange={handleRuleChange} 
                />
                <PolygonResultsDashboard
                  results={results}
                  loading={isLoading}
                  imageUrls={imageUrls}
                />
            </CardContent>
        </Card>
    );
}
