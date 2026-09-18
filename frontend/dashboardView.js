const formatNumber = (value) => new Intl.NumberFormat('vi-VN').format(value || 0);
const formatDate = (value) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));

export function setActiveView(viewName) {
    document.querySelectorAll('[data-view-target]').forEach((element) => element.hidden = element.dataset.viewTarget !== viewName);
    document.querySelectorAll('[data-view]').forEach((element) => element.classList.toggle('active', element.dataset.view === viewName));
    document.querySelector('#page-title').textContent = viewName === 'stores' ? 'Store directory' : viewName === 'events' ? 'Change log' : 'Store pulse';
}

export function renderStats(data) {
    document.querySelector('#last-sync').textContent = `Đồng bộ ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
    renderMovementChart('#daily-chart', data.daily);
    renderMovementChart('#monthly-chart', aggregateByPeriod(data.daily, 'month'));
    renderMovementChart('#yearly-chart', aggregateByPeriod(data.daily, 'year'));
    renderProvinceTable(data.byProvince, data.totals.opened);
}

export function renderChart(selector, daily, period) {
    renderMovementChart(selector, period === 'daily' ? daily : aggregateByPeriod(daily, period));
}

export function renderProvinceStats(rows, openedTotal) {
    renderProvinceTable(rows, openedTotal);
}

function aggregateByPeriod(daily, period) {
    const grouped = new Map();
    daily.forEach((item) => {
        const key = period === 'year' ? item.date.slice(0, 4) : item.date.slice(0, 7);
        const current = grouped.get(key) || { date: key, opened: 0, closed: 0 };
        current.opened += item.opened;
        current.closed += item.closed;
        grouped.set(key, current);
    });
    return [...grouped.values()];
}

function renderMovementChart(selector, daily) {
    const chart = document.querySelector(selector);
    if (!daily.length) { chart.innerHTML = '<div class="empty-state">Chưa có event mở hoặc đóng trong khoảng này.</div>'; return; }
    const max = Math.max(...daily.flatMap((item) => [item.opened, item.closed]), 1);
    const step = Math.max(Math.ceil(max / 4), 1);
    const ticks = [step * 4, step * 3, step * 2, step, 0];
    const labels = daily.map((item) => item.date.slice(5).replace('-', '/'));
    chart.innerHTML = `<div class="chart-y-axis"><span class="axis-title">Số cửa hàng</span>${ticks.map((tick) => `<span>${tick}</span>`).join('')}</div><div class="chart-plot"><div class="plot-grid">${ticks.slice(0, -1).map(() => '<i></i>').join('')}</div><div class="chart-bars">${daily.map((item, index) => `<div class="bar-group" title="${item.date}: mở ${item.opened}, đóng ${item.closed}"><div class="bar-pair"><span class="bar opened" style="height:${Math.max((item.opened / (step * 4)) * 100, item.opened ? 5 : 1)}%"><b>${item.opened || ''}</b></span><span class="bar closed" style="height:${Math.max((item.closed / (step * 4)) * 100, item.closed ? 5 : 1)}%"><b>${item.closed || ''}</b></span></div><small>${labels[index]}</small></div>`).join('')}</div><span class="axis-label">${labels.length > 1 ? 'Thời gian' : labels[0]}</span></div>`;
}

function renderProvinceTable(rows, openedTotal) {
    const body = document.querySelector('#province-table');
    document.querySelector('#province-count').textContent = `${rows.length} tỉnh`;
    if (!rows.length) { body.innerHTML = '<tr><td colspan="4" class="empty-cell">Chưa có dữ liệu biến động trong khoảng này.</td></tr>'; return; }
    body.innerHTML = rows.map((row) => { const share = openedTotal ? ((row.opened / openedTotal) * 100).toFixed(1) : '0.0'; return `<tr><td><strong>${row.provinceName}</strong><small>${row.provinceId}</small></td><td>${formatNumber(row.opened)}</td><td>${formatNumber(row.closed)}</td><td class="${row.net >= 0 ? 'positive' : 'negative'}">${row.net > 0 ? '+' : ''}${formatNumber(row.net)}</td><td><div class="share"><span><i style="width:${share}%"></i></span>${share}%</div></td></tr>`; }).join('');
}

function renderEvents(events) {
    const list = document.querySelector('#event-list');
    if (!events.length) { list.innerHTML = '<div class="empty-state">Chưa có sự kiện mở hoặc đóng trong khoảng này.</div>'; return; }
    list.innerHTML = events.map((event) => `<div class="event-row"><span class="event-marker ${event.eventType}"></span><div><strong>${event.eventType === 'opened' ? 'Cửa hàng mở mới' : 'Cửa hàng đóng / gỡ'}</strong><small>${event.shopCode} · ${event.provinceName || 'Chưa xác định'}</small></div><time>${formatDate(event.eventDate)}</time></div>`).join('');
}

export function renderPharmacies(data) {
    document.querySelector('#store-count').textContent = `${formatNumber(data.total)} cửa hàng`;
    document.querySelector('#store-table').innerHTML = data.items.length ? data.items.map((item) => `<tr><td><strong>${item.shopCode}</strong><small>${item.name?.short || ''}</small></td><td>${item.address?.province?.name || 'Chưa xác định'}</td><td>${item.address?.ward?.name || 'Chưa xác định'}</td><td><span class="status-pill ${item.status}">${item.status === 'active' ? 'Đang hoạt động' : 'Đã đóng'}</span></td><td>${item.openingDate ? formatDate(item.openingDate) : 'Chưa rõ'}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">Không tìm thấy cửa hàng phù hợp.</td></tr>';
    const province = document.querySelector('#store-province');
    if (province.options.length === 1) data.provinces.forEach((name) => province.add(new Option(name, name)));
}

export function renderEventTable(data) {
    document.querySelector('#event-count').textContent = `${formatNumber(data.total)} sự kiện`;
    document.querySelector('#change-table').innerHTML = data.items.length ? data.items.map((item) => `<tr><td>${formatDate(item.eventDate)}</td><td><strong>${item.shopCode}</strong></td><td>${item.provinceName || 'Chưa xác định'}</td><td><span class="status-pill ${item.eventType}">${item.eventType === 'opened' ? 'Mở mới' : 'Đóng / gỡ'}</span></td></tr>`).join('') : '<tr><td colspan="4" class="empty-cell">Chưa có biến động trong khoảng này.</td></tr>';
}

export function setLoading(button, loading) { button.disabled = loading; button.classList.toggle('loading', loading); }