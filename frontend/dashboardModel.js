export async function requestJson(path, params = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined));
    const response = await fetch(`${path}?${query}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Không tải được dữ liệu');
    return data;
}

export function getStats(from, to, province = '', source = 'longchau') {
    return requestJson('/api/stats', { from, to, province, source });
}

export function getSnapshotRange(source = 'longchau') {
    return requestJson('/api/snapshot-range', { source });
}

export function getPharmacies(filters) {
    return requestJson('/api/pharmacies', filters);
}

export function getEvents(filters) {
    return requestJson('/api/events', filters);
}

export function getSyncStatus(source = 'longchau') {
    return requestJson('/api/sync-status', { source });
}