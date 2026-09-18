const fs = require('fs');
const { ObjectId } = require('mongodb');
const { closeDatabase, getDatabase } = require('./db');

function parseDate(value) {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function todayStart() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    return new Date(`${date}T00:00:00+07:00`);
}

function normalizePharmacy(item, observedAt) {
    const coordinates = item.location?.coordinates;
    const longitude = coordinates?.longitude;
    const latitude = coordinates?.latitude;

    const normalized = {
        shopCode: item.shopCode,
        source: 'longchau',
        name: {
            short: item.shopName,
            display: item.shopNameDisplay
        },
        address: {
            display: item.location?.addressDisplay || null,
            full: item.location?.legacyAddress || item.location?.address || null,
            province: {
                id: item.provinceIDStr || item.provinceID || null,
                name: item.provinceName || null
            },
            district: {
                id: item.districtIDStr || item.districtID || null,
                name: item.districtName || null
            },
            ward: {
                id: item.wardIDStr || item.wardID || null,
                name: item.wardName || null
            }
        },
        openingDate: parseDate(item.grandOpening),
        status: item.isEcom === false ? 'inactive' : 'active',
        missingStreak: 0,
        missingSince: null,
        lastSeenAt: observedAt,
        updatedAt: observedAt
    };

    if (typeof longitude === 'number' && typeof latitude === 'number') {
        normalized.location = {
            type: 'Point',
            coordinates: [longitude, latitude]
        };
    }

    return normalized;
}

async function importBaseline() {
    const payload = JSON.parse(fs.readFileSync('longchau_raw.json', 'utf8'));
    const items = payload.items;

    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('longchau_raw.json không có mảng items hợp lệ');
    }

    const shopCodes = items.map((item) => item.shopCode).filter(Boolean);
    if (new Set(shopCodes).size !== shopCodes.length) {
        throw new Error('Dữ liệu baseline có shopCode trùng');
    }

    const db = await getDatabase();
    const observedAt = new Date();
    const snapshotDate = todayStart();
    const runId = new ObjectId();

    await db.collection('crawl_runs').insertOne({
        _id: runId,
        type: 'baseline',
        startedAt: observedAt,
        finishedAt: observedAt,
        expectedCount: payload.totalCount || items.length,
        fetchedCount: items.length,
        status: 'success'
    });

    const pharmacyOperations = items.map((item) => {
        const pharmacy = normalizePharmacy(item, observedAt);
        return {
            updateOne: {
                filter: { shopCode: pharmacy.shopCode },
                update: {
                    $set: pharmacy,
                    $setOnInsert: { firstSeenAt: observedAt }
                },
                upsert: true
            }
        };
    });

    const snapshotOperations = items.map((item) => ({
        updateOne: {
            filter: { snapshotDate, shopCode: item.shopCode },
            update: {
                $set: {
                    runId,
                    provinceId: item.provinceIDStr || item.provinceID || null,
                    provinceName: item.provinceName || null,
                    isPresent: true,
                    openStatus: item.operation?.openStatus ?? null
                }
            },
            upsert: true
        }
    }));

    await db.collection('pharmacies').bulkWrite(pharmacyOperations, { ordered: false });
    await db.collection('pharmacy_daily_snapshots').bulkWrite(snapshotOperations, { ordered: false });

    console.log(`Baseline imported: ${items.length} pharmacies`);
}

importBaseline()
    .catch((error) => {
        console.error('Baseline import failed:', error.message);
        process.exitCode = 1;
    })
    .finally(closeDatabase);