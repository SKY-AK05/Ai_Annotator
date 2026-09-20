
'use client';

import * as React from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2, UploadCloud, FileCog, Image as ImageIcon, CheckCircle } from 'lucide-react';

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
import type { FormValues } from '@/lib/types';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  gtFile: typeof window === 'undefined' ? z.any() : z.instanceof(FileList).refine((files) => files?.length === 1, "Ground Truth file is required."),
  studentFiles: typeof window === 'undefined' ? z.any() : z.instanceof(FileList).refine((files) => files?.length >= 1, "At least one Student Annotation file is required."),
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
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      toolType: "bounding_box",
    },
  });

  const gtFileRef = form.register("gtFile");
  const studentFileRef = form.register("studentFiles");
  const imageFileRef = form.register("imageFiles");
  
  const hasImagesFromGt = imageUrls.size > 0;

  function onSubmit(values: z.infer<typeof formSchema>) {
    onEvaluate(values);
  }

  return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
            <FormField
              control={form.control}
              name="studentFiles"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">2. Student Annotations</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <UploadCloud className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input type="file" className="pl-10" {...studentFileRef} accept=".xml,.json,.zip" multiple />
                    </div>
                  </FormControl>
                  <FormDescription>Upload one or more files, or a single ZIP archive.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
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
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
