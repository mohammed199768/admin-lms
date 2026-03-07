'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { instructorApi, type Part, type PartAsset } from '@/lib/api/instructor';
import { toast } from 'sonner';
import { Loader2, ChevronLeft, Video, FileText, Trash, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';

const MAX_DOCUMENT_SIZE = 100 * 1024 * 1024; // 100MB

export default function PartEditorPage() {
    const t = useTranslations('admin.curriculum');
    const params = useParams();
    const router = useRouter();
    // Support both parameter names during migration
    const partId = (params.partId || params.lectureId) as string;
    const courseId = params.courseId as string;

    const [part, setPart] = useState<Part | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [title, setTitle] = useState('');

    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const [isSecure, setIsSecure] = useState(true);

    // Video upload queue
    const [videoQueue, setVideoQueue] = useState<File[]>([]);
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const [currentVideoName, setCurrentVideoName] = useState('');
    const isProcessingQueue = useRef(false);

    const fetchPart = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await instructorApi.getPart(partId);
            setPart(data);
            setTitle(data.title);
        } catch (error) {
            toast.error('Failed to load part');
        } finally {
            setIsLoading(false);
        }
    }, [partId]);

    useEffect(() => {
        fetchPart();
    }, [fetchPart]);

    const handleSaveTitle = async () => {
        try {
            await instructorApi.updatePart(partId, { title, order: part?.order || 0 });
            toast.success(t('editPart'));
        } catch (error) {
            toast.error('Failed to update part');
        }
    };

    // Upload a single video (returns a promise that resolves when done)
    const uploadSingleVideo = (file: File): Promise<void> => {
        return new Promise(async (resolve, reject) => {
            try {
                setCurrentVideoName(file.name);
                setUploadProgress(0);

                const data = await instructorApi.initVideoUpload(file.name);
                const { videoId, authorizationSignature, expirationTime, libraryId } = data;
                const { Upload } = (await import('tus-js-client'));

                const upload = new Upload(file, {
                    endpoint: process.env.NEXT_PUBLIC_BUNNY_TUS_ENDPOINT || 'https://video.bunnycdn.com/tusupload',
                    retryDelays: [0, 3000, 5000],
                    headers: {
                        AuthorizationSignature: authorizationSignature,
                        AuthorizationExpire: expirationTime.toString(),
                        VideoId: videoId,
                        LibraryId: libraryId.toString(),
                    },
                    metadata: {
                        filetype: file.type,
                        title: file.name,
                    },
                    onError: (error) => {
                        toast.error(`❌ ${file.name}: ${error.message}`);
                        reject(error);
                    },
                    onProgress: (bytesUploaded, bytesTotal) => {
                        setUploadProgress(Math.round((bytesUploaded / bytesTotal) * 100));
                    },
                    onSuccess: async () => {
                        try {
                            const freshPart = await instructorApi.getPart(partId);
                            const nextOrder = (freshPart?.assets?.length || 0) + 1;
                            await instructorApi.createAsset(partId, {
                                title: file.name,
                                type: 'VIDEO',
                                bunnyVideoId: videoId,
                                order: nextOrder,
                                isPreview: false
                            });
                            toast.success(`✅ ${file.name}`);
                            resolve();
                        } catch (e) {
                            toast.error(`Failed to link: ${file.name}`);
                            reject(e);
                        }
                    },
                });
                upload.start();
            } catch (error) {
                toast.error(`Failed to init: ${file.name}`);
                reject(error);
            }
        });
    };

    // Handle multi-file selection → queue
    const handleSelectVideos = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const fileArray = Array.from(files);
        setVideoQueue(fileArray);
        setCurrentVideoIndex(0);
        setIsUploading(true);
        isProcessingQueue.current = true;
        toast.info(`📋 ${fileArray.length} video(s) queued for upload`);
    };

    // Process queue sequentially
    useEffect(() => {
        if (!isProcessingQueue.current || videoQueue.length === 0) return;
        if (currentVideoIndex >= videoQueue.length) {
            // All done
            setIsUploading(false);
            setVideoQueue([]);
            setCurrentVideoIndex(0);
            setCurrentVideoName('');
            isProcessingQueue.current = false;
            fetchPart();
            toast.success(`🎉 All ${videoQueue.length} videos uploaded!`);
            return;
        }

        const file = videoQueue[currentVideoIndex];
        uploadSingleVideo(file)
            .then(() => setCurrentVideoIndex(prev => prev + 1))
            .catch(() => setCurrentVideoIndex(prev => prev + 1)); // skip failed, continue
    }, [currentVideoIndex, videoQueue]);

    const [textContent, setTextContent] = useState('');

    const handleUploadPdf = async (file: File) => {
        if (!file) return;
        if (file.size > MAX_DOCUMENT_SIZE) {
            toast.error('Maximum document size is 100MB');
            return;
        }
        try {
            setIsUploading(true);
            await instructorApi.uploadPdf(partId, file, isSecure);
            toast.success('Document uploaded');
            fetchPart();
            setTextContent(''); // Reset text
        } catch (error) {
            toast.error('Failed to upload file');
        } finally {
            setIsUploading(false);
        }
    };

    const handleUploadTextAsPdf = async () => {
        if (!textContent.trim()) return;
        const blob = new Blob([textContent], { type: 'text/plain' });
        const file = new File([blob], `note-${Date.now()}.txt`, { type: 'text/plain' });
        await handleUploadPdf(file);
    };

    const handleDeleteAsset = async (id: string) => {
        if (!confirm('Delete this asset?')) return;
        try {
            await instructorApi.deleteAsset(id);
            toast.success('Asset deleted');
            fetchPart();
        } catch (error) {
            toast.error('Failed to delete asset');
        }
    };

    const handleCreateSubPart = async () => {
        const subTitle = prompt('Sub-part title:');
        if (!subTitle) return;
        try {
            const nextOrder = (part?.subParts?.length || 0) + 1;
            await instructorApi.createSubPart(partId, { title: subTitle, order: nextOrder });
            toast.success('Sub-part created');
            fetchPart();
        } catch (error) {
            toast.error('Failed to create sub-part');
        }
    };

    const togglePreview = async (asset: any) => {
        try {
            const newStatus = !asset.isPreview;
            await instructorApi.updateAsset(asset.id, { isPreview: newStatus });
            toast.success(`Preview ${newStatus ? 'enabled' : 'disabled'}`);
            setPart(prev => prev ? ({
                ...prev,
                assets: prev.assets.map(a => a.id === asset.id ? { ...a, isPreview: newStatus } : a)
            }) : null);
        } catch (error) {
            toast.error('Failed to update preview status');
        }
    };

    if (isLoading) return <div className="flex h-96 items-center justify-center"><Loader2 className="animate-spin" /></div>;
    if (!part) return <div>Part not found</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/courses/${courseId}/curriculum`)}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('editPart')}</h1>
                    <p className="text-muted-foreground">{part.title}</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>{t('partTitle')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-2">
                            <Label>{t('partTitle')}</Label>
                            <div className="flex gap-2">
                                <Input value={title} onChange={e => setTitle(e.target.value)} />
                                <Button onClick={handleSaveTitle}>Save</Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle>Media</CardTitle>
                        <CardDescription>Upload Video or PDF resources.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-2">
                            <Label>{t('video')}</Label>
                            <div className="relative">
                                <input
                                    type="file"
                                    accept="video/*"
                                    multiple
                                    className="hidden"
                                    id="video-upload-main"
                                    aria-label="Upload Videos"
                                    onChange={(e) => { handleSelectVideos(e.target.files); e.target.value = ''; }}
                                    disabled={isUploading}
                                />
                                <Button className="w-full" variant="outline" onClick={() => document.getElementById('video-upload-main')?.click()} disabled={isUploading}>
                                    <Video className="mr-2 h-4 w-4" /> {isUploading ? `Uploading ${currentVideoIndex + 1}/${videoQueue.length}...` : `${t('uploadVideo')} (multi)`}
                                </Button>
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label>Document / Text</Label>
                            <Tabs defaultValue="file" className="w-full">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="file">Upload File</TabsTrigger>
                                    <TabsTrigger value="text">Write Content</TabsTrigger>
                                </TabsList>
                                <TabsContent value="file" className="space-y-2">
                                    <div className="flex items-center gap-2 mb-2 p-2 border rounded bg-muted/30">
                                        <Switch
                                            id="secure-upload"
                                            checked={isSecure}
                                            onCheckedChange={setIsSecure}
                                        />
                                        <Label htmlFor="secure-upload" className="text-sm">
                                            {isSecure ? 'محمي (Watermark)' : 'عادي (قابل للتحميل)'}
                                        </Label>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="file"
                                            accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.cpp,.c,.java,.js,.ts,.py,.html,.cs,.php,.rb"
                                            className="hidden"
                                            id="pdf-upload-main"
                                            onChange={(e) => handleUploadPdf(e.target.files?.[0]!)}
                                            disabled={isUploading}
                                        />
                                        <Button className="w-full" variant="outline" onClick={() => document.getElementById('pdf-upload-main')?.click()} disabled={isUploading}>
                                            <FileText className="mr-2 h-4 w-4" /> Upload Document
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Supports PDF, Word, PPTX, Text, Code files (.cpp, .java, .py, .js...) (max 100MB)
                                    </p>
                                </TabsContent>
                                <TabsContent value="text" className="space-y-2">
                                    <Textarea 
                                        placeholder="Write or paste content here..." 
                                        className="h-32"
                                        value={textContent}
                                        onChange={(e) => setTextContent(e.target.value)}
                                    />
                                    <Button className="w-full" onClick={handleUploadTextAsPdf} disabled={isUploading || !textContent.trim()}>
                                        <FileText className="mr-2 h-4 w-4" /> Save as Document
                                    </Button>
                                </TabsContent>
                            </Tabs>
                        </div>
                        {isUploading && (
                            <div className="space-y-2">
                                {videoQueue.length > 0 && (
                                    <div className="text-xs font-medium text-primary">
                                        📹 {currentVideoIndex + 1} / {videoQueue.length}: {currentVideoName}
                                    </div>
                                )}
                                <div className="text-xs text-muted-foreground flex justify-between">
                                    <span>{currentVideoName || 'Uploading...'}</span>
                                    <span>{uploadProgress}%</span>
                                </div>
                                <Progress value={Math.min(100, Math.max(0, uploadProgress))} />
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Sub-Parts Section */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Sub-Parts ({part.subParts?.length || 0})</CardTitle>
                        <CardDescription>أجزاء فرعية - اضغط على أي جزء لإضافة محتوى له</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleCreateSubPart}>
                        <Plus className="mr-2 h-4 w-4" /> Add Sub-Part
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {part.subParts?.map((sub: any) => (
                            <div
                                key={sub.id}
                                className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-muted/50 cursor-pointer transition-colors group"
                                onClick={() => router.push(`/admin/courses/${courseId}/curriculum/${sub.id}`)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-muted rounded">
                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <div className="font-medium group-hover:text-primary transition-colors">{sub.title}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {sub.assets?.length || 0} assets
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm('Delete this sub-part?')) {
                                                instructorApi.deletePart(sub.id).then(() => {
                                                    toast.success('Sub-part deleted');
                                                    fetchPart();
                                                }).catch(() => toast.error('Failed to delete sub-part'));
                                            }
                                        }}
                                    >
                                        <Trash className="h-3 w-3 text-destructive" />
                                    </Button>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                            </div>
                        ))}
                        {(!part.subParts || part.subParts.length === 0) && (
                            <p className="text-muted-foreground text-center py-4">No sub-parts yet. Click &quot;Add Sub-Part&quot; to create one.</p>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{t('assets')} ({part.assets?.length || 0})</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {part.assets?.map((asset: any) => (
                            <div key={asset.id} className="flex items-center justify-between p-3 border rounded-lg bg-card">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-muted rounded">
                                        {asset.type === 'VIDEO' ? <Video className="h-4 w-4" /> :
                                            <FileText className="h-4 w-4 text-blue-500" />}
                                    </div>
                                    <div>
                                        <div className="font-medium">{asset.title}</div>
                                        <div className="text-xs text-muted-foreground">{asset.type}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteAsset(asset.id)}>
                                        <Trash className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {part.assets?.length === 0 && <p className="text-muted-foreground text-center py-4">No media assets uploaded.</p>}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
