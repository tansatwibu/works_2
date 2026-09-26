const fs = require('fs');
const { syncDaily } = require('./sync_daily');
const { closeDatabase } = require('./db');

const LOCATION_URL = 'https://api.bachhoaxanh.com/gw/LocationV3/GetFull';
const STORES_URL = 'https://api.bachhoaxanh.com/gw/Location/V2/GetStoresByLocation';
const RAW_PATH = 'bachhoaxanh_raw.json';
const PAGE_SIZE = 100;

async function getJson(url) {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Bách Hoá Xanh API lỗi HTTP ${response.status}`);
    return response.json();
}

function normalizeStore(store, province) {
    return {
        shopCode: `bhx-${store.storeId}`,
        shopName: store.storeLocation || `Bách Hoá Xanh ${store.storeId}`,
        shopNameDisplay: store.storeLocation || `Bách Hoá Xanh ${store.storeId}`,
        location: {
            addressDisplay: store.storeAddress,
            address: store.storeAddress,
            coordinates: { longitude: store.lng, latitude: store.lat }
        },
        provinceIDStr: String(store.provinceId || province.id),
        provinceName: province.name,
        districtIDStr: store.districtId ? String(store.districtId) : null,
        wardIDStr: store.wardId ? String(store.wardId) : null,
        operation: { openStatus: !store.isStoreVirtual },
        isEcom: !store.isStoreVirtual
    };
}

async function crawl() {
    const locationData = await getJson(LOCATION_URL);
    const provinces = locationData.data?.provinces || locationData.provinces || [];
    const stores = [];

    for (const province of provinces) {
        let provinceCount = 0;
        let pageIndex = 0;
        while (true) {
            const query = new URLSearchParams({
                provinceId: String(province.id), wardId: '0',
                pageSize: String(PAGE_SIZE), pageIndex: String(pageIndex)
            });
            const data = await getJson(`${STORES_URL}?${query}`);
            const responseData = data.data || data;
            const page = responseData.stores || [];
            stores.push(...page.map((store) => normalizeStore(store, province)));
            provinceCount += page.length;
            const total = Number(responseData.total || 0);
            if (!page.length || (total > 0 && provinceCount >= total) || (total === 0 && page.length < PAGE_SIZE)) break;
            pageIndex += 1;
        }
    }

    const uniqueStores = [...new Map(stores.map((store) => [store.shopCode, store])).values()];
    const payload = { totalCount: uniqueStores.length, items: uniqueStores };
    fs.writeFileSync(RAW_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await syncDaily(payload, { source: 'bachhoaxanh' });
    console.log(`Bách Hoá Xanh: ${uniqueStores.length} cửa hàng`);
}

crawl()
    .catch((error) => { console.error('Bách Hoá Xanh crawl failed:', error.message); process.exitCode = 1; })
    .finally(closeDatabase);