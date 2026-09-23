const crypto = require('crypto');
const fs = require('fs');
const { closeDatabase, getDatabase } = require('./db');
const { syncDaily } = require('./sync_daily');

const SITEMAP_URL = 'https://tiemchunglongchau.com.vn/sitemap_system.xml';
const BASE_URL = 'https://tiemchunglongchau.com.vn';
const RAW_PATH = 'tiemchunglongchau_raw.json';
const MIN_EXPECTED_CENTERS = 20;
const CONCURRENCY = 8;

function decodeHtml(value) {
    return value.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function matchMeta(html, name) {
    const pattern = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i');
    return html.match(pattern)?.[1] || '';
}

function extractTitle(html) {
    return decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || '');
}

function extractHeading(html) {
    return decodeHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '');
}

function extractAddress(html, title) {
    const address = html.match(/<p[^>]*>\s*<span>([^<]+)<\/span>\s*<\/p>/i)?.[1];
    return decodeHtml(address?.trim() || title.replace(/^Trung tâm Tiêm chủng Long Châu tại\s*/i, '').trim());
}

function provinceKey(name) {
    return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizeCenter(url, html) {
    const title = extractTitle(html);
    const heading = extractHeading(html);
    if (!/^Tiêm Chủng FPT Long Châu\s+/i.test(heading)) return null;
    const address = extractAddress(html, title);
    const provinceName = address.split(',').slice(-1)[0].trim() || null;
    const shopCode = `tclc-${crypto.createHash('sha256').update(url).digest('hex').slice(0, 16)}`;
    const longitude = Number(html.match(/longitude[^\d-]*(-?\d+(?:\.\d+)?)/i)?.[1]);
    const latitude = Number(html.match(/latitude[^\d-]*(-?\d+(?:\.\d+)?)/i)?.[1]);
    const item = {
        shopCode,
        shopName: heading,
        shopNameDisplay: heading,
        detailUrl: url,
        location: { addressDisplay: address, address },
        provinceIDStr: provinceKey(provinceName),
        provinceName,
        isEcom: true,
        operation: { openStatus: true }
    };
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
        item.location.coordinates = { longitude, latitude };
    }
    return item;
}

async function getText(url) {
    const response = await fetch(url, { headers: { accept: 'text/html' } });
    if (!response.ok) throw new Error(`HTTP ${response.status} khi tải ${url}`);
    return response.text();
}

async function crawl() {
    const sitemap = await getText(SITEMAP_URL);
    const urls = [...sitemap.matchAll(/<loc>([^<]+\/he-thong-trung-tam\/[^<]+)<\/loc>/g)].map((match) => match[1].trim());
    const centers = [];
    let nextIndex = 0;
    async function worker() {
        while (nextIndex < urls.length) {
            const url = urls[nextIndex++];
            const html = await getText(url);
            const center = normalizeCenter(url, html);
            if (center) centers.push(center);
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const uniqueCenters = [...new Map(centers.map((center) => [center.shopCode, center])).values()];
    if (uniqueCenters.length < MIN_EXPECTED_CENTERS) {
        throw new Error(`Dữ liệu trung tâm không đầy đủ: chỉ nhận ${uniqueCenters.length} trung tâm từ ${urls.length} URL sitemap`);
    }
    const payload = { totalCount: uniqueCenters.length, items: uniqueCenters };
    fs.writeFileSync(RAW_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    const db = await getDatabase();
    await Promise.all([
        db.collection('pharmacies').deleteMany({ source: 'tiemchunglongchau' }),
        db.collection('pharmacy_daily_snapshots').deleteMany({ source: 'tiemchunglongchau' }),
        db.collection('pharmacy_events').deleteMany({ source: 'tiemchunglongchau' })
    ]);
    await syncDaily(payload, { source: 'tiemchunglongchau' });
    console.log(`Tiêm chủng Long Châu: ${uniqueCenters.length} trung tâm`);
}

crawl()
    .catch((error) => { console.error('Tiêm chủng Long Châu crawl failed:', error.message); process.exitCode = 1; })
    .finally(closeDatabase);