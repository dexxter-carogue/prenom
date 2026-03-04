const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data.db');
const db = new Database(dbPath);

// Configuration simple pour la performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

/**
 * Initialise les schémas de base de données
 */
function initDb() {
    // 1. Table births (INSEE)
    db.exec(`
        CREATE TABLE IF NOT EXISTS births (
            prenom TEXT,
            sexe TEXT,
            annee INTEGER,
            dpt TEXT,
            n INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_births_prenom_sexe ON births(prenom, sexe);
        CREATE INDEX IF NOT EXISTS idx_births_prenom_sexe_annee ON births(prenom, sexe, annee);
        CREATE INDEX IF NOT EXISTS idx_births_prenom_sexe_dpt ON births(prenom, sexe, dpt);
    `);

    // 2. Table cache
    db.exec(`
        CREATE TABLE IF NOT EXISTS cache (
            key TEXT PRIMARY KEY,
            value_json TEXT,
            expires_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);
    `);

    // 3. Table meta
    db.exec(`
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);

    console.log('Database initialized successfully.');
}

module.exports = {
    db,
    initDb
};
