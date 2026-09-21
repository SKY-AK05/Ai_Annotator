
'use client';

import * as React from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2, UploadCloud, FileCog, Image as ImageIcon, CheckCircle, Settings, CheckSquare, Link as LinkIcon } from 'lucide-react';
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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";

import type { FormValues } from '@/lib/types';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  gtFile: typeof window === 'undefined' ? z.any() : z.instanceof(FileList).refine((files) => files?.length === 1, "Ground Truth file is required."),
  imageFiles: z.any().optional(),
  toolType: z.string({ required_error: 'Please select a tool type.' }),
});

interface EvaluationFormProps {
  onEvaluate: (data: FormValues) => void;
  isLoading: boolean;
  onGtFileChange: (file: File | undefined) => void;
  imageUrls: Map<string, string>;
}

export function EvaluationForm({ onEvaluate, isLoading, onGtFileChange, imageUrls }: EvaluationFormProps) {
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
  const imageFileRef = form.register("imageFiles");
  
  const hasImagesFromGt = imageUrls.size > 0;

  useEffect(() => {
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
        setIsConfigOpen(false);
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
        toast({ title: "Configuration Required", description: "Please enter API URL and Key." });
        return;
    }
    
    setIsFetchingProjects(true);
    try {
        const res = await fetch('/api/cvat/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cvatApiUrl: url, cvatApiKey: key })
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to fetch projects. Check your API Key.");
        }
        
        const data = await res.json();
        setProjects(data.results || []);
        if (data.results?.length === 0) {
            toast({ title: "No Projects Found", description: "No projects are accessible with this API key." });
        }
    } catch (err: any) {
        toast({ title: "Error", description: err.message });
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
        const res = await fetch('/api/cvat/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cvatApiUrl, cvatApiKey, projectId })
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to fetch tasks.");
        }
        
        const data = await res.json();
        setTasks(data.results || []);
        if (data.results?.length === 0) {
            toast({ title: "No Tasks Found", description: "No tasks found in this project." });
        }
    } catch (err: any) {
        toast({ title: "Error", description: err.message });
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
        toast({ title: "No Tasks Selected", description: "Please select at least one task to evaluate." });
        return;
    }
    
    if (!cvatApiUrl || !cvatApiKey) {
        toast({ title: "Configuration Missing", description: "CVAT API URL and Key are required." });
        return;
    }

    onEvaluate({
      gtFile: values.gtFile[0],
      imageFiles: values.imageFiles,
      cvatTaskIds: Array.from(selectedTaskIds).join(','),
      cvatApiUrl,
      cvatApiKey,
      toolType: values.toolType,
    } as any);
  }

  return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Ground Truth Upload */}
            <FormField
              control={form.control}
              name="gtFile"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">1. Ground Truth Annotations</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <FileCog className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        type="file"
                        className="pl-10"
                        {...gtFileRef}
                        accept=".xml,.json,.zip"
                        onChange={(e) => {
                            const files = e.target.files;
                            field.onChange(files);
                            onGtFileChange(files?.[0]);
                            
                            const file = files?.[0];
                            if (file) {
                                if (file.name.toLowerCase().endsWith('.xml')) {
                                    form.setValue('toolType', 'cvat_xml');
                                } else if (file.name.toLowerCase().endsWith('.json')) {
                                    form.setValue('toolType', 'bounding_box');
                                }
                            }
                        }}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>Upload a single JSON, XML, or ZIP file.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* CVAT API and Student Selection */}
            <FormItem>
              <FormLabel className="font-bold">2. CVAT Student Tasks</FormLabel>
              
              <Collapsible open={isConfigOpen} onOpenChange={setIsConfigOpen} className="border-2 border-foreground rounded-md p-3 bg-popover card-style shadow-hard">
                  <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-bold flex items-center gap-2">
                          <Settings className="h-4 w-4" /> API Config
                      </h4>
                      <CollapsibleTrigger asChild>
                          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs">
                              {isConfigOpen ? 'Hide' : 'Edit'}
                          </Button>
                      </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="space-y-3">
                      <div className="space-y-1">
                          <Label htmlFor="cvatApiUrl" className="text-xs font-semibold">API URL</Label>
                          <Input 
                              id="cvatApiUrl" 
                              value={cvatApiUrl} 
                              onChange={(e) => setCvatApiUrl(e.target.value)} 
                              placeholder="https://opencvat-ig.orchvate.com"
                              className="h-8 text-xs border-2 border-foreground shadow-hard"
                          />
                      </div>
                      <div className="space-y-1">
                          <Label htmlFor="cvatApiKey" className="text-xs font-semibold">API Key</Label>
                          <Input 
                              id="cvatApiKey" 
                              type="password"
                              value={cvatApiKey} 
                              onChange={(e) => setCvatApiKey(e.target.value)} 
                              placeholder="Enter your API token..."
                              className="h-8 text-xs border-2 border-foreground shadow-hard"
                          />
                      </div>
                      <Button type="button" onClick={saveConfig} variant="secondary" size="sm" className="w-full text-xs font-bold border-2 border-foreground shadow-hard">
                          Save & Connect
                      </Button>
                  </CollapsibleContent>
              </Collapsible>

              {!isConfigOpen && (
                  <div className="space-y-3 p-3 border-2 border-foreground rounded-md shadow-hard card-style mt-3">
                       <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                              <Label className="text-xs font-bold">Select Project</Label>
                              <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-[10px]" onClick={fetchProjects} disabled={isFetchingProjects}>
                                  {isFetchingProjects ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                  Refresh
                              </Button>
                          </div>
                          <Select value={selectedProjectId} onValueChange={fetchTasks}>
                              <SelectTrigger className="h-8 text-xs border-2 border-foreground shadow-hard">
                                  <SelectValue placeholder="Choose a project..." />
                              </SelectTrigger>
                              <SelectContent className="card-style">
                                  {projects.map(p => (
                                      <SelectItem key={p.id} value={p.id.toString()} className="text-xs">{p.name} (ID: {p.id})</SelectItem>
                                  ))}
                              </SelectContent>
                          </Select>
                      </div>

                      {selectedProjectId && (
                          <div className="space-y-1.5 pt-1">
                              <div className="flex items-center justify-between">
                                  <Label className="text-xs font-bold">Select Tasks / Students</Label>
                                  {tasks.length > 0 && (
                                      <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-[10px]" onClick={handleSelectAll}>
                                          <CheckSquare className="h-3 w-3 mr-1" />
                                          {selectedTaskIds.size === tasks.length ? "Deselect All" : "Select All"}
                                      </Button>
                                  )}
                              </div>
                              
                              {isFetchingTasks ? (
                                   <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
                                      <Loader2 className="h-3 w-3 animate-spin mr-2" /> Fetching tasks...
                                   </div>
                              ) : tasks.length === 0 ? (
                                  <div className="text-xs text-muted-foreground p-2 text-center border rounded bg-muted/20">
                                      No tasks found.
                                  </div>
                              ) : (
                                  <div className="max-h-[120px] overflow-y-auto border-2 border-foreground rounded p-1 space-y-1 bg-background shadow-inner">
                                      {tasks.map(task => (
                                          <div key={task.id} className="flex items-center space-x-2 p-1 hover:bg-muted/50 rounded-sm">
                                              <Checkbox 
                                                  id={`task-${task.id}`} 
                                                  checked={selectedTaskIds.has(task.id)}
                                                  onCheckedChange={() => toggleTaskSelection(task.id)}
                                                  className="h-3 w-3 border-foreground"
                                              />
                                              <label 
                                                  htmlFor={`task-${task.id}`}
                                                  className="text-xs font-medium leading-none cursor-pointer flex-1 truncate"
                                              >
                                                  {task.name} <span className="text-muted-foreground ml-1">({task.id})</span>
                                              </label>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                      )}
                  </div>
              )}
            </FormItem>

            {/* Original Images Upload */}
            <FormField
              control={form.control}
              name="imageFiles"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">3. Original Images (Optional)</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input 
                        type="file" 
                        className="pl-10" 
                        {...imageFileRef} 
                        accept="image/*,.zip" 
                        multiple 
                        disabled={hasImagesFromGt}
                      />
                    </div>
                  </FormControl>
                  <FormDescription className={cn(hasImagesFromGt && "text-green-600 flex items-center gap-2")}>
                    {hasImagesFromGt ? (
                        <><CheckCircle className="h-4 w-4" /> Images loaded from GT ZIP.</>
                    ) : (
                        "Upload images if not in the GT ZIP file."
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tool Type Selection */}
            <FormField
              control={form.control}
              name="toolType"
              render={({ field }) => (
                  <FormItem>
                  <FormLabel className="font-bold">Annotation Format</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                      <SelectTrigger className='shadow-hard border-2 border-foreground'>
                          <SelectValue placeholder="Select a tool type" />
                      </SelectTrigger>
                      </FormControl>
                      <SelectContent className='card-style'>
                        <SelectItem value="bounding_box">COCO JSON (Bounding Box)</SelectItem>
                        <SelectItem value="cvat_xml">CVAT XML 1.1</SelectItem>
                        <SelectItem value="polygon" disabled>Polygon (Coming Soon)</SelectItem>
                        <SelectItem value="keypoints" disabled>Keypoints (Coming Soon)</SelectItem>
                      </SelectContent>
                  </Select>
                  <FormDescription>Select the format used in your annotation files.</FormDescription>
                  <FormMessage />
                  </FormItem>
              )}
            />
          </div>
          
          <Button type="submit" disabled={isLoading} className="w-full font-bold">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Evaluating...
              </>
            ) : selectedTaskIds.size > 0 ? (
              `Pull ${selectedTaskIds.size} Tasks & Run Evaluation`
            ) : (
              'Run Evaluation'
            )}
          </Button>
        </form>
      </Form>
  );
}
