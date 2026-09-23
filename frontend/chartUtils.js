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

function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getMonthRange(monthValue) {
    if (!monthValue) return { from: '', to: '' };
    const [year, month] = monthValue.split('-').map(Number);
    if (!year || !month) return { from: '', to: '' };
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 1);
    return {
        from: formatLocalDate(from),
        to: formatLocalDate(to),
    };
}

export function getPeriodLabel(period) {
    return CHART_CONFIG[period]?.label || 'THEO NGÀY';
}
