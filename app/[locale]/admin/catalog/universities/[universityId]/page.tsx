'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, GraduationCap, Search, BookOpen, ArrowLeft, Loader2 } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { catalogApi } from '@/lib/api/catalog';
import { instructorApi } from '@/lib/api/instructor';
import { formatPrice } from '@/lib/utils';
import { toast } from 'sonner';
import { CatalogCard } from '@/components/admin/catalog/CatalogCard';
import { CatalogCardSkeleton } from '@/components/admin/catalog/CatalogSkeleton';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const majorSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
});

type MajorFormValues = z.infer<typeof majorSchema>;

export default function UniversityDetailPage() {
    const t = useTranslations('admin.catalog');
    const tCommon = useTranslations('common');
    const router = useRouter();
    const params = useParams();
    const locale = params.locale as string;
    const universityId = params.universityId as string;
    const queryClient = useQueryClient();

    const [searchQuery, setSearchQuery] = useState('');
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newCourseTitle, setNewCourseTitle] = useState('');

    const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
    const [newUniversityName, setNewUniversityName] = useState('');

    const { data: university, isLoading: isUniLoading } = useQuery({
        queryKey: ['university', universityId],
        queryFn: () => catalogApi.getUniversity(universityId),
    });

    const { data: courses = [], isLoading: isCoursesLoading } = useQuery({
        queryKey: ['courses', 'university', universityId],
        queryFn: () => catalogApi.getUniversityCourses(universityId),
    });

    const isLoading = isUniLoading || isCoursesLoading;

    // Course creation mutation
    const createCourseMutation = useMutation({
        mutationFn: async () => {
            return instructorApi.createCourse({
                title: newCourseTitle,
                universityId: universityId,
            });
        },
        onSuccess: () => {
            toast.success('Course created successfully');
            setNewCourseTitle('');
            setIsCreateDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ['courses', 'university', universityId] });
        },
        onError: () => {
            toast.error('Failed to create course');
        }
    });

    const handleCreateCourse = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCourseTitle.trim()) return;
        createCourseMutation.mutate();
    };

    const renameUniversityMutation = useMutation({
        mutationFn: async () => {
            return catalogApi.updateUniversity(universityId, {
                name: newUniversityName,
            });
        },
        onSuccess: () => {
            toast.success('University renamed successfully');
            setNewUniversityName('');
            setIsRenameDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ['university', universityId] });
            queryClient.invalidateQueries({ queryKey: ['universities'] }); // Refresh list view
        },
        onError: () => {
            toast.error('Failed to rename university');
        }
    });

    const handleRenameUniversity = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUniversityName.trim()) return;
        renameUniversityMutation.mutate();
    };


    const filteredCourses = courses.filter((c: any) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (isLoading && !university) {
        return (
            <div className="space-y-8 pb-10">
                <div className="h-72 bg-slate-100 dark:bg-white/5 animate-pulse rounded-[2.5rem]"></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <CatalogCardSkeleton key={i} />
                    ))}
                </div>
            </div>
        );
    }

    if (!university) {
        return (
            <div className="flex flex-col items-center justify-center py-32 bg-white/40 dark:bg-slate-900/40 rounded-[3rem] border border-dashed border-slate-200 dark:border-white/5 backdrop-blur-md">
                <div className="bg-primary/5 w-24 h-24 rounded-3xl flex items-center justify-center mb-6">
                    <GraduationCap className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-3xl font-black text-slate-900 dark:text-white leading-tight">{tCommon('noData')}</h3>
                <Button onClick={() => router.back()} className="mt-8 rounded-2xl px-8 h-12 font-black shadow-lg shadow-primary/20">
                    <ArrowLeft className="me-2 h-5 w-5" /> Go Back
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-10 max-w-7xl mx-auto">
            {/* Breadcrumbs */}
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink href={`/${locale}/admin`} className="font-medium">{tCommon('manage')}</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink href={`/${locale}/admin/catalog/universities`} className="font-medium">
                            {t('universitiesTitle')}
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbPage className="font-bold text-primary">{university.name}</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            {/* Premium Hero Section - Compact */}
            <div className="relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-700 via-primary to-blue-900 rounded-[2rem] shadow-xl"></div>
                <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-white/10 rounded-full -mr-32 -mt-32 blur-[60px]"></div>

                <div className="relative p-8 md:p-10 flex flex-col md:flex-row items-center gap-8">
                    <Avatar className="h-32 w-32 md:h-40 md:w-40 rounded-[2rem] border-4 border-white/20 shadow-2xl backdrop-blur-xl transition-transform duration-700 group-hover:scale-105">
                        {university.logo ? (
                            <AvatarImage src={university.logo} alt={university.name} className="object-cover" />
                        ) : (
                            <AvatarFallback className="bg-white/10 text-white text-4xl font-black">
                                {university.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                        )}
                    </Avatar>

                    <div className="flex-1 text-center md:text-start space-y-4">
                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/15 border border-white/25 text-white text-[10px] font-bold uppercase tracking-[0.2em] backdrop-blur-md">
                            <GraduationCap className="me-2 h-3.5 w-3.5" />
                            {t('university')}
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black text-white leading-tight tracking-tight flex flex-wrap items-center justify-center md:justify-start gap-4">
                            {university.name}
                            
                            <Dialog open={isRenameDialogOpen} onOpenChange={(open) => {
                                setIsRenameDialogOpen(open);
                                if (open && !newUniversityName) {
                                    setNewUniversityName(university.name);
                                }
                            }}>
                                <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-white">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[450px] rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden bg-white dark:bg-slate-950">
                                    <div className="bg-primary p-8 text-white relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
                                        <DialogTitle className="text-2xl font-black relative z-10">Rename University</DialogTitle>
                                        <DialogDescription className="text-primary-foreground/90 mt-2 font-medium text-sm relative z-10">
                                            Change the name of {university.name}.
                                        </DialogDescription>
                                    </div>
                                    <div className="p-8">
                                        <form onSubmit={handleRenameUniversity} className="space-y-6">
                                            <div className="space-y-2">
                                                <label className="text-slate-900 dark:text-slate-200 font-bold text-xs uppercase tracking-widest">New Name</label>
                                                <Input
                                                    value={newUniversityName}
                                                    onChange={(e) => setNewUniversityName(e.target.value)}
                                                    placeholder="Enter new name"
                                                    required
                                                    className="rounded-xl h-12 border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-base font-medium"
                                                />
                                            </div>
                                            <DialogFooter className="pt-4">
                                                <Button type="submit" disabled={renameUniversityMutation.isPending} className="w-full rounded-xl font-black h-14 text-lg shadow-xl shadow-primary/10 transition-all hover:scale-[1.02]">
                                                    {renameUniversityMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                    Save Changes
                                                </Button>
                                            </DialogFooter>
                                        </form>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </h1>
                        <div className="flex flex-wrap items-center gap-8 justify-center md:justify-start">
                             <div className="flex flex-col">
                                <span className="text-white/60 text-[10px] font-bold uppercase tracking-widest">{t('coursesTitle')}</span>
                                <span className="text-white text-2xl font-black">{courses.length}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                            <DialogTrigger asChild>
                                <Button
                                    variant="secondary"
                                    className="rounded-xl h-12 px-8 font-bold text-base bg-white text-primary hover:bg-slate-50 transition-all active:scale-95 shadow-lg shadow-blue-900/20"
                                >
                                    <Plus className="me-2 h-5 w-5" />
                                    {t('addCourse')}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[450px] rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden bg-white dark:bg-slate-950">
                                <div className="bg-primary p-8 text-white relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
                                    <DialogTitle className="text-3xl font-black relative z-10">{t('addCourse')}</DialogTitle>
                                    <DialogDescription className="text-primary-foreground/90 mt-2 font-bold text-base relative z-10">
                                        {t('addCourseDesc', { name: university?.name })}
                                    </DialogDescription>
                                </div>
                                <div className="p-8">
                                    <form onSubmit={handleCreateCourse} className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-slate-900 dark:text-slate-200 font-bold text-xs uppercase tracking-widest">{t('courseTitle')}</label>
                                            <Input
                                                value={newCourseTitle}
                                                onChange={(e) => setNewCourseTitle(e.target.value)}
                                                placeholder={t('courseTitlePlaceholder')}
                                                required
                                                className="rounded-xl h-12 border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-base font-medium"
                                            />
                                        </div>
                                        <DialogFooter className="pt-4">
                                            <Button type="submit" disabled={createCourseMutation.isPending} className="w-full rounded-xl font-black h-14 text-lg shadow-xl shadow-primary/10 transition-all hover:scale-[1.02]">
                                                {createCourseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                {tCommon('create')}
                                            </Button>
                                        </DialogFooter>
                                    </form>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            </div>

            {/* Logo Management Card */}
            <div className="bg-white/40 dark:bg-slate-900/40 p-6 rounded-[2rem] border border-white/50 dark:border-white/5 backdrop-blur-md relative overflow-hidden">
                <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className="bg-white dark:bg-slate-950 p-4 rounded-3xl shadow-lg border border-slate-100 dark:border-white/5">
                        {university.logo ? (
                            <Image src={university.logo} alt="Logo" width={96} height={96} className="object-contain" />
                        ) : (
                            <div className="w-24 h-24 flex items-center justify-center bg-slate-100 dark:bg-white/5 rounded-2xl text-slate-400 font-bold uppercase tracking-widest text-xs">
                                {t('noLogo')}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 space-y-1 text-center md:text-start">
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">{t('logo')}</h3>
                        <p className="text-slate-500 dark:text-slate-400 font-medium">
                            {t('logoHelp')}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <input
                                type="file"
                                id="logo-upload"
                                className="hidden"
                                accept="image/png, image/jpeg, image/webp, image/svg+xml"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;

                                    if (file.size > 2 * 1024 * 1024) {
                                        toast.error('File size must be less than 2MB');
                                        return;
                                    }

                                    const toastId = toast.loading(tCommon('loading'));
                                    try {
                                        await catalogApi.uploadUniversityLogo(university.id, file);
                                        toast.success(t('logoUpdated'), { id: toastId });
                                        queryClient.invalidateQueries({ queryKey: ['university', universityId] });
                                    } catch (error) {
                                        toast.error(t('logoUploadFailed'), { id: toastId });
                                    } finally {
                                        e.target.value = ''; // Reset input
                                    }
                                }}
                            />
                            <Button
                                variant="outline"
                                className="rounded-xl font-bold h-11 border-2"
                                onClick={() => document.getElementById('logo-upload')?.click()}
                            >
                                <Plus className="me-2 h-4 w-4" />
                                {university.logo ? t('replaceLogo') : t('uploadLogoBtn')}
                            </Button>
                        </div>

                        {university.logo && (
                            <Button
                                variant="destructive"
                                className="rounded-xl font-bold h-11 bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-200 dark:border-red-900/30"
                                onClick={async () => {
                                    if (!confirm(t('deleteLogoConfirm'))) return;

                                    const toastId = toast.loading(tCommon('loading'));
                                    try {
                                        await catalogApi.deleteUniversityLogo(university.id);
                                        toast.success(t('logoDeleted'), { id: toastId });
                                        queryClient.invalidateQueries({ queryKey: ['university', universityId] });
                                    } catch (error) {
                                        toast.error(t('logoDeleteFailed'), { id: toastId });
                                    }
                                }}
                            >
                                {tCommon('delete')}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* List section - Compact */}
            <div className="space-y-6 bg-white/30 dark:bg-slate-900/30 p-6 rounded-[2rem] border border-white/50 dark:border-white/5 backdrop-blur-md">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                            <BookOpen className="h-6 w-6 text-primary" />
                            {t('coursesTitle')}
                        </h2>
                    </div>

                    <div className="relative group w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors rtl:left-auto rtl:right-3" />
                        <Input
                            placeholder={tCommon('search')}
                            className="ps-10 rtl:pe-10 rounded-xl h-11 border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-950/50 backdrop-blur-sm focus:bg-white dark:focus:bg-slate-950 shadow-sm text-sm font-medium transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {isLoading ? (
                        Array.from({ length: 4 }).map((_, i) => <CatalogCardSkeleton key={i} />)
                    ) : filteredCourses.length === 0 ? (
                        <div className="col-span-full py-16 text-center bg-white/40 dark:bg-white/5 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-white/5 transition-colors">
                            <p className="text-lg font-bold text-slate-400 mb-4">{t('noCourses')}</p>
                            <Button variant="outline" className="rounded-xl px-6 h-10 font-bold border-2" onClick={() => setIsCreateDialogOpen(true)}>
                                <Plus className="me-2 h-4 w-4" /> {t('addCourse')}
                            </Button>
                        </div>
                    ) : (
                        filteredCourses.map((course: any) => (
                            <CatalogCard
                                key={course.id}
                                title={course.title}
                                count={course.isFree ? t('free') : formatPrice(Number(course.price))}
                                countLabel={course.instructor ? `${course.instructor.firstName} ${course.instructor.lastName}` : t('instructor')}
                                onManage={() => router.push(`/${locale}/admin/courses/${course.id}`)}
                                icon={<BookOpen className="h-8 w-8 text-primary/60" />}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
