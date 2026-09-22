
'use client';

import React, { useState } from 'react';
import JSZip from 'jszip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, Loader2, UploadCloud } from "lucide-react";
import type { CocoJson, SkeletonEvaluationResult } from '@/lib/types';
import { evaluateSkeletons } from '@/lib/evaluator';
import { SkeletonViewer } from './SkeletonViewer';
import { ScoreCard } from './ScoreCard';
import { useToast } from '@/hooks/use-toast';

export default function SkeletonAnnotationPage() {
    const [gtFile, setGtFile] = useState<File | null>(null);
    const [studentFile, setStudentFile] = useState<File | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    
    const [gtJson, setGtJson] = useState<CocoJson | null>(null);
    const [studentJson, setStudentJson] = useState<CocoJson | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [results, setResults] = useState<SkeletonEvaluationResult | null>(null);
    const { toast } = useToast();

    const processFile = async (file: File, jsonSetter: React.Dispatch<React.SetStateAction<CocoJson | null>>, isGt: boolean) => {
        let annotationContent: string | null = null;

        if (file.name.endsWith('.zip')) {
            const zip = await JSZip.loadAsync(file);
            let annotationFile: JSZip.JSZipObject | null = null;
            
            const filePromises = Object.values(zip.files).map(async (fileInZip) => {
                if (fileInZip.dir) return;

                if (!annotationFile && fileInZip.name.endsWith('.json')) {
                    annotationFile = fileInZip;
                }
                
                if (isGt && fileInZip.name.match(/\.(jpe?g|png|gif|webp)$/i)) {
                    const blob = await fileInZip.async('blob');
                    const url = URL.createObjectURL(blob);
                    setImageUrl(url); // Set the first image found as the preview
                    setImageFile(new File([blob], fileInZip.name.split('/').pop()!));
                }
            });
            await Promise.all(filePromises);

            if (annotationFile) {
                annotationContent = await annotationFile.async('string');
            } else {
                throw new Error("No .json annotation file found in the ZIP archive.");
            }
        } else if (file.name.endsWith('.json')) {
            annotationContent = await file.text();
        } else {
             throw new Error("Unsupported file type. Please upload a .json or .zip file.");
        }
        
        if (annotationContent) {
            jsonSetter(JSON.parse(annotationContent));
        }
    };


    const handleGtFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setGtFile(file);
            setResults(null);
            try {
                await processFile(file, setGtJson, true);
                toast({ title: "Ground Truth processed successfully." });
            } catch (error: any) {
                toast({ title: "Error processing GT file", description: error.message, variant: "destructive" });
            }
        }
    };
    
    const handleStudentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setStudentFile(file);
             setResults(null);
            try {
                await processFile(file, setStudentJson, false);
                 toast({ title: "Student file processed successfully." });
            } catch (error: any) {
                toast({ title: "Error processing student file", description: error.message, variant: "destructive" });
            }
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setImageUrl(URL.createObjectURL(file));
        }
    };

    const handleEvaluate = async () => {
        if (!gtJson || !studentJson || !imageFile) {
            toast({
                title: "Missing Files",
                description: "Please upload all three files: Ground Truth, Student Annotation, and the Image.",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        setResults(null);

        try {
            const evalResults = evaluateSkeletons(gtJson, studentJson);
            setResults({
                ...evalResults,
                studentFilename: studentFile?.name || 'student_file',
            });

        } catch (e: any) {
            console.error(e);
            toast({
                title: "Evaluation Error",
                description: `Evaluation failed: ${e.message}. Please check file formats.`,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle>Skeleton Annotation Evaluation</CardTitle>
                <CardDescription>
                    Upload COCO Keypoints JSON files and the corresponding image to evaluate skeleton annotations.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                        <Label htmlFor="gt-file">1. Ground Truth (JSON or ZIP)</Label>
                        <div className="relative">
                            <UploadCloud className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input id="gt-file" type="file" className="pl-10" accept=".json,.zip" onChange={handleGtFileChange} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="student-file">2. Student Annotation (JSON or ZIP)</Label>
                         <div className="relative">
                            <UploadCloud className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input id="student-file" type="file" className="pl-10" accept=".json,.zip" onChange={handleStudentFileChange} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="image-file">3. Image File (if not in GT ZIP)</Label>
                         <div className="relative">
                            <UploadCloud className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input id="image-file" type="file" className="pl-10" accept="image/*" onChange={handleImageChange} />
                        </div>
                    </div>
                </div>

                <Button onClick={handleEvaluate} disabled={isLoading || !gtFile || !studentFile || !imageFile} className="w-full">
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Evaluating...
                        </>
                    ) : (
                        'Run Skeleton Evaluation'
                    )}
                </Button>

                {isLoading && (
                     <Card className="flex flex-col items-center justify-center text-center p-8 h-full min-h-[300px]">
                        <Loader2 className="h-16 w-16 text-muted-foreground animate-spin mb-4" />
                        <h3 className="text-xl font-semibold text-foreground">Calculating OKS...</h3>
                        <p className="text-muted-foreground mt-2">The skeleton evaluation is in progress.</p>
                    </Card>
                )}

                {results && imageUrl && gtJson && studentJson && (
                    <Card className="mt-6">
                        <CardHeader>
                            <CardTitle>Evaluation Results for <span className="text-primary">{results.studentFilename}</span></CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="md:col-span-1 flex items-center justify-center">
                                    <ScoreCard score={results.score} />
                                </div>
                                <div className="md:col-span-2 space-y-4">
                                     <Alert>
                                        <CheckCircle className="h-4 w-4" />
                                        <AlertTitle>Overall Feedback</AlertTitle>
                                        <AlertDescription>
                                            <ul className="list-disc list-inside">
                                                {results.feedback.map((item, index) => <li key={index}>{item}</li>)}
                                            </ul>
                                        </AlertDescription>
                                    </Alert>
                                    <Card>
                                        <CardHeader><CardTitle>Average OKS</CardTitle></CardHeader>
                                        <CardContent className="text-3xl font-bold">{results.averageOks.toFixed(3)}</CardContent>
                                    </Card>
                                </div>
                            </div>
                            
                            <div>
                                <h3 className="text-lg font-semibold mb-2">Visual Comparison</h3>
                                <SkeletonViewer 
                                    imageUrl={imageUrl}
                                    gtJson={gtJson}
                                    studentJson={studentJson}
                                    results={results}
                                />
                                <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground mt-2 border-t pt-2">
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'rgba(0, 255, 0, 0.9)' }}></div><span>GT Keypoint</span></div>
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'rgba(0, 0, 255, 0.9)' }}></div><span>Student Keypoint</span></div>
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'rgba(255, 0, 0, 0.9)' }}></div><span>Missed Skeleton</span></div>
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'rgba(255, 165, 0, 0.9)' }}></div><span>Extra Skeleton</span></div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </CardContent>
        </Card>
    );
}