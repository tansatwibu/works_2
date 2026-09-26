import { getStats, getSyncStatus, getSnapshotRange } from './dashboardModel.js';
import { renderChart, renderProvinceStats, setLoading } from './dashboardView.js';
import { getMonthRange } from './chartUtils.js';

const today = new Date();
const fromMonthInput = document.querySelector('#from-month');
const toMonthInput = document.querySelector('#to-month');
let latestRequest = 0;
let currentSource = 'longchau';
let selectedProvince = '';

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
}

function rangeFilters() {
    const fromRange = getMonthRange(fromMonthInput.value);
    const toRange = getMonthRange(toMonthInput.value);
    return {
        from: fromRange.from || '',
        to: toRange.to || ''
    };
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
        renderProvinceStats(table.byProvince);
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
    fromMonthInput.addEventListener('change', loadDashboard);
    toMonthInput.addEventListener('change', loadDashboard);
    document.querySelector('#province-table').addEventListener('click', (event) => {
        const row = event.target.closest('tr[data-province-id]');
        if (!row) return;
        selectedProvince = row.dataset.provinceId;
        void loadDashboard();
    });
    switchModule('longchau');
}

initializeDashboard();