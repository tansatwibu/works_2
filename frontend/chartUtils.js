export const CHART_CONFIG = {
  day: { selector: '#daily-chart', label: 'THEO NGÀY', mode: 'day', periodKey: 'date' },
  month: { selector: '#monthly-chart', label: 'THEO THÁNG', mode: 'month', periodKey: 'month' },
  year: { selector: '#yearly-chart', label: 'THEO NĂM', mode: 'year', periodKey: 'year' },
};

export function aggregateByPeriod(daily, period) {
    const grouped = new Map();
    daily.forEach((item) => {
        const key = period === 'year' ? item.date.slice(0, 4) : item.date.slice(0, 7);
        const current = grouped.get(key) || { date: key, count: 0, delta: 0 };
        current.count = item.count;
        current.delta = item.delta;
        grouped.set(key, current);
    });
    return [...grouped.values()];
}

export function resolveChartData(daily, period) {
    if (period === 'day') return daily;
    return aggregateByPeriod(daily, period);
}

export function getPeriodLabel(period) {
    return CHART_CONFIG[period]?.label || 'THEO NGÀY';
}
