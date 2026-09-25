const { closeDatabase, getDatabase, databaseName } = require('./db');

async function setupDatabase() {
    const db = await getDatabase();

    await db.collection('pharmacies').updateMany(
        { source: { $exists: false } },
        { $set: { source: 'longchau' } }
    );
    await db.collection('pharmacy_daily_snapshots').updateMany(
        { source: { $exists: false } },
        { $set: { source: 'longchau' } }
    );
    await db.collection('pharmacy_events').updateMany(
        { source: { $exists: false } },
        { $set: { source: 'longchau' } }
    );

    for (const [collectionName, indexName] of [
        ['pharmacy_daily_snapshots', 'uq_snapshots_date_shop_code'],
        ['pharmacy_events', 'uq_events_shop_type_date']
    ]) {
        try {
            await db.collection(collectionName).dropIndex(indexName);
        } catch (error) {
            if (!['IndexNotFound', 'NamespaceNotFound'].includes(error.codeName)) throw error;
        }
    }

    await db.collection('pharmacies').createIndex(
        { shopCode: 1 },
        { unique: true, name: 'uq_pharmacies_shop_code' }
    );
    await db.collection('pharmacies').createIndex(
        { status: 1, 'address.province.id': 1 },
        { name: 'idx_pharmacies_status_province' }
    );
    await db.collection('pharmacies').createIndex(
        { openingDate: 1 },
        { name: 'idx_pharmacies_opening_date' }
    );

    await db.collection('pharmacy_daily_snapshots').createIndex(
        { snapshotDate: 1, source: 1, shopCode: 1 },
        { unique: true, name: 'uq_snapshots_date_source_shop_code' }
    );
    await db.collection('pharmacy_daily_snapshots').createIndex(
        { snapshotDate: 1, provinceId: 1 },
        { name: 'idx_snapshots_date_province' }
    );

    await db.collection('pharmacy_events').createIndex(
        { eventType: 1, eventDate: 1 },
        { name: 'idx_events_type_date' }
    );
    await db.collection('pharmacy_events').createIndex(
        { shopCode: 1, eventType: 1 },
        { name: 'idx_events_shop_code_type' }
    );
    await db.collection('pharmacy_events').createIndex(
        { source: 1, shopCode: 1, eventType: 1, eventDate: 1 },
        { unique: true, name: 'uq_events_source_shop_type_date' }
    );

    await db.collection('crawl_runs').createIndex(
        { startedAt: -1 },
        { name: 'idx_crawl_runs_started_at' }
    );

    await db.command({ ping: 1 });
    console.log(`MongoDB ready: ${databaseName}`);
}

setupDatabase()
    .catch((error) => {
        console.error('MongoDB setup failed:', error.message);
        process.exitCode = 1;
    })
    .finally(closeDatabase);