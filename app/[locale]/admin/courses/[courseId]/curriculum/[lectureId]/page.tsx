'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { instructorApi, type Lecture, type Part, type PartAsset } from '@/lib/api/instructor';
import { toast } from 'sonner';
import { Loader2, ChevronLeft, Video, FileText, Trash, Plus, ArrowRight, ArrowRightLeft, FolderUp, Pencil, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslations } from 'next-intl';

const MAX_DOCUMENT_SIZE = 100 * 1024 * 1024; // 100MB

type PartOption = {
    id: string;
    lectureId: string;
    lectureTitle: string;
    label: string;
};

const collectPartOptions = (lectures: Lecture[]): PartOption[] => {
    const options: PartOption[] = [];
    const seen = new Set<string>();

    const visit = (lecture: Lecture, currentPart: Lecture['parts'][0], parents: string[]) => {
        if (seen.has(currentPart.id)) return;
        seen.add(currentPart.id);

        options.push({
            id: currentPart.id,
            lectureId: lecture.id,
            lectureTitle: lecture.title,
            label: [...parents, currentPart.title].join(' / ')
        });

        currentPart.subParts?.forEach((subPart) => visit(lecture, subPart, [...parents, currentPart.title]));
    };

    lectures.forEach((lecture) => {
        lecture.parts?.forEach((currentPart) => visit(lecture, currentPart, []));
    });

    return options;
};

const findPartById = (lectures: Lecture[], partId: string): Part | null => {
    const visit = (currentPart: Part): Part | null => {
        if (currentPart.id === partId) return currentPart;
        for (const subPart of currentPart.subParts || []) {
            const found = visit(subPart);
            if (found) return found;
        }
        return null;
    };

    for (const lecture of lectures) {
        for (const currentPart of lecture.parts || []) {
            const found = visit(currentPart);
            if (found) return found;
        }
    }

    return null;
};

// ─── Rename Dialog ────────────────────────────────────────────────────────────

function RenameDialog({
    open,
    onOpenChange,
    currentTitle,
    onSave,
    label,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    currentTitle: string;
    onSave: (title: string) => Promise<void>;
    label: string;
}) {
    const [title, setTitle] = useState(currentTitle);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) setTitle(currentTitle);
    }, [open, currentTitle]);

    const handleSave = async () => {
        if (!title.trim()) return;
        setSaving(true);
        try {
            await onSave(title.trim());
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Rename {label}</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSave()}
                        autoFocus
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function MoveAssetDialog({
    open,
    onOpenChange,
    lectures,
    currentPartId,
    onMove,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    lectures: Lecture[];
    currentPartId: string;
    onMove: (targetPartId: string) => Promise<void>;
}) {
    const [targetLectureId, setTargetLectureId] = useState('');
    const [targetPartId, setTargetPartId] = useState('');
    const [saving, setSaving] = useState(false);

    const partOptions = collectPartOptions(lectures).filter((option) => option.id !== currentPartId);
    const lectureOptions = Array.from(
        new Map(partOptions.map((option) => [option.lectureId, option.lectureTitle])).entries()
    ).map(([id, title]) => ({ id, title }));
    const filteredPartOptions = partOptions.filter((option) => option.lectureId === targetLectureId);

    useEffect(() => {
        if (!open) return;

        const firstLectureId = lectureOptions[0]?.id || '';
        const firstPartId = partOptions.find((option) => option.lectureId === firstLectureId)?.id || '';

        setTargetLectureId(firstLectureId);
        setTargetPartId(firstPartId);
    }, [open, lectureOptions, partOptions]);

    useEffect(() => {
        if (!open) return;
        const nextPartId = filteredPartOptions[0]?.id || '';
        if (!filteredPartOptions.some((option) => option.id === targetPartId)) {
            setTargetPartId(nextPartId);
        }
    }, [filteredPartOptions, open, targetPartId]);

    const handleMove = async () => {
        if (!targetPartId) return;
        setSaving(true);
        try {
            await onMove(targetPartId);
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Move Asset</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <div className="text-sm font-medium">Target lecture</div>
                        <Select value={targetLectureId} onValueChange={setTargetLectureId} disabled={lectureOptions.length === 0}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select lecture" />
                            </SelectTrigger>
                            <SelectContent>
                                {lectureOptions.map((lecture) => (
                                    <SelectItem key={lecture.id} value={lecture.id}>
                                        {lecture.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <div className="text-sm font-medium">Target part</div>
                        <Select value={targetPartId} onValueChange={setTargetPartId} disabled={filteredPartOptions.length === 0}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select part" />
                            </SelectTrigger>
                            <SelectContent>
                                {filteredPartOptions.map((partOption) => (
                                    <SelectItem key={partOption.id} value={partOption.id}>
                                        {partOption.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {partOptions.length === 0 && (
                        <p className="text-sm text-muted-foreground">No other parts available in this course.</p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleMove} disabled={saving || !targetPartId}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Move'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Sortable Asset ──────────────────────────────────────────────────────────

function SortableAsset({
    asset,
    lectures,
    currentPartId,
    onDelete,
    onRename,
    onMove,
    onMoveUp,
    onMoveDown,
    isFirst,
    isLast,
}: {
    asset: import('@/lib/api/instructor').PartAsset;
    lectures: Lecture[];
    currentPartId: string;
    onDelete: (id: string) => void;
    onRename: (asset: { id: string; title: string }) => void;
    onMove: (assetId: string, targetPartId: string) => Promise<void>;
    onMoveUp: () => void;
    onMoveDown: () => void;
    isFirst: boolean;
    isLast: boolean;
}) {
    const [moveOpen, setMoveOpen] = useState(false);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: asset.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : undefined,
    };

    return (
        <div ref={setNodeRef} style={style}
            className="flex items-center gap-2 p-3 border rounded-lg bg-card group">
            {/* Drag handle — hidden on mobile */}
            <div
                {...attributes}
                {...listeners}
                className="hidden sm:flex cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted shrink-0"
                onClick={e => e.stopPropagation()}
            >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Up/Down buttons — always visible */}
            <div className="flex flex-col gap-0.5 shrink-0">
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={isFirst} onClick={onMoveUp}>
                    <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={isLast} onClick={onMoveDown}>
                    <ChevronDown className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Icon */}
            <div className="p-2 bg-muted rounded shrink-0">
                {asset.type === 'VIDEO'
                    ? <Video className="h-4 w-4" />
                    : <FileText className="h-4 w-4 text-blue-500" />}
            </div>

            {/* Title */}
            <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{asset.title}</div>
                <div className="text-xs text-muted-foreground">{asset.type}</div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => onRename({ id: asset.id, title: asset.title })}>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => setMoveOpen(true)}>
                    <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => onDelete(asset.id)}>
                    <Trash className="h-4 w-4 text-destructive" />
                </Button>
            </div>

            <MoveAssetDialog
                open={moveOpen}
                onOpenChange={setMoveOpen}
                lectures={lectures}
                currentPartId={currentPartId}
                onMove={async (targetPartId) => {
                    await onMove(asset.id, targetPartId);
                    toast.success('Asset moved');
                }}
            />
        </div>
    );
}

// ─── Sortable Asset List ──────────────────────────────────────────────────────

function SortableAssetList({
    assets: initialAssets,
    lectures,
    currentPartId,
    onDelete,
    onRename,
    onMove,
}: {
    assets: import('@/lib/api/instructor').PartAsset[];
    lectures: Lecture[];
    currentPartId: string;
    onDelete: (id: string) => void;
    onRename: (asset: { id: string; title: string }) => void;
    onMove: (assetId: string, targetPartId: string) => Promise<void>;
}) {
    const [assets, setAssets] = useState(initialAssets);

    useEffect(() => {
        setAssets(initialAssets);
    }, [initialAssets]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // ── Shared save logic ────────────────────────────────────────────────────
    const saveOrder = async (reordered: typeof assets, fallback: typeof assets) => {
        try {
            for (let i = 0; i < reordered.length; i++)
                await instructorApi.updateAsset(reordered[i].id, { title: reordered[i].title, order: 1000 + i });
            for (let i = 0; i < reordered.length; i++)
                await instructorApi.updateAsset(reordered[i].id, { title: reordered[i].title, order: i + 1 });
            toast.success('Asset order saved ✓');
        } catch {
            toast.error('Failed to save asset order');
            setAssets(fallback);
        }
    };

    // ── Drag end ─────────────────────────────────────────────────────────────
    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = assets.findIndex(a => a.id === active.id);
        const newIndex = assets.findIndex(a => a.id === over.id);
        const reordered = arrayMove(assets, oldIndex, newIndex);
        setAssets(reordered);
        await saveOrder(reordered, assets);
    };

    // ── Up / Down buttons ────────────────────────────────────────────────────
    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= assets.length) return;
        const reordered = arrayMove([...assets], index, newIndex);
        setAssets(reordered);
        await saveOrder(reordered, assets);
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={assets.map(a => a.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                    {assets.map((asset, index) => (
                        <SortableAsset
                            key={asset.id}
                            asset={asset}
                            lectures={lectures}
                            currentPartId={currentPartId}
                            onDelete={onDelete}
                            onRename={onRename}
                            onMove={onMove}
                            onMoveUp={() => handleMove(index, 'up')}
                            onMoveDown={() => handleMove(index, 'down')}
                            isFirst={index === 0}
                            isLast={index === assets.length - 1}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PartEditorPage() {
    const t = useTranslations('admin.curriculum');
    const params = useParams();
    const router = useRouter();
    const partId = (params.partId || params.lectureId) as string;
    const courseId = params.courseId as string;

    const [part, setPart] = useState<Part | null>(null);
    const [courseLectures, setCourseLectures] = useState<Lecture[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [title, setTitle] = useState('');

    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const [isSecure, setIsSecure] = useState(true);

    // Rename state for assets
    const [renameAsset, setRenameAsset] = useState<{ id: string; title: string } | null>(null);
    // Rename state for sub-parts
    const [renameSubPart, setRenameSubPart] = useState<{ id: string; title: string; order: number } | null>(null);

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

    const fetchCourseContent = useCallback(async () => {
        try {
            const data = await instructorApi.getCourseContent(courseId);
            setCourseLectures(data.lectures || []);
        } catch {
            toast.error('Failed to load course content');
        }
    }, [courseId]);

    useEffect(() => {
        fetchCourseContent();
    }, [fetchCourseContent]);

    const handleSaveTitle = async () => {
        try {
            await instructorApi.updatePart(partId, { title, order: part?.order || 0 });
            toast.success(t('editPart'));
        } catch (error) {
            toast.error('Failed to update part');
        }
    };

    // ── Rename Asset ──────────────────────────────────────────────────────────
    const handleRenameAsset = async (newTitle: string) => {
        if (!renameAsset) return;
        await instructorApi.updateAsset(renameAsset.id, { title: newTitle });
        setPart(prev => prev ? ({
            ...prev,
            assets: prev.assets.map(a => a.id === renameAsset.id ? { ...a, title: newTitle } : a)
        }) : null);
        toast.success('Asset renamed ✓');
    };

    // ── Rename Sub-part ───────────────────────────────────────────────────────
    const handleRenameSubPart = async (newTitle: string) => {
        if (!renameSubPart) return;
        await instructorApi.updatePart(renameSubPart.id, { title: newTitle, order: renameSubPart.order });
        setPart(prev => prev ? ({
            ...prev,
            subParts: prev.subParts?.map((s: any) => s.id === renameSubPart.id ? { ...s, title: newTitle } : s)
        }) : null);
        toast.success('Sub-part renamed ✓');
    };

    const uploadSingleVideo = useCallback((file: File): Promise<void> => {
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
                    chunkSize: 5 * 1024 * 1024, // 5MB chunks for reliable uploads on slow connections
                    headers: {
                        AuthorizationSignature: authorizationSignature,
                        AuthorizationExpire: expirationTime.toString(),
                        VideoId: videoId,
                        LibraryId: libraryId.toString(),
                    },
                    metadata: { filetype: file.type, title: file.name },
                    onError: (error) => { toast.error(`❌ ${file.name}: ${error.message}`); reject(error); },
                    onProgress: (bytesUploaded, bytesTotal) => {
                        setUploadProgress(Math.round((bytesUploaded / bytesTotal) * 100));
                    },
                    onSuccess: async () => {
                        try {
                            const freshPart = await instructorApi.getPart(partId);
                            const nextOrder = (freshPart?.assets?.length || 0) + 1;
                            await instructorApi.createAsset(partId, {
                                title: file.name, type: 'VIDEO', bunnyVideoId: videoId,
                                order: nextOrder, isPreview: false
                            });
                            toast.success(`✅ ${file.name}`);
                            resolve();
                        } catch (e) { toast.error(`Failed to link: ${file.name}`); reject(e); }
                    },
                });
                upload.start();
            } catch (error) { toast.error(`Failed to init: ${file.name}`); reject(error); }
        });
    }, [partId]);

    const isVideoFile = (file: File) => file.type.startsWith('video/');
    const SKIP_FILES = ['desktop.ini', '.ds_store', 'thumbs.db', '.thumbs', '.gitkeep', '.gitignore'];
    const isSystemFile = (file: File) => {
        const name = file.name.toLowerCase();
        return SKIP_FILES.includes(name) || name.startsWith('.');
    };

    const handleSelectVideos = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const fileArray = Array.from(files);
        setVideoQueue(fileArray);
        setCurrentVideoIndex(0);
        setIsUploading(true);
        isProcessingQueue.current = true;
        toast.info(`📋 ${fileArray.length} file(s) queued for upload`);
    };

    const uploadVideoToTarget = useCallback((targetPartId: string, file: File): Promise<void> => {
        return new Promise(async (resolve, reject) => {
            try {
                const data = await instructorApi.initVideoUpload(file.name);
                const { videoId, authorizationSignature, expirationTime, libraryId } = data;
                const { Upload } = (await import('tus-js-client'));
                const upload = new Upload(file, {
                    endpoint: process.env.NEXT_PUBLIC_BUNNY_TUS_ENDPOINT || 'https://video.bunnycdn.com/tusupload',
                    retryDelays: [0, 3000, 5000],
                    chunkSize: 5 * 1024 * 1024, // 5MB chunks for reliable uploads on slow connections
                    headers: {
                        AuthorizationSignature: authorizationSignature,
                        AuthorizationExpire: expirationTime.toString(),
                        VideoId: videoId,
                        LibraryId: libraryId.toString(),
                    },
                    metadata: { filetype: file.type, title: file.name },
                    onError: (error) => reject(error),
                    onProgress: (bytesUploaded, bytesTotal) => {
                        setUploadProgress(Math.round((bytesUploaded / bytesTotal) * 100));
                    },
                    onSuccess: async () => {
                        try {
                            const freshPart = await instructorApi.getPart(targetPartId);
                            const nextOrder = (freshPart?.assets?.length || 0) + 1;
                            await instructorApi.createAsset(targetPartId, {
                                title: file.name, type: 'VIDEO', bunnyVideoId: videoId,
                                order: nextOrder, isPreview: false
                            });
                            resolve();
                        } catch (e) { reject(e); }
                    },
                });
                upload.start();
            } catch (error) { reject(error); }
        });
    }, []);

    const uploadFileToTarget = useCallback(async (targetPartId: string, file: File) => {
        if (isVideoFile(file)) {
            await uploadVideoToTarget(targetPartId, file);
        } else {
            await instructorApi.uploadPdf(targetPartId, file, isSecure);
        }
    }, [isSecure, uploadVideoToTarget]);

    useEffect(() => {
        if (!isProcessingQueue.current || videoQueue.length === 0) return;
        if (currentVideoIndex >= videoQueue.length) {
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
        const uploader = isVideoFile(file) ? uploadSingleVideo(file) : uploadFileToTarget(partId, file);
        uploader
            .then(() => setCurrentVideoIndex(prev => prev + 1))
            .catch(() => setCurrentVideoIndex(prev => prev + 1));
    }, [currentVideoIndex, videoQueue, fetchPart, partId, uploadFileToTarget, uploadSingleVideo]);

    const [textContent, setTextContent] = useState('');
    const [docQueue, setDocQueue] = useState<File[]>([]);
    const [currentDocIndex, setCurrentDocIndex] = useState(0);
    const [currentDocName, setCurrentDocName] = useState('');
    const isProcessingDocQueue = useRef(false);

    const uploadSingleDoc = useCallback(async (file: File): Promise<void> => {
        setCurrentDocName(file.name);
        setUploadProgress(0);
        try {
            await instructorApi.uploadPdf(partId, file, isSecure);
            toast.success(`✅ ${file.name}`);
        } catch (error) {
            toast.error(`❌ ${file.name}: Upload failed`);
            throw error;
        }
    }, [isSecure, partId]);

    const handleSelectDocs = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const fileArray = Array.from(files).filter(f => {
            if (f.size > MAX_DOCUMENT_SIZE) { toast.error(`${f.name}: exceeds 100MB limit`); return false; }
            return true;
        });
        if (fileArray.length === 0) return;
        setDocQueue(fileArray);
        setCurrentDocIndex(0);
        setIsUploading(true);
        isProcessingDocQueue.current = true;
        toast.info(`📋 ${fileArray.length} document(s) queued for upload`);
    };

    useEffect(() => {
        if (!isProcessingDocQueue.current || docQueue.length === 0) return;
        if (currentDocIndex >= docQueue.length) {
            setIsUploading(false);
            setDocQueue([]);
            setCurrentDocIndex(0);
            setCurrentDocName('');
            isProcessingDocQueue.current = false;
            fetchPart();
            toast.success(`🎉 All ${docQueue.length} documents uploaded!`);
            return;
        }
        const file = docQueue[currentDocIndex];
        uploadSingleDoc(file)
            .then(() => setCurrentDocIndex(prev => prev + 1))
            .catch(() => setCurrentDocIndex(prev => prev + 1));
    }, [currentDocIndex, docQueue, fetchPart, uploadSingleDoc]);

    const handleUploadPdf = async (file: File) => {
        if (!file) return;
        if (file.size > MAX_DOCUMENT_SIZE) { toast.error('Maximum document size is 100MB'); return; }
        try {
            setIsUploading(true);
            await instructorApi.uploadPdf(partId, file, isSecure);
            toast.success('Document uploaded');
            fetchPart();
            setTextContent('');
        } catch (error) {
            toast.error('Failed to upload file');
        } finally {
            setIsUploading(false);
        }
    };

    const [isImporting, setIsImporting] = useState(false);
    const [importStatus, setImportStatus] = useState('');

    const handleFolderImport = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const folderMap = new Map<string, File[]>();
        const rootFiles: File[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (isSystemFile(file)) continue;
            const relativePath = (file as any).webkitRelativePath || file.name;
            const parts = relativePath.split('/');
            if (parts.length >= 3) {
                const subfolderName = parts[1];
                if (!folderMap.has(subfolderName)) folderMap.set(subfolderName, []);
                folderMap.get(subfolderName)!.push(file);
            } else if (parts.length === 2) {
                rootFiles.push(file);
            }
        }
        const totalFolders = folderMap.size;
        const totalRootFiles = rootFiles.length;
        if (totalFolders === 0 && totalRootFiles === 0) { toast.error('No files found in folder'); return; }
        setIsImporting(true);
        setIsUploading(true);
        let processedFolders = 0;
        try {
            for (let i = 0; i < rootFiles.length; i++) {
                const file = rootFiles[i];
                setImportStatus(`📂 Root: ${i + 1}/${totalRootFiles} ${file.name}`);
                try { await uploadFileToTarget(partId, file); toast.success(`✅ ${file.name}`); }
                catch (e) { toast.error(`❌ ${file.name}`); }
            }
            const sortedFolders = Array.from(folderMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
            for (const [folderName, folderFiles] of sortedFolders) {
                processedFolders++;
                setImportStatus(`📁 ${processedFolders}/${totalFolders}: Creating "${folderName}"...`);
                let subPartId: string;
                try {
                    const nextOrder = ((part?.subParts?.length || 0) + processedFolders);
                    const result = await instructorApi.createSubPart(partId, { title: folderName, order: nextOrder });
                    subPartId = result.id;
                    toast.success(`📁 Sub-part: ${folderName}`);
                } catch (e) { toast.error(`❌ Failed to create sub-part: ${folderName}`); continue; }
                for (let i = 0; i < folderFiles.length; i++) {
                    const file = folderFiles[i];
                    setImportStatus(`📁 ${processedFolders}/${totalFolders}: "${folderName}" - ${i + 1}/${folderFiles.length}: ${file.name}`);
                    try { await uploadFileToTarget(subPartId, file); toast.success(`  ✅ ${file.name}`); }
                    catch (e) { toast.error(`  ❌ ${file.name}`); }
                }
            }
            toast.success(`🎉 Import complete! ${totalFolders} sub-parts created`);
            fetchPart();
        } catch (error) {
            toast.error('Import failed');
        } finally {
            setIsImporting(false);
            setIsUploading(false);
            setImportStatus('');
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

    const handleMoveAsset = async (assetId: string, targetPartId: string) => {
        const asset = part?.assets.find((item) => item.id === assetId);
        const targetPart = findPartById(courseLectures, targetPartId);

        if (!asset || !targetPart) {
            toast.error('Target part not found');
            throw new Error('move-asset-failed');
        }

        const nextOrder = targetPart.assets.length > 0
            ? Math.max(...targetPart.assets.map((item) => item.order)) + 1
            : 1;

        try {
            await instructorApi.updateAsset(assetId, {
                title: asset.title,
                order: nextOrder,
                partId: targetPartId
            });
            await Promise.all([fetchPart(), fetchCourseContent()]);
        } catch {
            toast.error('Failed to move asset');
            throw new Error('move-asset-failed');
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
                    <CardHeader><CardTitle>{t('partTitle')}</CardTitle></CardHeader>
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
                                <input type="file" accept="video/*,image/*" multiple className="hidden"
                                    id="video-upload-main"
                                    onChange={(e) => { handleSelectVideos(e.target.files); e.target.value = ''; }}
                                    disabled={isUploading} />
                                <Button className="w-full" variant="outline"
                                    onClick={() => document.getElementById('video-upload-main')?.click()}
                                    disabled={isUploading}>
                                    <Video className="mr-2 h-4 w-4" />
                                    {isUploading ? `Uploading ${currentVideoIndex + 1}/${videoQueue.length}...` : 'Upload Video & Images (multi)'}
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
                                        <Switch id="secure-upload" checked={isSecure} onCheckedChange={setIsSecure} />
                                        <Label htmlFor="secure-upload" className="text-sm">
                                            {isSecure ? 'محمي (Watermark)' : 'عادي (قابل للتحميل)'}
                                        </Label>
                                    </div>
                                    <div className="relative">
                                        <input type="file"
                                            accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.cpp,.c,.java,.js,.ts,.py,.html,.cs,.php,.rb,.jpg,.jpeg,.png,.webp"
                                            multiple className="hidden" id="pdf-upload-main"
                                            onChange={(e) => { handleSelectDocs(e.target.files); e.target.value = ''; }}
                                            disabled={isUploading} />
                                        <Button className="w-full" variant="outline"
                                            onClick={() => document.getElementById('pdf-upload-main')?.click()}
                                            disabled={isUploading}>
                                            <FileText className="mr-2 h-4 w-4" />
                                            {isProcessingDocQueue.current && isUploading
                                                ? `Uploading ${currentDocIndex + 1}/${docQueue.length}...`
                                                : 'Upload Documents (multi)'}
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Supports PDF, Word, PPTX, Text, Code files (max 100MB each).
                                    </p>
                                </TabsContent>
                                <TabsContent value="text" className="space-y-2">
                                    <Textarea placeholder="Write or paste content here..." className="h-32"
                                        value={textContent} onChange={(e) => setTextContent(e.target.value)} />
                                    <Button className="w-full" onClick={handleUploadTextAsPdf}
                                        disabled={isUploading || !textContent.trim()}>
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
                                {docQueue.length > 0 && (
                                    <div className="text-xs font-medium text-blue-500">
                                        📄 {currentDocIndex + 1} / {docQueue.length}: {currentDocName}
                                    </div>
                                )}
                                <div className="text-xs text-muted-foreground flex justify-between">
                                    <span>{currentVideoName || currentDocName || 'Uploading...'}</span>
                                    <span>{videoQueue.length > 0 ? `${uploadProgress}%` : 'Processing...'}</span>
                                </div>
                                {videoQueue.length > 0 && <Progress value={Math.min(100, Math.max(0, uploadProgress))} />}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Sub-Parts Section */}
            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <CardTitle>Sub-Parts ({part.subParts?.length || 0})</CardTitle>
                        <CardDescription>أجزاء فرعية - اضغط على أي جزء لإضافة محتوى له</CardDescription>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <input type="file" className="hidden" id="folder-import"
                            {...{ webkitdirectory: '', directory: '' } as any}
                            onChange={(e) => { handleFolderImport(e.target.files); e.target.value = ''; }}
                            disabled={isUploading || isImporting} />
                        <Button variant="outline" size="sm"
                            onClick={() => document.getElementById('folder-import')?.click()}
                            disabled={isUploading || isImporting}>
                            <FolderUp className="mr-2 h-4 w-4" /> Import Folder
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleCreateSubPart} disabled={isImporting}>
                            <Plus className="mr-2 h-4 w-4" /> Add Sub-Part
                        </Button>
                    </div>
                </CardHeader>
                {isImporting && (
                    <div className="px-6 pb-2">
                        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                            <div className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">⏳ Importing...</div>
                            <div className="text-xs text-blue-600 dark:text-blue-400">{importStatus}</div>
                        </div>
                    </div>
                )}
                <CardContent>
                    <div className="space-y-2">
                        {part.subParts?.map((sub: any) => (
                            <div key={sub.id}
                                className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                                <div
                                    className="flex items-center gap-3 flex-1 cursor-pointer min-w-0"
                                    onClick={() => router.push(`/admin/courses/${courseId}/curriculum/${sub.id}`)}
                                >
                                    <div className="p-2 bg-muted rounded shrink-0">
                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{sub.title}</div>
                                        <div className="text-xs text-muted-foreground">{sub.assets?.length || 0} assets</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 ml-2">
                                    {/* Rename sub-part */}
                                    <Button variant="ghost" size="icon"
                                        className="h-8 w-8"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setRenameSubPart({ id: sub.id, title: sub.title, order: sub.order });
                                        }}>
                                        <Pencil className="h-3 w-3 text-muted-foreground" />
                                    </Button>
                                    {/* Delete sub-part */}
                                    <Button variant="ghost" size="icon"
                                        className="h-8 w-8"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm('Delete this sub-part?')) {
                                                instructorApi.deletePart(sub.id).then(() => {
                                                    toast.success('Sub-part deleted');
                                                    fetchPart();
                                                }).catch(() => toast.error('Failed to delete sub-part'));
                                            }
                                        }}>
                                        <Trash className="h-3 w-3 text-destructive" />
                                    </Button>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground cursor-pointer"
                                        onClick={() => router.push(`/admin/courses/${courseId}/curriculum/${sub.id}`)} />
                                </div>
                            </div>
                        ))}
                        {(!part.subParts || part.subParts.length === 0) && (
                            <p className="text-muted-foreground text-center py-4">
                                No sub-parts yet. Click &quot;Add Sub-Part&quot; to create one.
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Assets Section */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{t('assets')} ({part.assets?.length || 0})</CardTitle>
                </CardHeader>
                <CardContent>
                    {(part.assets?.length ?? 0) > 0 ? (
                        <SortableAssetList
                            assets={part.assets}
                            lectures={courseLectures}
                            currentPartId={partId}
                            onDelete={handleDeleteAsset}
                            onRename={setRenameAsset}
                            onMove={handleMoveAsset}
                        />
                    ) : (
                        <p className="text-muted-foreground text-center py-4">No media assets uploaded.</p>
                    )}
                </CardContent>
            </Card>

            {/* Rename Asset Dialog */}
            <RenameDialog
                open={!!renameAsset}
                onOpenChange={(v) => { if (!v) setRenameAsset(null); }}
                currentTitle={renameAsset?.title || ''}
                label="Asset"
                onSave={handleRenameAsset}
            />

            {/* Rename Sub-part Dialog */}
            <RenameDialog
                open={!!renameSubPart}
                onOpenChange={(v) => { if (!v) setRenameSubPart(null); }}
                currentTitle={renameSubPart?.title || ''}
                label="Sub-part"
                onSave={handleRenameSubPart}
            />
        </div>
    );
}
