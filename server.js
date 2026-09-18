const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');
const { closeDatabase } = require('./db');
const { getRoute } = require('./src/routes/apiRoutes');

const port = Number(process.env.PORT) || 3000;
const publicDirectory = __dirname;

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload));
}

function serveStatic(response, pathname) {
    const requestedFile = pathname === '/' ? 'dashboard.html' : pathname.slice(1);
    const filePath = path.resolve(publicDirectory, requestedFile);
    if (!filePath.startsWith(publicDirectory) || !fs.existsSync(filePath)) {
        sendJson(response, 404, { error: 'Không tìm thấy tài nguyên' });
        return;
    }

    const contentTypes = {
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8'
    };
    response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream'
    });
    response.end(fs.readFileSync(filePath));
}

const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    const route = getRoute(requestUrl.pathname);
    if (route) {
        try {
            sendJson(response, 200, await route(requestUrl));
        } catch (error) {
            sendJson(response, 400, { error: error.message });
        }
        return;
    }

    serveStatic(response, requestUrl.pathname);
});

server.listen(port, () => {
    console.log(`Dashboard running at http://localhost:${port}`);
});

async function shutdown() {
    server.close();
    await closeDatabase();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);