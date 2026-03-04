const fetch = require('node-fetch');
const { db } = require('../lib/database');

/**
 * Fetch name history and origin from French Wikipedia with SQLite caching.
 * Strategy:
 *   1. Try: https://fr.wikipedia.org/api/rest_v1/page/summary/<Prénom>_(prénom)
 *   2. If empty, try: https://fr.wikipedia.org/api/rest_v1/page/summary/<Prénom>
 * @param {string} name  (in any case, will be title-cased)
 * @returns {{extract: string, page: string}|null}
 */
async function fetchWikiData(name) {
    // Title-case the name (JEROME -> Jerome)
    const titleName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    const cacheKey = `wiki_${titleName.toLowerCase()}`;

    try {
        // 1. Check SQLite Cache (72h for Wikipedia)
        const cached = db.prepare('SELECT value_json, expires_at FROM cache WHERE key = ?').get(cacheKey);
        if (cached) {
            if (Date.now() < cached.expires_at) {
                return JSON.parse(cached.value_json);
            }
            db.prepare('DELETE FROM cache WHERE key = ?').run(cacheKey);
        }

        // 2. Fetch from Wikipedia
        const result = await tryWikiFetch(titleName);

        // 3. Cache the result (even null prevents repeated failed lookups)
        const expiresAt = Date.now() + 72 * 60 * 60 * 1000;
        db.prepare(`
            INSERT INTO cache (key, value_json, expires_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, expires_at = excluded.expires_at
        `).run(cacheKey, JSON.stringify(result), expiresAt);

        return result;

    } catch (err) {
        console.error('Wikipedia fetch error:', err);
        return null;
    }
}

async function tryWikiFetch(name) {
    // Try the "(prénom)" disambiguation page first
    const candidates = [
        `${name}_(prénom)`,
        name
    ];

    for (const title of candidates) {
        const url = `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        try {
            const res = await fetch(url, { timeout: 7000 });
            if (!res.ok) continue;
            const data = await res.json();

            // Only keep if it looks like a name article (not a stub)
            if (data.extract && data.extract.length > 30) {
                return {
                    extract: data.extract,
                    page: data.content_urls?.desktop?.page || null,
                    thumbnail: data.thumbnail?.source || null
                };
            }
        } catch (e) {
            continue;
        }
    }

    return null;
}

module.exports = { fetchWikiData };
