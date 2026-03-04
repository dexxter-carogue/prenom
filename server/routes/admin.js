const express = require('express');
const { fetchLatestInseeResource, importInseeData } = require('../services/insee');
require('dotenv').config();

const router = express.Router();

/**
 * Endpoint de mise à jour manuelle/admin
 */
router.post('/update-insee', async (req, res) => {
    const token = req.headers['x-admin-token'];

    if (token !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const resource = await fetchLatestInseeResource();
        const count = await importInseeData(resource.url);

        res.json({
            status: 'success',
            imported_rows: count,
            source_url: resource.url,
            imported_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
