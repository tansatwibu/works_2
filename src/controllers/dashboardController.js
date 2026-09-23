const dashboardModel = require('../models/dashboardModel');

function queryParams(requestUrl) {
    return Object.fromEntries(requestUrl.searchParams.entries());
}

async function stats(requestUrl) {
    const query = queryParams(requestUrl);
    return dashboardModel.getStats(query.from, query.to, query.province, query.source);
}

async function pharmacies(requestUrl) {
    return dashboardModel.listPharmacies(queryParams(requestUrl));
}

async function events(requestUrl) {
    return dashboardModel.listEvents(queryParams(requestUrl));
}

async function syncStatus(requestUrl) {
    return dashboardModel.getSyncStatus(queryParams(requestUrl).source);
}

async function snapshotRange(requestUrl) {
    return dashboardModel.getSnapshotRange(queryParams(requestUrl).source);
}

module.exports = { stats, pharmacies, events, syncStatus, snapshotRange };