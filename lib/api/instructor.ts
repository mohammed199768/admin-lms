import apiClient from '@/lib/api-client';

// ============================================================================
// TYPE DEFINITIONS - Eliminating all 'any' types
// ============================================================================

export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface University {
    id: string;
    name: string;
}

export interface Major {
    id: string;
    name: string;
    university?: University;
}

export interface Subject {
    id: string;
    name: string;
    major?: Major;
}

export interface Course {
    id: string;
    title: string;
    description?: string;
    thumbnail?: string;
    price: number;
    isPublished: boolean;
    universityId?: string;
    university?: University;
    subjectId: string;
    subject?: Subject;
    _count?: {
        enrollments: number;
    };
    lectures?: Lecture[];
}

export interface QuizQuestion {
    id: string;
    text: string;
    type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER';
    options?: string[];
    correctAnswer: string;
    points: number;
    order: number;
}

export interface Quiz {
    id: string;
    title: string;
    description?: string;
    passingScore: number;
    timeLimit?: number;
    questions: QuizQuestion[];
}

export interface QuizAttempt {
    id: string;
    quizId: string;
    userId: string;
    score: number;
    passed: boolean;
    completedAt: string;
}

export interface PartAsset {
    id: string;
    title: string;
    type: 'VIDEO' | 'PDF' | 'QUIZ' | 'PPTX';
    bunnyVideoId?: string;
    storageKey?: string;
    quizId?: string;
    quiz?: {
        title: string;
        attempts?: QuizAttempt[];
    };
}

export interface Part {
    id: string;
    title: string;
    order: number;
    assets: PartAsset[];
    subParts?: Part[];
}

export interface Lecture {
    id: string;
    title: string;
    order: number;
    parts: Part[];
}

export interface CourseContent {
    lectures: Lecture[];
}

export interface CreateAssetInput {
    title: string;
    type: 'VIDEO' | 'PDF' | 'PPTX';
    order: number;
    isPreview?: boolean;
    bunnyVideoId?: string;
    storageKey?: string;
}

export interface Payment {
    id: string;
    amount: number;
    status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
    method: string;
    createdAt: string;
    userId: string;
    courseId: string;
    user?: {
        fullName: string;
        email: string;
    };
    course?: {
        title: string;
    };
}

export interface TicketMessage {
    id: string;
    content: string;
    createdAt: string;
    isStaff: boolean;
    senderId: string;
}

export interface SupportTicket {
    id: string;
    subject: string;
    status: 'OPEN' | 'PENDING' | 'CLOSED';
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    createdAt: string;
    updatedAt: string;
    userId: string;
    messages?: TicketMessage[];
    user?: {
        fullName: string;
        email: string;
    };
}

export interface Student {
    id: string;
    email: string;
    fullName: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    phoneNumber?: string;
    avatar?: string;
    createdAt: string;
    enrollmentId?: string;
    enrollmentStatus?: string;
    enrolledAt?: string;
    payment?: {
        price: number;
        paidAmount: number;
        remaining: number;
        paymentState: 'UNPAID' | 'PARTIALLY_PAID' | 'FULLY_PAID';
    };
    enrollments?: Array<{
        id: string;
        courseId: string;
        createdAt: string;
        course?: {
            title: string;
        };
    }>;
}

export interface StudentDetails {
    user: Student;
    enrollments: Array<{
        id: string;
        courseId: string;
        createdAt: string;
        course: {
            title: string;
            thumbnail?: string;
        };
    }>;
}

export interface VideoInitResponse {
    videoId: string;
    authorizationSignature: string;
    expirationTime: number;
    libraryId: string;
}

export interface BunnyPresignedResponse {
    uploadUrl: string;
    storageKey: string;
    expiresAt: number;
}

export interface UploadProgress {
    loaded: number;
    total: number;
    percentage: number;
}

// ============================================================================
// CHUNKED UPLOAD CONFIGURATION
// ============================================================================

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for reliable uploads

// ============================================================================
// INSTRUCTOR API
// ============================================================================

export const instructorApi = {
    // ========================================================================
    // COURSES
    // ========================================================================
    
    getMyCourses: async (): Promise<Course[]> => {
        return apiClient.get<Course[]>('/instructor/courses');
    },

    getCourse: async (id: string): Promise<Course & CourseContent> => {
        type BackendPart = Omit<Part, 'subParts'> & {
            subParts?: BackendPart[];
            subLessons?: BackendPart[];
        };

        const data = await apiClient.get<{
            id: string;
            title: string;
            description?: string;
            thumbnail?: string;
            price: number;
            isPublished: boolean;
            subjectId: string;
            subject?: Subject;
            _count?: { enrollments: number };
            sections?: Array<{
                id: string;
                title: string;
                order: number;
                lessons: BackendPart[];
            }>;
        }>(`/instructor/courses/${id}`);

        const normalizePart = (part: BackendPart): Part => ({
            ...part,
            subParts: (part.subParts || part.subLessons || []).map(normalizePart)
        });
        
        // Map backend response (sections -> lectures, lessons -> parts)
        return {
            ...data,
            lectures: data.sections?.map((s) => ({
                ...s,
                parts: s.lessons.map(normalizePart)
            })) || []
        };
    },

    getPart: async (id: string): Promise<Part> => {
        return apiClient.get<Part>(`/instructor/lessons/${id}`);
    },

    createCourse: async (data: { title: string; subjectId?: string; universityId?: string }): Promise<Course> => {
        const slug = data.title.toLowerCase().replace(/ /g, '-') + '-' + Math.floor(Math.random() * 1000);
        return apiClient.post<Course>('/instructor/courses', {
            ...data,
            slug,
            price: 0
        });
    },

    updateCourse: async (id: string, data: Partial<Course>): Promise<Course> => {
        return apiClient.patch<Course>(`/instructor/courses/${id}`, data);
    },

    deleteCourse: async (id: string): Promise<void> => {
        return apiClient.delete(`/instructor/courses/${id}`);
    },

    // ========================================================================
    // CURRICULUM
    // ========================================================================
    
    getCourseContent: async (courseId: string): Promise<Course & CourseContent> => {
        return instructorApi.getCourse(courseId);
    },

    createLecture: async (courseId: string, data: { title: string; order: number }): Promise<Lecture> => {
        return apiClient.post<Lecture>(`/instructor/courses/${courseId}/sections`, data);
    },

    updateLecture: async (lectureId: string, data: { title: string; order: number }): Promise<Lecture> => {
        return apiClient.patch<Lecture>(`/instructor/sections/${lectureId}`, data);
    },

    deleteLecture: async (lectureId: string): Promise<void> => {
        return apiClient.delete(`/instructor/sections/${lectureId}`);
    },

    createPart: async (lectureId: string, data: { title: string; order: number }): Promise<Part> => {
        return apiClient.post<Part>(`/instructor/sections/${lectureId}/lessons`, data);
    },

    createSubPart: async (parentPartId: string, data: { title: string; order: number }): Promise<Part> => {
        return apiClient.post<Part>(`/instructor/lessons/${parentPartId}/sub-lessons`, data);
    },

    updatePart: async (partId: string, data: { title: string; order: number }): Promise<Part> => {
        return apiClient.patch<Part>(`/instructor/lessons/${partId}`, data);
    },

    deletePart: async (partId: string): Promise<void> => {
        return apiClient.delete(`/instructor/lessons/${partId}`);
    },

    createAsset: async (partId: string, data: CreateAssetInput): Promise<PartAsset> => {
        return apiClient.post<PartAsset>(`/instructor/lessons/${partId}/assets`, data);
    },

    updateAsset: async (assetId: string, data: Partial<CreateAssetInput>): Promise<PartAsset> => {
        return apiClient.patch<PartAsset>(`/instructor/assets/${assetId}`, data);
    },

    deleteAsset: async (assetId: string): Promise<void> => {
        return apiClient.delete(`/instructor/assets/${assetId}`);
    },

    // ========================================================================
    // FILE UPLOADS
    // ========================================================================

    /**
     * Standard document upload (supported up to backend direct-upload limit, currently 100MB)
     */
    uploadPdf: async (partId: string, file: File, isSecure: boolean = true): Promise<{ storageKey: string }> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('isSecure', isSecure.toString());
        return apiClient.post(`/lessons/${partId}/document`, formData);
    },

    /**
     * Upload a file with pre-built FormData (supports Unicode titles)
     */
    uploadPartFile: async (partId: string, formData: FormData, title?: string): Promise<{ storageKey: string }> => {
        if (title) formData.append('title', title);
        try {
            return await apiClient.post(`/instructor/lessons/${partId}/files`, formData);
        } catch {
            // Backward compatibility with older backend route.
            return apiClient.post(`/lessons/${partId}/document`, formData);
        }
    },

    uploadPartImage: async (partId: string, formData: FormData, title?: string): Promise<{ storageKey: string }> => {
        if (title) formData.append('title', title);
        formData.append('isSecure', 'false');
        try {
            return await apiClient.post(`/instructor/lessons/${partId}/files`, formData);
        } catch {
            // Backward compatibility with older backend route.
            return apiClient.post(`/lessons/${partId}/document`, formData);
        }
    },

    /**
     * PERFORMANCE: Chunked upload for very large files or unstable networks
     * Splits file into 5MB chunks for reliable uploads
     */
    uploadFileChunked: async (
        partId: string, 
        file: File, 
        isSecure: boolean = true,
        onProgress?: (progress: UploadProgress) => void,
        abortSignal?: AbortSignal
    ): Promise<{ storageKey: string }> => {
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const uploadId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        // Initialize chunked upload
        const initResponse = await apiClient.post<{ uploadId: string }>('/uploads/init', {
            filename: file.name,
            fileSize: file.size,
            totalChunks,
            mimeType: file.type,
            partId,
            isSecure
        });

        const serverUploadId = initResponse.uploadId || uploadId;
        let uploadedBytes = 0;

        // Upload each chunk
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            // Check for abort
            if (abortSignal?.aborted) {
                throw new Error('Upload aborted');
            }

            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);

            const formData = new FormData();
            formData.append('chunk', chunk);
            formData.append('uploadId', serverUploadId);
            formData.append('chunkIndex', chunkIndex.toString());
            formData.append('totalChunks', totalChunks.toString());

            await apiClient.post(`/uploads/chunk`, formData);

            uploadedBytes += chunk.size;
            
            if (onProgress) {
                onProgress({
                    loaded: uploadedBytes,
                    total: file.size,
                    percentage: Math.round((uploadedBytes / file.size) * 100)
                });
            }
        }

        // Finalize upload
        const finalResponse = await apiClient.post<{ storageKey: string }>('/uploads/finalize', {
            uploadId: serverUploadId,
            partId,
            isSecure
        });

        return finalResponse;
    },

    /**
     * PERFORMANCE: Get Bunny.net presigned URL for direct upload
     * Prevents "double bandwidth" costs by uploading directly to CDN
     */
    getBunnyPresignedUrl: async (
        filename: string, 
        fileSize: number, 
        mimeType: string
    ): Promise<BunnyPresignedResponse> => {
        return apiClient.post<BunnyPresignedResponse>('/uploads/presigned', {
            filename,
            fileSize,
            mimeType
        });
    },

    /**
     * PERFORMANCE: Upload file directly to Bunny.net using presigned URL
     * Bypasses Railway backend for large file uploads
     */
    uploadToBunnyDirect: async (
        presignedUrl: string,
        file: File,
        onProgress?: (progress: UploadProgress) => void,
        abortSignal?: AbortSignal
    ): Promise<void> => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable && onProgress) {
                    onProgress({
                        loaded: event.loaded,
                        total: event.total,
                        percentage: Math.round((event.loaded / event.total) * 100)
                    });
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new Error('Upload failed'));
            });

            if (abortSignal) {
                abortSignal.addEventListener('abort', () => {
                    xhr.abort();
                    reject(new Error('Upload aborted'));
                });
            }

            xhr.open('PUT', presignedUrl);
            xhr.setRequestHeader('Content-Type', file.type);
            xhr.send(file);
        });
    },

    /**
     * Register uploaded file with backend after direct Bunny upload
     */
    registerBunnyUpload: async (
        partId: string,
        storageKey: string,
        filename: string,
        isSecure: boolean = true
    ): Promise<{ assetId: string }> => {
        return apiClient.post<{ assetId: string }>('/uploads/register', {
            partId,
            storageKey,
            filename,
            isSecure
        });
    },

    uploadThumbnail: async (courseId: string, file: File): Promise<{ thumbnail: string }> => {
        const formData = new FormData();
        formData.append('file', file);
        return apiClient.post<{ thumbnail: string }>(`/courses/${courseId}/thumbnail`, formData);
    },

    uploadGenericFile: async (file: File): Promise<{ url: string }> => {
        const formData = new FormData();
        formData.append('file', file);
        return apiClient.post<{ url: string }>('/upload', formData);
    },

    initVideoUpload: async (title: string): Promise<VideoInitResponse> => {
        return apiClient.post<VideoInitResponse>('/video/init', { title });
    },

    // ========================================================================
    // QUIZZES
    // ========================================================================

    createQuiz: async (partId: string, data: Omit<Quiz, 'id'>): Promise<{ id: string; title: string }> => {
        return apiClient.post<{ id: string; title: string }>(`/instructor/lessons/${partId}/quiz`, data);
    },

    getInstructorQuiz: async (quizId: string): Promise<Quiz> => {
        return apiClient.get<Quiz>(`/instructor/quizzes/${quizId}`);
    },

    updateQuiz: async (quizId: string, data: Partial<Quiz>): Promise<Quiz> => {
        return apiClient.put<Quiz>(`/instructor/quizzes/${quizId}`, data);
    },

    // ========================================================================
    // FINANCE / PAYMENTS
    // ========================================================================

    getPayments: async (): Promise<Payment[]> => {
        return apiClient.get<Payment[]>('/instructor/payments');
    },

    // ========================================================================
    // SUPPORT
    // ========================================================================

    getSupportTickets: async (): Promise<SupportTicket[]> => {
        return apiClient.get<SupportTicket[]>('/instructor/support/tickets');
    },

    getSupportTicket: async (id: string): Promise<SupportTicket> => {
        return apiClient.get<SupportTicket>(`/instructor/support/tickets/${id}`);
    },

    sendTicketMessage: async (id: string, content: string): Promise<TicketMessage> => {
        return apiClient.post<TicketMessage>(`/instructor/support/tickets/${id}/messages`, { content });
    },

    updateTicketStatus: async (id: string, status: 'OPEN' | 'PENDING' | 'CLOSED'): Promise<SupportTicket> => {
        return apiClient.patch<SupportTicket>(`/instructor/support/tickets/${id}`, { status });
    },

    // ========================================================================
    // STUDENTS
    // ========================================================================

    getStudents: async (params: { page?: number; limit?: number; q?: string } = {}): Promise<{ data: Student[], meta: PaginationMeta }> => {
        const queryString = new URLSearchParams();
        if (params.page) queryString.append('page', params.page.toString());
        if (params.limit) queryString.append('limit', params.limit.toString());
        if (params.q) queryString.append('q', params.q);

        return apiClient.get<{ data: Student[], meta: PaginationMeta }>(`/instructor/students?${queryString.toString()}`);
    },

    getStudentDetails: async (studentId: string): Promise<StudentDetails> => {
        return apiClient.get<StudentDetails>(`/instructor/students/${studentId}`);
    },

    getCourseStudents: async (courseId: string): Promise<Student[]> => {
        return apiClient.get<Student[]>(`/instructor/courses/${courseId}/students`);
    },

    // ========================================================================
    // ADMIN STUDENT MANAGEMENT
    // ========================================================================

    deleteStudent: async (studentId: string): Promise<void> => {
        return apiClient.delete(`/admin/students/${studentId}`);
    },

    deleteAllStudents: async (): Promise<void> => {
        return apiClient.delete('/admin/students', {
            headers: { 'X-Confirm-Delete': 'DELETE_ALL_STUDENTS' }
        });
    },

    clearCourseEnrollments: async (courseId: string): Promise<void> => {
        return apiClient.delete(`/admin/courses/${courseId}/enrollments`);
    },
};
