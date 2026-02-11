'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PaymentRecord } from '@/lib/api/finance';
import { useMemo } from 'react';
import { format, subDays, startOfDay, isSameDay } from 'date-fns';

interface RevenueChartProps {
    series: { date: string; amount: number }[];
}

export function RevenueChart({ series }: RevenueChartProps) {
    const t = useTranslations('admin.dashboard');

    const chartData = useMemo(() => {
        // The backend returns only days with revenue (or all, depending on impl).
        // Best practice: Ensure we fill gaps or rely on backend to have done it?
        // Plan says: "Group by day in memory" in backend, but my implementation returned only found records.
        // Let's make the chart robust: Fill the gaps here for visual consistency.
        
        const filledData = Array.from({ length: 14 }).map((_, i) => {
            const d = startOfDay(subDays(new Date(), 13 - i));
            return {
                date: d,
                displayDate: format(d, 'MMM dd'),
                revenue: 0
            };
        });

        // Safety check: ensure series is an array before iterating
        if (Array.isArray(series)) {
            series.forEach(item => {
                const itemDate = startOfDay(new Date(item.date));
                const foundDay = filledData.find(d => isSameDay(d.date, itemDate));
                if (foundDay) {
                    foundDay.revenue += item.amount;
                }
            });
        }

        return filledData;
    }, [series]);

    return (
        <Card className="col-span-1 lg:col-span-2 overflow-hidden border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md rounded-[2rem] shadow-xl">
            <CardHeader className="pb-2">
                <CardTitle className="text-xl font-bold flex items-center justify-between">
                    <span>{t('revenueTrend', { defaultMessage: 'Financial Pulse' })}</span>
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 dark:bg-white/5 py-1 rounded-full px-3">
                        Last 14 Days
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <div className="h-[300px] w-full mt-4 flex items-center justify-center">
                    {(!series || series.length === 0) ? (
                        <div className="text-slate-400 dark:text-slate-500 font-medium text-sm">
                            {t('noData', { defaultMessage: 'No time-series data available' })}
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="displayDate"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    dy={10}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'rgba(255,255,255,0.8)',
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                                    }}
                                    itemStyle={{ color: '#1e40af', fontWeight: 'bold' }}
                                    formatter={(value: number) => [`$${value}`, 'Revenue']}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="revenue"
                                    stroke="#3b82f6"
                                    strokeWidth={4}
                                    fillOpacity={1}
                                    fill="url(#colorRevenue)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
