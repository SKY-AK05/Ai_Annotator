'use client';

import * as React from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2, UploadCloud, FileCog, Image as ImageIcon, CheckCircle, Settings, CheckSquare, Link as LinkIcon, Eye, EyeOff } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { FormValues } from '@/lib/types';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  gtFile: typeof window === 'undefined' ? z.any() : z.instanceof(FileList).optional(),
  studentFiles: typeof window === 'undefined' ? z.any() : z.instanceof(FileList).optional(),
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
  
  // Modes
  const [gtSourceMode, setGtSourceMode] = useState<'file' | 'api'>('file');
  const [studentSourceMode, setStudentSourceMode] = useState<'file' | 'api'>('api');

  // API Config State
  const [cvatApiUrl, setCvatApiUrl] = useState('https://opencvat-ig.orchvate.com');
  const [cvatApiKey, setCvatApiKey] = useState('');
  const [isConfigOpen, setIsConfigOpen] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Shared Orgs & Projects
  const [orgs, setOrgs] = useState<any[]>([]);
  const [isFetchingOrgs, setIsFetchingOrgs] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [isFetchingProjects, setIsFetchingProjects] = useState(false);

  // GT State
  const [gtSelectedOrgId, setGtSelectedOrgId] = useState<string>('personal');
  const [gtSelectedProjectId, setGtSelectedProjectId] = useState<string>('');
  const [gtTasks, setGtTasks] = useState<any[]>([]);
  const [gtSelectedTaskIds, setGtSelectedTaskIds] = useState<Set<number>>(new Set());
  const [isFetchingGtTasks, setIsFetchingGtTasks] = useState(false);
  const [gtTaskSearch, setGtTaskSearch] = useState('');
  const [gtProjectSearch, setGtProjectSearch] = useState('');

  // Student State
  const [studentSelectedOrgId, setStudentSelectedOrgId] = useState<string>('personal');
  const [studentSelectedProjectId, setStudentSelectedProjectId] = useState<string>('');
  const [studentTasks, setStudentTasks] = useState<any[]>([]);
  const [studentSelectedTaskIds, setStudentSelectedTaskIds] = useState<Set<number>>(new Set());
  const [isFetchingStudentTasks, setIsFetchingStudentTasks] = useState(false);
  const [studentTaskSearch, setStudentTaskSearch] = useState('');
  const [studentProjectSearch, setStudentProjectSearch] = useState('');

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      toolType: "bounding_box",
    },
  });

  const gtFileRef = form.register("gtFile");
  const studentFilesRef = form.register("studentFiles");
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
        fetchOrgsWithArgs(currentUrl, currentKey);
        fetchProjectsWithArgs(currentUrl, currentKey, ''); // Initial fetch for personal workspace
    }
  }, []);

  const saveConfig = () => {
    localStorage.setItem('cvatApiUrl', cvatApiUrl);
    localStorage.setItem('cvatApiKey', cvatApiKey);
    setIsConfigOpen(false);
    fetchOrgsWithArgs(cvatApiUrl, cvatApiKey);
    fetchProjectsWithArgs(cvatApiUrl, cvatApiKey, '');
  };

  const fetchOrgsWithArgs = async (url: string, key: string) => {
    const trimmedKey = key?.trim();
    if (!trimmedKey || !url) return;
    
    setIsFetchingOrgs(true);
    try {
        const res = await fetch('/api/cvat/organizations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cvatApiUrl: url, cvatApiKey: trimmedKey })
        });
        
        if (res.ok) {
            const data = await res.json();
            setOrgs(data.results || []);
        }
    } catch (err: any) {
        console.error("Failed to fetch orgs:", err);
    } finally {
        setIsFetchingOrgs(false);
    }
  };

  const fetchProjectsWithArgs = async (url: string, key: string, org: string) => {
    const trimmedKey = key?.trim();
    if (!trimmedKey || !url) {
        toast({ title: "Configuration Required", description: "Please enter API URL and Key." });
        return;
    }
    
    setIsFetchingProjects(true);
    try {
        const res = await fetch('/api/cvat/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cvatApiUrl: url, cvatApiKey: trimmedKey, org })
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

  const fetchProjects = (org: string) => fetchProjectsWithArgs(cvatApiUrl, cvatApiKey, org === 'personal' ? '' : org);

  const handleOrgChange = (org: string, target: 'gt' | 'student') => {
      if (target === 'gt') {
          setGtSelectedOrgId(org);
          setGtSelectedProjectId('');
          setGtTasks([]);
          setGtSelectedTaskIds(new Set());
      } else {
          setStudentSelectedOrgId(org);
          setStudentSelectedProjectId('');
          setStudentTasks([]);
          setStudentSelectedTaskIds(new Set());
      }
      const actualOrg = org === 'personal' ? '' : org;
      fetchProjectsWithArgs(cvatApiUrl, cvatApiKey, actualOrg);
  };

  const fetchTasks = async (projectId: string, target: 'gt' | 'student') => {
    const rawOrg = target === 'gt' ? gtSelectedOrgId : studentSelectedOrgId;
    const org = rawOrg === 'personal' ? '' : rawOrg;
    if (target === 'gt') {
        setGtSelectedProjectId(projectId);
        if (!projectId) return setGtTasks([]);
        setIsFetchingGtTasks(true);
        setGtSelectedTaskIds(new Set());
    } else {
        setStudentSelectedProjectId(projectId);
        if (!projectId) return setStudentTasks([]);
        setIsFetchingStudentTasks(true);
        setStudentSelectedTaskIds(new Set());
    }
    
    try {
        const trimmedKey = cvatApiKey?.trim();
        const res = await fetch('/api/cvat/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cvatApiUrl, cvatApiKey: trimmedKey, projectId, org })
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to fetch tasks.");
        }
        
        const data = await res.json();
        
        if (target === 'gt') {
            setGtTasks(data.results || []);
        } else {
            setStudentTasks(data.results || []);
        }
        
        if (data.results?.length === 0) {
            toast({ title: "No Tasks Found", description: `No tasks found in this project for ${target}.` });
        }
    } catch (err: any) {
        toast({ title: "Error", description: err.message });
    } finally {
        if (target === 'gt') setIsFetchingGtTasks(false);
        else setIsFetchingStudentTasks(false);
    }
  };

  const toggleTaskSelection = (taskId: number, target: 'gt' | 'student') => {
      const currentSelection = target === 'gt' ? gtSelectedTaskIds : studentSelectedTaskIds;
      const setter = target === 'gt' ? setGtSelectedTaskIds : setStudentSelectedTaskIds;
      
      const newSelection = new Set(currentSelection);
      if (newSelection.has(taskId)) {
          newSelection.delete(taskId);
      } else {
          newSelection.add(taskId);
      }
      setter(newSelection);
  };

  const handleSelectAll = (target: 'gt' | 'student') => {
      const currentTasks = target === 'gt' ? gtTasks : studentTasks;
      const currentSelection = target === 'gt' ? gtSelectedTaskIds : studentSelectedTaskIds;
      const setter = target === 'gt' ? setGtSelectedTaskIds : setStudentSelectedTaskIds;

      if (currentSelection.size === currentTasks.length) {
          setter(new Set());
      } else {
          setter(new Set(currentTasks.map(t => t.id)));
      }
  };

  function onSubmit(values: z.infer<typeof formSchema>) {
    // Validation
    if (gtSourceMode === 'file' && (!values.gtFile || values.gtFile.length === 0)) {
        toast({ title: "Missing Ground Truth", description: "Please upload a Ground Truth file." });
        return;
    }
    if (gtSourceMode === 'api' && gtSelectedTaskIds.size === 0) {
        toast({ title: "Missing Ground Truth", description: "Please select at least one CVAT task for Ground Truth." });
        return;
    }
    if (studentSourceMode === 'file' && (!values.studentFiles || values.studentFiles.length === 0)) {
        toast({ title: "Missing Student Data", description: "Please upload at least one Student file." });
        return;
    }
    if (studentSourceMode === 'api' && studentSelectedTaskIds.size === 0) {
        toast({ title: "Missing Student Data", description: "Please select at least one CVAT task for Student Data." });
        return;
    }
    
    if ((gtSourceMode === 'api' || studentSourceMode === 'api') && (!cvatApiUrl || !cvatApiKey)) {
        toast({ title: "Configuration Missing", description: "CVAT API URL and Key are required for API mode." });
        return;
    }

    onEvaluate({
      gtSourceMode,
      studentSourceMode,
      gtFile: values.gtFile,
      gtCvatTaskIds: Array.from(gtSelectedTaskIds).join(','),
      studentFiles: values.studentFiles,
      cvatTaskIds: Array.from(studentSelectedTaskIds).join(','),
      cvatApiUrl,
      cvatApiKey: cvatApiKey.trim(),
      imageFiles: values.imageFiles,
      toolType: values.toolType,
    });
  }

  return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          
          {/* API Config Collapsible (Global for both GT and Student API) */}
          <Collapsible open={isConfigOpen} onOpenChange={setIsConfigOpen} className="border-2 border-foreground rounded-md p-3 bg-popover card-style shadow-hard mb-6">
              <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                      <Settings className="h-4 w-4" /> Global CVAT API Config
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
                      <div className="relative">
                        <Input 
                            id="cvatApiKey" 
                            type={showApiKey ? "text" : "password"}
                            value={cvatApiKey} 
                            onChange={(e) => setCvatApiKey(e.target.value)} 
                            placeholder="Enter your API token..."
                            className="h-8 text-xs border-2 border-foreground shadow-hard pr-8"
                        />
                        <button 
                            type="button" 
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                  </div>
                  <Button type="button" onClick={saveConfig} variant="secondary" size="sm" className="w-full text-xs font-bold border-2 border-foreground shadow-hard">
                      Save & Connect
                  </Button>
              </CollapsibleContent>
          </Collapsible>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Ground Truth Section */}
            <div className="space-y-3">
                <Label className="font-bold text-base">1. Ground Truth Annotations</Label>
                <Tabs value={gtSourceMode} onValueChange={(v: any) => setGtSourceMode(v)} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 border-2 border-foreground shadow-hard h-10">
                        <TabsTrigger value="file" className="text-xs font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Manual Upload</TabsTrigger>
                        <TabsTrigger value="api" className="text-xs font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">CVAT API</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="file" className="mt-3">
                        <FormField
                        control={form.control}
                        name="gtFile"
                        render={({ field }) => (
                            <FormItem>
                            <FormControl>
                                <div className="relative">
                                <FileCog className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                <Input
                                    type="file"
                                    className="pl-10 shadow-hard border-2 border-foreground bg-background"
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
                    </TabsContent>

                    <TabsContent value="api" className="mt-3">
                        <div className="space-y-3 p-3 border-2 border-foreground rounded-md shadow-hard card-style">
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold">Select Organization</Label>
                                </div>
                                <Select value={gtSelectedOrgId} onValueChange={(v) => handleOrgChange(v, 'gt')}>
                                    <SelectTrigger className="h-8 text-xs border-2 border-foreground shadow-hard bg-background">
                                        <SelectValue placeholder="Personal Workspace" />
                                    </SelectTrigger>
                                    <SelectContent className="card-style">
                                        <SelectItem value="personal" className="text-xs">Personal Workspace</SelectItem>
                                        {orgs.map(o => (
                                            <SelectItem key={o.id} value={o.id.toString()} className="text-xs">{o.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold">Select Project</Label>
                                    <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-[10px]" onClick={() => fetchProjects(gtSelectedOrgId)} disabled={isFetchingProjects}>
                                        {isFetchingProjects ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                        Refresh
                                    </Button>
                                </div>
                                <Select value={gtSelectedProjectId} onValueChange={(v) => fetchTasks(v, 'gt')}>
                                    <SelectTrigger className="h-8 text-xs border-2 border-foreground shadow-hard bg-background">
                                        <SelectValue placeholder="Choose a project..." />
                                    </SelectTrigger>
                                    <SelectContent className="card-style">
                                        <div className="p-2 border-b">
                                            <Input 
                                                placeholder="Search projects..." 
                                                className="h-7 text-xs border-foreground"
                                                value={gtProjectSearch}
                                                onChange={(e) => setGtProjectSearch(e.target.value)}
                                                onKeyDown={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        {projects.filter(p => p.name.toLowerCase().includes(gtProjectSearch.toLowerCase())).map(p => (
                                            <SelectItem key={p.id} value={p.id.toString()} className="text-xs">{p.name} (ID: {p.id})</SelectItem>
                                        ))}
                                        {projects.filter(p => p.name.toLowerCase().includes(gtProjectSearch.toLowerCase())).length === 0 && (
                                            <div className="p-2 text-xs text-muted-foreground text-center">No projects found.</div>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>

                            {gtSelectedProjectId && (
                                <div className="space-y-1.5 pt-1">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-bold">Select GT Tasks</Label>
                                        {gtTasks.length > 0 && (
                                            <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-[10px]" onClick={() => handleSelectAll('gt')}>
                                                <CheckSquare className="h-3 w-3 mr-1" />
                                                {gtSelectedTaskIds.size === gtTasks.length ? "Deselect All" : "Select All"}
                                            </Button>
                                        )}
                                    </div>
                                    
                                    {isFetchingGtTasks ? (
                                        <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
                                            <Loader2 className="h-3 w-3 animate-spin mr-2" /> Fetching tasks...
                                        </div>
                                    ) : gtTasks.length === 0 ? (
                                        <div className="text-xs text-muted-foreground p-2 text-center border rounded bg-muted/20">
                                            No tasks found.
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            <Input 
                                                placeholder="Search tasks..." 
                                                className="h-7 text-xs border-foreground"
                                                value={gtTaskSearch}
                                                onChange={(e) => setGtTaskSearch(e.target.value)}
                                            />
                                            <div className="max-h-[120px] overflow-y-auto border-2 border-foreground rounded p-1 space-y-1 bg-background shadow-inner">
                                                {gtTasks.filter(t => t.name.toLowerCase().includes(gtTaskSearch.toLowerCase())).map(task => (
                                                    <div key={task.id} className="flex items-center space-x-2 p-1 hover:bg-muted/50 rounded-sm">
                                                        <Checkbox 
                                                            id={`gt-task-${task.id}`} 
                                                            checked={gtSelectedTaskIds.has(task.id)}
                                                            onCheckedChange={() => toggleTaskSelection(task.id, 'gt')}
                                                            className="h-3 w-3 border-foreground"
                                                        />
                                                        <label 
                                                            htmlFor={`gt-task-${task.id}`}
                                                            className="text-xs font-medium leading-none cursor-pointer flex-1 truncate"
                                                        >
                                                            {task.name} <span className="text-muted-foreground ml-1">({task.id})</span>
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Student Data Section */}
            <div className="space-y-3">
                <Label className="font-bold text-base">2. Student Annotations</Label>
                <Tabs value={studentSourceMode} onValueChange={(v: any) => setStudentSourceMode(v)} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 border-2 border-foreground shadow-hard h-10">
                        <TabsTrigger value="file" className="text-xs font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Manual Upload</TabsTrigger>
                        <TabsTrigger value="api" className="text-xs font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">CVAT API</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="file" className="mt-3">
                         <FormField
                            control={form.control}
                            name="studentFiles"
                            render={({ field }) => (
                                <FormItem>
                                <FormControl>
                                    <div className="relative">
                                    <UploadCloud className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        type="file"
                                        className="pl-10 shadow-hard border-2 border-foreground bg-background"
                                        {...studentFilesRef}
                                        accept=".xml,.json,.zip"
                                        multiple
                                    />
                                    </div>
                                </FormControl>
                                <FormDescription>Upload one or more student JSON/XML files or ZIPs.</FormDescription>
                                <FormMessage />
                                </FormItem>
                            )}
                            />
                    </TabsContent>

                    <TabsContent value="api" className="mt-3">
                        <div className="space-y-3 p-3 border-2 border-foreground rounded-md shadow-hard card-style">
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold">Select Organization</Label>
                                </div>
                                <Select value={studentSelectedOrgId} onValueChange={(v) => handleOrgChange(v, 'student')}>
                                    <SelectTrigger className="h-8 text-xs border-2 border-foreground shadow-hard bg-background">
                                        <SelectValue placeholder="Personal Workspace" />
                                    </SelectTrigger>
                                    <SelectContent className="card-style">
                                        <SelectItem value="personal" className="text-xs">Personal Workspace</SelectItem>
                                        {orgs.map(o => (
                                            <SelectItem key={o.id} value={o.id.toString()} className="text-xs">{o.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold">Select Project</Label>
                                    <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-[10px]" onClick={() => fetchProjects(studentSelectedOrgId)} disabled={isFetchingProjects}>
                                        {isFetchingProjects ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                        Refresh
                                    </Button>
                                </div>
                                <Select value={studentSelectedProjectId} onValueChange={(v) => fetchTasks(v, 'student')}>
                                    <SelectTrigger className="h-8 text-xs border-2 border-foreground shadow-hard bg-background">
                                        <SelectValue placeholder="Choose a project..." />
                                    </SelectTrigger>
                                    <SelectContent className="card-style">
                                        <div className="p-2 border-b">
                                            <Input 
                                                placeholder="Search projects..." 
                                                className="h-7 text-xs border-foreground"
                                                value={studentProjectSearch}
                                                onChange={(e) => setStudentProjectSearch(e.target.value)}
                                                onKeyDown={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        {projects.filter(p => p.name.toLowerCase().includes(studentProjectSearch.toLowerCase())).map(p => (
                                            <SelectItem key={p.id} value={p.id.toString()} className="text-xs">{p.name} (ID: {p.id})</SelectItem>
                                        ))}
                                        {projects.filter(p => p.name.toLowerCase().includes(studentProjectSearch.toLowerCase())).length === 0 && (
                                            <div className="p-2 text-xs text-muted-foreground text-center">No projects found.</div>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>

                            {studentSelectedProjectId && (
                                <div className="space-y-1.5 pt-1">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-bold">Select Student Tasks</Label>
                                        {studentTasks.length > 0 && (
                                            <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-[10px]" onClick={() => handleSelectAll('student')}>
                                                <CheckSquare className="h-3 w-3 mr-1" />
                                                {studentSelectedTaskIds.size === studentTasks.length ? "Deselect All" : "Select All"}
                                            </Button>
                                        )}
                                    </div>
                                    
                                    {isFetchingStudentTasks ? (
                                        <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
                                            <Loader2 className="h-3 w-3 animate-spin mr-2" /> Fetching tasks...
                                        </div>
                                    ) : studentTasks.length === 0 ? (
                                        <div className="text-xs text-muted-foreground p-2 text-center border rounded bg-muted/20">
                                            No tasks found.
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            <Input 
                                                placeholder="Search tasks..." 
                                                className="h-7 text-xs border-foreground"
                                                value={studentTaskSearch}
                                                onChange={(e) => setStudentTaskSearch(e.target.value)}
                                            />
                                            <div className="max-h-[120px] overflow-y-auto border-2 border-foreground rounded p-1 space-y-1 bg-background shadow-inner">
                                                {studentTasks.filter(t => t.name.toLowerCase().includes(studentTaskSearch.toLowerCase())).map(task => (
                                                    <div key={task.id} className="flex items-center space-x-2 p-1 hover:bg-muted/50 rounded-sm">
                                                        <Checkbox 
                                                            id={`student-task-${task.id}`} 
                                                            checked={studentSelectedTaskIds.has(task.id)}
                                                            onCheckedChange={() => toggleTaskSelection(task.id, 'student')}
                                                            className="h-3 w-3 border-foreground"
                                                        />
                                                        <label 
                                                            htmlFor={`student-task-${task.id}`}
                                                            className="text-xs font-medium leading-none cursor-pointer flex-1 truncate"
                                                        >
                                                            {task.name} <span className="text-muted-foreground ml-1">({task.id})</span>
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

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
                        className="pl-10 shadow-hard border-2 border-foreground bg-background" 
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
                      <SelectTrigger className='shadow-hard border-2 border-foreground bg-background'>
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
          
          <Button type="submit" disabled={isLoading} className="w-full font-bold h-12 shadow-hard border-2 border-foreground text-base mt-8">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Evaluating...
              </>
            ) : (
              'Run Evaluation'
            )}
          </Button>
        </form>
      </Form>
  );
}
