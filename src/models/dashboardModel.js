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

async function getStats(from, to) {
    const db = await getDatabase();
    const range = buildRange(from, to);
    const closedMatch = {
        eventDate: { $gte: range.start, $lt: range.end },
        eventType: 'closed'
    };
    const openedMatch = { openingDate: { $gte: range.start, $lt: range.end } };

    const [openedDaily, closedDaily, openedByProvince, closedByProvince, recentEvents, active] = await Promise.all([
        db.collection('pharmacies').aggregate([
            { $match: openedMatch },
            { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$openingDate', timezone: 'Asia/Ho_Chi_Minh' } } }, count: { $sum: 1 } } },
            { $sort: { '_id.date': 1 } }
        ]).toArray(),
        db.collection('pharmacy_events').aggregate([
            { $match: closedMatch },
            { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$eventDate', timezone: 'Asia/Ho_Chi_Minh' } } }, count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]).toArray(),
        db.collection('pharmacies').aggregate([
            { $match: openedMatch },
            { $group: { _id: { provinceId: '$address.province.id', provinceName: '$address.province.name' }, count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]).toArray(),
        db.collection('pharmacy_events').aggregate([
            { $match: closedMatch },
            { $group: { _id: { provinceId: '$provinceId', provinceName: '$provinceName' }, count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]).toArray(),
        db.collection('pharmacy_events').find(closedMatch).sort({ eventDate: -1 }).limit(20).project({ _id: 0, shopCode: 1, eventType: 1, eventDate: 1, provinceName: 1 }).toArray(),
        db.collection('pharmacies').countDocuments({ status: 'active' })
    ]);

    const days = new Map();
    for (const item of openedDaily) {
        days.set(item._id.date, { date: item._id.date, opened: item.count, closed: 0 });
    }
    for (const item of closedDaily) {
        if (!days.has(item._id.date)) days.set(item._id.date, { date: item._id.date, opened: 0, closed: 0 });
        days.get(item._id.date).closed = item.count;
    }

    const provinceMap = new Map();
    for (const item of openedByProvince) {
        const key = item._id.provinceId || item._id.provinceName || 'unknown';
        provinceMap.set(key, { provinceId: item._id.provinceId || 'unknown', provinceName: item._id.provinceName || 'Chưa xác định', opened: item.count, closed: 0 });
    }
    for (const item of closedByProvince) {
        const key = item._id.provinceId || item._id.provinceName || 'unknown';
        const province = provinceMap.get(key) || { provinceId: item._id.provinceId || 'unknown', provinceName: item._id.provinceName || 'Chưa xác định', opened: 0, closed: 0 };
        province.closed = item.count;
        provinceMap.set(key, province);
    }
    const byProvince = [...provinceMap.values()].map((item) => ({ ...item, net: item.opened - item.closed })).sort((left, right) => right.opened - left.opened);

    return {
        range: { from: range.start.toISOString(), to: range.end.toISOString() },
        totals: { active, opened: openedDaily.reduce((sum, item) => sum + item.count, 0), closed: closedDaily.reduce((sum, item) => sum + item.count, 0) },
        daily: [...days.values()],
        byProvince,
        recentEvents
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

module.exports = { getStats, listPharmacies, listEvents };