import { getStats, getSyncStatus, getSnapshotRange } from './dashboardModel.js';
import { renderChart, renderProvinceStats, setLoading } from './dashboardView.js';
import { getMonthRange } from './chartUtils.js';

const today = new Date();
const fromMonthInput = document.querySelector('#from-month');
const toMonthInput = document.querySelector('#to-month');
const chartMonthInput = document.querySelector('#chart-month');
const chartProvince = document.querySelector('#chart-province');
let latestChartRequest = 0;
let latestTableRequest = 0;
let currentSource = 'longchau';

function monthValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

async function setDates() {
    const currentMonth = monthValue(today);
    const range = await getSnapshotRange(currentSource);
    const minDate = range.minDate ? new Date(range.minDate) : new Date(today.getFullYear(), 0, 1);
    const minMonth = monthValue(minDate);
    fromMonthInput.value = minMonth;
    toMonthInput.value = currentMonth;
    chartMonthInput.value = currentMonth;
}

function chartRangeFilters() {
    const range = getMonthRange(chartMonthInput.value);
    return { from: range.from, to: range.to };
}

function tableRangeFilters() {
    const fromRange = getMonthRange(fromMonthInput.value);
    const toRange = getMonthRange(toMonthInput.value);
    return {
        from: fromRange.from || '',
        to: toRange.to || ''
    };
}

async function loadChart() {
    const requestId = ++latestChartRequest;
    const button = document.querySelector('#chart-refresh');
    setLoading(button, true);
    try {
        const { from, to } = chartRangeFilters();
        const table = await getStats(from, to, chartProvince.value, currentSource);
        if (requestId !== latestChartRequest) return;
        renderChart('#daily-chart', table.daily, 'daily');
        updateProvinceOptions(table.provinces);
    }
    catch (error) { document.querySelector('#last-sync').textContent = error.message; }
    finally {
        if (requestId === latestChartRequest) setLoading(button, false);
    }
}

async function loadOverview() {
    const requestId = ++latestTableRequest;
    const button = document.querySelector('#refresh-button');
    setLoading(button, true);
    try {
        const { from, to } = tableRangeFilters();
        const table = await getStats(from, to, chartProvince.value, currentSource);
        if (requestId !== latestTableRequest) return;
        renderProvinceStats(table.byProvince);
        updateProvinceOptions(table.provinces);
        await renderSyncStatus();
    }
    catch (error) { document.querySelector('#last-sync').textContent = error.message; }
    finally {
        if (requestId === latestTableRequest) setLoading(button, false);
    }
}

function updateProvinceOptions(provinces) {
    const selected = chartProvince.value;
    chartProvince.innerHTML = '<option value="">Tất cả tỉnh / thành</option>';
    provinces.forEach((item) => chartProvince.add(new Option(item.provinceName, item.provinceId)));
    chartProvince.value = selected;
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
    document.querySelectorAll('[data-module]').forEach((button) => button.classList.toggle('active', button.dataset.module === moduleName));
    document.querySelectorAll('[data-module-view]').forEach((view) => { view.hidden = view.dataset.moduleView !== 'dashboard'; });
    const titles = {
        longchau: 'Nhà thuốc Long Châu',
        bachhoaxanh: 'Bách Hoá Xanh',
        tiemchunglongchau: 'Tiêm chủng Long Châu'
    };
    document.querySelector('#page-title').textContent = titles[currentSource];
    void loadChart();
    void loadOverview();
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
    document.querySelector('#refresh-button').addEventListener('click', loadOverview);
    document.querySelector('#chart-refresh').addEventListener('click', loadChart);
    chartProvince.addEventListener('change', loadChart);
    fromMonthInput.addEventListener('change', loadOverview);
    toMonthInput.addEventListener('change', loadOverview);
    chartMonthInput.addEventListener('change', loadChart);
    switchModule('longchau');
}

initializeDashboard();