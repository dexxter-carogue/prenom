const fetch = require('node-fetch');
const { db } = require('../lib/database');
require('dotenv').config();

const BTN_API_KEY = process.env.BTN_API_KEY;

/**
 * Fetch name details from Behind The Name (BTN) API with SQLite caching
 * @param {string} name 
 * @returns {Object|null} BTN Data
 */
async function fetchBtnData(name) {
    if (!BTN_API_KEY) {
        console.log('BTN_API_KEY not configured. Skipping enrichment.');
        return null;
    }

    const normalizedName = name.toLowerCase().trim();
    const cacheKey = `btn_${normalizedName}`;

    try {
        // 1. Check SQLite Cache
        const cached = db.prepare('SELECT value_json, expires_at FROM cache WHERE key = ?').get(cacheKey);

        if (cached) {
            const now = Date.now();
            if (now < cached.expires_at) {
                return JSON.parse(cached.value_json);
            } else {
                // Expired, delete it
                db.prepare('DELETE FROM cache WHERE key = ?').run(cacheKey);
            }
        }

        // 2. Fetch from API if not in cache or expired
        const url = `https://www.behindthename.com/api/lookup.json?name=${encodeURIComponent(normalizedName)}&key=${BTN_API_KEY}`;

        const response = await fetch(url);

        if (!response.ok) {
            console.warn(`BTN API error for ${name}: ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json();

        // BTN returns an array of objects if found, or an error object if not
        if (data.error) {
            console.log(`BTN API: ${data.error} for ${name}`);
            return null;
        }

        // 3. Save to SQLite Cache
        // Cache for 48 hours to minimize API calls (Render Disk makes this persistent)
        const expiresInMs = 48 * 60 * 60 * 1000;
        const expiresAt = Date.now() + expiresInMs;

        const dataToCache = JSON.stringify(data);

        db.prepare(`
            INSERT INTO cache (key, value_json, expires_at) 
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, expires_at = excluded.expires_at
        `).run(cacheKey, dataToCache, expiresAt);

        return data;

    } catch (error) {
        console.error('Error fetching BTN data:', error);
        return null;
    }
}

module.exports = {
    fetchBtnData
};
