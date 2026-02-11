'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/contexts/auth-context';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { instructorApi } from '@/lib/api/instructor';
import { financeApi } from '@/lib/api/finance';
import { DashboardHeader } from '@/components/admin/dashboard/DashboardHeader';
import { RevenueChart } from '@/components/admin/dashboard/RevenueChart';
import { ActivityFeed } from '@/components/admin/dashboard/ActivityFeed';
import { QuickActions } from '@/components/admin/dashboard/QuickActions';
import { DashboardInsights } from '@/components/admin/dashboard/DashboardInsights';
import { Loader2 } from 'lucide-react';
import { isAdminPanelRole } from '@/lib/rbac';

// Helper to handle both old (Array) and new ({ data, meta }) response shapes during migration
const handlePaginatedResponse = (res: any) => {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.data)) return res.data;
    return [];
};

export default function DashboardPage() {
  const t = useTranslations('admin.dashboard');
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const [data, setData] = useState({
    payments: [] as any[],
    students: [] as any[],
    totalRevenue: 0,
    revenueSeries: [] as any[] // Add series state
  });
  const [loading, setLoading] = useState(true);

  // Auth Guard
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push(`/${locale}/login`);
    } else if (!isAuthLoading && user && !isAdminPanelRole(user.role)) {
      router.push(`/${locale}/login`);
    }
  }, [user, isAuthLoading, router, locale]);

  // Data Fetching
  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    if (user && isAdminPanelRole(user.role)) {
      const fetchData = async () => {
        try {
          if (isMounted) setLoading(true);
          
          const results = await Promise.allSettled([
            financeApi.getPayments({ limit: 20 }), 
            instructorApi.getStudents({ limit: 5 }), 
            financeApi.getRevenueSummary()
          ]);

          if (!isMounted) return;

          // Helper to get fulfilled value or default
          const getResult = <T,>(result: PromiseSettledResult<T>, fallback: T): T => {
             return result.status === 'fulfilled' ? result.value : fallback;
          };

          const paymentsRes = getResult(results[0], { payments: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
          const studentsRes = getResult(results[1], { data: [], meta: { total: 0, page: 1, limit: 5, totalPages: 0 } });
          const revenueRes = getResult(results[2], { total: 0, outstanding: 0, byCourse: [] });

          // Log failures for debugging
          results.forEach((res, idx) => {
              if (res.status === 'rejected') {
                  console.warn(`Dashboard API ${idx} failed:`, res.reason);
              }
          });

          // Extract payments safely based on financeApi response structure
          const paymentsList = (paymentsRes as any).payments || (Array.isArray(paymentsRes) ? paymentsRes : []);
          
          // Extract students from new pagination structure
          const studentList = handlePaginatedResponse(studentsRes);

          setData({
            payments: paymentsList,
            students: studentList,
            totalRevenue: revenueRes.total,
            revenueSeries: [] // Backend does not provide time-series data yet
          });
        } catch (error) {
          console.error('Dashboard data fetch failed:', error);
        } finally {
          if (isMounted) setLoading(false);
        }
      };
      fetchData();
    }
    
    return () => {
        isMounted = false;
        abortController.abort();
    };
  }, [user]);

  if (isAuthLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAdminPanelRole(user.role)) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">

      {/* 1. Hero / Header */}
      <DashboardHeader
        totalRevenue={data.totalRevenue}
        userName={user.firstName}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 2. Financial Pulse Chart */}
        <RevenueChart series={data.revenueSeries} />

        {/* 3. Live Operations Feed */}
        <ActivityFeed
          payments={data.payments}
          students={data.students}
        />
      </div>

      {/* 4. Insights Section */}
      <DashboardInsights />

      {/* 5. Quick Actions */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <span className="w-1.5 h-6 bg-primary rounded-full"></span>
          {t('quickLaunchpad')}
        </h3>
        <QuickActions />
      </div>
    </div>
  );
}

