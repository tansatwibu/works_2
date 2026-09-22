import { getStats, getSyncStatus } from './dashboardModel.js';
import { renderChart, renderProvinceStats, setLoading } from './dashboardView.js';

const today = new Date();
const fromInput = document.querySelector('#from-date');
const toInput = document.querySelector('#to-date');
const chartProvince = document.querySelector('#chart-province');

function dateValue(date) { return date.toISOString().slice(0, 10); }
function setDates() {
    const year = today.getFullYear();
    fromInput.value = `${year}-01-01`;
    toInput.value = dateValue(today);
}

function filters() { return { from: fromInput.value, to: toInput.value }; }

async function loadOverview() {
    const button = document.querySelector('#refresh-button');
    setLoading(button, true);
    try {
        const table = await getStats(fromInput.value, toInput.value, chartProvince.value);
        renderChart('#daily-chart', table.daily, 'daily');
        renderProvinceStats(table.byProvince);
        updateProvinceOptions(table.provinces);
        await renderSyncStatus();
    }
    catch (error) { document.querySelector('#last-sync').textContent = error.message; }
    finally { setLoading(button, false); }
}

function updateProvinceOptions(provinces) {
    const selected = chartProvince.value;
    chartProvince.innerHTML = '<option value="">Tất cả tỉnh / thành</option>';
    provinces.forEach((item) => chartProvince.add(new Option(item.provinceName, item.provinceId)));
    chartProvince.value = selected;
}

async function renderSyncStatus() {
    const status = await getSyncStatus();
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
    document.querySelectorAll('[data-module]').forEach((button) => button.classList.toggle('active', button.dataset.module === moduleName));
    document.querySelectorAll('[data-module-view]').forEach((view) => { view.hidden = view.dataset.moduleView !== 'longchau'; });
    document.querySelector('#page-title').textContent = 'Dashboard';
    loadOverview();
}

function toggleSidebar() {
    document.querySelector('#module-sidebar').classList.toggle('open');
    document.querySelector('#sidebar-overlay').classList.toggle('active');
}

function closeSidebar() {
    document.querySelector('#module-sidebar').classList.remove('open');
    document.querySelector('#sidebar-overlay').classList.remove('active');
}

setDates();
document.querySelector('#sidebar-toggle').addEventListener('click', toggleSidebar);
document.querySelector('#sidebar-overlay').addEventListener('click', closeSidebar);
document.querySelectorAll('[data-module]').forEach((button) => button.addEventListener('click', () => { switchModule(button.dataset.module); closeSidebar(); }));
document.querySelector('#refresh-button').addEventListener('click', loadOverview);
document.querySelector('#chart-refresh').addEventListener('click', loadOverview);
chartProvince.addEventListener('change', loadOverview);
fromInput.addEventListener('change', loadOverview);
toInput.addEventListener('change', loadOverview);
switchModule('longchau');