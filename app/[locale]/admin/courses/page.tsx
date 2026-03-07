'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, BookOpen, MoreVertical, Loader2, FolderOpen, ChevronRight, FileIcon, FolderIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Card,
    CardContent,
    CardFooter,
} from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

import { instructorApi, type Course } from '@/lib/api/instructor';
import { catalogApi } from '@/lib/api/catalog';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';

import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { formatPrice } from '@/lib/utils';
import { CatalogCardSkeleton } from '@/components/admin/catalog/CatalogSkeleton';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

type FolderNode = { name: string; type: 'folder' | 'file'; children?: FolderNode[]; file?: File; mimeType?: string };

export default function CoursesPage() {
    const t = useTranslations('admin.courses');
    const tCommon = useTranslations('common');
    const tCatalog = useTranslations('admin.catalog');
    const router = useRouter();
    const params = useParams();
    const locale = params.locale as string;
    const queryClient = useQueryClient();

    const searchParams = useSearchParams();
    const [searchQuery, setSearchQuery] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // Creation Form State
    const [selectedUniId, setSelectedUniId] = useState('');
    const [newCourseTitle, setNewCourseTitle] = useState('');

    // Import Folder State
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
    const [importUniId, setImportUniId] = useState('');
    const [folderStructure, setFolderStructure] = useState<FolderNode | null>(null);
    const [importStep, setImportStep] = useState<'select' | 'preview' | 'importing' | 'done'>('select');
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0, currentFile: '' });
    const [importErrors, setImportErrors] = useState<string[]>([]);

    // Handle URL Params for pre-filling
    useEffect(() => {
        const createParam = searchParams.get('create');
        const uniParam = searchParams.get('universityId');
        if (createParam === 'true') {
            setIsDialogOpen(true);
            if (uniParam) {
                setSelectedUniId(uniParam);
            }
        }
    }, [searchParams]);

    // Queries
    const { data: courses = [], isLoading: isCoursesLoading } = useQuery({
        queryKey: ['my-courses'],
        queryFn: instructorApi.getMyCourses,
    });

    const { data: universities = [] } = useQuery({
        queryKey: ['universities'],
        queryFn: catalogApi.getUniversities,
        staleTime: 10 * 60 * 1000,
    });

    const createMutation = useMutation({
        mutationFn: async () => {
            return instructorApi.createCourse({
                title: newCourseTitle,
                universityId: selectedUniId || undefined,
            });
        },
        onSuccess: () => {
            toast.success(tCommon('create') + ' ' + t('title'));
            setNewCourseTitle('');
            setIsDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ['my-courses'] });
        },
        onError: () => {
            toast.error('Failed to create course');
        }
    });

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCourseTitle || !selectedUniId) return;
        createMutation.mutate();
    };

    const handleUniChange = (val: string) => {
        setSelectedUniId(val);
    };

    const filteredCourses = courses.filter(c =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // ====== IMPORT FOLDER LOGIC ======
    const IGNORED_FILES = ['desktop.ini', '.ds_store', 'thumbs.db', '.gitkeep', '.gitignore'];

    const buildFolderStructure = (files: FileList): FolderNode => {
        const root: FolderNode = { name: '', type: 'folder', children: [] };
        Array.from(files).forEach(file => {
            if (IGNORED_FILES.includes(file.name.toLowerCase())) return;
            if (file.name.startsWith('.')) return;
            const parts = (file as any).webkitRelativePath?.split('/') || [file.name];
            if (parts.length < 2) return;
            root.name = parts[0];

            if (parts.length === 2) {
                root.children!.push({ name: parts[1], type: 'file', file, mimeType: file.type });
                return;
            }

            const lectureName = parts[1];
            let lectureNode = root.children!.find(c => c.name === lectureName && c.type === 'folder');
            if (!lectureNode) { lectureNode = { name: lectureName, type: 'folder', children: [] }; root.children!.push(lectureNode); }

            if (parts.length === 3) {
                lectureNode.children!.push({ name: parts[2], type: 'file', file, mimeType: file.type });
            } else if (parts.length >= 4) {
                const partName = parts[2];
                let partNode = lectureNode.children!.find(c => c.name === partName && c.type === 'folder');
                if (!partNode) { partNode = { name: partName, type: 'folder', children: [] }; lectureNode.children!.push(partNode); }
                partNode.children!.push({ name: parts[parts.length - 1], type: 'file', file, mimeType: file.type });
            }
        });
        // Sort folders alphabetically
        const sortChildren = (node: FolderNode) => {
            if (node.children) {
                node.children.sort((a, b) => { if (a.type !== b.type) return a.type === 'folder' ? -1 : 1; return a.name.localeCompare(b.name); });
                node.children.forEach(sortChildren);
            }
        };
        sortChildren(root);
        return root;
    };

    const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const structure = buildFolderStructure(e.target.files);
        setFolderStructure(structure);
        setImportStep('preview');
    };

    const countFiles = (node: FolderNode): number => {
        if (node.type === 'file') return 1;
        return (node.children || []).reduce((sum, c) => sum + countFiles(c), 0);
    };

    const handleImport = async () => {
        if (!folderStructure || !importUniId) return;
        setImportStep('importing');
        const errors: string[] = [];
        const totalFiles = countFiles(folderStructure);
        let current = 0;
        setImportProgress({ current: 0, total: totalFiles, currentFile: 'Creating course...' });

        try {
            const course = await instructorApi.createCourse({ title: folderStructure.name, universityId: importUniId });

            const lectures = folderStructure.children?.filter(c => c.type === 'folder') || [];
            const rootFiles = folderStructure.children?.filter(c => c.type === 'file') || [];

            // Root files → default lecture + part
            if (rootFiles.length > 0) {
                const lec = await instructorApi.createLecture(course.id, { title: folderStructure.name, order: 0 });
                const part = await instructorApi.createPart(lec.id, { title: folderStructure.name, order: 1 });
                for (const f of rootFiles) {
                    if (!f.file) continue;
                    setImportProgress({ current, total: totalFiles, currentFile: f.name });
                    try { await instructorApi.uploadPdf(part.id, f.file, false); } catch { errors.push(f.name); }
                    current++;
                }
            }

            // Each subfolder → Lecture
            for (let li = 0; li < lectures.length; li++) {
                const lec = lectures[li];
                const lecture = await instructorApi.createLecture(course.id, { title: lec.name, order: li + 1 });

                const directFiles = lec.children?.filter(c => c.type === 'file') || [];
                const subFolders = lec.children?.filter(c => c.type === 'folder') || [];

                // Direct files in lecture → auto Part
                if (directFiles.length > 0) {
                    const autoPart = await instructorApi.createPart(lecture.id, { title: lec.name, order: 1 });
                    for (const f of directFiles) {
                        if (!f.file) continue;
                        setImportProgress({ current, total: totalFiles, currentFile: f.name });
                        try { await instructorApi.uploadPdf(autoPart.id, f.file, false); } catch { errors.push(f.name); }
                        current++;
                    }
                }

                // Subfolders → Parts
                for (let pi = 0; pi < subFolders.length; pi++) {
                    const sf = subFolders[pi];
                    const part = await instructorApi.createPart(lecture.id, { title: sf.name, order: pi + (directFiles.length > 0 ? 2 : 1) });
                    const partFiles = sf.children?.filter(c => c.type === 'file') || [];
                    for (const f of partFiles) {
                        if (!f.file) continue;
                        setImportProgress({ current, total: totalFiles, currentFile: f.name });
                        try { await instructorApi.uploadPdf(part.id, f.file, false); } catch { errors.push(f.name); }
                        current++;
                    }
                }
            }

            setImportProgress({ current: totalFiles, total: totalFiles, currentFile: 'Done!' });
            setImportErrors(errors);
            setImportStep('done');
            queryClient.invalidateQueries({ queryKey: ['my-courses'] });
        } catch {
            toast.error('Import failed');
            setImportStep('preview');
        }
    };

    const renderTree = (node: FolderNode, depth = 0): React.ReactNode => (
        <div key={node.name + depth} style={{ paddingInlineStart: depth * 16 }}>
            <div className="flex items-center gap-2 py-1 text-sm">
                {node.type === 'folder' ? <FolderIcon className="h-4 w-4 text-amber-500" /> : <FileIcon className="h-4 w-4 text-slate-400" />}
                <span className={node.type === 'folder' ? 'font-bold' : 'text-muted-foreground'}>{node.name}</span>
                {node.type === 'folder' && node.children && <span className="text-xs text-muted-foreground">({countFiles(node)} files)</span>}
            </div>
            {node.children?.map((child, i) => renderTree(child, depth + 1))}
        </div>
    );

    return (
        <div className="space-y-6 pb-10 max-w-7xl mx-auto">
            {/* Breadcrumbs */}
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink href={`/${locale}/admin`}>{tCommon('manage')}</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbPage>{t('title')}</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/40 dark:bg-slate-900/40 p-6 rounded-[2rem] border border-white dark:border-white/5 shadow-xl shadow-slate-200/50 dark:shadow-none backdrop-blur-md transition-colors duration-300">
                <div className="space-y-1">
                    <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white leading-tight">{t('title')}</h2>
                    <p className="text-slate-500 dark:text-slate-400 font-medium text-base">{t('subtitle')}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative group w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 rtl:left-auto rtl:right-3 group-focus-within:text-primary transition-colors" />
                        <Input
                            placeholder={tCommon('search')}
                            className="ps-10 rtl:pe-10 bg-white/80 dark:bg-white/5 border-slate-200 dark:border-white/10 focus:bg-white dark:focus:bg-white/10 transition-all rounded-xl h-11 shadow-sm text-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="rounded-xl shadow-lg shadow-primary/20 px-6 font-bold h-11 text-base hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-95">
                                <Plus className="me-2 h-5 w-5" /> {t('create')}
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px] rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden bg-white dark:bg-slate-950">
                            <div className="bg-primary p-8 text-white relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
                                <DialogTitle className="text-3xl font-black relative z-10">{t('createTitle')}</DialogTitle>
                                <DialogDescription className="text-primary-foreground/90 mt-2 font-bold text-base relative z-10">
                                    {t('createDesc')}
                                </DialogDescription>
                            </div>
                            <div className="p-8">
                                <form onSubmit={handleCreate} className="space-y-5">
                                    <div className="grid gap-5">
                                        <div className="space-y-2">
                                            <Label className="text-slate-900 dark:text-slate-200 font-bold text-xs uppercase tracking-widest">{tCatalog('selectUniversity')}</Label>
                                            <Select onValueChange={handleUniChange} value={selectedUniId}>
                                                <SelectTrigger className="rounded-xl h-12 border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-base font-medium">
                                                    <SelectValue placeholder={tCatalog('selectUniversity')} />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl border-none shadow-2xl">
                                                    {universities.map(u => <SelectItem key={u.id} value={u.id} className="rounded-lg">{u.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="title" className="text-slate-900 dark:text-slate-200 font-bold text-xs uppercase tracking-widest">{t('courseTitle')}</Label>
                                            <Input
                                                id="title"
                                                value={newCourseTitle}
                                                onChange={(e) => setNewCourseTitle(e.target.value)}
                                                placeholder="e.g. Advanced Calculus"
                                                required
                                                className="rounded-xl h-12 border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-base font-medium"
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter className="pt-4">
                                        <Button type="submit" disabled={createMutation.isPending} className="w-full rounded-xl font-black h-14 text-lg shadow-xl shadow-primary/10 transition-all hover:scale-[1.02]">
                                            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            {tCommon('create')}
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </div>
                        </DialogContent>
                    </Dialog>

                    {/* Import Folder Button */}
                    <Button
                        variant="outline"
                        className="rounded-xl h-11 px-5 font-bold border-dashed border-2"
                        onClick={() => { setImportStep('select'); setFolderStructure(null); setImportUniId(''); setImportErrors([]); setIsImportDialogOpen(true); }}
                    >
                        <FolderOpen className="me-2 h-5 w-5" /> Import Folder
                    </Button>

                    {/* Import Dialog */}
                    <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                        <DialogContent className="sm:max-w-[550px] rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden bg-white dark:bg-slate-950">
                            <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-8 text-white relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
                                <DialogTitle className="text-3xl font-black relative z-10">📁 Import Course from Folder</DialogTitle>
                                <DialogDescription className="text-white/90 mt-2 font-bold text-base relative z-10">
                                    هيكل المجلد يصير كورس كامل تلقائياً
                                </DialogDescription>
                            </div>

                            {importStep === 'select' && (
                                <div className="p-8 space-y-5">
                                    <div className="space-y-2">
                                        <Label className="text-slate-900 dark:text-slate-200 font-bold text-xs uppercase tracking-widest">University</Label>
                                        <Select onValueChange={setImportUniId} value={importUniId}>
                                            <SelectTrigger className="rounded-xl h-12 border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5"><SelectValue placeholder="Select university" /></SelectTrigger>
                                            <SelectContent className="rounded-xl border-none shadow-2xl">
                                                {universities.map(u => <SelectItem key={u.id} value={u.id} className="rounded-lg">{u.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <label className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-2xl cursor-pointer hover:bg-muted/30 transition-all ${!importUniId ? 'opacity-40 pointer-events-none' : 'hover:border-primary'}`}>
                                        <FolderOpen className="h-10 w-10 text-primary mb-2" />
                                        <span className="font-black text-lg">Click to select folder</span>
                                        <span className="text-xs text-muted-foreground mt-1">المجلد الرئيسي = اسم الكورس</span>
                                        <input type="file" className="hidden" {...{ webkitdirectory: '', directory: '' } as any} onChange={handleFolderSelect} disabled={!importUniId} />
                                    </label>
                                    <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-xl space-y-1">
                                        <p className="font-bold">📂 الهيكل المتوقع:</p>
                                        <p>📁 CourseName/ → كورس</p>
                                        <p>&nbsp;&nbsp;📁 Lecture1/ → محاضرة</p>
                                        <p>&nbsp;&nbsp;&nbsp;&nbsp;📁 Part1/ → جزء</p>
                                        <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;📄 file.pdf → ملف</p>
                                    </div>
                                </div>
                            )}

                            {importStep === 'preview' && folderStructure && (
                                <div className="p-6 space-y-4">
                                    <div className="flex items-center gap-3">
                                        <FolderIcon className="h-6 w-6 text-amber-500" />
                                        <div>
                                            <p className="font-black text-lg">{folderStructure.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {folderStructure.children?.filter(c => c.type === 'folder').length || 0} lectures · {countFiles(folderStructure)} files
                                            </p>
                                        </div>
                                    </div>
                                    <ScrollArea className="h-[300px] border rounded-xl p-3">
                                        {folderStructure.children?.map((child, i) => renderTree(child, 0))}
                                    </ScrollArea>
                                    <div className="flex gap-3">
                                        <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setImportStep('select')}>Back</Button>
                                        <Button className="flex-1 rounded-xl font-black" onClick={handleImport}>
                                            <ChevronRight className="mr-2 h-4 w-4" /> Start Import
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {importStep === 'importing' && (
                                <div className="p-8 space-y-5">
                                    <div className="text-center">
                                        <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-3" />
                                        <p className="font-black text-lg">Importing...</p>
                                        <p className="text-sm text-muted-foreground mt-1 truncate max-w-[400px] mx-auto">{importProgress.currentFile}</p>
                                    </div>
                                    <Progress value={importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0} />
                                    <p className="text-center text-sm font-bold text-muted-foreground">{importProgress.current} / {importProgress.total}</p>
                                </div>
                            )}

                            {importStep === 'done' && (
                                <div className="p-8 text-center space-y-4">
                                    <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
                                    <p className="font-black text-2xl">Import Complete! 🎉</p>
                                    <p className="text-muted-foreground">{importProgress.total} files uploaded</p>
                                    {importErrors.length > 0 && (
                                        <div className="text-left bg-destructive/10 rounded-xl p-3 max-h-32 overflow-auto">
                                            <p className="font-bold text-xs text-destructive mb-1"><AlertCircle className="inline h-3 w-3 mr-1" />{importErrors.length} errors:</p>
                                            {importErrors.map((e, i) => <p key={i} className="text-xs text-destructive">{e}</p>)}
                                        </div>
                                    )}
                                    <Button onClick={() => setIsImportDialogOpen(false)} className="w-full rounded-xl font-black h-12">Done</Button>
                                </div>
                            )}
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Course Grid */}
            {isCoursesLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => <CatalogCardSkeleton key={i} />)}
                </div>
            ) : filteredCourses.length === 0 ? (
                <div className="col-span-full py-20 text-center bg-white/40 dark:bg-slate-900/40 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-white/5 backdrop-blur-sm">
                    <div className="bg-primary/5 w-20 h-20 rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 transform rotate-12">
                        <BookOpen className="h-10 w-10 text-primary" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">{t('noCourses')}</h3>
                    <p className="text-slate-500 dark:text-slate-400 max-w-xs mx-auto text-base font-medium">{t('startCreating')}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredCourses.map((course) => (
                        <Card key={course.id} className="group overflow-hidden border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 rounded-2xl flex flex-col h-full">
                            {/* Thumbnail Area */}
                            <div className="aspect-video relative overflow-hidden bg-gradient-to-br from-indigo-700 via-primary to-cyan-600 p-4">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.25),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.18),transparent_35%)]" />
                                <div className="relative flex h-full items-center justify-center text-center">
                                    <span className="text-white text-lg font-black leading-tight line-clamp-3 drop-shadow-sm">
                                        {course.title}
                                    </span>
                                </div>

                                <div className="absolute top-2 right-2 flex gap-1">
                                    <Badge
                                        className={`font-bold uppercase text-[9px] tracking-widest shadow-sm backdrop-blur-md border hover:bg-white/90 ${course.isPublished
                                            ? "bg-emerald-500 text-white border-emerald-400"
                                            : "bg-amber-500 text-white border-amber-400"
                                            }`}
                                    >
                                        {course.isPublished ? t('published') : t('draft')}
                                    </Badge>
                                </div>
                            </div>

                            {/* Content Area */}
                            <CardContent className="p-4 flex-1 flex flex-col gap-2">
                                <div className="space-y-1">
                                    <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider flex items-center gap-1">
                                        <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm">{course.university?.name || "Unknown Uni"}</span>
                                    </div>
                                    <h3 className="text-base font-black tracking-tight text-slate-900 dark:text-white line-clamp-1 group-hover:text-primary transition-colors">
                                        {course.title}
                                    </h3>
                                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                                        {course.description || "No description provided."}
                                    </p>
                                </div>
                                <div className="mt-auto pt-2 flex items-center justify-between">
                                    <Badge variant="outline" className="border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-300 font-bold text-xs px-2 py-0.5">
                                        {course.price > 0 ? formatPrice(course.price) : "Free"}
                                    </Badge>
                                </div>
                            </CardContent>

                            {/* Footer Action */}
                            <CardFooter className="p-0 border-t border-slate-100 dark:border-white/5">
                                <Button
                                    variant="ghost"
                                    className="w-full h-10 rounded-none rounded-b-2xl font-bold text-xs uppercase tracking-widest text-primary hover:text-primary hover:bg-primary/5 transition-colors"
                                    onClick={() => router.push(`/${locale}/admin/courses/${course.id}`)}
                                >
                                    <MoreVertical className="mr-2 h-3.5 w-3.5" /> {t('manage')}
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
