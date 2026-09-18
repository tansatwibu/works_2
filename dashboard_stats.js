const { closeDatabase, getDatabase } = require('./db');

function parseDate(value, fallback) {
    if (!value) {
        return fallback;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Ngày không hợp lệ: ${value}`);
    }

    return date;
}

function getPeriod() {
    const end = parseDate(process.argv[3], new Date());
    const start = parseDate(process.argv[2], new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000));
    if (start >= end) {
        throw new Error('Ngày bắt đầu phải trước ngày kết thúc');
    }

    const duration = end.getTime() - start.getTime();
    return {
        start,
        end,
        previousStart: new Date(start.getTime() - duration),
        previousEnd: start
    };
}

async function groupEvents(db, eventType, start, end) {
    return db.collection('pharmacy_events').aggregate([
        {
            $match: {
                eventType,
                eventDate: { $gte: start, $lt: end }
            }
        },
        {
            $group: {
                _id: {
                    provinceId: '$provinceId',
                    provinceName: '$provinceName'
                },
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1, '_id.provinceName': 1 } }
    ]).toArray();
}

function toProvinceMap(rows) {
    return new Map(rows.map((row) => [row._id.provinceId || 'unknown', row]));
}

async function getDashboardStats() {
    const db = await getDatabase();
    const period = getPeriod();
    const [opened, previousOpened, closed, activeTotal] = await Promise.all([
        groupEvents(db, 'opened', period.start, period.end),
        groupEvents(db, 'opened', period.previousStart, period.previousEnd),
        groupEvents(db, 'closed', period.start, period.end),
        db.collection('pharmacies').countDocuments({ status: 'active' })
    ]);

    const previousByProvince = toProvinceMap(previousOpened);
    const totalOpened = opened.reduce((sum, row) => sum + row.count, 0);
    const byProvince = opened.map((row) => {
        const provinceId = row._id.provinceId || 'unknown';
        const previous = previousByProvince.get(provinceId)?.count || 0;
        return {
            provinceId,
            provinceName: row._id.provinceName || 'Không xác định',
            opened: row.count,
            sharePercent: totalOpened === 0 ? 0 : Number((row.count / totalOpened * 100).toFixed(2)),
            change: row.count - previous
        };
    });

    return {
        period: {
            start: period.start,
            end: period.end
        },
        totals: {
            active: activeTotal,
            opened: totalOpened,
            closed: closed.reduce((sum, row) => sum + row.count, 0)
        },
        byProvince
    };
}

if (require.main === module) {
    getDashboardStats()
        .then((stats) => console.log(JSON.stringify(stats, null, 2)))
        .catch((error) => {
            console.error('Dashboard stats failed:', error.message);
            process.exitCode = 1;
        })
        .finally(closeDatabase);
}

module.exports = { getDashboardStats };