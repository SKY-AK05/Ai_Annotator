

'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ScoreCard } from "@/components/ScoreCard";
import type { BboxAnnotation, EvaluationResult, ImageEvaluationResult, SelectedAnnotation, Feedback, FeedbackIssue } from "@/lib/types";
import type { FormValues } from '@/lib/types';
import type { EvalSchema } from "@/ai/flows/extract-eval-schema";
import { AnnotationViewer } from "@/components/AnnotationViewer";
import { AlertCircle, CheckCircle, Download, FileQuestion, FileText, ImageIcon, MessageSquare, ShieldAlert, User, FileCog, Code2, XCircle, Lightbulb, Pencil } from "lucide-react";
import { Badge } from "./ui/badge";
import { EvaluationForm } from "./EvaluationForm";
import { RuleConfiguration } from "./RuleConfiguration";
import { cn } from '@/lib/utils';
import { EditableScoreCell } from './EditableScoreCell';
import { Progress } from "@/components/ui/progress";

interface ResultsDashboardProps {
  results: EvaluationResult[] | null;
  loading: boolean;
  progress?: number;
  imageUrls: Map<string, string>;
  onEvaluate: (data: FormValues) => void;
  onGtFileChange: (file: File | undefined) => void;
  evalSchema: EvalSchema | null;
  onRuleChange: (instructions: { pseudoCode?: string; userInstructions?: string }) => void;
  selectedAnnotation: SelectedAnnotation | null;
  onAnnotationSelect: (annotation: SelectedAnnotation | null) => void;
  feedback: Feedback | null;
  onScoreOverride: (studentFilename: string, imageId: number, annotationId: number, newScore: number | null) => void;
  evaluationError?: string | null;
}

const FeedbackPanel = ({ feedback }: { feedback: Feedback | null }) => {
    if (!feedback) return null;

    const getIssueColor = (status: FeedbackIssue['status']) => {
        switch (status) {
            case 'gap': return 'text-blue-500';
            case 'cut_off': return 'text-red-500';
            default: return 'text-green-500';
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Lightbulb className="h-5 w-5" />
                    Rule-Based Feedback
                </CardTitle>
            </CardHeader>
            <CardContent>
                {feedback.issues.length === 0 || feedback.issues[0].status === 'aligned' ? (
                    <p className="text-sm text-green-600 flex items-center gap-2"><CheckCircle className="h-4 w-4" />Annotation is well-aligned.</p>
                ) : (
                    <ul className="space-y-2 text-sm">
                        {feedback.issues.map((issue, index) => (
                            <li key={index} className={cn("flex items-start gap-2", getIssueColor(issue.status))}>
                                <div className="mt-1">
                                    {issue.status === 'gap' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                                    {issue.status === 'cut_off' && <div className="w-2 h-2 rounded-full bg-red-500" />}
                                </div>
                                <span>{issue.message}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
};


const ResultsDisplay = ({ results, imageUrls, selectedAnnotation, onAnnotationSelect, feedback, onScoreOverride }: { results: EvaluationResult[], imageUrls: Map<string, string>, selectedAnnotation: SelectedAnnotation | null, onAnnotationSelect: (annotation: SelectedAnnotation | null) => void, feedback: Feedback | null, onScoreOverride: (studentFilename: string, imageId: number, annotationId: number, newScore: number | null) => void }) => {

  const handleDownloadSummaryCsv = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Header
    csvContent += "Student Filename,Score,Avg IoU,Label Accuracy,Correct Labels,Total Labels,Attribute Accuracy,Attributes Compared,Matched Count,Missed Count,Extra Count,Feedback,Critical Issues\r\n";

    results.forEach(result => {
        const studentFilename = `"${result.studentFilename}"`;
        const score = result.score;
        const avgIoU = result.average_iou.toFixed(3);
        const labelAccuracy = result.label_accuracy.accuracy.toFixed(1);
        const correctLabels = result.label_accuracy.correct;
        const totalLabels = result.label_accuracy.total;
        const attributeAccuracy = result.attribute_accuracy.average_similarity.toFixed(1);
        const attributesCompared = result.attribute_accuracy.total;
        const matchedCount = result.matched.length;
        const missedCount = result.missed.length;
        const extraCount = result.extra.length;
        const feedback = `"${result.feedback.join('. ')}"`;
        const criticalIssues = `"${result.critical_issues.join('. ')}"`;

        const row = [studentFilename, score, avgIoU, labelAccuracy, correctLabels, totalLabels, attributeAccuracy, attributesCompared, matchedCount, missedCount, extraCount, feedback, criticalIssues].join(',');
        csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "batch_evaluation_summary.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const handleDownloadDetailedCsv = (result: EvaluationResult) => {
    const escapeCsv = (str: string | number | undefined | null) => {
        if (str === undefined || str === null) return '""';
        const s = String(str);
        if (s.includes('"') || s.includes(',')) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return `"${s}"`;
    };

    let csv = [];

    // Summary
    csv.push(`"Summary for ${result.studentFilename}"`);
    csv.push(`"Metric","Value"`);
    csv.push(`"Final Score",${result.score}`);
    csv.push(`"Average IoU",${result.average_iou.toFixed(4)}`);
    csv.push(`"Label Accuracy","${result.label_accuracy.accuracy.toFixed(2)}%"`);
    csv.push(`"Attribute Accuracy","${result.attribute_accuracy.average_similarity.toFixed(2)}%"`);
    csv.push(`"Matched Detections",${result.matched.length}`);
    csv.push(`"Missed Detections",${result.missed.length}`);
    csv.push(`"Extra Detections",${result.extra.length}`);
    csv.push('');

    // Feedback & Issues
    csv.push('"Feedback"');
    result.feedback.forEach(f => csv.push(escapeCsv(f)));
    csv.push('');
    csv.push('"Critical Issues"');
    result.critical_issues.forEach(i => csv.push(escapeCsv(i)));
    csv.push('');
    csv.push('---');
    csv.push('');

    // Per-Image Breakdown
    result.image_results.forEach(imgResult => {
        csv.push(`"Image: ${imgResult.imageName}"`);
        csv.push('');

        // Matched
        csv.push('"Matched Annotations"');
        csv.push(`"GT ID","GT Label","Student ID","Student Label","IoU","Attribute Similarity","Original Score","Final Score (Overridden)"`);
        imgResult.matched.forEach(m => {
            const row = [
                m.gt.id,
                m.gt.attributes?.label,
                m.student.id,
                m.student.attributes?.label,
                m.iou.toFixed(4),
                m.attributeSimilarity.toFixed(4),
                m.originalScore.toFixed(2),
                m.overrideScore !== null && m.overrideScore !== undefined ? m.overrideScore.toFixed(2) : m.originalScore.toFixed(2)
            ].map(escapeCsv).join(',');
            csv.push(row);
        });
        csv.push('');

        // Missed
        csv.push('"Missed Annotations"');
        csv.push(`"GT ID","GT Label","GT Bbox"`);
        imgResult.missed.forEach(m => {
            const row = [
                m.gt.id,
                m.gt.attributes?.label,
                m.gt.bbox.join(';'),
            ].map(escapeCsv).join(',');
            csv.push(row);
        });
        csv.push('');

        // Extra
        csv.push('"Extra Annotations"');
        csv.push(`"Student ID","Student Label","Student Bbox"`);
        imgResult.extra.forEach(e => {
            const row = [
                e.student.id,
                e.student.attributes?.label,
                e.student.bbox.join(';'),
            ].map(escapeCsv).join(',');
            csv.push(row);
        });
        csv.push('');
        csv.push('---');
        csv.push('');
    });

    const csvContent = "data:text/csv;charset=utf-8," + csv.join("\r\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${result.studentFilename.replace(/[^a-z0-9]/gi, '_')}_detailed_result.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className="flex flex-row items-center justify-between mb-4">
        <div>
            <div className="flex items-center gap-3">
                 <h2 className="text-3xl">
                    Batch Evaluation Results
                </h2>
                 <Badge variant="outline" className={`border-2 border-foreground shadow-hard`}>
                    <User className="h-4 w-4 mr-1" />
                    {results.length} Students
                </Badge>
            </div>
          <p className="text-muted-foreground">
            Summary and detailed breakdown for each student file. Click a row to inspect an annotation.
          </p>
        </div>
        <Button variant="outline" onClick={handleDownloadSummaryCsv}>
          <Download className="mr-2 h-4 w-4" /> Download Summary CSV
        </Button>
      </div>

       <Card className="mb-6">
            <CardHeader>
                <CardTitle>Batch Summary</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Student File</TableHead>
                            <TableHead className="text-right">Score</TableHead>
                            <TableHead className="text-right">Avg. IoU</TableHead>
                            <TableHead className="text-right">Label Acc.</TableHead>
                            <TableHead className="text-right">Attribute Acc.</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {results.map((result) => (
                            <TableRow key={result.studentFilename}>
                                <TableCell className="font-medium">{result.studentFilename}</TableCell>
                                <TableCell className="text-right font-bold">{result.score}</TableCell>
                                <TableCell className="text-right">{(result.average_iou * 100).toFixed(1)}%</TableCell>
                                <TableCell className="text-right">{result.label_accuracy.accuracy.toFixed(1)}%</TableCell>
                                <TableCell className="text-right">{result.attribute_accuracy.average_similarity.toFixed(1)}%</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
        
        <Accordion type="single" collapsible className="w-full">
            <h3 className="text-2xl mb-2">Detailed Student Results</h3>
            {results.map((result) => (
                <AccordionItem value={result.studentFilename} key={result.studentFilename} className="card-style mb-4 overflow-hidden">
                    <AccordionTrigger className="font-bold text-lg p-4 hover:no-underline">
                       <div className="flex items-center justify-between w-full pr-4">
                           <span>{result.studentFilename}</span>
                           <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDownloadDetailedCsv(result); }}>
                                <FileText className="mr-2 h-4 w-4" />
                                Download CSV
                            </Button>
                       </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-4 bg-muted">
                        <SingleResultDisplay result={result} imageUrls={imageUrls} selectedAnnotation={selectedAnnotation} onAnnotationSelect={onAnnotationSelect} feedback={feedback} onScoreOverride={onScoreOverride}/>
                    </AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    </>
  )

}

const ImageResultDisplay = ({ studentFilename, imageResult, imageUrl, selectedAnnotation, onAnnotationSelect, feedback, onScoreOverride }: { studentFilename: string, imageResult: ImageEvaluationResult, imageUrl: string | undefined, selectedAnnotation: SelectedAnnotation | null, onAnnotationSelect: (annotation: SelectedAnnotation | null) => void, feedback: Feedback | null, onScoreOverride: (studentFilename: string, imageId: number, annotationId: number, newScore: number | null) => void }) => {
    const getAnnotationLabel = (ann: BboxAnnotation) => {
      const categoryName = ann.attributes?.['label']
      const annotationId = `ID ${ann.id}`
      const matchKey = ann.attributes?.['Annotation No'] ? ` (Key: ${ann.attributes['Annotation No']})` : ''
      return `${categoryName || 'Unknown'}${matchKey || ` (${annotationId})`}`
    };

    const isAnnotationSelected = (annId: number, type: 'match' | 'missed' | 'extra') => {
        if (!selectedAnnotation) return false;
        return selectedAnnotation.imageId === imageResult.imageId && selectedAnnotation.annotationId === annId && selectedAnnotation.type === type;
    }

    return (
        <Card>
            <CardHeader className="p-4 flex flex-row items-center justify-between">
                <CardTitle className="text-xl flex items-center gap-2">
                    <ImageIcon className="h-5 w-5"/>
                    {imageResult.imageName}
                </CardTitle>
                {selectedAnnotation && selectedAnnotation.imageId === imageResult.imageId && (
                    <Button variant="ghost" size="sm" onClick={() => onAnnotationSelect(null)}>
                        <XCircle className="mr-2 h-4 w-4" />
                        Clear Selection
                    </Button>
                )}
            </CardHeader>
            <CardContent className="p-4 pt-0 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={cn(
                    "transition-all duration-300",
                    feedback ? "md:col-span-2" : "md:col-span-3"
                )}>
                    {imageUrl ? (
                        <AnnotationViewer
                            imageUrl={imageUrl}
                            imageResult={imageResult}
                            selectedAnnotation={selectedAnnotation}
                            feedback={feedback}
                            onAnnotationSelect={onAnnotationSelect}
                        />
                    ) : (
                        <div className="w-full aspect-video bg-muted rounded-md flex items-center justify-center text-sm text-muted-foreground">
                            Image not provided
                        </div>
                    )}
                </div>
                <div className={cn(
                    "transition-all duration-300",
                    feedback ? "md:col-span-1" : "md:col-span-0 hidden"
                )}>
                    <FeedbackPanel feedback={feedback} />
                </div>
                 <div className="md:col-span-3 grid grid-cols-1 gap-4">
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-lg">{imageResult.matched.length} Matched</CardTitle></CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>GT</TableHead>
                                    <TableHead>Student</TableHead>
                                    <TableHead className="text-right">IoU</TableHead>
                                    <TableHead className="text-right">Score</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>{imageResult.matched.map((m, i) => 
                                    <TableRow 
                                        key={i} 
                                        className="cursor-pointer" 
                                        onClick={() => onAnnotationSelect({ imageId: imageResult.imageId, annotationId: m.gt.id, type: 'match' })}
                                        data-state={isAnnotationSelected(m.gt.id, 'match') ? 'selected' : undefined}
                                    >
                                        <TableCell>{getAnnotationLabel(m.gt)}</TableCell>
                                        <TableCell>{getAnnotationLabel(m.student)}</TableCell>
                                        <TableCell className="text-right">{m.iou.toFixed(2)}</TableCell>
                                        <EditableScoreCell
                                          originalScore={m.originalScore}
                                          overrideScore={m.overrideScore}
                                          onSave={(newScore) => onScoreOverride(studentFilename, imageResult.imageId, m.gt.id, newScore)}
                                        />
                                    </TableRow>
                                )}</TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-lg">{imageResult.missed.length} Missed</CardTitle></CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader><TableRow><TableHead>GT Label</TableHead></TableRow></TableHeader>
                                <TableBody>{imageResult.missed.map((m, i) => 
                                    <TableRow 
                                        key={i} 
                                        className="cursor-pointer" 
                                        onClick={() => onAnnotationSelect({ imageId: imageResult.imageId, annotationId: m.gt.id, type: 'missed' })}
                                        data-state={isAnnotationSelected(m.gt.id, 'missed') ? 'selected' : undefined}
                                    >
                                        <TableCell>{getAnnotationLabel(m.gt)}</TableCell>
                                    </TableRow>
                                )}</TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-lg">{imageResult.extra.length} Extra</CardTitle></CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader><TableRow><TableHead>Student Label</TableHead></TableRow></TableHeader>
                                <TableBody>{imageResult.extra.map((m, i) => 
                                    <TableRow 
                                        key={i} 
                                        className="cursor-pointer" 
                                        onClick={() => onAnnotationSelect({ imageId: imageResult.imageId, annotationId: m.student.id, type: 'extra' })}
                                        data-state={isAnnotationSelected(m.student.id, 'extra') ? 'selected' : undefined}
                                    >
                                        <TableCell>{getAnnotationLabel(m.student)}</TableCell>
                                    </TableRow>
                                )}</TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            </CardContent>
        </Card>
    )
}

const SingleResultDisplay = ({ result, imageUrls, selectedAnnotation, onAnnotationSelect, feedback, onScoreOverride }: { result: EvaluationResult; imageUrls: Map<string, string>; selectedAnnotation: SelectedAnnotation | null; onAnnotationSelect: (annotation: SelectedAnnotation | null) => void; feedback: Feedback | null; onScoreOverride: (studentFilename: string, imageId: number, annotationId: number, newScore: number | null) => void; }) => {
    
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 flex items-center justify-center">
                    <ScoreCard score={result.score} />
                </div>
                <div className="md:col-span-2 space-y-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center space-x-3 space-y-0 pb-2">
                            <MessageSquare className="h-5 w-5 text-primary"/>
                            <h3 className="font-bold">Overall Feedback</h3>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                            {result.feedback.map((item, index) => <li key={index} className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 shrink-0"/><span>{item}</span></li>)}
                            </ul>
                        </CardContent>
                    </Card>
                    { (result.critical_issues && result.critical_issues.length > 0) ? (
                        <Card>
                        <CardHeader className="flex flex-row items-center space-x-3 space-y-0 pb-2">
                            <ShieldAlert className="h-5 w-5 text-destructive"/>
                            <h3 className="font-bold">Critical Issues</h3>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                            {result.critical_issues.map((item, index) => <li key={index} className="flex items-start"><AlertCircle className="h-4 w-4 text-destructive mr-2 mt-0.5 shrink-0"/><span>{item}</span></li>)}
                            </ul>
                        </CardContent>
                        </Card>
                    ) : null }
                </div>
            </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <Card>
                    <CardHeader><CardTitle>Localization Accuracy</CardTitle></CardHeader>
                    <CardContent className="text-3xl font-bold">{result.average_iou.toFixed(3)} <span className="text-sm font-normal text-muted-foreground">Avg. IoU</span></CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Label Accuracy</CardTitle></CardHeader>
                    <CardContent className="text-3xl font-bold">{result.label_accuracy.accuracy.toFixed(0)}% <span className="text-sm font-normal text-muted-foreground">({result.label_accuracy.correct}/{result.label_accuracy.total} correct)</span></CardContent>
                </Card>
                    <Card>
                    <CardHeader><CardTitle>Attribute Accuracy</CardTitle></CardHeader>
                    <CardContent className="text-3xl font-bold">{result.attribute_accuracy.average_similarity.toFixed(0)}% <span className="text-sm font-normal text-muted-foreground">({result.attribute_accuracy.total} attributes)</span></CardContent>
                </Card>
            </div>
             <Accordion type="single" collapsible className="w-full mt-6" defaultValue={result.image_results.length > 0 ? result.image_results[0].imageName : undefined}>
                <h3 className="font-semibold mb-2">Per-Image Breakdown</h3>
                 {result.image_results.map((imageResult) => (
                    <AccordionItem value={imageResult.imageName} key={imageResult.imageName}>
                        <AccordionTrigger className="font-normal text-sm bg-muted/30 px-4 rounded-md">
                            {imageResult.imageName}
                        </AccordionTrigger>
                        <AccordionContent className="p-2">
                           <ImageResultDisplay studentFilename={result.studentFilename} imageResult={imageResult} imageUrl={imageUrls.get(imageResult.imageName.split('/').pop()!)} selectedAnnotation={selectedAnnotation} onAnnotationSelect={onAnnotationSelect} feedback={feedback} onScoreOverride={onScoreOverride} />
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </div>
    );
};

export function ResultsDashboard({ results, loading, progress = 0, imageUrls, onEvaluate, onGtFileChange, evalSchema, onRuleChange, selectedAnnotation, onAnnotationSelect, feedback, onScoreOverride, evaluationError }: ResultsDashboardProps) {
  const [openAccordion, setOpenAccordion] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (evalSchema) {
      setOpenAccordion(["item-1"]);
    }
  }, [evalSchema]);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <FileCog className="w-6 h-6" />
            New Bounding Box Evaluation
        </CardTitle>
        <CardDescription>Upload annotations to compare and score.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <EvaluationForm 
            onEvaluate={onEvaluate} 
            isLoading={loading} 
            onGtFileChange={onGtFileChange}
            imageUrls={imageUrls}
        />
        
        <Accordion 
          type="multiple" 
          className="w-full"
          value={openAccordion}
          onValueChange={setOpenAccordion}
        >
            <AccordionItem value="item-1" className="card-style overflow-hidden">
                <AccordionTrigger className="p-4 hover:no-underline">
                    <div className='flex items-center gap-3'>
                        <Code2 className="w-6 h-6" />
                        <div className="flex-1 text-left">
                            <h2 className="text-2xl">
                                Evaluation Rules
                            </h2>
                            <p className="text-sm text-muted-foreground font-sans">
                                Customize logic with instructions or by editing the pseudocode directly.
                            </p>
                        </div>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="bg-muted p-4">
                    <RuleConfiguration 
                        schema={evalSchema} 
                        loading={loading} 
                        onRuleChange={onRuleChange} 
                    />
                </AccordionContent>
            </AccordionItem>
        </Accordion>
        
        <div>
            <h2 className="text-3xl mb-4">Evaluation Results</h2>
            {loading && !results ? (
                <div className="flex flex-col items-center justify-center text-center p-8 h-full min-h-[300px] border-dashed border-2 rounded-md bg-card">
                    <FileQuestion className="h-16 w-16 text-muted-foreground mb-4 animate-pulse" />
                    <h3 className="text-xl font-semibold text-foreground mb-2">Evaluating...</h3>
                    <Progress value={progress} className="w-[60%] max-w-[300px] h-2 mb-2" />
                    <p className="text-muted-foreground">{progress}% Complete</p>
                    <p className="text-muted-foreground mt-2 text-sm">Large CVAT datasets with images may take several minutes to download.</p>
                </div>
            ) : evaluationError ? (
                <div className="flex flex-col items-center justify-center text-center p-8 h-full min-h-[300px] border-dashed border-2 border-destructive/50 rounded-md bg-destructive/10">
                    <XCircle className="h-16 w-16 text-destructive mb-4" />
                    <h3 className="text-xl font-semibold text-destructive">Evaluation Error</h3>
                    <p className="text-destructive/80 mt-2 max-w-md">{evaluationError}</p>
                </div>
            ) : results ? (
                <ResultsDisplay results={results} imageUrls={imageUrls} selectedAnnotation={selectedAnnotation} onAnnotationSelect={onAnnotationSelect} feedback={feedback} onScoreOverride={onScoreOverride}/>
            ) : (
                <div className="flex flex-col items-center justify-center text-center p-8 h-full min-h-[300px] border-dashed border-2 rounded-md bg-card">
                    <FileQuestion className="h-16 w-16 text-muted-foreground mb-4" />
                    <h3 className="text-xl font-semibold text-foreground font-sans">Awaiting Evaluation</h3>
                    <p className="text-muted-foreground mt-2">Complete the form and run an evaluation to see results.</p>
                </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
