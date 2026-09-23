const dashboardController = require('../controllers/dashboardController');

const routes = {
    '/api/stats': dashboardController.stats,
    '/api/pharmacies': dashboardController.pharmacies,
    '/api/events': dashboardController.events,
    '/api/sync-status': dashboardController.syncStatus,
    '/api/snapshot-range': dashboardController.snapshotRange
};

function getRoute(pathname) {
    return routes[pathname];
}

module.exports = { getRoute };