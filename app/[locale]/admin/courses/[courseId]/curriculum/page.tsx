'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { instructorApi, type Lecture, type Part, type PartAsset } from '@/lib/api/instructor';
import { toast } from 'sonner';
import { Loader2, Plus, GripVertical, FileText, Trash, ArrowRight, ArrowRightLeft, Video, Pencil, ChevronUp, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
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

type SelectedNodeType = 'lecture' | 'lecture-assets' | 'part' | 'sub-part' | 'asset';

type SelectedNode = {
    id: string;
    type: SelectedNodeType;
    title: string;
    location?: string;
};

const selectedNodeLabels: Record<SelectedNodeType, string> = {
    lecture: 'Lecture',
    'lecture-assets': 'Folder',
    part: 'Part',
    'sub-part': 'Sub-part',
    asset: 'Asset',
};

function findPartSelection(parts: Part[], nodeId: string, path: string[] = []): SelectedNode | null {
    for (const part of parts) {
        const nextPath = [...path, part.title];
        const partType: SelectedNodeType = path.length === 0 ? 'part' : 'sub-part';

        if (part.id === nodeId) {
            return {
                id: part.id,
                type: partType,
                title: part.title,
                location: path.length > 0 ? path.join(' / ') : undefined,
            };
        }

        const asset = part.assets?.find((item) => item.id === nodeId);
        if (asset) {
            return {
                id: asset.id,
                type: 'asset',
                title: asset.title,
                location: nextPath.join(' / '),
            };
        }

        const nestedSelection = findPartSelection(part.subParts || [], nodeId, nextPath);
        if (nestedSelection) return nestedSelection;
    }

    return null;
}

function findSelectedNodeInLectures(lectures: Lecture[], nodeId: string): SelectedNode | null {
    for (const lecture of lectures) {
        if (lecture.id === nodeId) {
            return { id: lecture.id, type: 'lecture', title: lecture.title };
        }

        if (nodeId === `lecture-assets:${lecture.id}`) {
            return {
                id: nodeId,
                type: 'lecture-assets',
                title: 'Lecture Assets',
                location: lecture.title,
            };
        }

        const lectureAsset = lecture.assets?.find((asset) => asset.id === nodeId);
        if (lectureAsset) {
            return {
                id: lectureAsset.id,
                type: 'asset',
                title: lectureAsset.title,
                location: `${lecture.title} / Lecture Assets`,
            };
        }

        const partSelection = findPartSelection(lecture.parts || [], nodeId);
        if (partSelection) {
            return {
                ...partSelection,
                location: partSelection.location ? `${lecture.title} / ${partSelection.location}` : lecture.title,
            };
        }
    }

    return null;
}

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

function MovePartDialog({
    open,
    onOpenChange,
    lectures,
    currentLectureId,
    onMove,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    lectures: Lecture[];
    currentLectureId: string;
    onMove: (targetLectureId: string) => Promise<void>;
}) {
    const [targetLectureId, setTargetLectureId] = useState('');
    const [saving, setSaving] = useState(false);

    const availableLectures = lectures.filter((lecture) => lecture.id !== currentLectureId);

    useEffect(() => {
        if (!open) return;
        setTargetLectureId(availableLectures[0]?.id || '');
    }, [open, currentLectureId, lectures]);

    const handleMove = async () => {
        if (!targetLectureId) return;
        setSaving(true);
        try {
            await onMove(targetLectureId);
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Move Part</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    {availableLectures.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No other lectures available in this course.</p>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                            <div className="rounded-lg border">
                                <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Target lecture
                                </div>
                                <ScrollArea className="h-72">
                                    <div className="p-2">
                                        {availableLectures.map((lecture) => {
                                            const isActive = targetLectureId === lecture.id;
                                            return (
                                                <button
                                                    key={lecture.id}
                                                    type="button"
                                                    onClick={() => setTargetLectureId(lecture.id)}
                                                    className={`mb-2 w-full rounded-md border px-3 py-2 text-left transition-colors ${isActive
                                                        ? 'border-primary bg-primary/10 text-foreground'
                                                        : 'border-transparent hover:bg-muted'
                                                        }`}
                                                >
                                                    <div className="truncate text-sm font-medium">{lecture.title}</div>
                                                    <div className="text-xs text-muted-foreground">{lecture.parts.length} parts</div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            </div>

                            <div className="rounded-lg border bg-muted/20 p-4">
                                <div className="mb-2 text-sm font-medium">
                                    {availableLectures.find((lecture) => lecture.id === targetLectureId)?.title || 'Select lecture'}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    Move this part directly into the selected lecture.
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleMove} disabled={saving || !targetLectureId}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Move'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function AssetNode({
    asset,
    level = 0,
    selectedNode,
    onSelect,
    location,
}: {
    asset: PartAsset;
    level?: number;
    selectedNode: SelectedNode | null;
    onSelect: (node: SelectedNode) => void;
    location?: string;
}) {
    const icon = asset.type === 'VIDEO'
        ? <Video className="h-3.5 w-3.5 text-purple-500" />
        : <FileText className="h-3.5 w-3.5 text-blue-500" />;
    const isSelected = selectedNode?.id === asset.id;

    return (
        <div
            className={`mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm shadow-sm transition-colors ${isSelected
                ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                : 'bg-background/70 hover:bg-muted/70'
                }`}
            style={{ marginLeft: `${12 + level * 24}px` }}
            onClick={() => onSelect({ id: asset.id, type: 'asset', title: asset.title, location })}
        >
            <div className="shrink-0">{icon}</div>
            <span className="truncate font-medium">{asset.title}</span>
            <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground">{asset.type}</span>
        </div>
    );
}

function NestedPartNode({
    part,
    courseId,
    level = 0,
    selectedNode,
    onSelect,
    parentPath = [],
}: {
    part: Part;
    courseId: string;
    level?: number;
    selectedNode: SelectedNode | null;
    onSelect: (node: SelectedNode) => void;
    parentPath?: string[];
}) {
    const router = useRouter();
    const [expanded, setExpanded] = useState(false);
    const isSelected = selectedNode?.id === part.id;
    const partPath = [...parentPath, part.title];

    return (
        <div className="mt-1">
            <div
                className={`flex items-center justify-between rounded-md border px-3 py-2 transition-colors ${isSelected
                    ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
                    : 'bg-muted/30 hover:bg-muted'
                    }`}
                style={{ marginLeft: `${48 + level * 24}px` }}
                onClick={() => onSelect({
                    id: part.id,
                    type: 'sub-part',
                    title: part.title,
                    location: parentPath.join(' / ') || undefined,
                })}
            >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpanded((value) => !value);
                        }}
                    >
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                    <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{part.title}</div>
                        <div className="text-xs text-muted-foreground">{part.assets?.length || 0} assets</div>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/admin/courses/${courseId}/curriculum/${part.id}`);
                    }}
                >
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Button>
            </div>

            {expanded && (
                <div
                    className="ml-16 mt-1 border-l border-dashed border-muted-foreground/30 pl-3"
                    style={{ marginLeft: `${64 + level * 24}px` }}
                >
                    {part.assets?.map((asset) => (
                        <AssetNode
                            key={asset.id}
                            asset={asset}
                            level={level + 1}
                            selectedNode={selectedNode}
                            onSelect={onSelect}
                            location={partPath.join(' / ')}
                        />
                    ))}

                    {part.subParts?.map((subPart) => (
                        <NestedPartNode
                            key={subPart.id}
                            part={subPart}
                            courseId={courseId}
                            level={level + 1}
                            selectedNode={selectedNode}
                            onSelect={onSelect}
                            parentPath={partPath}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function LectureAssetFolder({
    lecture,
    onOpen,
    selectedNode,
    onSelect,
}: {
    lecture: Lecture;
    onOpen: (lecture: Lecture) => Promise<void>;
    selectedNode: SelectedNode | null;
    onSelect: (node: SelectedNode) => void;
}) {
    const [expanded, setExpanded] = useState(true);
    const folderId = `lecture-assets:${lecture.id}`;
    const isSelected = selectedNode?.id === folderId;

    return (
        <div className="mt-1">
            <div
                className={`ml-6 flex items-center justify-between rounded-md border px-3 py-2 transition-colors ${isSelected
                    ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
                    : 'bg-amber-50/40 hover:bg-amber-100/50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30'
                    }`}
                onClick={() => onSelect({ id: folderId, type: 'lecture-assets', title: 'Lecture Assets', location: lecture.title })}
            >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpanded((value) => !value);
                        }}
                    >
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                    <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium">Lecture Assets</div>
                        <div className="text-xs text-muted-foreground">{lecture.assets?.length || 0} assets</div>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation();
                        void onOpen(lecture);
                    }}
                >
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Button>
            </div>

            {expanded && (
                <div className="ml-12 mt-1 border-l border-dashed border-amber-500/40 pl-3">
                    {lecture.assets?.map((asset) => (
                        <AssetNode
                            key={asset.id}
                            asset={asset}
                            level={1}
                            selectedNode={selectedNode}
                            onSelect={onSelect}
                            location={`${lecture.title} / Lecture Assets`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Sortable Lecture Item ────────────────────────────────────────────────────

function SortableLecture({
    lecture,
    lectures,
    courseId,
    selectedNode,
    onSelect,
    onDelete,
    onOpenLectureAssets,
    onAddPart,
    onAddSubPart,
    onRename,
    onDeletePart,
    onMovePart,
    onMoveUp,
    onMoveDown,
    isFirst,
    isLast,
}: {
    lecture: Lecture;
    lectures: Lecture[];
    courseId: string;
    selectedNode: SelectedNode | null;
    onSelect: (node: SelectedNode) => void;
    onDelete: (id: string) => void;
    onOpenLectureAssets: (lecture: Lecture) => Promise<void>;
    onAddPart: (lectureId: string) => void;
    onAddSubPart: (parentPartId: string, lectureId: string) => void;
    onRename: (id: string, title: string) => Promise<void>;
    onDeletePart: (partId: string) => Promise<void>;
    onMovePart: (partId: string, targetLectureId: string) => Promise<void>;
    onMoveUp: () => void;
    onMoveDown: () => void;
    isFirst: boolean;
    isLast: boolean;
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
            <AccordionItem
                value={lecture.id}
                className={`border rounded-lg bg-card px-4 transition-colors ${selectedNode?.id === lecture.id
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : ''
                    }`}
            >
                <div
                    className="flex items-center justify-between py-2"
                    onClick={() => onSelect({ id: lecture.id, type: 'lecture', title: lecture.title })}
                >
                    <div className="flex items-center gap-1 flex-1">
                        {/* Drag handle — hidden on mobile */}
                        <div
                            {...attributes}
                            {...listeners}
                            className="hidden sm:flex cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted shrink-0"
                            onClick={e => e.stopPropagation()}
                        >
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                        </div>
                        {/* Up/Down buttons */}
                        <div className="flex flex-col gap-0.5 shrink-0">
                            <Button variant="ghost" size="icon" className="h-5 w-5" disabled={isFirst}
                                onClick={e => { e.stopPropagation(); onMoveUp(); }}>
                                <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-5 w-5" disabled={isLast}
                                onClick={e => { e.stopPropagation(); onMoveDown(); }}>
                                <ChevronDown className="h-3 w-3" />
                            </Button>
                        </div>
                        <AccordionTrigger className="hover:no-underline py-2 font-semibold text-lg">
                            {lecture.title}
                        </AccordionTrigger>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={async (e) => {
                                e.stopPropagation();
                                await onOpenLectureAssets(lecture);
                            }}
                        >
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="ml-1 text-xs">{lecture.assets?.length || 0}</span>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setRenameOpen(true); }}>
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(lecture.id);
                            }}
                        >
                            <Trash className="h-4 w-4 text-destructive" />
                        </Button>
                    </div>
                </div>

                <AccordionContent className="pt-2 pb-4 space-y-2">
                    <LectureAssetFolder
                        lecture={lecture}
                        onOpen={onOpenLectureAssets}
                        selectedNode={selectedNode}
                        onSelect={onSelect}
                    />
                    <SortablePartsList
                        lecture={lecture}
                        lectures={lectures}
                        courseId={courseId}
                        selectedNode={selectedNode}
                        onSelect={onSelect}
                        onAddSubPart={onAddSubPart}
                        onRenamePart={onRename}
                        onDeletePart={onDeletePart}
                        onMovePart={onMovePart}
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
    lectures,
    courseId,
    selectedNode,
    onSelect,
    onAddSubPart,
    onRenamePart,
    onDeletePart,
    onMovePart,
}: {
    lecture: Lecture;
    lectures: Lecture[];
    courseId: string;
    selectedNode: SelectedNode | null;
    onSelect: (node: SelectedNode) => void;
    onAddSubPart: (parentPartId: string, lectureId: string) => void;
    onRenamePart: (id: string, title: string) => Promise<void>;
    onDeletePart: (partId: string) => Promise<void>;
    onMovePart: (partId: string, targetLectureId: string) => Promise<void>;
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

    const savePartOrder = async (reordered: typeof parts, fallback: typeof parts) => {
        try {
            for (let i = 0; i < reordered.length; i++)
                await instructorApi.updatePart(reordered[i].id, { title: reordered[i].title, order: 1000 + i });
            for (let i = 0; i < reordered.length; i++)
                await instructorApi.updatePart(reordered[i].id, { title: reordered[i].title, order: i + 1 });
            toast.success('Part order saved ✓');
        } catch {
            toast.error('Failed to save part order');
            setParts(fallback);
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = parts.findIndex(p => p.id === active.id);
        const newIndex = parts.findIndex(p => p.id === over.id);
        const reordered = arrayMove(parts, oldIndex, newIndex);
        setParts(reordered);
        await savePartOrder(reordered, parts);
    };

    const handleMovePart = async (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= parts.length) return;
        const reordered = arrayMove([...parts], index, newIndex);
        setParts(reordered);
        await savePartOrder(reordered, parts);
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={parts.map(p => p.id)} strategy={verticalListSortingStrategy}>
                {parts.map((part, index) => (
                    <SortablePart
                        key={part.id}
                        part={part}
                        lectureId={lecture.id}
                        lectures={lectures}
                        courseId={courseId}
                        selectedNode={selectedNode}
                        onSelect={onSelect}
                        onAddSubPart={onAddSubPart}
                        onRename={onRenamePart}
                        onDelete={onDeletePart}
                        onMove={onMovePart}
                        onLocalRename={(id, newTitle) => {
                            setParts(prev => prev.map(p => p.id === id ? { ...p, title: newTitle } : p));
                        }}
                        onMoveUp={() => handleMovePart(index, 'up')}
                        onMoveDown={() => handleMovePart(index, 'down')}
                        isFirst={index === 0}
                        isLast={index === parts.length - 1}
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
    lectures,
    courseId,
    selectedNode,
    onSelect,
    onAddSubPart,
    onRename,
    onDelete,
    onMove,
    onLocalRename,
    onMoveUp,
    onMoveDown,
    isFirst,
    isLast,
}: {
    part: Lecture['parts'][0];
    lectureId: string;
    lectures: Lecture[];
    courseId: string;
    selectedNode: SelectedNode | null;
    onSelect: (node: SelectedNode) => void;
    onAddSubPart: (parentPartId: string, lectureId: string) => void;
    onRename: (id: string, title: string) => Promise<void>;
    onDelete: (partId: string) => Promise<void>;
    onMove: (partId: string, targetLectureId: string) => Promise<void>;
    onLocalRename: (id: string, title: string) => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    isFirst: boolean;
    isLast: boolean;
}) {
    const router = useRouter();
    const [renameOpen, setRenameOpen] = useState(false);
    const [moveOpen, setMoveOpen] = useState(false);
    const [subRenameId, setSubRenameId] = useState<string | null>(null);
    const [subRenameTitle, setSubRenameTitle] = useState('');
    const [expanded, setExpanded] = useState(false);
    const isSelected = selectedNode?.id === part.id;

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
            <div
                className={`flex items-center gap-1 rounded-md border px-3 py-2 ml-6 transition-colors group ${isSelected
                    ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
                    : 'bg-muted/30 hover:bg-muted'
                    }`}
                onClick={() => onSelect({ id: part.id, type: 'part', title: part.title })}
            >
                {/* Drag handle — hidden on mobile */}
                <div
                    {...attributes}
                    {...listeners}
                    className="hidden sm:flex cursor-grab active:cursor-grabbing p-1 rounded hover:bg-background mr-1 shrink-0"
                    onClick={e => e.stopPropagation()}
                >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>

                {/* Up/Down buttons */}
                <div className="flex flex-col gap-0.5 shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        disabled={isFirst}
                        onClick={(e) => {
                            e.stopPropagation();
                            onMoveUp();
                        }}
                    >
                        <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        disabled={isLast}
                        onClick={(e) => {
                            e.stopPropagation();
                            onMoveDown();
                        }}
                    >
                        <ChevronDown className="h-3 w-3" />
                    </Button>
                </div>

                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpanded((value) => !value);
                        }}
                    >
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                    <div className="p-2 bg-background rounded-full border shrink-0">
                        {isVideo ? <Video className="h-4 w-4 text-purple-500" /> :
                            isPdf ? <FileText className="h-4 w-4 text-blue-500" /> :
                                <FileText className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0">
                        <div className="font-medium group-hover:text-primary transition-colors truncate">{part.title}</div>
                        <div className="text-xs text-muted-foreground">{part.assets?.length || 0} assets</div>
                    </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setRenameOpen(true); }}>
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setMoveOpen(true); }}>
                        <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={async (e) => {
                            e.stopPropagation();
                            await onDelete(part.id);
                        }}
                    >
                        <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/admin/courses/${courseId}/curriculum/${part.id}`);
                        }}
                    >
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Button>
                </div>
            </div>

            {expanded && (
                <div className="ml-12 mt-1 border-l border-dashed border-muted-foreground/30 pl-3">
                    {part.assets?.map((asset) => (
                        <AssetNode
                            key={asset.id}
                            asset={asset}
                            selectedNode={selectedNode}
                            onSelect={onSelect}
                            location={part.title}
                        />
                    ))}

                    {part.subParts?.map(sub => (
                        <div key={sub.id}>
                            <div
                                className={`mt-1 flex items-center justify-between rounded-md border px-2 py-2 transition-colors ${selectedNode?.id === sub.id
                                    ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
                                    : 'bg-muted/20 hover:bg-muted'
                                    }`}
                                onClick={() => onSelect({ id: sub.id, type: 'sub-part', title: sub.title, location: part.title })}
                            >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <FolderOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                    <span className="text-sm truncate">{sub.title}</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <Button
                                        variant="ghost" size="icon"
                                        className="h-6 w-6"
                                        onClick={e => { e.stopPropagation(); setSubRenameId(sub.id); setSubRenameTitle(sub.title); }}
                                    >
                                        <Pencil className="h-3 w-3 text-muted-foreground" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(`/admin/courses/${courseId}/curriculum/${sub.id}`);
                                        }}
                                    >
                                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                    </Button>
                                </div>
                            </div>

                            <div className="ml-8 mt-1 border-l border-dashed border-muted-foreground/30 pl-3">
                                {sub.assets?.map((asset) => (
                                    <AssetNode
                                        key={asset.id}
                                        asset={asset}
                                        level={1}
                                        selectedNode={selectedNode}
                                        onSelect={onSelect}
                                        location={`${part.title} / ${sub.title}`}
                                    />
                                ))}

                                {sub.subParts?.map((nestedSubPart) => (
                                    <NestedPartNode
                                        key={nestedSubPart.id}
                                        part={nestedSubPart}
                                        courseId={courseId}
                                        level={1}
                                        selectedNode={selectedNode}
                                        onSelect={onSelect}
                                        parentPath={[part.title, sub.title]}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Rename Part Dialog */}
            <RenameDialog
                open={renameOpen}
                onOpenChange={setRenameOpen}
                currentTitle={part.title}
                label="Part"
                onSave={async (newTitle) => {
                    await onRename(part.id, newTitle);
                    onLocalRename(part.id, newTitle);
                    if (selectedNode?.id === part.id) {
                        onSelect({ ...selectedNode, title: newTitle });
                    }
                    toast.success('Part renamed ✓');
                }}
            />

            <MovePartDialog
                open={moveOpen}
                onOpenChange={setMoveOpen}
                lectures={lectures}
                currentLectureId={lectureId}
                onMove={async (targetLectureId) => {
                    await onMove(part.id, targetLectureId);
                    toast.success('Part moved');
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
                    if (selectedNode?.id === subRenameId) {
                        onSelect({ ...selectedNode, title: newTitle });
                    }
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
    const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);

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

    useEffect(() => {
        setSelectedNode((current) => {
            if (!current) return current;
            return findSelectedNodeInLectures(lectures, current.id);
        });
    }, [lectures]);

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

    // ── Drag end for Lectures ──────────────────────────────────────────────────
    const saveLectureOrder = async (reordered: typeof lectures, fallback: typeof lectures) => {
        try {
            for (let i = 0; i < reordered.length; i++)
                await instructorApi.updateLecture(reordered[i].id, { title: reordered[i].title, order: 1000 + i });
            for (let i = 0; i < reordered.length; i++)
                await instructorApi.updateLecture(reordered[i].id, { title: reordered[i].title, order: i + 1 });
            toast.success('Lecture order saved ✓');
        } catch {
            toast.error('Failed to save lecture order');
            setLectures(fallback);
        }
    };

    const handleLectureDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = lectures.findIndex(l => l.id === active.id);
        const newIndex = lectures.findIndex(l => l.id === over.id);
        const reordered = arrayMove(lectures, oldIndex, newIndex);
        setLectures(reordered);
        await saveLectureOrder(reordered, lectures);
    };

    const handleMoveLecture = async (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= lectures.length) return;
        const reordered = arrayMove([...lectures], index, newIndex);
        setLectures(reordered);
        await saveLectureOrder(reordered, lectures);
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

    const handleDeletePart = useCallback(async (partId: string) => {
        if (!confirm('Delete this part?')) return;
        try {
            await instructorApi.deletePart(partId);
            toast.success('Part deleted');
            await fetchContent();
        } catch {
            toast.error('Failed to delete part');
        }
    }, [fetchContent]);

    const handleOpenLectureAssets = useCallback(async (lecture: Lecture) => {
        try {
            const containerPartId = lecture.assetContainerPartId
                ? lecture.assetContainerPartId
                : (await instructorApi.ensureLectureAssetContainer(lecture.id)).id;
            router.push(`/admin/courses/${courseId}/curriculum/${containerPartId}`);
        } catch {
            toast.error('Failed to open lecture assets');
        }
    }, [courseId, router]);

    const handleMovePart = useCallback(async (partId: string, targetLectureId: string) => {
        const sourceLecture = lectures.find((lecture) => lecture.parts?.some((part) => part.id === partId));
        const movingPart = sourceLecture?.parts?.find((part) => part.id === partId);
        const targetLecture = lectures.find((lecture) => lecture.id === targetLectureId);

        if (!movingPart || !targetLecture) {
            toast.error('Target lecture not found');
            return;
        }

        try {
            await instructorApi.updatePart(partId, { title: movingPart.title, lectureId: targetLectureId });
            await fetchContent();
        } catch {
            toast.error('Failed to move part');
            throw new Error('move-part-failed');
        }
    }, [fetchContent, lectures]);

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

            {selectedNode && (
                <div className="rounded-xl border bg-muted/30 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Selected item
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                        <span className="rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            {selectedNodeLabels[selectedNode.type]}
                        </span>
                        <span className="truncate text-sm font-semibold">{selectedNode.title}</span>
                    </div>
                    {selectedNode.location && (
                        <div className="mt-1 truncate text-xs text-muted-foreground">{selectedNode.location}</div>
                    )}
                </div>
            )}

            {isLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleLectureDragEnd}>
                    <SortableContext items={lectures.map(l => l.id)} strategy={verticalListSortingStrategy}>
                        <Accordion type="multiple" className="w-full space-y-4" defaultValue={lectures.map(s => s.id)}>
                            {lectures.map((lecture, index) => (
                                <SortableLecture
                                    key={lecture.id}
                                    lecture={lecture}
                                    lectures={lectures}
                                    courseId={courseId}
                                    selectedNode={selectedNode}
                                    onSelect={setSelectedNode}
                                    onDelete={handleDeleteLecture}
                                    onOpenLectureAssets={handleOpenLectureAssets}
                                    onAddPart={handleQuickAddPart}
                                    onAddSubPart={handleQuickAddSubPart}
                                    onRename={handleRename}
                                    onDeletePart={handleDeletePart}
                                    onMovePart={handleMovePart}
                                    onMoveUp={() => handleMoveLecture(index, 'up')}
                                    onMoveDown={() => handleMoveLecture(index, 'down')}
                                    isFirst={index === 0}
                                    isLast={index === lectures.length - 1}
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
