import { getStats, getSyncStatus, getSnapshotRange } from './dashboardModel.js';
import { renderChart, renderProvinceStats, setLoading } from './dashboardView.js';
import { getChartRange } from './chartUtils.js';

const today = new Date();
const chartFilterMode = document.querySelector('#chart-filter-mode');
const monthFilterOptions = document.querySelector('#month-filter-options');
const monthInput = document.querySelector('#chart-month');
const yearInput = document.querySelector('#chart-year');
const dayFilterOptions = document.querySelector('#day-filter-options');
const fromDateInput = document.querySelector('#from-date');
const toDateInput = document.querySelector('#to-date');
let latestRequest = 0;
let currentSource = 'longchau';
let selectedProvince = '';
let provinceRows = [];
let sortColumn = 'count';
let sortDirection = 'desc';

function monthValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function setMonthYearOptions(minDate) {
    const currentYear = today.getFullYear();
    const firstYear = Math.min(minDate.getFullYear(), 2000);
    const lastYear = currentYear + 5;
    monthInput.innerHTML = Array.from({ length: 12 }, (_, index) => {
        const month = String(index + 1).padStart(2, '0');
        return `<option value="${month}">${month}</option>`;
    }).join('');
    yearInput.innerHTML = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => {
        const year = firstYear + index;
        return `<option value="${year}">${year}</option>`;
    }).join('');
}

async function setDates() {
    const currentMonth = monthValue(today);
    const range = await getSnapshotRange(currentSource);
    const minDate = range.minDate ? new Date(range.minDate) : new Date(today.getFullYear(), 0, 1);
    const minDateValue = minDate.toISOString().slice(0, 10);
    const todayValue = today.toISOString().slice(0, 10);
    setMonthYearOptions(minDate);
    monthInput.value = currentMonth.slice(5);
    yearInput.value = currentMonth.slice(0, 4);
    fromDateInput.value = minDateValue;
    toDateInput.value = todayValue;
}

function rangeFilters() {
    const selectedMonth = `${yearInput.value}-${monthInput.value}`;
    return getChartRange(chartFilterMode.value === 'month' ? 'month' : 'range', selectedMonth, fromDateInput.value, toDateInput.value);
}

function updateChartFilterVisibility() {
    const monthMode = chartFilterMode.value === 'month';
    monthFilterOptions.hidden = !monthMode;
    dayFilterOptions.hidden = monthMode;
}

async function loadDashboard() {
    const requestId = ++latestRequest;
    const button = document.querySelector('#refresh-button');
    setLoading(button, true);
    try {
        const { from, to } = rangeFilters();
        const table = await getStats(from, to, selectedProvince, currentSource);
        if (requestId !== latestRequest) return;
        renderChart('#daily-chart', table.daily, 'daily');
        provinceRows = table.byProvince;
        renderProvinceStats(table.byProvince, sortColumn, sortDirection);
        const selectedProvinceName = table.provinces.find((item) => String(item.provinceId) === String(selectedProvince))?.provinceName;
        document.querySelector('#chart-scope').textContent = selectedProvinceName || 'Toàn quốc';
        document.querySelectorAll('#province-table tr[data-province-id]').forEach((row) => {
            row.classList.toggle('selected', row.dataset.provinceId === selectedProvince);
        });
        await renderSyncStatus();
    }
    catch (error) { document.querySelector('#last-sync').textContent = error.message; }
    finally {
        if (requestId === latestRequest) setLoading(button, false);
    }
}

async function renderSyncStatus() {
    const status = await getSyncStatus(currentSource);
    const label = document.querySelector('#last-sync');
    if (!status.latestRun) {
        label.textContent = 'Chưa có snapshot cuối ngày';
        return;
    }
    const finishedAt = new Date(status.latestRun.finishedAt).toLocaleString('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short'
    });
    label.textContent = `Snapshot cuối ngày: ${finishedAt}`;
}

function switchModule(moduleName) {
    currentSource = moduleName === 'bachhoaxanh' ? 'bachhoaxanh' : moduleName === 'tiemchunglongchau' ? 'tiemchunglongchau' : 'longchau';
    selectedProvince = '';
    provinceRows = [];
    document.querySelectorAll('[data-module]').forEach((button) => button.classList.toggle('active', button.dataset.module === moduleName));
    document.querySelectorAll('[data-module-view]').forEach((view) => { view.hidden = view.dataset.moduleView !== 'dashboard'; });
    const titles = {
        longchau: 'Nhà thuốc Long Châu',
        bachhoaxanh: 'Bách Hoá Xanh',
        tiemchunglongchau: 'Tiêm chủng Long Châu'
    };
    document.querySelector('#page-title').textContent = titles[currentSource];
    void loadDashboard();
}

function toggleSidebar() {
    document.querySelector('#module-sidebar').classList.toggle('open');
    document.querySelector('#sidebar-overlay').classList.toggle('active');
}

function closeSidebar() {
    document.querySelector('#module-sidebar').classList.remove('open');
    document.querySelector('#sidebar-overlay').classList.remove('active');
}

async function initializeDashboard() {
    await setDates();
    document.querySelector('#sidebar-toggle').addEventListener('click', toggleSidebar);
    document.querySelector('#sidebar-overlay').addEventListener('click', closeSidebar);
    document.querySelectorAll('[data-module]').forEach((button) => button.addEventListener('click', () => { switchModule(button.dataset.module); closeSidebar(); }));
    document.querySelector('#refresh-button').addEventListener('click', loadDashboard);
    chartFilterMode.addEventListener('change', () => { updateChartFilterVisibility(); void loadDashboard(); });
    monthInput.addEventListener('change', loadDashboard);
    yearInput.addEventListener('change', loadDashboard);
    fromDateInput.addEventListener('change', loadDashboard);
    toDateInput.addEventListener('change', loadDashboard);
    const provinceTableWrapper = document.querySelector('#province-table-wrapper');
    const sortProvinceTable = (header) => {
        const col = header.dataset.sort;
        if (sortColumn === col) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            sortColumn = col;
            sortDirection = col === 'province' ? 'asc' : 'desc';
        }
        if (provinceRows.length) renderProvinceStats(provinceRows, sortColumn, sortDirection);
    };
    provinceTableWrapper.addEventListener('click', (event) => {
        const header = event.target.closest('th[data-sort]');
        if (header) {
            sortProvinceTable(header);
            return;
        }
        const row = event.target.closest('#province-table tr[data-province-id]');
        if (!row) return;
        selectedProvince = row.dataset.provinceId;
        void loadDashboard();
    });
    provinceTableWrapper.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('th[data-sort]')) {
            event.preventDefault();
            sortProvinceTable(event.target);
        }
    });
    updateChartFilterVisibility();
    switchModule('longchau');
}

initializeDashboard();