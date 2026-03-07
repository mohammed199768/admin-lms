'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { instructorApi, type Part, type PartAsset } from '@/lib/api/instructor';
import { toast } from 'sonner';
import { Loader2, ChevronLeft, Video, FileText, Trash } from 'lucide-react';
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

    const handleUploadVideo = async (file: File) => {
        if (!file) return;
        try {
            setIsUploading(true);
            setUploadProgress(0);

            // 1. Init Upload
            const data = await instructorApi.initVideoUpload(file.name);
            const { videoId, authorizationSignature, expirationTime, libraryId } = data;

            // 2. Upload with Tus
            // Dynamically import Tus to avoid SSR issues
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
                    toast.error('Video upload failed: ' + error.message);
                    setIsUploading(false);
                },
                onProgress: (bytesUploaded, bytesTotal) => {
                    const percentage = (bytesUploaded / bytesTotal) * 100;
                    setUploadProgress(Math.round(percentage));
                },
                onSuccess: async () => {
                    // 3. Create Asset
                    try {
                        const nextOrder = (part?.assets?.length || 0) + 1;
                        await instructorApi.createAsset(partId, {
                            title: file.name,
                            type: 'VIDEO',
                            bunnyVideoId: videoId,
                            order: nextOrder,
                            isPreview: false
                        });
                        toast.success('Video uploaded successfully');
                        fetchPart();
                    } catch (e) {
                        toast.error('Failed to link video to part');
                    } finally {
                        setIsUploading(false);
                    }
                },
            });

            upload.start();

        } catch (error) {
            toast.error('Failed to initialize video upload');
            setIsUploading(false);
        }
    };

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
                                    className="hidden"
                                    id="video-upload-main"
                                    aria-label="Upload Video"
                                    onChange={(e) => handleUploadVideo(e.target.files?.[0]!)}
                                    disabled={isUploading}
                                />
                                <Button className="w-full" variant="outline" onClick={() => document.getElementById('video-upload-main')?.click()} disabled={isUploading}>
                                    <Video className="mr-2 h-4 w-4" /> {t('uploadVideo')}
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
                                <div className="text-xs text-muted-foreground flex justify-between">
                                    <span>Uploading...</span>
                                    <span>{uploadProgress}%</span>
                                </div>
                                <Progress value={Math.min(100, Math.max(0, uploadProgress))} />
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

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
