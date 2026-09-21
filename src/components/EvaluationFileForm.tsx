
'use client';

import * as React from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2, UploadCloud, Link as LinkIcon, Settings, CheckSquare } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";

import type { FormValues } from '@/lib/types';

const formSchema = z.object({
  gtFile: typeof window === 'undefined' ? z.any() : z.instanceof(FileList).refine((files) => files?.length === 1, "Ground Truth file is required."),
  toolType: z.string({ required_error: 'Please select a tool type.' }),
});

interface EvaluationFormProps {
  onEvaluate: (data: FormValues) => void;
  isLoading: boolean;
}

export function EvaluationForm({ onEvaluate, isLoading }: EvaluationFormProps) {
  const { toast } = useToast();
  
  // API Config State
  const [cvatApiUrl, setCvatApiUrl] = useState('https://opencvat-ig.orchvate.com');
  const [cvatApiKey, setCvatApiKey] = useState('vr7wfCre.nH1E9PmNq9giisIdUVCBdajKerTPFJe7');
  const [isConfigOpen, setIsConfigOpen] = useState(true);
  
  // Data State
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  
  // Loading States
  const [isFetchingProjects, setIsFetchingProjects] = useState(false);
  const [isFetchingTasks, setIsFetchingTasks] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      toolType: "bounding_box",
    },
  });

  const gtFileRef = form.register("gtFile");

  useEffect(() => {
    // Load config from local storage on mount if available
    const savedUrl = localStorage.getItem('cvatApiUrl');
    const savedKey = localStorage.getItem('cvatApiKey');
    
    let currentUrl = cvatApiUrl;
    let currentKey = cvatApiKey;

    if (savedUrl) {
        setCvatApiUrl(savedUrl);
        currentUrl = savedUrl;
    }
    if (savedKey) {
        setCvatApiKey(savedKey);
        currentKey = savedKey;
    }

    if (currentKey && currentUrl) {
        setIsConfigOpen(false); // hide if we already have it
        // We can't easily call fetchProjects here directly due to dependency issues,
        // but since we know we have the keys, we can just trigger the fetch.
        // We'll extract fetchProjects to a useCallback or just use the current values.
        fetchProjectsWithArgs(currentUrl, currentKey);
    }
  }, []);

  const saveConfig = () => {
    localStorage.setItem('cvatApiUrl', cvatApiUrl);
    localStorage.setItem('cvatApiKey', cvatApiKey);
    setIsConfigOpen(false);
    fetchProjectsWithArgs(cvatApiUrl, cvatApiKey);
  };

  const fetchProjectsWithArgs = async (url: string, key: string) => {
    if (!key || !url) {
        toast({ title: "Configuration Required", description: "Please enter API URL and Key.", variant: "destructive" });
        return;
    }
    
    setIsFetchingProjects(true);
    try {
        const res = await fetch(`${url}/api/projects`, {
            headers: { 'Authorization': `Token ${key}` }
        });
        
        if (!res.ok) throw new Error("Failed to fetch projects. Check your API Key.");
        const data = await res.json();
        setProjects(data.results || []);
        if (data.results?.length === 0) {
            toast({ title: "No Projects Found", description: "No projects are accessible with this API key." });
        }
    } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
        setIsFetchingProjects(false);
    }
  };

  const fetchProjects = () => fetchProjectsWithArgs(cvatApiUrl, cvatApiKey);

  const fetchTasks = async (projectId: string) => {
    setSelectedProjectId(projectId);
    if (!projectId) {
        setTasks([]);
        return;
    }
    
    setIsFetchingTasks(true);
    setSelectedTaskIds(new Set()); // Reset selections
    try {
        const res = await fetch(`${cvatApiUrl}/api/tasks?project_id=${projectId}`, {
            headers: { 'Authorization': `Token ${cvatApiKey}` }
        });
        
        if (!res.ok) throw new Error("Failed to fetch tasks.");
        const data = await res.json();
        setTasks(data.results || []);
        if (data.results?.length === 0) {
            toast({ title: "No Tasks Found", description: "No tasks found in this project." });
        }
    } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
        setIsFetchingTasks(false);
    }
  };

  const toggleTaskSelection = (taskId: number) => {
      const newSelection = new Set(selectedTaskIds);
      if (newSelection.has(taskId)) {
          newSelection.delete(taskId);
      } else {
          newSelection.add(taskId);
      }
      setSelectedTaskIds(newSelection);
  };

  const handleSelectAll = () => {
      if (selectedTaskIds.size === tasks.length) {
          setSelectedTaskIds(new Set());
      } else {
          setSelectedTaskIds(new Set(tasks.map(t => t.id)));
      }
  };

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (selectedTaskIds.size === 0) {
        toast({ title: "No Tasks Selected", description: "Please select at least one task to evaluate.", variant: "destructive" });
        return;
    }
    
    if (!cvatApiUrl || !cvatApiKey) {
        toast({ title: "Configuration Missing", description: "CVAT API URL and Key are required.", variant: "destructive" });
        return;
    }

    onEvaluate({
      gtFile: values.gtFile[0],
      cvatTaskIds: Array.from(selectedTaskIds).join(','),
      cvatApiUrl,
      cvatApiKey,
      toolType: values.toolType,
    } as any);
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>New Evaluation</CardTitle>
        <CardDescription>Configure API, select tasks, and upload ground truth.</CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        
        {/* CVAT API Configuration Section */}
        <Collapsible open={isConfigOpen} onOpenChange={setIsConfigOpen} className="border rounded-md p-4 bg-muted/30">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Settings className="h-4 w-4" /> CVAT API Configuration
                </h4>
                <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm">
                        {isConfigOpen ? 'Hide' : 'Edit'}
                    </Button>
                </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="space-y-4 mt-4">
                <div className="space-y-2">
                    <Label htmlFor="cvatApiUrl" className="text-xs font-medium">CVAT API URL</Label>
                    <Input 
                        id="cvatApiUrl" 
                        value={cvatApiUrl} 
                        onChange={(e) => setCvatApiUrl(e.target.value)} 
                        placeholder="https://opencvat-ig.orchvate.com" 
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="cvatApiKey" className="text-xs font-medium">CVAT API Key</Label>
                    <Input 
                        id="cvatApiKey" 
                        type="password"
                        value={cvatApiKey} 
                        onChange={(e) => setCvatApiKey(e.target.value)} 
                        placeholder="Enter your API token..." 
                    />
                </div>
                <Button type="button" onClick={saveConfig} variant="secondary" size="sm" className="w-full">
                    Save & Connect
                </Button>
            </CollapsibleContent>
        </Collapsible>

        {/* Dynamic Project/Task Selection */}
        {!isConfigOpen && (
            <div className="space-y-4 p-4 border rounded-md">
                 <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">1. Select Project</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={fetchProjects} disabled={isFetchingProjects}>
                            {isFetchingProjects ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                            Refresh Projects
                        </Button>
                    </div>
                    <Select value={selectedProjectId} onValueChange={fetchTasks}>
                        <SelectTrigger>
                            <SelectValue placeholder="Choose a project..." />
                        </SelectTrigger>
                        <SelectContent>
                            {projects.map(p => (
                                <SelectItem key={p.id} value={p.id.toString()}>{p.name} (ID: {p.id})</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {selectedProjectId && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">2. Select Tasks / Students</Label>
                            {tasks.length > 0 && (
                                <Button type="button" variant="ghost" size="sm" onClick={handleSelectAll}>
                                    <CheckSquare className="h-3 w-3 mr-2" />
                                    {selectedTaskIds.size === tasks.length ? "Deselect All" : "Select All"}
                                </Button>
                            )}
                        </div>
                        
                        {isFetchingTasks ? (
                             <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Fetching tasks...
                             </div>
                        ) : tasks.length === 0 ? (
                            <div className="text-sm text-muted-foreground p-4 text-center border rounded-md bg-muted/20">
                                No tasks found in this project.
                            </div>
                        ) : (
                            <div className="max-h-[200px] overflow-y-auto border rounded-md p-2 space-y-2 bg-background">
                                {tasks.map(task => (
                                    <div key={task.id} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded-sm">
                                        <Checkbox 
                                            id={`task-${task.id}`} 
                                            checked={selectedTaskIds.has(task.id)}
                                            onCheckedChange={() => toggleTaskSelection(task.id)}
                                        />
                                        <label 
                                            htmlFor={`task-${task.id}`}
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                                        >
                                            {task.name} <span className="text-muted-foreground text-xs font-normal ml-2">(ID: {task.id})</span>
                                        </label>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        )}

        {/* Standard Form Fields */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="gtFile"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>3. Ground Truth Annotations</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <UploadCloud className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input type="file" className="pl-10" {...gtFileRef} />
                    </div>
                  </FormControl>
                  <FormDescription>Upload the expert-reviewed file (e.g., COCO JSON, CVAT XML).</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="toolType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>4. Tool Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a tool type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="bounding_box">COCO JSON</SelectItem>
                      <SelectItem value="cvat_xml">CVAT XML 1.1</SelectItem>
                      <SelectItem value="polygon">Polygon (AI Fallback)</SelectItem>
                      <SelectItem value="keypoints">Keypoints (AI Fallback)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isLoading} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Evaluating...
                </>
              ) : (
                `Pull ${selectedTaskIds.size} Tasks & Run Evaluation`
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
