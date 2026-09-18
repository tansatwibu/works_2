const dashboardController = require('../controllers/dashboardController');

const routes = {
    '/api/stats': dashboardController.stats,
    '/api/pharmacies': dashboardController.pharmacies,
    '/api/events': dashboardController.events,
    '/api/sync-status': dashboardController.syncStatus
};

function getRoute(pathname) {
    return routes[pathname];
}

module.exports = { getRoute };