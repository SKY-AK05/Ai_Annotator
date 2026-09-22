'use client';

import * as React from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2, UploadCloud, FileCog, Image as ImageIcon, CheckCircle, Settings, Eye, EyeOff, DownloadCloud } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Progress } from "@/components/ui/progress";

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
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Modes
  const [gtSourceMode, setGtSourceMode] = useState<'file' | 'api'>('file');
  const [studentSourceMode, setStudentSourceMode] = useState<'file' | 'api'>('api');

  // GT API State
  const [gtCvatApiUrl, setGtCvatApiUrl] = useState('https://opencvat-ig.orchvate.com');
  const [gtCvatApiKey, setGtCvatApiKey] = useState('');
  const [gtIsConfigOpen, setGtIsConfigOpen] = useState(true);
  const [gtShowApiKey, setGtShowApiKey] = useState(false);
  const [gtOrgs, setGtOrgs] = useState<any[]>([]);
  const [isFetchingGtOrgs, setIsFetchingGtOrgs] = useState(false);
  const [gtProjects, setGtProjects] = useState<any[]>([]);
  const [isFetchingGtProjects, setIsFetchingGtProjects] = useState(false);
  const [gtSelectedOrgId, setGtSelectedOrgId] = useState<string>('personal');
  const [gtSelectedProjectId, setGtSelectedProjectId] = useState<string>('');
  const [gtProjectSearch, setGtProjectSearch] = useState('');

  // Student API State
  const [studentCvatApiUrl, setStudentCvatApiUrl] = useState('https://opencvat-ig.orchvate.com');
  const [studentCvatApiKey, setStudentCvatApiKey] = useState('');
  const [studentIsConfigOpen, setStudentIsConfigOpen] = useState(true);
  const [studentShowApiKey, setStudentShowApiKey] = useState(false);
  const [studentOrgs, setStudentOrgs] = useState<any[]>([]);
  const [isFetchingStudentOrgs, setIsFetchingStudentOrgs] = useState(false);
  const [studentProjects, setStudentProjects] = useState<any[]>([]);
  const [isFetchingStudentProjects, setIsFetchingStudentProjects] = useState(false);
  const [studentSelectedOrgId, setStudentSelectedOrgId] = useState<string>('personal');
  const [studentSelectedProjectId, setStudentSelectedProjectId] = useState<string>('');
  const [studentProjectSearch, setStudentProjectSearch] = useState('');

  // Download State
  const [gtDownloadJobId, setGtDownloadJobId] = useState<string | null>(null);
  const [gtDownloadProgress, setGtDownloadProgress] = useState(0);
  const [gtDownloadedPath, setGtDownloadedPath] = useState<string | null>(null);
  
  const [studentDownloadJobId, setStudentDownloadJobId] = useState<string | null>(null);
  const [studentDownloadProgress, setStudentDownloadProgress] = useState(0);
  const [studentDownloadedPaths, setStudentDownloadedPaths] = useState<string[]>([]);

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
    const savedGtUrl = localStorage.getItem('gtCvatApiUrl');
    const savedGtKey = localStorage.getItem('gtCvatApiKey');
    if (savedGtUrl) setGtCvatApiUrl(savedGtUrl);
    if (savedGtKey) setGtCvatApiKey(savedGtKey);
    if (savedGtUrl && savedGtKey) {
        setGtIsConfigOpen(false);
        fetchGtOrgs(savedGtUrl, savedGtKey);
        fetchGtProjects(savedGtUrl, savedGtKey, '');
    }

    const savedStudentUrl = localStorage.getItem('studentCvatApiUrl');
    const savedStudentKey = localStorage.getItem('studentCvatApiKey');
    if (savedStudentUrl) setStudentCvatApiUrl(savedStudentUrl);
    if (savedStudentKey) setStudentCvatApiKey(savedStudentKey);
    if (savedStudentUrl && savedStudentKey) {
        setStudentIsConfigOpen(false);
        fetchStudentOrgs(savedStudentUrl, savedStudentKey);
        fetchStudentProjects(savedStudentUrl, savedStudentKey, '');
    }
  }, []);

  const saveGtConfig = () => {
    localStorage.setItem('gtCvatApiUrl', gtCvatApiUrl);
    localStorage.setItem('gtCvatApiKey', gtCvatApiKey);
    setGtIsConfigOpen(false);
    fetchGtOrgs(gtCvatApiUrl, gtCvatApiKey);
    fetchGtProjects(gtCvatApiUrl, gtCvatApiKey, gtSelectedOrgId === 'personal' ? '' : gtSelectedOrgId);
  };

  const saveStudentConfig = () => {
    localStorage.setItem('studentCvatApiUrl', studentCvatApiUrl);
    localStorage.setItem('studentCvatApiKey', studentCvatApiKey);
    setStudentIsConfigOpen(false);
    fetchStudentOrgs(studentCvatApiUrl, studentCvatApiKey);
    fetchStudentProjects(studentCvatApiUrl, studentCvatApiKey, studentSelectedOrgId === 'personal' ? '' : studentSelectedOrgId);
  };

  const pullData = async (target: 'gt' | 'student') => {
      const projectId = target === 'gt' ? gtSelectedProjectId : studentSelectedProjectId;
      if (!projectId) return;
      
      const url = target === 'gt' ? gtCvatApiUrl : studentCvatApiUrl;
      const key = target === 'gt' ? gtCvatApiKey : studentCvatApiKey;
      const setterJobId = target === 'gt' ? setGtDownloadJobId : setStudentDownloadJobId;
      const setterProgress = target === 'gt' ? setGtDownloadProgress : setStudentDownloadProgress;
      
      if (target === 'student') {
          setStudentDownloadedPaths([]);
      } else {
          setGtDownloadedPath(null);
      }
      setterProgress(0);
      
      try {
          const res = await fetch('/api/pull-data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  cvatProjectId: projectId,
                  cvatApiUrl: url,
                  cvatApiKey: key,
                  type: target
              })
          });
          if (!res.ok) throw new Error("Failed to start pull job");
          const data = await res.json();
          setterJobId(data.jobId);
      } catch (err: any) {
          toast({ title: "Error starting download", description: err.message });
      }
  };

  useEffect(() => {
      const checkStatus = async () => {
          let jobsActive = false;
          
          if (gtDownloadJobId) {
              jobsActive = true;
              try {
                  const res = await fetch(`/api/evaluate/status?jobId=${gtDownloadJobId}&type=download`);
                  const data = await res.json();
                  if (data.status === 'completed') {
                      setGtDownloadedPath(data.batchResults.manifestPath);
                      setGtDownloadJobId(null);
                      setGtDownloadProgress(100);
                      toast({ title: "GT Download Complete!" });
                  } else if (data.status === 'failed') {
                      setGtDownloadJobId(null);
                      toast({ title: "GT Download Failed", description: data.error, variant: "destructive" });
                  } else {
                      setGtDownloadProgress(data.progress || 0);
                  }
              } catch (e) {
                  console.error(e);
              }
          }
          
          if (studentDownloadJobId) {
              jobsActive = true;
              try {
                  const res = await fetch(`/api/evaluate/status?jobId=${studentDownloadJobId}&type=download`);
                  const data = await res.json();
                  if (data.status === 'completed') {
                      setStudentDownloadedPaths([data.batchResults.manifestPath]);
                      setStudentDownloadJobId(null);
                      setStudentDownloadProgress(100);
                      toast({ title: "Student Download Complete!" });
                  } else if (data.status === 'failed') {
                      setStudentDownloadJobId(null);
                      toast({ title: "Student Download Failed", description: data.error, variant: "destructive" });
                  } else {
                      setStudentDownloadProgress(data.progress || 0);
                  }
              } catch (e) {
                  console.error(e);
              }
          }
          
          if (!jobsActive && pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
          }
      };

      if (gtDownloadJobId || studentDownloadJobId) {
          if (!pollIntervalRef.current) {
              pollIntervalRef.current = setInterval(checkStatus, 2000);
          }
      }
      
      return () => {
          if (pollIntervalRef.current && !gtDownloadJobId && !studentDownloadJobId) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
          }
      };
  }, [gtDownloadJobId, studentDownloadJobId]);

  const fetchGtOrgs = async (url: string, key: string) => {
    const trimmedKey = key?.trim();
    if (!trimmedKey || !url) return;
    setIsFetchingGtOrgs(true);
    try {
        const res = await fetch('/api/cvat/organizations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cvatApiUrl: url, cvatApiKey: trimmedKey })
        });
        if (res.ok) {
            const data = await res.json();
            setGtOrgs(data.results || []);
        }
    } catch (err: any) {
        console.error("Failed to fetch GT orgs:", err);
    } finally {
        setIsFetchingGtOrgs(false);
    }
  };

  const fetchStudentOrgs = async (url: string, key: string) => {
    const trimmedKey = key?.trim();
    if (!trimmedKey || !url) return;
    setIsFetchingStudentOrgs(true);
    try {
        const res = await fetch('/api/cvat/organizations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cvatApiUrl: url, cvatApiKey: trimmedKey })
        });
        if (res.ok) {
            const data = await res.json();
            setStudentOrgs(data.results || []);
        }
    } catch (err: any) {
        console.error("Failed to fetch Student orgs:", err);
    } finally {
        setIsFetchingStudentOrgs(false);
    }
  };

  const fetchGtProjects = async (url: string, key: string, org: string) => {
    const trimmedKey = key?.trim();
    if (!trimmedKey || !url) return;
    setIsFetchingGtProjects(true);
    try {
        const res = await fetch('/api/cvat/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cvatApiUrl: url, cvatApiKey: trimmedKey, org })
        });
        if (!res.ok) throw new Error("Failed to fetch projects.");
        const data = await res.json();
        setGtProjects(data.results || []);
    } catch (err: any) {
        toast({ title: "Error", description: err.message });
    } finally {
        setIsFetchingGtProjects(false);
    }
  };

  const fetchStudentProjects = async (url: string, key: string, org: string) => {
    const trimmedKey = key?.trim();
    if (!trimmedKey || !url) return;
    setIsFetchingStudentProjects(true);
    try {
        const res = await fetch('/api/cvat/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cvatApiUrl: url, cvatApiKey: trimmedKey, org })
        });
        if (!res.ok) throw new Error("Failed to fetch projects.");
        const data = await res.json();
        setStudentProjects(data.results || []);
    } catch (err: any) {
        toast({ title: "Error", description: err.message });
    } finally {
        setIsFetchingStudentProjects(false);
    }
  };

  const handleGtOrgChange = (org: string) => {
      setGtSelectedOrgId(org);
      setGtSelectedProjectId('');
      setGtDownloadedPath(null);
      fetchGtProjects(gtCvatApiUrl, gtCvatApiKey, org === 'personal' ? '' : org);
  };

  const handleStudentOrgChange = (org: string) => {
      setStudentSelectedOrgId(org);
      setStudentSelectedProjectId('');
      setStudentDownloadedPaths([]);
      fetchStudentProjects(studentCvatApiUrl, studentCvatApiKey, org === 'personal' ? '' : org);
  };

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (gtSourceMode === 'file' && (!values.gtFile || values.gtFile.length === 0)) {
        toast({ title: "Missing Ground Truth", description: "Please upload a Ground Truth file." });
        return;
    }
    if (gtSourceMode === 'api' && !gtSelectedProjectId) {
        toast({ title: "Missing Ground Truth", description: "Please select a CVAT project for Ground Truth." });
        return;
    }
    if (gtSourceMode === 'api' && !gtDownloadedPath) {
        toast({ title: "Missing Data", description: "Please pull Ground Truth Data first." });
        return;
    }
    if (studentSourceMode === 'file' && (!values.studentFiles || values.studentFiles.length === 0)) {
        toast({ title: "Missing Student Data", description: "Please upload at least one Student file." });
        return;
    }
    if (studentSourceMode === 'api' && !studentSelectedProjectId) {
        toast({ title: "Missing Student Data", description: "Please select a CVAT project for Student Data." });
        return;
    }
    if (studentSourceMode === 'api' && studentDownloadedPaths.length === 0) {
        toast({ title: "Missing Data", description: "Please pull Student Data first." });
        return;
    }

    onEvaluate({
      gtSourceMode,
      studentSourceMode,
      gtFile: values.gtFile,
      studentFiles: values.studentFiles,
      cvatApiUrl: gtCvatApiUrl,
      cvatApiKey: gtCvatApiKey,
      imageFiles: values.imageFiles,
      toolType: values.toolType,
      gtDownloadedPath,
      studentDownloadedPaths
    });
  }

  return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                            {/* API Config for GT */}
                            <Collapsible open={gtIsConfigOpen} onOpenChange={setGtIsConfigOpen} className="border-b-2 border-muted pb-3 mb-3">
                                <div className="flex items-center justify-between mb-2">
                                    <Label className="text-xs font-bold flex items-center gap-1"><Settings className="h-3 w-3"/> Instance Config</Label>
                                    <CollapsibleTrigger asChild>
                                        <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-[10px]">
                                            {gtIsConfigOpen ? 'Hide' : 'Edit'}
                                        </Button>
                                    </CollapsibleTrigger>
                                </div>
                                <CollapsibleContent className="space-y-2 pt-1">
                                    <Input 
                                        value={gtCvatApiUrl} onChange={(e) => setGtCvatApiUrl(e.target.value)} 
                                        placeholder="API URL" className="h-7 text-xs border-2 shadow-hard"
                                    />
                                    <div className="relative">
                                        <Input 
                                            type={gtShowApiKey ? "text" : "password"}
                                            value={gtCvatApiKey} onChange={(e) => setGtCvatApiKey(e.target.value)} 
                                            placeholder="API Key" className="h-7 text-xs border-2 shadow-hard pr-8"
                                        />
                                        <button type="button" onClick={() => setGtShowApiKey(!gtShowApiKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                                            {gtShowApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                        </button>
                                    </div>
                                    <Button type="button" onClick={saveGtConfig} variant="secondary" size="sm" className="w-full h-7 text-[10px] font-bold border-2 shadow-hard">
                                        Save & Connect
                                    </Button>
                                </CollapsibleContent>
                            </Collapsible>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold">Select Organization</Label>
                                <Select value={gtSelectedOrgId} onValueChange={handleGtOrgChange}>
                                    <SelectTrigger className="h-8 text-xs border-2 shadow-hard bg-background">
                                        <SelectValue placeholder="Personal Workspace" />
                                    </SelectTrigger>
                                    <SelectContent className="card-style">
                                        <SelectItem value="personal" className="text-xs">Personal Workspace</SelectItem>
                                        {gtOrgs.map(o => (
                                            <SelectItem key={o.id} value={o.id.toString()} className="text-xs">{o.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold">Select Project</Label>
                                    <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-[10px]" onClick={() => fetchGtProjects(gtCvatApiUrl, gtCvatApiKey, gtSelectedOrgId === 'personal' ? '' : gtSelectedOrgId)} disabled={isFetchingGtProjects}>
                                        {isFetchingGtProjects ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                        Refresh
                                    </Button>
                                </div>
                                <Select value={gtSelectedProjectId} onValueChange={setGtSelectedProjectId}>
                                    <SelectTrigger className="h-8 text-xs border-2 shadow-hard bg-background">
                                        <SelectValue placeholder="Choose a project..." />
                                    </SelectTrigger>
                                    <SelectContent className="card-style">
                                        <div className="p-2 border-b">
                                            <Input 
                                                placeholder="Search projects..." 
                                                className="h-7 text-xs"
                                                value={gtProjectSearch}
                                                onChange={(e) => setGtProjectSearch(e.target.value)}
                                                onKeyDown={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        {gtProjects.filter(p => p.name.toLowerCase().includes(gtProjectSearch.toLowerCase())).map(p => (
                                            <SelectItem key={p.id} value={p.id.toString()} className="text-xs">{p.name} (ID: {p.id})</SelectItem>
                                        ))}
                                        {gtProjects.filter(p => p.name.toLowerCase().includes(gtProjectSearch.toLowerCase())).length === 0 && (
                                            <div className="p-2 text-xs text-muted-foreground text-center">No projects found.</div>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>

                            {gtSelectedProjectId && (
                                <div className="pt-2">
                                    <Button 
                                        type="button" onClick={() => pullData('gt')} 
                                        disabled={gtDownloadJobId !== null || gtDownloadedPath !== null}
                                        className="w-full text-xs h-8 border-2 shadow-hard font-bold"
                                    >
                                        {gtDownloadJobId ? (
                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Pulling...</>
                                        ) : gtDownloadedPath ? (
                                            <><CheckCircle className="mr-2 h-4 w-4 text-green-500" /> Ready</>
                                        ) : (
                                            <><DownloadCloud className="mr-2 h-4 w-4" /> Pull Entire Project</>
                                        )}
                                    </Button>
                                    {gtDownloadJobId && (
                                        <div className="mt-2 space-y-1">
                                            <Progress value={gtDownloadProgress} className="h-2 border-2" />
                                            <p className="text-[10px] text-center text-muted-foreground">{gtDownloadProgress}% Complete</p>
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
                            {/* API Config for Student */}
                            <Collapsible open={studentIsConfigOpen} onOpenChange={setStudentIsConfigOpen} className="border-b-2 border-muted pb-3 mb-3">
                                <div className="flex items-center justify-between mb-2">
                                    <Label className="text-xs font-bold flex items-center gap-1"><Settings className="h-3 w-3"/> Instance Config</Label>
                                    <CollapsibleTrigger asChild>
                                        <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-[10px]">
                                            {studentIsConfigOpen ? 'Hide' : 'Edit'}
                                        </Button>
                                    </CollapsibleTrigger>
                                </div>
                                <CollapsibleContent className="space-y-2 pt-1">
                                    <Input 
                                        value={studentCvatApiUrl} onChange={(e) => setStudentCvatApiUrl(e.target.value)} 
                                        placeholder="API URL" className="h-7 text-xs border-2 shadow-hard"
                                    />
                                    <div className="relative">
                                        <Input 
                                            type={studentShowApiKey ? "text" : "password"}
                                            value={studentCvatApiKey} onChange={(e) => setStudentCvatApiKey(e.target.value)} 
                                            placeholder="API Key" className="h-7 text-xs border-2 shadow-hard pr-8"
                                        />
                                        <button type="button" onClick={() => setStudentShowApiKey(!studentShowApiKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                                            {studentShowApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                        </button>
                                    </div>
                                    <Button type="button" onClick={saveStudentConfig} variant="secondary" size="sm" className="w-full h-7 text-[10px] font-bold border-2 shadow-hard">
                                        Save & Connect
                                    </Button>
                                </CollapsibleContent>
                            </Collapsible>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold">Select Organization</Label>
                                <Select value={studentSelectedOrgId} onValueChange={handleStudentOrgChange}>
                                    <SelectTrigger className="h-8 text-xs border-2 shadow-hard bg-background">
                                        <SelectValue placeholder="Personal Workspace" />
                                    </SelectTrigger>
                                    <SelectContent className="card-style">
                                        <SelectItem value="personal" className="text-xs">Personal Workspace</SelectItem>
                                        {studentOrgs.map(o => (
                                            <SelectItem key={o.id} value={o.id.toString()} className="text-xs">{o.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold">Select Project</Label>
                                    <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-[10px]" onClick={() => fetchStudentProjects(studentCvatApiUrl, studentCvatApiKey, studentSelectedOrgId === 'personal' ? '' : studentSelectedOrgId)} disabled={isFetchingStudentProjects}>
                                        {isFetchingStudentProjects ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                        Refresh
                                    </Button>
                                </div>
                                <Select value={studentSelectedProjectId} onValueChange={setStudentSelectedProjectId}>
                                    <SelectTrigger className="h-8 text-xs border-2 shadow-hard bg-background">
                                        <SelectValue placeholder="Choose a project..." />
                                    </SelectTrigger>
                                    <SelectContent className="card-style">
                                        <div className="p-2 border-b">
                                            <Input 
                                                placeholder="Search projects..." 
                                                className="h-7 text-xs"
                                                value={studentProjectSearch}
                                                onChange={(e) => setStudentProjectSearch(e.target.value)}
                                                onKeyDown={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        {studentProjects.filter(p => p.name.toLowerCase().includes(studentProjectSearch.toLowerCase())).map(p => (
                                            <SelectItem key={p.id} value={p.id.toString()} className="text-xs">{p.name} (ID: {p.id})</SelectItem>
                                        ))}
                                        {studentProjects.filter(p => p.name.toLowerCase().includes(studentProjectSearch.toLowerCase())).length === 0 && (
                                            <div className="p-2 text-xs text-muted-foreground text-center">No projects found.</div>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>

                            {studentSelectedProjectId && (
                                <div className="pt-2">
                                    <Button 
                                        type="button" onClick={() => pullData('student')} 
                                        disabled={studentDownloadJobId !== null || studentDownloadedPaths.length > 0}
                                        className="w-full text-xs h-8 border-2 shadow-hard font-bold"
                                    >
                                        {studentDownloadJobId ? (
                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Pulling...</>
                                        ) : studentDownloadedPaths.length > 0 ? (
                                            <><CheckCircle className="mr-2 h-4 w-4 text-green-500" /> Ready</>
                                        ) : (
                                            <><DownloadCloud className="mr-2 h-4 w-4" /> Pull Entire Project</>
                                        )}
                                    </Button>
                                    {studentDownloadJobId && (
                                        <div className="mt-2 space-y-1">
                                            <Progress value={studentDownloadProgress} className="h-2 border-2" />
                                            <p className="text-[10px] text-center text-muted-foreground">{studentDownloadProgress}% Complete</p>
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
