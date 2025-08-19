
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ScoreCard } from "@/components/ScoreCard";
import type { PolygonAnnotation, PolygonEvaluationResult, PolygonMatch } from "@/lib/types";
import { PolygonViewer } from "@/components/PolygonViewer";
import { AlertCircle, CheckCircle, Download, FileQuestion, ImageIcon, MessageSquare, ShieldAlert, User, FileText } from "lucide-react";
import { Badge } from "./ui/badge";

interface PolygonResultsDashboardProps {
  results: PolygonEvaluationResult[] | null;
  loading: boolean;
  imageUrls: Map<string, string>;
}

const ResultsDisplay = ({ results, imageUrls }: { results: PolygonEvaluationResult[], imageUrls: Map<string, string> }) => {

  const handleDownloadSummaryCsv = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Header
    csvContent += "Student Filename,Score,Avg IoU,Avg Deviation,Avg Polygon Score,Avg Attribute Score,Matched Count,Missed Count,Extra Count,Feedback\r\n";

    results.forEach(result => {
        const studentFilename = `"${result.studentFilename}"`;
        const score = result.score;
        const avgIoU = result.averageIoU.toFixed(3);
        const avgDeviation = result.averageDeviation.toFixed(1);
        const avgPolygonScore = result.averagePolygonScore.toFixed(1);
        const avgAttributeScore = result.averageAttributeScore.toFixed(1);
        const matchedCount = result.matched.length;
        const missedCount = result.missed.length;
        const extraCount = result.extra.length;
        const feedback = `"${result.feedback.join('. ')}"`;

        const row = [studentFilename, score, avgIoU, avgDeviation, avgPolygonScore, avgAttributeScore, matchedCount, missedCount, extraCount, feedback].join(',');
        csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "polygon_batch_evaluation_summary.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const handleDownloadDetailedCsv = (result: PolygonEvaluationResult) => {
    const escapeCsv = (str: string | number | undefined) => {
        if (str === undefined || str === null) return '""';
        const s = String(str);
        if (s.includes('"') || s.includes(',')) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return `"${s}"`;
    };

    let csv = [];
    csv.push(`"Summary for ${result.studentFilename}"`);
    csv.push(`"Metric","Value"`);
    csv.push(`"Score",${result.score}`);
    csv.push(`"Average IoU",${result.averageIoU.toFixed(4)}`);
    csv.push(`"Average Deviation Score","${result.averageDeviation.toFixed(2)}%"`);
    csv.push(`"Average Attribute Score","${result.averageAttributeScore.toFixed(2)}%"`);
    csv.push('');
    
    // Matched
    csv.push('"Matched Polygons"');
    csv.push(`"Image ID","GT ID","Student ID","IoU","Polygon Score","Attribute Score","Final Score"`);
    result.matched.forEach(m => {
        const row = [
            imageUrls.get(m.gt.image_id.toString()) || m.gt.image_id,
            m.gt.id,
            m.student.id,
            m.iou.toFixed(4),
            m.polygonScore.toFixed(2),
            m.attributeScore.toFixed(2),
            m.finalScore.toFixed(2),
        ].map(escapeCsv).join(',');
        csv.push(row);
    });
    csv.push('');

    // Missed
    csv.push('"Missed Polygons"');
    csv.push(`"Image ID","GT ID","GT Label"`);
    result.missed.forEach(m => {
        const row = [
            imageUrls.get(m.gt.image_id.toString()) || m.gt.image_id,
            m.gt.id,
            m.gt.attributes?.label,
        ].map(escapeCsv).join(',');
        csv.push(row);
    });
    csv.push('');

    // Extra
    csv.push('"Extra Polygons"');
    csv.push(`"Image ID","Student ID","Student Label"`);
    result.extra.forEach(e => {
        const row = [
            imageUrls.get(e.student.image_id.toString()) || e.student.image_id,
            e.student.id,
            e.student.attributes?.label,
        ].map(escapeCsv).join(',');
        csv.push(row);
    });

    const csvContent = "data:text/csv;charset=utf-8," + csv.join("\r\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${result.studentFilename.replace(/[^a-z0-9]/gi, '_')}_polygon_result.csv`);
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
            Summary and detailed breakdown for each student file.
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
                            <TableHead className="text-right">Avg. Deviation</TableHead>
                            <TableHead className="text-right">Avg. Polygon Score</TableHead>
                            <TableHead className="text-right">Avg. Attribute Score</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {results.map((result) => (
                            <TableRow key={result.studentFilename}>
                                <TableCell className="font-medium">{result.studentFilename}</TableCell>
                                <TableCell className="text-right font-bold">{result.score}</TableCell>
                                <TableCell className="text-right">{(result.averageIoU * 100).toFixed(1)}%</TableCell>
                                <TableCell className="text-right">{result.averageDeviation.toFixed(1)}%</TableCell>
                                <TableCell className="text-right">{result.averagePolygonScore.toFixed(1)}%</TableCell>
                                <TableCell className="text-right">{result.averageAttributeScore.toFixed(1)}%</TableCell>
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
                        <SingleResultDisplay result={result} imageUrls={imageUrls}/>
                    </AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    </>
  )

}


const Legend = () => (
    <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground mt-2 border-t pt-2">
        <div className="flex items-center gap-2"><div className="w-4 h-1 rounded-full" style={{ border: '2px solid rgba(0, 215, 255, 1)' }}></div><span>GT Polygon</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-1 rounded-full" style={{ border: '2px solid rgba(255, 0, 0, 1)' }}></div><span>Student Polygon</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(0, 215, 255, 0.5)' }}></div><span>Missed</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(255, 0, 0, 0.5)' }}></div><span>Extra</span></div>
    </div>
);


const SingleResultDisplay = ({ result, imageUrls }: { result: PolygonEvaluationResult; imageUrls: Map<string, string>; }) => {
    
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
                </div>
            </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <Card>
                    <CardHeader><CardTitle>Avg. Polygon Score</CardTitle></CardHeader>
                    <CardContent className="text-3xl font-bold">{result.averagePolygonScore.toFixed(1)}%</CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Avg. Attribute Score</CardTitle></CardHeader>
                    <CardContent className="text-3xl font-bold">{result.averageAttributeScore.toFixed(1)}%</CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Avg. IoU</CardTitle></CardHeader>
                    <CardContent className="text-3xl font-bold">{(result.averageIoU * 100).toFixed(1)}%</CardContent>
                </Card>
            </div>

            <div>
                <h3 className="text-lg font-semibold mb-2">Visual Comparison</h3>
                 <PolygonViewer 
                    imageUrl={imageUrls.values().next().value} // Simplified: uses the first image for all results in batch
                    results={result}
                />
                <Legend />
            </div>
        </div>
    );
};

export function PolygonResultsDashboard({ results, loading, imageUrls }: PolygonResultsDashboardProps) {
  
  return (
    <div>
        <h2 className="text-3xl mb-4">Evaluation Results</h2>
        {loading && !results ? (
            <div className="flex flex-col items-center justify-center text-center p-8 h-full min-h-[300px] border-dashed border-2 rounded-md bg-card">
                <FileQuestion className="h-16 w-16 text-muted-foreground mb-4 animate-pulse" />
                <h3 className="text-xl font-semibold text-foreground">Evaluating...</h3>
                <p className="text-muted-foreground mt-2">The results will appear here once the evaluation is complete.</p>
            </div>
        ) : results ? (
            <ResultsDisplay results={results} imageUrls={imageUrls} />
        ) : (
            <div className="flex flex-col items-center justify-center text-center p-8 h-full min-h-[300px] border-dashed border-2 rounded-md bg-card">
                <FileQuestion className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold text-foreground font-sans">Awaiting Evaluation</h3>
                <p className="text-muted-foreground mt-2">Complete the form and run an evaluation to see results.</p>
            </div>
        )}
    </div>
  );
}

