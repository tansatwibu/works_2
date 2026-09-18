const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config();

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const databaseName = process.env.MONGO_DB || 'longchau_dashboard';

let client;

async function getDatabase() {
    if (!client) {
        client = new MongoClient(mongoUri);
        await client.connect();
    }

    return client.db(databaseName);
}

async function closeDatabase() {
    if (client) {
        await client.close();
        client = undefined;
    }
}

module.exports = {
    getDatabase,
    closeDatabase,
    databaseName
};