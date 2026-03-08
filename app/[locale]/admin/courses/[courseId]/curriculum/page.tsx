'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { instructorApi, type Lecture } from '@/lib/api/instructor';
import { toast } from 'sonner';
import { Loader2, Plus, GripVertical, FileText, Trash, ArrowRight, Video } from 'lucide-react';
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

// ─── Sortable Lecture Item ────────────────────────────────────────────────────

function SortableLecture({
    lecture,
    courseId,
    onDelete,
    onAddPart,
    onAddSubPart,
}: {
    lecture: Lecture;
    courseId: string;
    onDelete: (id: string) => void;
    onAddPart: (lectureId: string) => void;
    onAddSubPart: (parentPartId: string, lectureId: string) => void;
}) {
    const router = useRouter();
    const t = useTranslations('admin.curriculum');

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: lecture.id });

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
                        {/* Drag handle for lecture */}
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
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => onDelete(lecture.id)}>
                            <Trash className="h-4 w-4 text-destructive" />
                        </Button>
                    </div>
                </div>

                <AccordionContent className="pt-2 pb-4 space-y-2">
                    {/* Sortable Parts inside this lecture */}
                    <SortablePartsList
                        lecture={lecture}
                        courseId={courseId}
                        onAddSubPart={onAddSubPart}
                    />
                    <div className="flex gap-2 ml-6 mt-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 border-dashed"
                            onClick={() => onAddPart(lecture.id)}
                        >
                            <Plus className="mr-2 h-4 w-4" /> {t('addPart')}
                        </Button>
                    </div>
                </AccordionContent>
            </AccordionItem>
        </div>
    );
}

// ─── Sortable Parts List ──────────────────────────────────────────────────────

function SortablePartsList({
    lecture,
    courseId,
    onAddSubPart,
}: {
    lecture: Lecture;
    courseId: string;
    onAddSubPart: (parentPartId: string, lectureId: string) => void;
}) {
    const router = useRouter();
    const [parts, setParts] = useState(lecture.parts || []);

    // Keep in sync if parent re-fetches
    useEffect(() => {
        setParts(lecture.parts || []);
    }, [lecture.parts]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = parts.findIndex(p => p.id === active.id);
        const newIndex = parts.findIndex(p => p.id === over.id);
        const reordered = arrayMove(parts, oldIndex, newIndex);

        // Optimistic update
        setParts(reordered);

        // Save to backend
        try {
            await Promise.all(
                reordered.map((part, index) =>
                    instructorApi.updatePart(part.id, { title: part.title, order: index + 1 })
                )
            );
            toast.success('Part order saved');
        } catch {
            toast.error('Failed to save part order');
            setParts(lecture.parts || []); // rollback
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
}: {
    part: Lecture['parts'][0];
    lectureId: string;
    courseId: string;
    onAddSubPart: (parentPartId: string, lectureId: string) => void;
}) {
    const router = useRouter();

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: part.id });

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
                {/* Drag handle for part */}
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
                        {isVideo ? (
                            <Video className="h-4 w-4 text-purple-500" />
                        ) : isPdf ? (
                            <FileText className="h-4 w-4 text-blue-500" />
                        ) : (
                            <FileText className="h-4 w-4 text-muted-foreground" />
                        )}
                    </div>
                    <div>
                        <div className="font-medium group-hover:text-primary transition-colors">
                            {part.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {part.assets?.length || 0} assets
                        </div>
                    </div>
                </div>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/admin/courses/${courseId}/curriculum/${part.id}`)}
                >
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Button>
            </div>

            {/* Sub-parts */}
            {part.subParts?.map(sub => (
                <div
                    key={sub.id}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/20 hover:bg-muted ml-12 mt-1 cursor-pointer"
                    onClick={() => router.push(`/admin/courses/${courseId}/curriculum/${sub.id}`)}
                >
                    <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{sub.title}</span>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </div>
            ))}
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
        useSensor(PointerSensor),
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

    // ── Drag end for Lectures ──────────────────────────────────────────────────
    const handleLectureDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = lectures.findIndex(l => l.id === active.id);
        const newIndex = lectures.findIndex(l => l.id === over.id);
        const reordered = arrayMove(lectures, oldIndex, newIndex);

        // Optimistic update
        setLectures(reordered);

        // Save to backend
        try {
            await Promise.all(
                reordered.map((lecture, index) =>
                    instructorApi.updateLecture(lecture.id, { title: lecture.title, order: index + 1 })
                )
            );
            toast.success('Lecture order saved');
        } catch {
            toast.error('Failed to save lecture order');
            fetchContent(); // rollback
        }
    };

    const handleCreateLecture = async () => {
        if (!newLectureTitle) return;
        try {
            const nextOrder = lectures.length > 0
                ? Math.max(...lectures.map(s => s.order)) + 1
                : 1;
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
                ? Math.max(...(lecture?.parts || []).map(l => l.order)) + 1
                : 1;
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
                        <Button>
                            <Plus className="mr-2 h-4 w-4" /> {t('addLecture')}
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{t('addLecture')}</DialogTitle>
                        </DialogHeader>
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
                <div className="flex justify-center py-10">
                    <Loader2 className="animate-spin" />
                </div>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleLectureDragEnd}
                >
                    <SortableContext
                        items={lectures.map(l => l.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <Accordion
                            type="multiple"
                            className="w-full space-y-4"
                            defaultValue={lectures.map(s => s.id)}
                        >
                            {lectures.map(lecture => (
                                <SortableLecture
                                    key={lecture.id}
                                    lecture={lecture}
                                    courseId={courseId}
                                    onDelete={handleDeleteLecture}
                                    onAddPart={handleQuickAddPart}
                                    onAddSubPart={handleQuickAddSubPart}
                                />
                            ))}
                        </Accordion>
                    </SortableContext>
                </DndContext>
            )}

            {lectures.length === 0 && !isLoading && (
                <div className="text-center py-10 text-muted-foreground">
                    {t('noLectures')}
                </div>
            )}
        </div>
    );
}