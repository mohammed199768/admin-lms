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

export default function CurriculumPage() {
    const t = useTranslations('admin.curriculum');
    const params = useParams();
    const router = useRouter();
    const courseId = params.courseId as string;
    const [lectures, setLectures] = useState<Lecture[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newLectureTitle, setNewLectureTitle] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const fetchContent = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await instructorApi.getCourseContent(courseId);
            setLectures(data.lectures || []);
        } catch (error) {
            toast.error('Failed to load curriculum');
        } finally {
            setIsLoading(false);
        }
    }, [courseId]);

    useEffect(() => {
        fetchContent();
    }, [fetchContent]);

    const handleCreateLecture = async () => {
        if (!newLectureTitle) return;
        try {
            const nextOrder = lectures.length > 0 ? Math.max(...lectures.map(s => s.order)) + 1 : 1;
            await instructorApi.createLecture(courseId, { title: newLectureTitle, order: nextOrder });
            toast.success(t('addLecture') + ' created');
            setNewLectureTitle('');
            setIsDialogOpen(false);
            fetchContent();
        } catch (error) {
            toast.error('Failed to create lecture');
        }
    };

    const handleDeleteLecture = async (id: string) => {
        if (!confirm("Are you sure?")) return;
        try {
            await instructorApi.deleteLecture(id);
            toast.success(t('deleteLecture'));
            fetchContent();
        } catch (error) {
            toast.error('Failed to delete lecture');
        }
    };

    // Quick Add Part (Just Title, then navigate to edit)
    const handleQuickAddPart = async (lectureId: string) => {
        const title = prompt(t('partTitle') + ":");
        if (!title) return;
        try {
            // Find next order
            const lecture = lectures.find(s => s.id === lectureId);
            const nextOrder = (lecture?.parts?.length || 0) > 0
                ? Math.max(...(lecture?.parts || []).map(l => l.order)) + 1
                : 1;
            await instructorApi.createPart(lectureId, { title, order: nextOrder });
            toast.success(t('addPart'));
            fetchContent();
        } catch (error) {
            toast.error('Failed to create part');
        }
    };

    const handleQuickAddSubPart = async (parentPartId: string, lectureId: string) => {
        const title = prompt("Sub-part title:");
        if (!title) return;
        try {
            const parent = lectures.find(l => l.id === lectureId)?.parts?.find(p => p.id === parentPartId);
            const nextOrder = (parent?.subParts?.length || 0) + 1;
            await instructorApi.createSubPart(parentPartId, { title, order: nextOrder });
            toast.success('Sub-part created');
            fetchContent();
        } catch (error) {
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
                <div className="flex gap-2">
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button><Plus className="mr-2 h-4 w-4" /> {t('addLecture')}</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{t('addLecture')}</DialogTitle>
                            </DialogHeader>
                            <div className="py-4">
                                <Input placeholder={t('lectureTitle')} value={newLectureTitle} onChange={e => setNewLectureTitle(e.target.value)} />
                            </div>
                            <DialogFooter>
                                <Button onClick={handleCreateLecture}>{t('addLecture')}</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {isLoading ? <Loader2 className="animate-spin" /> : (
                <Accordion type="multiple" className="w-full space-y-4" defaultValue={lectures.map(s => s.id)}>
                    {lectures.map(lecture => (
                        <AccordionItem key={lecture.id} value={lecture.id} className="border rounded-lg bg-card px-4">
                            <div className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-2 flex-1">
                                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                                    <AccordionTrigger className="hover:no-underline py-2 font-semibold text-lg">{lecture.title}</AccordionTrigger>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteLecture(lecture.id)}><Trash className="h-4 w-4 text-destructive" /></Button>
                                </div>
                            </div>
                            <AccordionContent className="pt-2 pb-4 space-y-2">
                                {lecture.parts?.map(part => {
                                    const isVideo = part.assets?.some(a => a.type === 'VIDEO');
                                    const isPdf = part.assets?.some(a => a.type === 'PDF' || a.type === 'PPTX');
                                    
                                    return (
                                        <div key={part.id}>
                                            <div
                                                className="flex items-center justify-between p-3 rounded-md bg-muted/40 hover:bg-muted ml-6 transition-colors cursor-pointer group"
                                                onClick={() => router.push(`/admin/courses/${courseId}/curriculum/${part.id}`)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 bg-background rounded-full border`}>
                                                        {isVideo ? <Video className="h-4 w-4 text-purple-500" /> :
                                                            isPdf ? <FileText className="h-4 w-4 text-blue-500" /> :
                                                                <FileText className="h-4 w-4 text-muted-foreground" />}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium group-hover:text-primary transition-colors">{part.title}</div>
                                                        <div className="text-xs text-muted-foreground flex gap-2">
                                                            {part.assets?.length || 0} {t('assets')}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button variant="ghost" size="sm">
                                                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                                    </Button>
                                                </div>
                                            </div>
                                            {part.subParts?.map(sub => (
                                                <div
                                                    key={sub.id}
                                                    className="flex items-center justify-between p-2 rounded-md bg-muted/20 hover:bg-muted ml-12 mt-1 cursor-pointer"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/admin/courses/${courseId}/curriculum/${sub.id}`);
                                                    }}
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
                                })}
                                <div className="flex gap-2 ml-6 mt-2">
                                    <Button variant="outline" size="sm" className="flex-1 border-dashed" onClick={() => handleQuickAddPart(lecture.id)}>
                                        <Plus className="mr-2 h-4 w-4" /> {t('addPart')}
                                    </Button>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            )}
            {lectures.length === 0 && !isLoading && <div className="text-center py-10 text-muted-foreground">{t('noLectures')}</div>}
        </div>
    );
}
