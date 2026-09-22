const { getDatabase } = require('../../db');

function buildRange(from, to) {
    const start = new Date(`${from}T00:00:00+07:00`);
    const end = new Date(`${to}T00:00:00+07:00`);
    end.setTime(end.getTime() + 24 * 60 * 60 * 1000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
        throw new Error('Khoảng ngày không hợp lệ');
    }
    return { start, end };
}

async function getStats(from, to, province = '') {
    const db = await getDatabase();
    const range = buildRange(from, to);
    const snapshotMatch = { snapshotDate: { $gte: range.start, $lt: range.end }, isPresent: true };
    if (province) snapshotMatch.provinceId = province;
    const pharmacyMatch = { status: 'active' };
    if (province) pharmacyMatch['address.province.id'] = province;

    const [snapshotDaily, snapshotByProvince, provinces, active] = await Promise.all([
        db.collection('pharmacy_daily_snapshots').aggregate([
            { $match: snapshotMatch },
            { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$snapshotDate', timezone: 'Asia/Ho_Chi_Minh' } } }, count: { $sum: 1 } } },
            { $sort: { '_id.date': 1 } }
        ]).toArray(),
        db.collection('pharmacy_daily_snapshots').aggregate([
            { $match: { snapshotDate: { $gte: range.start, $lt: range.end }, isPresent: true } },
            { $group: { _id: { provinceId: '$provinceId', snapshotDate: '$snapshotDate' }, provinceName: { $first: '$provinceName' }, count: { $sum: 1 } } },
            { $sort: { '_id.provinceId': 1, '_id.snapshotDate': -1 } },
            { $group: { _id: '$_id.provinceId', provinceName: { $first: '$provinceName' }, counts: { $push: '$count' } } },
            { $project: { _id: 1, provinceName: 1, count: { $arrayElemAt: ['$counts', 0] }, previousCount: { $ifNull: [{ $arrayElemAt: ['$counts', 1] }, 0] } } },
            { $sort: { count: -1 } }
        ]).toArray(),
        db.collection('pharmacy_daily_snapshots').aggregate([
            { $match: { snapshotDate: { $gte: range.start, $lt: range.end }, isPresent: true } },
            { $group: { _id: { id: '$provinceId', name: '$provinceName' } } },
            { $sort: { '_id.name': 1 } }
        ]).toArray(),
        db.collection('pharmacies').countDocuments(pharmacyMatch)
    ]);

    const daily = snapshotDaily.map((item, index) => ({
        date: item._id.date,
        count: item.count,
        delta: index === 0 ? 0 : item.count - snapshotDaily[index - 1].count
    }));
    const byProvince = snapshotByProvince.map((item) => ({
        provinceId: item._id || 'unknown',
        provinceName: item.provinceName || 'Chưa xác định',
        count: item.count,
        delta: item.count - item.previousCount
    }));
    const provinceOptions = provinces.map((item) => ({ provinceId: item._id.id || 'unknown', provinceName: item._id.name || 'Chưa xác định' }));
    const latestCount = daily.at(-1)?.count || 0;

    return {
        range: { from: range.start.toISOString(), to: range.end.toISOString() },
        province,
        totals: { active, current: latestCount },
        daily,
        byProvince,
        provinces: provinceOptions
    };
}

async function listPharmacies({ search = '', status = 'all', province = '', page = 1, limit = 20 }) {
    const db = await getDatabase();
    const query = {};
    if (status !== 'all') query.status = status;
    if (province) query['address.province.name'] = province;
    if (search) query.$or = [{ shopCode: { $regex: search, $options: 'i' } }, { 'name.display': { $regex: search, $options: 'i' } }];
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const [items, total, provinces] = await Promise.all([
        db.collection('pharmacies').find(query).sort({ shopCode: 1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).project({ _id: 0, shopCode: 1, name: 1, address: 1, status: 1, lastSeenAt: 1, missingStreak: 1, openingDate: 1 }).toArray(),
        db.collection('pharmacies').countDocuments(query),
        db.collection('pharmacies').distinct('address.province.name')
    ]);
    return { items, total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit), provinces: provinces.filter(Boolean).sort() };
}

async function listEvents({ from, to, type = 'all', page = 1, limit = 30 }) {
    const db = await getDatabase();
    const query = {};
    if (from && to) {
        const range = buildRange(from, to);
        query.eventDate = { $gte: range.start, $lt: range.end };
    }
    if (type !== 'all') query.eventType = type;
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const [items, total] = await Promise.all([
        db.collection('pharmacy_events').find(query).sort({ eventDate: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).project({ _id: 0, shopCode: 1, eventType: 1, eventDate: 1, provinceName: 1, detectedAt: 1 }).toArray(),
        db.collection('pharmacy_events').countDocuments(query)
    ]);
    return { items, total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) };
}

async function getSyncStatus() {
    const db = await getDatabase();
    const latestRun = await db.collection('crawl_runs')
        .find({ status: 'success' })
        .sort({ finishedAt: -1, startedAt: -1 })
        .limit(1)
        .project({ _id: 0, type: 1, startedAt: 1, finishedAt: 1, fetchedCount: 1, expectedCount: 1, status: 1 })
        .next();

    return {
        mode: 'end-of-day',
        schedule: '23:00 Asia/Ho_Chi_Minh',
        latestRun: latestRun || null
    };
}

module.exports = { getStats, listPharmacies, listEvents, getSyncStatus };