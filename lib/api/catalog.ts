import apiClient from '@/lib/api-client';
import type { ApiResponse } from '@/types/api';

// Define types here or in a separate types file
export interface University {
    id: string;
    name: string;
    logo?: string;
    createdAt: string;
    updatedAt: string;
    _count?: {
        majors: number;
    }
}

export interface Major {
    id: string;
    name: string;
    universityId: string;
    createdAt: string;
    updatedAt: string;
    university?: University;
    _count?: {
        subjects: number;
    }
}

export interface Subject {
    id: string;
    name: string;
    majorId: string;
    createdAt: string;
    updatedAt: string;
    major?: Major;
    _count?: {
        courses: number;
    }
}

export const catalogApi = {
    getUniversities: async () => {
        return apiClient.get<University[]>('/catalog/universities');
    },

    getUniversity: async (id: string) => {
        return apiClient.get<University>(`/catalog/universities/${id}`);
    },

    getMajors: async (universityId: string) => {
        return apiClient.get<Major[]>(`/catalog/universities/${universityId}/majors`);
    },

    getSubjectsByUniversity: async (universityId: string) => {
        return apiClient.get<Subject[]>(`/catalog/universities/${universityId}/subjects`);
    },

    // Added for V2 Catalog Simplification
    getUniversityCourses: async (universityId: string) => {
        return apiClient.get<any[]>(`/catalog/universities/${universityId}/courses`);
    },

    getAllMajors: async () => {
        return apiClient.get<Major[]>('/catalog/majors');
    },

    getSubjects: async (majorId: string) => {
        return apiClient.get<Subject[]>(`/catalog/majors/${majorId}/subjects`);
    },

    getAllSubjects: async () => {
        return apiClient.get<Subject[]>('/catalog/subjects');
    },

    createUniversity: async (data: { name: string; logo?: string }) => {
        return apiClient.post<University>('/catalog/universities', data);
    },

    updateUniversity: async (universityId: string, data: { name: string }) => {
        return apiClient.put<University>(`/catalog/universities/${universityId}`, data);
    },

    deleteUniversity: async (universityId: string) => {
        return apiClient.delete<{
            universityId: string;
            universityName: string;
            deleted: {
                courses: number;
                enrollments: number;
                paymentRecords: number;
            };
        }>(`/catalog/universities/${universityId}`);
    },

    createMajor: async (data: { name: string; universityId: string }) => {
        return apiClient.post<Major>('/catalog/majors', data);
    },

    createSubject: async (data: { name: string; majorId?: string }) => {
        return apiClient.post<Subject>('/catalog/subjects', data);
    },

    uploadUniversityLogo: async (universityId: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return apiClient.post<{ url: string; universityId: string }>(`/catalog/universities/${universityId}/logo`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
    },

    deleteUniversityLogo: async (universityId: string) => {
        return apiClient.delete<{ success: boolean }>(`/catalog/universities/${universityId}/logo`);
    },
};
