const formatNumber = (value) => new Intl.NumberFormat('vi-VN').format(value || 0);
const formatDate = (value) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));

export function setActiveView(viewName) {
    document.querySelectorAll('[data-view-target]').forEach((element) => element.hidden = element.dataset.viewTarget !== viewName);
    document.querySelectorAll('[data-view]').forEach((element) => element.classList.toggle('active', element.dataset.view === viewName));
    document.querySelector('#page-title').textContent = viewName === 'stores' ? 'Danh sách nhà thuốc' : viewName === 'events' ? 'Biến động cửa hàng' : 'Dashboard';
}

export function renderStats(data) {
    document.querySelector('#last-sync').textContent = `Đồng bộ ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
    renderLineChart('#daily-chart', data.daily);
    renderProvinceTable(data.byProvince);
}

export function renderChart(selector, daily, period) {
    renderLineChart(selector, daily);
}

export function renderKpis(totals, provinceCount) {
    if (document.querySelector('#kpi-active') && totals) {
        document.querySelector('#kpi-active').textContent = formatNumber(totals.active);
        document.querySelector('#kpi-opened').textContent = formatNumber(totals.current);
        document.querySelector('#kpi-closed').textContent = '—';
    }
    if (document.querySelector('#kpi-provinces') && provinceCount != null) {
        document.querySelector('#kpi-provinces').textContent = formatNumber(provinceCount);
    }
}

export function renderProvinceStats(rows, sortColumn = 'count', sortDirection = 'desc') {
    renderProvinceTable(rows, sortColumn, sortDirection);
}

function aggregateByPeriod(daily, period) {
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

function renderLineChart(selector, daily) {
    const chart = document.querySelector(selector);
    if (!daily.length) { chart.innerHTML = '<div class="empty-state">Chưa có snapshot crawl trong khoảng này.</div>'; return; }
    const width = 1000;
    const height = 360;
    const padding = { top: 20, right: 30, bottom: 70, left: 80 };
    const counts = daily.map((item) => item.count);
    const dataMin = Math.min(...counts);
    const dataMax = Math.max(...counts);
    const dataRange = Math.max(dataMax - dataMin, 1);
    const domainPadding = Math.max(dataRange * 0.2, 1);
    const domainMin = Math.max(0, dataMin - domainPadding);
    const domainMax = dataMax + domainPadding;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const x = (index) => padding.left + (daily.length === 1 ? chartWidth / 2 : (index / (daily.length - 1)) * chartWidth);
    const y = (count) => padding.top + chartHeight - ((count - domainMin) / (domainMax - domainMin)) * chartHeight;
    const labels = daily.map((item) => item.date.slice(5).replace('-', '/'));
    const points = daily.map((item, index) => `${x(index)},${y(item.count)}`).join(' ');
    const tickValues = [domainMax, domainMin + (domainMax - domainMin) * 0.75, domainMin + (domainMax - domainMin) * 0.5, domainMin + (domainMax - domainMin) * 0.25, domainMin]
        .map((tick) => Math.round(tick));
    const grid = tickValues.map((tick) => `<line class="line-grid" x1="${padding.left}" x2="${width - padding.right}" y1="${y(tick)}" y2="${y(tick)}"><title>${tick} cửa hàng</title></line><text class="line-y-label" x="${padding.left - 12}" y="${y(tick) + 4}" text-anchor="end">${formatNumber(tick)}</text>`).join('');

    const maxLabels = Math.max(6, Math.floor(chartWidth / 55));
    const labelStep = Math.ceil(daily.length / maxLabels);
    const shouldShowLabel = (index) => index % labelStep === 0 || index === daily.length - 1;
    const labelY = height - padding.bottom + 18;
    const dots = daily.map((item, index) => `<circle class="line-point" cx="${x(index)}" cy="${y(item.count)}" r="5"><title>${item.date}: ${item.count} cửa hàng (${item.delta >= 0 ? '+' : ''}${item.delta})</title></circle>${shouldShowLabel(index) ? `<text class="line-x-label" x="${x(index)}" y="${labelY}" text-anchor="middle">${labels[index]}</text>` : ''}`).join('');
    chart.innerHTML = `<svg class="line-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Số cửa hàng theo ngày crawl"><text class="line-axis-title" x="16" y="${height / 2}" transform="rotate(-90 16 ${height / 2})" text-anchor="middle">Số cửa hàng</text>${grid}<line class="line-axis" x1="${padding.left}" x2="${width - padding.right}" y1="${y(domainMin)}" y2="${y(domainMin)}"/><polyline class="line-series" points="${points}"/>${dots}<text class="line-axis-title" x="${width / 2}" y="${height - 4}" text-anchor="middle">Ngày crawl</text></svg>`;
}

const sortArrow = { asc: '▲', desc: '▼', none: '↕' };

function sortRows(rows, column, direction) {
    const sorted = [...rows];
    const dir = direction === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
        let av, bv;
        if (column === 'province') { av = (a.provinceName || '').toLowerCase(); bv = (b.provinceName || '').toLowerCase(); return av < bv ? -dir : av > bv ? dir : 0; }
        if (column === 'count') { av = a.count; bv = b.count; }
        if (column === 'delta') { av = a.delta; bv = b.delta; }
        if (column === 'share') { av = a.sharePercent || 0; bv = b.sharePercent || 0; }
        return ((av || 0) - (bv || 0)) * dir;
    });
    return sorted;
}

export function updateSortIndicators(sortColumn, sortDirection) {
    document.querySelectorAll('#province-table-wrapper th[data-sort]').forEach((th) => {
        const col = th.dataset.sort;
        const indicator = th.querySelector('.sort-indicator');
        th.classList.toggle('sorted', col === sortColumn);
        if (indicator) indicator.textContent = col === sortColumn ? sortArrow[sortDirection] : sortArrow.none;
    });
}

function renderProvinceTable(rows, sortColumn = 'count', sortDirection = 'desc') {
    const body = document.querySelector('#province-table');
    document.querySelector('#province-count').textContent = `${rows.length} tỉnh`;
    if (!rows.length) { body.innerHTML = '<tr><td colspan="4" class="empty-cell">Chưa có snapshot crawl trong khoảng này.</td></tr>'; return; }
    const nationalTotal = rows.reduce((sum, item) => sum + item.count, 0);
    const nationalDelta = rows.reduce((sum, item) => sum + item.delta, 0);
    const sortedRows = sortRows(rows.map((row) => ({ ...row, sharePercent: nationalTotal ? (row.count / nationalTotal) * 100 : 0 })), sortColumn, sortDirection);
    const nationalRow = `<tr class="national-total" data-province-id=""><td><strong>Toàn quốc</strong><small>Tổng cộng</small></td><td>${formatNumber(nationalTotal)}</td><td class="${nationalDelta >= 0 ? 'positive' : 'negative'}">${nationalDelta > 0 ? '+' : ''}${formatNumber(nationalDelta)}</td><td><div class="share"><span><i style="width:100%"></i></span>100.0%</div></td></tr>`;
    body.innerHTML = nationalRow + sortedRows.map((row) => {
        const share = nationalTotal ? ((row.count / nationalTotal) * 100).toFixed(1) : '0.0';
        return `<tr data-province-id="${row.provinceId}"><td><strong>${row.provinceName}</strong><small>${row.provinceId}</small></td><td>${formatNumber(row.count)}</td><td class="${row.delta >= 0 ? 'positive' : 'negative'}">${row.delta > 0 ? '+' : ''}${formatNumber(row.delta)}</td><td><div class="share"><span><i style="width:${share}%"></i></span>${share}%</div></td></tr>`;
    }).join('');
    updateSortIndicators(sortColumn, sortDirection);
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