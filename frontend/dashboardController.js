import { getEvents, getPharmacies, getStats } from './dashboardModel.js';
import { renderChart, renderEventTable, renderPharmacies, renderProvinceStats, setActiveView, setLoading } from './dashboardView.js';

const state = { view: 'overview', page: 1 };
const today = new Date();
const fromInput = document.querySelector('#from-date');
const toInput = document.querySelector('#to-date');
const dailyMonth = document.querySelector('#daily-month');
const monthlyYear = document.querySelector('#monthly-year');
const yearlyFrom = document.querySelector('#yearly-from');
const yearlyTo = document.querySelector('#yearly-to');

function dateValue(date) { return date.toISOString().slice(0, 10); }
function setDates() {
    const year = today.getFullYear();
    dailyMonth.value = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    monthlyYear.value = String(year);
    yearlyFrom.value = String(year - 4);
    yearlyTo.value = String(year);
    fromInput.value = `${year}-01-01`;
    toInput.value = `${year}-12-31`;
}

function filters() { return { from: fromInput.value, to: toInput.value }; }

async function loadOverview() {
    const button = document.querySelector('#refresh-button');
    setLoading(button, true);
    try {
        const [daily, monthly, yearly, table] = await Promise.all([
            getStats(...monthRange(dailyMonth.value)),
            getStats(`${monthlyYear.value}-01-01`, `${monthlyYear.value}-12-31`),
            getStats(`${yearlyFrom.value}-01-01`, `${yearlyTo.value}-12-31`),
            getStats(fromInput.value, toInput.value)
        ]);
        renderChart('#daily-chart', daily.daily, 'daily');
        renderChart('#monthly-chart', monthly.daily, 'month');
        renderChart('#yearly-chart', yearly.daily, 'year');
        renderProvinceStats(table.byProvince, table.totals.opened);
        document.querySelector('#last-sync').textContent = `Đồng bộ ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
    }
    catch (error) { document.querySelector('#last-sync').textContent = error.message; }
    finally { setLoading(button, false); }
}

function monthRange(value) {
    const [year, month] = value.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return [`${value}-01`, `${value}-${String(lastDay).padStart(2, '0')}`];
}

async function loadStores() {
    const button = document.querySelector('#store-search-button');
    setLoading(button, true);
    try { renderPharmacies(await getPharmacies({ ...filters(), search: document.querySelector('#store-search').value, status: document.querySelector('#store-status').value, province: document.querySelector('#store-province').value, page: state.page })); }
    catch (error) { document.querySelector('#store-table').innerHTML = `<tr><td colspan="5" class="empty-cell error-state">${error.message}</td></tr>`; }
    finally { setLoading(button, false); }
}

async function loadEvents() {
    try { renderEventTable(await getEvents({ ...filters(), type: document.querySelector('#event-type').value })); }
    catch (error) { document.querySelector('#change-table').innerHTML = `<tr><td colspan="4" class="empty-cell error-state">${error.message}</td></tr>`; }
}

function switchView(view) { state.view = view; setActiveView(view); if (view === 'overview') loadOverview(); if (view === 'stores') loadStores(); if (view === 'events') loadEvents(); }

function switchModule(moduleName) {
    document.querySelectorAll('[data-module]').forEach((button) => button.classList.toggle('active', button.dataset.module === moduleName));
    document.querySelectorAll('[data-module-view]').forEach((view) => { view.hidden = view.dataset.moduleView !== 'longchau'; });
    document.querySelector('#page-title').textContent = 'Dashboard';
    loadOverview();
}

setDates();
document.querySelectorAll('[data-module]').forEach((button) => button.addEventListener('click', () => switchModule(button.dataset.module)));
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
document.querySelector('#refresh-button').addEventListener('click', loadOverview);
document.querySelectorAll('[data-chart-refresh]').forEach((button) => button.addEventListener('click', loadOverview));
dailyMonth.addEventListener('change', loadOverview);
monthlyYear.addEventListener('change', loadOverview);
yearlyFrom.addEventListener('change', loadOverview);
yearlyTo.addEventListener('change', loadOverview);
document.querySelector('#store-search-button').addEventListener('click', () => { state.page = 1; loadStores(); });
document.querySelector('#store-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') { state.page = 1; loadStores(); } });
document.querySelector('#store-status').addEventListener('change', () => { state.page = 1; loadStores(); });
document.querySelector('#store-province').addEventListener('change', () => { state.page = 1; loadStores(); });
document.querySelector('#event-type').addEventListener('change', loadEvents);
fromInput.addEventListener('change', () => state.view === 'overview' ? loadOverview() : loadEvents());
toInput.addEventListener('change', () => state.view === 'overview' ? loadOverview() : loadEvents());
switchView('overview');
switchModule('longchau');