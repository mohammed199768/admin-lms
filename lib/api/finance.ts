
import apiClient from '@/lib/api-client';

export interface PaymentRecord {
    id: string;
    amount: number;
    currency: string;
    status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'REFUNDED';
    provider: 'STRIPE' | 'PAYPAL' | 'MANUAL_WHATSAPP';
    createdAt: string;
    course: {
        title: string;
        price?: number;
        university?: {
            name: string;
        };
    };
    enrollmentId: string;
    user: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
}

export interface PaymentsResponse {
    payments: PaymentRecord[];
    meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export interface RevenueSummary {
    total: number;
    outstanding: number;
    byCourse: {
        courseId: string;
        title: string;
        amount: number;
        count: number;
    }[];
}

export const financeApi = {
    getPayments: async (params: { page?: number; limit?: number; status?: string } = {}) => {
        return apiClient.get<PaymentsResponse>('/instructor/payments', { params });
    },
    
    // Manual Payment Methods
    getPendingPurchases: async () => {
        // apiClient unwraps response.data.data -> T
        return apiClient.get<PaymentRecord[]>('/admin/purchases/pending');
    },

    markPaid: async (enrollmentId: string, amount?: number) => {
        return apiClient.post<{ message: string; enrollment: any }>(`/admin/purchases/${enrollmentId}/mark-paid`, { amount });
    },

    getRevenueSummary: async () => {
        return apiClient.get<RevenueSummary>('/admin/revenue/summary');
    },

    getRevenueTimeseries: async (days: number = 14) => {
        return apiClient.get<{ series: { date: string; amount: number }[] }>('/admin/revenue/timeseries', { params: { days } });
    }
};
