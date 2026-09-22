

'use client';

import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { useToast } from "@/hooks/use-toast";
import { ResultsDashboard } from '@/components/ResultsDashboard';
import { AnnotatorAiLogo } from '@/components/AnnotatorAiLogo';
import type { EvaluationResult, FormValues, CocoJson, SelectedAnnotation, Feedback, ScoreOverrides } from '@/lib/types';
import type { EvalSchema, EvalSchemaInput } from '@/lib/types';
import { recalculateOverallScore } from '@/lib/evaluator';
import SkeletonAnnotationPage from '@/components/SkeletonAnnotationPage';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { BoxSelect, Bone, Spline } from 'lucide-react';
import PolygonAnnotationPage from '@/components/PolygonAnnotationPage';
import { ThemeToggle } from '@/components/ThemeToggle';

const LOCAL_STORAGE_KEY = 'annotator-ai-score-overrides';

export default function Home() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGeneratingRules, setIsGeneratingRules] = useState<boolean>(false);
  const [results, setResults] = useState<EvaluationResult[] | null>(null);
  const [evalSchema, setEvalSchema] = useState<EvalSchema | null>(null);
  const [gtFileContent, setGtFileContent] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [evaluationMode, setEvaluationMode] = useState<'bounding-box' | 'skeleton' | 'polygon'>('bounding-box');
  const [selectedAnnotation, setSelectedAnnotation] = useState<SelectedAnnotation | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [feedbackCache, setFeedbackCache] = useState<Map<string, Feedback>>(new Map());
  const [scoreOverrides, setScoreOverrides] = useState<ScoreOverrides>({});
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    try {
        const savedOverrides = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedOverrides) {
            setScoreOverrides(JSON.parse(savedOverrides));
        }
    } catch (error) {
        console.error("Could not load score overrides from localStorage", error);
    }
  }, []);

  useEffect(() => {
    if (results) {
      handleRecalculate();
    }
  }, [scoreOverrides]);

  const handleRecalculate = () => {
    if (!results) return;
    const newResults = results.map(res => recalculateOverallScore(res, scoreOverrides));
    setResults(newResults);
  };
  
  const handleScoreOverride = (studentFilename: string, imageId: number, annotationId: number, newScore: number | null) => {
    if (!results) return;

    // Find the original score to compare against
    const result = results.find(r => r.studentFilename === studentFilename);
    const imageResult = result?.image_results.find(ir => ir.imageId === imageId);
    const match = imageResult?.matched.find(m => m.gt.id === annotationId);

    if (!match) return;

    const updatedOverrides = JSON.parse(JSON.stringify(scoreOverrides)) as ScoreOverrides;
    
    // Ensure nested objects exist
    if (!updatedOverrides[studentFilename]) {
        updatedOverrides[studentFilename] = {};
    }
    if (!updatedOverrides[studentFilename][imageId]) {
        updatedOverrides[studentFilename][imageId] = {};
    }

    // If new score is null or same as original, remove the override
    if (newScore === null || newScore === Math.round(match.originalScore)) {
        if (updatedOverrides[studentFilename]?.[imageId]?.[annotationId]) {
             delete updatedOverrides[studentFilename][imageId][annotationId];
        }
    } else {
        // Otherwise, set the new override score
        updatedOverrides[studentFilename][imageId][annotationId] = newScore;
    }

    // Clean up empty objects
    if (Object.keys(updatedOverrides[studentFilename][imageId]).length === 0) {
        delete updatedOverrides[studentFilename][imageId];
    }
    if (Object.keys(updatedOverrides[studentFilename]).length === 0) {
        delete updatedOverrides[studentFilename];
    }
    
    setScoreOverrides(updatedOverrides);
    
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedOverrides));
    } catch (error) {
        console.error("Could not save score overrides to localStorage", error);
    }
  };


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
    setSelectedAnnotation(null);
    setFeedback(null);
    setFeedbackCache(new Map());
    setEvaluationError(null);

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
      setImageUrls(newImageUrls); // Set images extracted from GT zip
      const formData = new FormData();
      formData.append('gtFileContent', fileContent);
      const res = await fetch('/api/schema', { method: 'POST', body: formData });
      if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to extract schema');
      }
      const data = await res.json();
      setEvalSchema(data.schema);
      toast({
        title: "Evaluation Rules Generated",
        description: "The evaluation schema has been extracted from your GT file.",
      });
    } catch (e: any) {
      console.error(e);
      let description = `Could not process the GT file: ${e.message}`;
      // Check if the error is a service availability issue from the AI model
      if (e.cause?.status === 503 || (e.message && e.message.includes('503'))) {
        description = "The AI service is temporarily unavailable. Please try again in a few moments.";
      }
      toast({
        title: "Error Generating Rules",
        description: description,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingRules(false);
    }
  }
  
  const prefetchAndCacheFeedback = async (resultsToCache: EvaluationResult[]) => {
      const newCache = new Map<string, Feedback>();
      const feedbackPromises: Promise<void>[] = [];

      for (const result of resultsToCache) {
          for (const imageResult of result.image_results) {
              for (const match of imageResult.matched) {
                  const cacheKey = `${imageResult.imageId}-${match.gt.id}`;
                  if (!newCache.has(cacheKey)) {
                      const promise = fetch('/api/feedback', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ gt: match.gt, student: match.student })
                      }).then(async res => {
                          if (res.ok) {
                              const feedbackResponse = await res.json();
                              newCache.set(cacheKey, feedbackResponse);
                          }
                      }).catch(error => {
                              console.error(`Failed to prefetch feedback for ${cacheKey}:`, error);
                          });
                      feedbackPromises.push(promise);
                  }
              }
          }
      }

      await Promise.all(feedbackPromises);
      setFeedbackCache(newCache);
      console.log("Feedback cache populated:", newCache);
  };

  const handleGenerateRulesFromApi = async (manifestPath: string) => {
    setIsGeneratingRules(true);
    setResults(null);
    setEvalSchema(null);
    setGtFileContent(null);
    setImageUrls(new Map());
    setSelectedAnnotation(null);
    setFeedback(null);
    setFeedbackCache(new Map());
    setEvaluationError(null);

    try {
        toast({ title: "Loading GT Data...", description: "Reading downloaded project data." });
        
        const manifestRes = await fetch('/api/pull-data/read-manifest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ manifestPath })
        });
        
        if (!manifestRes.ok) {
            const errData = await manifestRes.json();
            throw new Error(`Failed to read manifest: ${errData.error}`);
        }
        
        const manifestData = await manifestRes.json();
        const manifest = manifestData.manifest;
        
        if (!manifest || manifest.length === 0) {
            throw new Error("GT Manifest is empty.");
        }
        
        const content = manifest[0].content;
        setGtFileContent(content);
        
        // Extract images from GT manifest if present
        const newImageUrls = new Map<string, string>();
        if (manifest[0].extractedImages) {
            manifest[0].extractedImages.forEach((img: {name: string, url: string}) => {
                newImageUrls.set(img.name, img.url);
            });
        }
        setImageUrls(newImageUrls);

        toast({ title: "Generating Rules...", description: "Extracting evaluation schema from GT." });
        const formData = new FormData();
        formData.append('gtFileContent', content);
        const schemaRes = await fetch('/api/schema', { method: 'POST', body: formData });
        
        if (!schemaRes.ok) {
            const errData = await schemaRes.json();
            throw new Error(errData.error || 'Failed to extract schema');
        }
        
        const schemaData = await schemaRes.json();
        setEvalSchema(schemaData.schema);
        setLoadedGtSourceId(manifestPath);
        
        toast({
            title: "Evaluation Rules Ready",
            description: "The rules have been generated successfully.",
        });
    } catch (e: any) {
        console.error(e);
        toast({
            title: "Error Generating Rules",
            description: e.message || "Failed to load GT and generate rules.",
            variant: "destructive",
        });
    } finally {
        setIsGeneratingRules(false);
    }
  };

  const [loadedGtSourceId, setLoadedGtSourceId] = useState<string | null>(null);

  const handleEvaluate = async (data: FormValues) => {
    setIsLoading(true);
    setResults(null);
    setSelectedAnnotation(null);
    setFeedback(null);
    setFeedbackCache(new Map());
    setEvaluationError(null);
    setProgress(0);

    try {
        let currentGtContent = gtFileContent;
        let currentEvalSchema = evalSchema;

        // If GT is from API and we have downloaded it
        if (data.gtSourceMode === 'api' && data.gtDownloadedPath) {
            if (loadedGtSourceId !== data.gtDownloadedPath) {
                // If they haven't clicked Generate Rules, we need to do it here as a fallback
                toast({ title: "Fetching Ground Truth...", description: "Reading downloaded GT annotations." });
                const manifestRes = await fetch('/api/pull-data/read-manifest', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ manifestPath: data.gtDownloadedPath })
                });
                if (!manifestRes.ok) throw new Error("Failed to fetch downloaded GT manifest");
                const manifestData = await manifestRes.json();
                const manifest = manifestData.manifest;
                
                if (manifest && manifest.length > 0) {
                    currentGtContent = manifest[0].content;
                    setGtFileContent(currentGtContent);
                    
                    // Generate Schema
                    toast({ title: "Generating Rules...", description: "Extracting evaluation schema from GT." });
                    const formData = new FormData();
                    if (currentGtContent) formData.append('gtFileContent', currentGtContent);
                    const schemaRes = await fetch('/api/schema', { method: 'POST', body: formData });
                    if (!schemaRes.ok) {
                        const errData = await schemaRes.json();
                        throw new Error(errData.error || 'Failed to extract schema');
                    }
                    const schemaData = await schemaRes.json();
                    currentEvalSchema = schemaData.schema;
                    setEvalSchema(currentEvalSchema);
                    setLoadedGtSourceId(data.gtDownloadedPath);
                } else {
                    throw new Error("GT Manifest is empty.");
                }
            }
        } else if (data.gtSourceMode === 'file' && loadedGtSourceId !== 'file') {
             if (!currentEvalSchema || !currentGtContent) {
                throw new Error("Please upload a Ground Truth file first to generate rules.");
             }
             setLoadedGtSourceId('file');
        }

        if (!currentEvalSchema || !currentGtContent) {
            throw new Error("Missing Ground Truth data or Evaluation Rules.");
        }
  
        const imageFileInputs = data.imageFiles ? Array.from(data.imageFiles) : [];
        const batchResults: EvaluationResult[] = [];
        
        let studentFiles: { name: string, content: string }[] = [];
        // Start with images from GT zip, then add/overwrite with explicitly uploaded images
        const newImageUrls = new Map(imageUrls);

        // Handle image files uploaded in the dedicated field
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
            // It's okay to not have images if they are just doing bounding boxes without rendering, 
            // but the original code enforced it. Let's keep it but just log it if we need to.
            console.log("No image files found, skipping image rendering.");
        }
        setImageUrls(newImageUrls);

        const formData = new FormData();
        formData.append('gtFileContent', currentGtContent);
        formData.append('evalSchema', JSON.stringify(currentEvalSchema));
        formData.append('toolType', data.toolType);
        formData.append('scoreOverrides', JSON.stringify(scoreOverrides));
        
        // Pass either API details OR files for student tasks
        if (data.studentSourceMode === 'api') {
            if (data.studentDownloadedPaths) {
                for (let i = 0; i < data.studentDownloadedPaths.length; i++) {
                     formData.append('studentDownloadedPaths', data.studentDownloadedPaths[i]);
                }
            }
        } else {
             if (data.studentFiles) {
                for (let i = 0; i < data.studentFiles.length; i++) {
                     formData.append('studentFiles', data.studentFiles[i]);
                }
             }
        }
        
        if (data.gtDownloadedPath) {
            formData.append('gtDownloadedPath', data.gtDownloadedPath);
        }

        toast({ title: "Uploading to Server...", description: "Evaluating submissions in the background." });

        const res = await fetch('/api/evaluate', {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Failed to evaluate annotations');
        }

        const responseData = await res.json();
        const jobId = responseData.jobId;
        
        toast({ title: "Job Queued", description: "Waiting for background processing..." });

        let attempts = 0;
        while(attempts < 120) {
            await new Promise(r => setTimeout(r, 2000));
            
            const statusRes = await fetch(`/api/evaluate/status?jobId=${jobId}`);
            if (!statusRes.ok) throw new Error('Failed to check job status');
            
            const statusData = await statusRes.json();
            
            if (statusData.status === 'completed') {
                const batchResults: EvaluationResult[] = statusData.batchResults;
                
                // Collect any server-extracted images and add them to imageUrls
                const updatedImageUrls = new Map(newImageUrls);
                batchResults.forEach(result => {
                    if (result.extractedImages) {
                        result.extractedImages.forEach(img => {
                            // CVAT images might be nested in folders like data/images/etc, just use basename as key
                            updatedImageUrls.set(img.name, img.url);
                        });
                    }
                });
                
                setImageUrls(updatedImageUrls);
                setResults(batchResults);
                prefetchAndCacheFeedback(batchResults);
                
                toast({
                    title: "Batch Evaluation Complete",
                    description: `Successfully evaluated ${batchResults.length} student files. Caching feedback...`,
                });
                break;
            } else if (statusData.status === 'failed') {
                throw new Error(statusData.error || 'Job failed on the server');
            } else {
                setProgress(statusData.progress || 0);
                toast({
                    title: "Evaluating...",
                    description: `Progress: ${statusData.progress || 0}%`,
                });
            }
        }

    } catch (e) {
      console.error(e);
      const error = e as Error;
      setEvaluationError(`${error.message}. Please check file formats and try again.`);
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
        const formData = new FormData();
        formData.append('gtFileContent', gtFileContent);
        if (instructions.userInstructions) formData.append('userInstructions', instructions.userInstructions);
        if (instructions.pseudoCode) formData.append('pseudoCode', instructions.pseudoCode);
        
        const res = await fetch('/api/schema', { method: 'POST', body: formData });
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Failed to regenerate schema');
        }
        const data = await res.json();
        setEvalSchema(data.schema);
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

  const handleAnnotationSelect = async (annotation: SelectedAnnotation | null) => {
    setSelectedAnnotation(annotation);
    
    if (!annotation) {
      setFeedback(null);
      return;
    }
    
    const cacheKey = `${annotation.imageId}-${annotation.annotationId}`;

    if (feedbackCache.has(cacheKey)) {
        setFeedback(feedbackCache.get(cacheKey)!);
        return;
    }
    
    // Fallback if not in cache (should be rare)
    if (!results || annotation.type !== 'match') {
      setFeedback(null);
      return;
    }

    const result = results.find(r => r.image_results.some(ir => ir.imageId === annotation.imageId));
    const imageResult = result?.image_results.find(ir => ir.imageId === annotation.imageId);
    const match = imageResult?.matched.find(m => m.gt.id === annotation.annotationId);

    if (match) {
        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gt: match.gt, student: match.student })
            });
            if (res.ok) {
                const feedbackResponse = await res.json();
                setFeedback(feedbackResponse);
                setFeedbackCache(prev => {
                    const newCache = new Map(prev);
                    newCache.set(cacheKey, feedbackResponse);
                    return newCache;
                });
            } else {
                console.error("Failed to fetch feedback");
            }
            // Also update the cache
            setFeedbackCache(prev => new Map(prev).set(cacheKey, feedbackResponse));
        } catch (error) {
             console.error("Failed to get feedback:", error);
             toast({ title: "Error", description: "Could not generate feedback for this annotation.", variant: "destructive" });
        }
    } else {
      setFeedback(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 sm:p-8 md:p-12">
      <header className="w-full max-w-7xl flex items-center justify-between mb-8">
        <div className="flex items-center">
            <AnnotatorAiLogo className="h-10 w-10 text-primary" />
            <h1 className="text-4xl ml-4">Annotator AI</h1>
        </div>
        <ThemeToggle />
      </header>
      <main className="w-full max-w-7xl">
        <RadioGroup
              defaultValue="bounding-box"
              className="grid grid-cols-3 gap-4 mb-6 max-w-lg mx-auto"
              onValueChange={(mode: 'bounding-box' | 'skeleton' | 'polygon') => setEvaluationMode(mode)}
              value={evaluationMode}
          >
              <div>
                <RadioGroupItem value="bounding-box" id="bounding-box" className="peer sr-only" />
                <Label
                  htmlFor="bounding-box"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-foreground bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary w-full shadow-hard card-style"
                >
                  <BoxSelect className="mb-3 h-6 w-6" />
                  <span className="font-bold text-center">Bounding Box</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem value="skeleton" id="skeleton" className="peer sr-only" />
                <Label
                  htmlFor="skeleton"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-foreground bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary w-full shadow-hard card-style"
                >
                  <Bone className="mb-3 h-6 w-6" />
                  <span className="font-bold text-center">Skeleton</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem value="polygon" id="polygon" className="peer sr-only" />
                <Label
                  htmlFor="polygon"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-foreground bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary w-full shadow-hard card-style"
                >
                  <Spline className="mb-3 h-6 w-6" />
                  <span className="font-bold text-center">Polygon</span>
                </Label>
              </div>
          </RadioGroup>

          {evaluationMode === 'bounding-box' ? (
              <ResultsDashboard
                  results={results}
                  loading={isLoading || isGeneratingRules}
                  progress={progress}
                  imageUrls={imageUrls}
                  onEvaluate={handleEvaluate}
                  onGtFileChange={handleGtFileChange}
                  onGenerateRules={handleGenerateRulesFromApi}
                  evalSchema={evalSchema}
                  onRuleChange={handleRuleChange}
                  selectedAnnotation={selectedAnnotation}
                  onAnnotationSelect={handleAnnotationSelect}
                  feedback={feedback}
                  onScoreOverride={handleScoreOverride}
                  evaluationError={evaluationError}
              />
          ) : evaluationMode === 'skeleton' ? (
              <SkeletonAnnotationPage />
          ) : (
              <PolygonAnnotationPage />
          )}
      </main>
    </div>
  );
}
