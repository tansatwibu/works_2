const fs = require('fs');
const { ObjectId } = require('mongodb');
const { closeDatabase, getDatabase } = require('./db');

const CLOSE_AFTER_MISSING_DAYS = 2;

function todayStart() {
    const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
    return new Date(`${date}T00:00:00+07:00`);
}

function pharmacyFields(item, observedAt) {
    const coordinates = item.location?.coordinates;
    const fields = {
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
        openingDate: item.grandOpening ? new Date(item.grandOpening) : null,
        lastSeenAt: observedAt,
        updatedAt: observedAt,
        status: 'active',
        missingStreak: 0,
        missingSince: null
    };

    if (typeof coordinates?.longitude === 'number' && typeof coordinates?.latitude === 'number') {
        fields.location = {
            type: 'Point',
            coordinates: [coordinates.longitude, coordinates.latitude]
        };
    }

    return fields;
}

async function recordEvent(db, event) {
    await db.collection('pharmacy_events').updateOne(
        {
            source: event.source,
            shopCode: event.shopCode,
            eventType: event.eventType,
            eventDate: event.eventDate
        },
        { $setOnInsert: event },
        { upsert: true }
    );
}

async function syncDaily(payload, options = {}) {
    const source = options.source || 'longchau';
    const items = payload.items;
    const expectedCount = Number(payload.totalCount) || 0;

    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Dữ liệu crawl không có items hợp lệ');
    }

    if (expectedCount > 0 && items.length < expectedCount * 0.95) {
        throw new Error(`Dữ liệu không đầy đủ: nhận ${items.length}/${expectedCount}`);
    }

    const db = await getDatabase();
    const observedAt = new Date();
    const snapshotDate = todayStart();
    const runId = new ObjectId();
    const todayCodes = new Set(items.map((item) => item.shopCode).filter(Boolean));

    if (todayCodes.size !== items.length) {
        throw new Error('Dữ liệu crawl có shopCode thiếu hoặc trùng');
    }

    await db.collection('crawl_runs').insertOne({
        _id: runId,
        type: 'daily',
        source,
        startedAt: observedAt,
        expectedCount,
        fetchedCount: items.length,
        status: 'running'
    });

    try {
        const activePharmacies = await db.collection('pharmacies')
            .find({ status: 'active', source })
            .project({ shopCode: 1, missingStreak: 1, missingSince: 1, status: 1 })
            .toArray();
        const existingCodes = new Set(activePharmacies.map((item) => item.shopCode));
        const previousPharmacies = await db.collection('pharmacies')
            .find({ source, shopCode: { $in: [...todayCodes] } })
            .project({ shopCode: 1, status: 1 })
            .toArray();
        const previousByCode = new Map(previousPharmacies.map((item) => [item.shopCode, item]));

        await db.collection('pharmacy_daily_snapshots').bulkWrite(items.map((item) => ({
            updateOne: {
                filter: { snapshotDate, source, shopCode: item.shopCode },
                update: {
                    $set: {
                        runId,
                        source,
                        provinceId: item.provinceIDStr || item.provinceID || null,
                        provinceName: item.provinceName || null,
                        isPresent: true,
                        openStatus: item.operation?.openStatus ?? null
                    }
                },
                upsert: true
            }
        })), { ordered: false });

        for (const item of items) {
            const previous = previousByCode.get(item.shopCode);
            const fields = pharmacyFields(item, observedAt);

            await db.collection('pharmacies').updateOne(
                { source, shopCode: item.shopCode },
                {
                    $set: fields,
                    $setOnInsert: {
                        shopCode: item.shopCode,
                        source,
                        firstSeenAt: observedAt
                    }
                },
                { upsert: true }
            );

            if (!previous || previous.status === 'closed') {
                await recordEvent(db, {
                    source,
                    shopCode: item.shopCode,
                    eventType: previous?.status === 'closed' ? 'reopened' : 'opened',
                    eventDate: snapshotDate,
                    detectedAt: observedAt,
                    provinceId: item.provinceIDStr || item.provinceID || null,
                    provinceName: item.provinceName || null,
                    runId
                });
            }
        }

        for (const pharmacy of activePharmacies) {
            if (todayCodes.has(pharmacy.shopCode)) {
                continue;
            }

            const missingStreak = (pharmacy.missingStreak || 0) + 1;
            const missingSince = pharmacy.missingSince || observedAt;
            const nextStatus = missingStreak >= CLOSE_AFTER_MISSING_DAYS ? 'closed' : 'active';

            await db.collection('pharmacies').updateOne(
                { source, shopCode: pharmacy.shopCode },
                {
                    $set: {
                        status: nextStatus,
                        missingStreak,
                        missingSince,
                        updatedAt: observedAt
                    }
                }
            );

            await recordEvent(db, {
                source,
                shopCode: pharmacy.shopCode,
                eventType: nextStatus === 'closed' ? 'closed' : 'missing',
                eventDate: snapshotDate,
                detectedAt: observedAt,
                runId
            });
        }

        await db.collection('crawl_runs').updateOne(
            { _id: runId },
            { $set: { finishedAt: new Date(), status: 'success' } }
        );

        console.log(`Daily sync complete: ${items.length} present, ${items.length - existingCodes.size} new`);
    } catch (error) {
        await db.collection('crawl_runs').updateOne(
            { _id: runId },
            { $set: { finishedAt: new Date(), status: 'failed', error: error.message } }
        );
        throw error;
    }
}

async function main() {
    const payload = JSON.parse(fs.readFileSync('longchau_raw.json', 'utf8'));
    await syncDaily(payload, { source: 'longchau' });
}

if (require.main === module) {
    main()
        .catch((error) => {
            console.error('Daily sync failed:', error.message);
            process.exitCode = 1;
        })
        .finally(closeDatabase);
}

module.exports = { syncDaily };