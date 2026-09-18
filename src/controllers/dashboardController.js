const dashboardModel = require('../models/dashboardModel');

function queryParams(requestUrl) {
    return Object.fromEntries(requestUrl.searchParams.entries());
}

async function stats(requestUrl) {
    const query = queryParams(requestUrl);
    return dashboardModel.getStats(query.from, query.to);
}

async function pharmacies(requestUrl) {
    return dashboardModel.listPharmacies(queryParams(requestUrl));
}

async function events(requestUrl) {
    return dashboardModel.listEvents(queryParams(requestUrl));
}

module.exports = { stats, pharmacies, events };