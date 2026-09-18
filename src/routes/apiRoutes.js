const dashboardController = require('../controllers/dashboardController');

const routes = {
    '/api/stats': dashboardController.stats,
    '/api/pharmacies': dashboardController.pharmacies,
    '/api/events': dashboardController.events
};

function getRoute(pathname) {
    return routes[pathname];
}

module.exports = { getRoute };