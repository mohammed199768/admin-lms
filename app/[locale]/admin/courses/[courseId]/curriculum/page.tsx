'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { instructorApi, type Lecture } from '@/lib/api/instructor';
import { toast } from 'sonner';
import { Loader2, Plus, GripVertical, FileText, Trash, ArrowRight, Video, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useTranslations } from 'next-intl';
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

// ─── Sortable Lecture Item ────────────────────────────────────────────────────

function SortableLecture({
    lecture,
    courseId,
    onDelete,
    onAddPart,
    onAddSubPart,
    onRename,
}: {
    lecture: Lecture;
    courseId: string;
    onDelete: (id: string) => void;
    onAddPart: (lectureId: string) => void;
    onAddSubPart: (parentPartId: string, lectureId: string) => void;
    onRename: (id: string, title: string) => Promise<void>;
}) {
    const t = useTranslations('admin.curriculum');
    const [renameOpen, setRenameOpen] = useState(false);

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lecture.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : undefined,
    };

    return (
        <div ref={setNodeRef} style={style}>
            <AccordionItem value={lecture.id} className="border rounded-lg bg-card px-4">
                <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2 flex-1">
                        <div
                            {...attributes}
                            {...listeners}
                            className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted"
                            onClick={e => e.stopPropagation()}
                        >
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <AccordionTrigger className="hover:no-underline py-2 font-semibold text-lg">
                            {lecture.title}
                        </AccordionTrigger>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setRenameOpen(true); }}>
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onDelete(lecture.id)}>
                            <Trash className="h-4 w-4 text-destructive" />
                        </Button>
                    </div>
                </div>

                <AccordionContent className="pt-2 pb-4 space-y-2">
                    <SortablePartsList
                        lecture={lecture}
                        courseId={courseId}
                        onAddSubPart={onAddSubPart}
                        onRenamePart={onRename}
                    />
                    <div className="flex gap-2 ml-6 mt-2">
                        <Button variant="outline" size="sm" className="flex-1 border-dashed" onClick={() => onAddPart(lecture.id)}>
                            <Plus className="mr-2 h-4 w-4" /> {t('addPart')}
                        </Button>
                    </div>
                </AccordionContent>
            </AccordionItem>

            <RenameDialog
                open={renameOpen}
                onOpenChange={setRenameOpen}
                currentTitle={lecture.title}
                label="Lecture"
                onSave={async (newTitle) => {
                    await onRename(lecture.id, newTitle);
                    toast.success('Lecture renamed ✓');
                }}
            />
        </div>
    );
}

// ─── Sortable Parts List ──────────────────────────────────────────────────────

function SortablePartsList({
    lecture,
    courseId,
    onAddSubPart,
    onRenamePart,
}: {
    lecture: Lecture;
    courseId: string;
    onAddSubPart: (parentPartId: string, lectureId: string) => void;
    onRenamePart: (id: string, title: string) => Promise<void>;
}) {
    const [parts, setParts] = useState(lecture.parts || []);

    useEffect(() => {
        setParts(lecture.parts || []);
    }, [lecture.parts]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = parts.findIndex(p => p.id === active.id);
        const newIndex = parts.findIndex(p => p.id === over.id);
        const reordered = arrayMove(parts, oldIndex, newIndex);
        setParts(reordered);

        try {
            for (let i = 0; i < reordered.length; i++) {
                await instructorApi.updatePart(reordered[i].id, { title: reordered[i].title, order: 1000 + i });
            }
            for (let i = 0; i < reordered.length; i++) {
                await instructorApi.updatePart(reordered[i].id, { title: reordered[i].title, order: i + 1 });
            }
            toast.success('Part order saved ✓');
        } catch {
            toast.error('Failed to save part order');
            setParts(lecture.parts || []);
        }
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={parts.map(p => p.id)} strategy={verticalListSortingStrategy}>
                {parts.map(part => (
                    <SortablePart
                        key={part.id}
                        part={part}
                        lectureId={lecture.id}
                        courseId={courseId}
                        onAddSubPart={onAddSubPart}
                        onRename={onRenamePart}
                        onLocalRename={(id, newTitle) => {
                            setParts(prev => prev.map(p => p.id === id ? { ...p, title: newTitle } : p));
                        }}
                    />
                ))}
            </SortableContext>
        </DndContext>
    );
}

// ─── Sortable Single Part ─────────────────────────────────────────────────────

function SortablePart({
    part,
    lectureId,
    courseId,
    onAddSubPart,
    onRename,
    onLocalRename,
}: {
    part: Lecture['parts'][0];
    lectureId: string;
    courseId: string;
    onAddSubPart: (parentPartId: string, lectureId: string) => void;
    onRename: (id: string, title: string) => Promise<void>;
    onLocalRename: (id: string, title: string) => void;
}) {
    const router = useRouter();
    const [renameOpen, setRenameOpen] = useState(false);
    const [subRenameId, setSubRenameId] = useState<string | null>(null);
    const [subRenameTitle, setSubRenameTitle] = useState('');

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: part.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const isVideo = part.assets?.some(a => a.type === 'VIDEO');
    const isPdf = part.assets?.some(a => a.type === 'PDF' || a.type === 'PPTX');

    return (
        <div ref={setNodeRef} style={style}>
            <div className="flex items-center justify-between p-3 rounded-md bg-muted/40 hover:bg-muted ml-6 transition-colors group">
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-background mr-1"
                    onClick={e => e.stopPropagation()}
                >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>

                <div
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => router.push(`/admin/courses/${courseId}/curriculum/${part.id}`)}
                >
                    <div className="p-2 bg-background rounded-full border">
                        {isVideo ? <Video className="h-4 w-4 text-purple-500" /> :
                            isPdf ? <FileText className="h-4 w-4 text-blue-500" /> :
                                <FileText className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div>
                        <div className="font-medium group-hover:text-primary transition-colors">{part.title}</div>
                        <div className="text-xs text-muted-foreground">{part.assets?.length || 0} assets</div>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setRenameOpen(true); }}>
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/courses/${courseId}/curriculum/${part.id}`)}>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Button>
                </div>
            </div>

            {/* Sub-parts */}
            {part.subParts?.map(sub => (
                <div key={sub.id} className="flex items-center justify-between p-2 rounded-md bg-muted/20 hover:bg-muted ml-12 mt-1 group">
                    <div
                        className="flex items-center gap-2 flex-1 cursor-pointer"
                        onClick={() => router.push(`/admin/courses/${courseId}/curriculum/${sub.id}`)}
                    >
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{sub.title}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost" size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                            onClick={e => { e.stopPropagation(); setSubRenameId(sub.id); setSubRenameTitle(sub.title); }}
                        >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                        </Button>
                        <ArrowRight
                            className="h-3 w-3 text-muted-foreground cursor-pointer"
                            onClick={() => router.push(`/admin/courses/${courseId}/curriculum/${sub.id}`)}
                        />
                    </div>
                </div>
            ))}

            {/* Rename Part Dialog */}
            <RenameDialog
                open={renameOpen}
                onOpenChange={setRenameOpen}
                currentTitle={part.title}
                label="Part"
                onSave={async (newTitle) => {
                    await onRename(part.id, newTitle);
                    onLocalRename(part.id, newTitle);
                    toast.success('Part renamed ✓');
                }}
            />

            {/* Rename Sub-part Dialog */}
            <RenameDialog
                open={!!subRenameId}
                onOpenChange={(v) => { if (!v) setSubRenameId(null); }}
                currentTitle={subRenameTitle}
                label="Sub-part"
                onSave={async (newTitle) => {
                    if (!subRenameId) return;
                    await onRename(subRenameId, newTitle);
                    toast.success('Sub-part renamed ✓');
                }}
            />
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CurriculumPage() {
    const t = useTranslations('admin.curriculum');
    const params = useParams();
    const router = useRouter();
    const courseId = params.courseId as string;
    const [lectures, setLectures] = useState<Lecture[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newLectureTitle, setNewLectureTitle] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const fetchContent = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await instructorApi.getCourseContent(courseId);
            setLectures(data.lectures || []);
        } catch {
            toast.error('Failed to load curriculum');
        } finally {
            setIsLoading(false);
        }
    }, [courseId]);

    useEffect(() => {
        fetchContent();
    }, [fetchContent]);

    // ── Rename: works for lectures, parts, and sub-parts ─────────────────────
    const handleRename = useCallback(async (id: string, newTitle: string) => {
        // Check if it's a lecture
        const lecture = lectures.find(l => l.id === id);
        if (lecture) {
            await instructorApi.updateLecture(id, { title: newTitle, order: lecture.order });
            setLectures(prev => prev.map(l => l.id === id ? { ...l, title: newTitle } : l));
            return;
        }
        // Check parts and sub-parts
        for (const lec of lectures) {
            const part = lec.parts?.find(p => p.id === id);
            if (part) {
                await instructorApi.updatePart(id, { title: newTitle, order: part.order });
                return;
            }
            for (const p of lec.parts || []) {
                const sub = p.subParts?.find(s => s.id === id);
                if (sub) {
                    await instructorApi.updatePart(id, { title: newTitle, order: sub.order });
                    return;
                }
            }
        }
    }, [lectures]);

    // ── Drag end for Lectures ─────────────────────────────────────────────────
    const handleLectureDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = lectures.findIndex(l => l.id === active.id);
        const newIndex = lectures.findIndex(l => l.id === over.id);
        const reordered = arrayMove(lectures, oldIndex, newIndex);
        setLectures(reordered);

        try {
            for (let i = 0; i < reordered.length; i++) {
                await instructorApi.updateLecture(reordered[i].id, { title: reordered[i].title, order: 1000 + i });
            }
            for (let i = 0; i < reordered.length; i++) {
                await instructorApi.updateLecture(reordered[i].id, { title: reordered[i].title, order: i + 1 });
            }
            toast.success('Lecture order saved ✓');
        } catch {
            toast.error('Failed to save lecture order');
            fetchContent();
        }
    };

    const handleCreateLecture = async () => {
        if (!newLectureTitle) return;
        try {
            const nextOrder = lectures.length > 0 ? Math.max(...lectures.map(s => s.order)) + 1 : 1;
            await instructorApi.createLecture(courseId, { title: newLectureTitle, order: nextOrder });
            toast.success(t('addLecture') + ' created');
            setNewLectureTitle('');
            setIsDialogOpen(false);
            fetchContent();
        } catch {
            toast.error('Failed to create lecture');
        }
    };

    const handleDeleteLecture = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        try {
            await instructorApi.deleteLecture(id);
            toast.success(t('deleteLecture'));
            fetchContent();
        } catch {
            toast.error('Failed to delete lecture');
        }
    };

    const handleQuickAddPart = async (lectureId: string) => {
        const title = prompt(t('partTitle') + ':');
        if (!title) return;
        try {
            const lecture = lectures.find(s => s.id === lectureId);
            const nextOrder = (lecture?.parts?.length || 0) > 0
                ? Math.max(...(lecture?.parts || []).map(l => l.order)) + 1 : 1;
            await instructorApi.createPart(lectureId, { title, order: nextOrder });
            toast.success(t('addPart'));
            fetchContent();
        } catch {
            toast.error('Failed to create part');
        }
    };

    const handleQuickAddSubPart = async (parentPartId: string, lectureId: string) => {
        const title = prompt('Sub-part title:');
        if (!title) return;
        try {
            const parent = lectures.find(l => l.id === lectureId)?.parts?.find(p => p.id === parentPartId);
            const nextOrder = (parent?.subParts?.length || 0) + 1;
            await instructorApi.createSubPart(parentPartId, { title, order: nextOrder });
            toast.success('Sub-part created');
            fetchContent();
        } catch {
            toast.error('Failed to create sub-part');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">{t('manageContent')}</h2>
                    <p className="text-muted-foreground">{t('startAdding')}</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button><Plus className="mr-2 h-4 w-4" /> {t('addLecture')}</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader><DialogTitle>{t('addLecture')}</DialogTitle></DialogHeader>
                        <div className="py-4">
                            <Input
                                placeholder={t('lectureTitle')}
                                value={newLectureTitle}
                                onChange={e => setNewLectureTitle(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreateLecture()}
                            />
                        </div>
                        <DialogFooter>
                            <Button onClick={handleCreateLecture}>{t('addLecture')}</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleLectureDragEnd}>
                    <SortableContext items={lectures.map(l => l.id)} strategy={verticalListSortingStrategy}>
                        <Accordion type="multiple" className="w-full space-y-4" defaultValue={lectures.map(s => s.id)}>
                            {lectures.map(lecture => (
                                <SortableLecture
                                    key={lecture.id}
                                    lecture={lecture}
                                    courseId={courseId}
                                    onDelete={handleDeleteLecture}
                                    onAddPart={handleQuickAddPart}
                                    onAddSubPart={handleQuickAddSubPart}
                                    onRename={handleRename}
                                />
                            ))}
                        </Accordion>
                    </SortableContext>
                </DndContext>
            )}

            {lectures.length === 0 && !isLoading && (
                <div className="text-center py-10 text-muted-foreground">{t('noLectures')}</div>
            )}
        </div>
    );
}