const { db } = require('./database');

/**
 * Récupère une valeur du cache
 * @param {string} key 
 * @returns {any|null}
 */
function getCache(key) {
    const now = Math.floor(Date.now() / 1000);
    const row = db.prepare('SELECT value_json FROM cache WHERE key = ? AND expires_at > ?')
        .get(key, now);

    if (row) {
        try {
            return JSON.parse(row.value_json);
        } catch (e) {
            return null;
        }
    }
    return null;
}

/**
 * Enregistre une valeur dans le cache
 * @param {string} key 
 * @param {any} value 
 * @param {number} ttl Seconds
 */
function setCache(key, value, ttl = 86400) {
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;
    const valueJson = JSON.stringify(value);

    db.prepare('INSERT OR REPLACE INTO cache (key, value_json, expires_at) VALUES (?, ?, ?)')
        .run(key, valueJson, expiresAt);
}

/**
 * Nettoie le cache expiré
 */
function cleanCache() {
    const now = Math.floor(Date.now() / 1000);
    db.prepare('DELETE FROM cache WHERE expires_at < ?').run(now);
}

module.exports = {
    getCache,
    setCache,
    cleanCache
};
