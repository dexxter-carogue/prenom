const express = require('express');
const { db } = require('../lib/database');
const deptsMap = require('../lib/depts');
const originsMap = require('../lib/origins');
const regionsMap = require('../lib/regions');

const router = express.Router();

// Cache pour les rangs par décennie (pour éviter de tout recalculer à chaque fois)
const rankCache = new Map();

/**
 * GET /api/name?prenom=Jerome&sexe=M
 */
router.get('/name', async (req, res) => {
    try {
        let inputPrenom = req.query.prenom;
        let inputSexe = req.query.sexe;

        if (!inputPrenom) {
            return res.status(400).json({ error: 'Prenom is required' });
        }

        const normalizedPrenom = inputPrenom.toUpperCase();

        let targetDbSexe = '1';
        let detectedSexeLabel = 'M';

        if (!inputSexe) {
            const dominantRow = db.prepare('SELECT sexe, SUM(n) as total FROM births WHERE prenom = ? GROUP BY sexe ORDER BY total DESC LIMIT 1').get(normalizedPrenom);
            if (dominantRow) {
                targetDbSexe = dominantRow.sexe;
                detectedSexeLabel = (targetDbSexe === '1' ? 'M' : 'F');
            }
        } else {
            detectedSexeLabel = inputSexe.toUpperCase();
            if (!['M', 'F'].includes(detectedSexeLabel)) detectedSexeLabel = 'M';
            targetDbSexe = (detectedSexeLabel === '1' || detectedSexeLabel === 'M') ? '1' : '2';
        }

        const stats = calculateAdvancedStats(normalizedPrenom, targetDbSexe);
        const story = generateStory(normalizedPrenom, stats);

        res.json({
            prenom: normalizedPrenom,
            sexe: detectedSexeLabel,
            stats,
            story,
            sources: [{ type: 'INSEE', via: 'data.gouv' }]
        });
    } catch (error) {
        console.error('API Name Error:', error);
        res.status(500).json({ error: error.message });
    }
});

function calculateAdvancedStats(prenom, sexe) {
    const rows = db.prepare('SELECT annee, n, dpt FROM births WHERE prenom = ? AND sexe = ? ORDER BY annee ASC')
        .all(prenom, sexe);

    if (rows.length === 0) return null;

    let totalNaissances = 0;
    let picYear = 0;
    let maxNaissances = 0;
    let weightedSumYears = 0;
    let totalNaissancesWithYear = 0;
    const dpts = {};
    const decadeTotals = {};
    const regionalTotals = {};

    let firstYear = null;
    let lastYear = null;

    const currentYear = new Date().getFullYear();

    rows.forEach(r => {
        const n = parseInt(r.n) || 0;
        totalNaissances += n;

        if (r.annee && r.annee !== '' && r.annee !== 'XXXX') {
            const annee = parseInt(r.annee);
            if (n > maxNaissances) {
                maxNaissances = n;
                picYear = annee;
            }
            weightedSumYears += (annee * n);
            totalNaissancesWithYear += n;

            if (firstYear === null || annee < firstYear) firstYear = annee;
            if (lastYear === null || annee > lastYear) lastYear = annee;

            const decade = Math.floor(annee / 10) * 10;
            decadeTotals[decade] = (decadeTotals[decade] || 0) + n;
        }

        if (r.dpt && r.dpt !== 'XX') {
            dpts[r.dpt] = (dpts[r.dpt] || 0) + n;
            const region = regionsMap[r.dpt] || 'Inconnue';
            regionalTotals[region] = (regionalTotals[region] || 0) + n;
        }
    });

    const averageAge = totalNaissancesWithYear > 0 ? (currentYear - (weightedSumYears / totalNaissancesWithYear)).toFixed(1) : null;

    // Top Region
    const topRegion = Object.entries(regionalTotals)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'France entière';

    // Meilleur Rang par Décennie (Peak)
    const peakDecade = Object.entries(decadeTotals).sort((a, b) => b[1] - a[1])[0]?.[0];
    const rankInDecade = peakDecade ? getRankInDecade(prenom, sexe, peakDecade) : null;

    // Tendance
    const last5Years = rows.filter(r => r.annee >= currentYear - 6).reduce((acc, r) => acc + (parseInt(r.n) || 0), 0);
    const prev5Years = rows.filter(r => r.annee >= currentYear - 11 && r.annee < currentYear - 6).reduce((acc, r) => acc + (parseInt(r.n) || 0), 0);
    let tendance = 'stable';
    if (last5Years > prev5Years * 1.1) tendance = 'hausse';
    else if (last5Years < prev5Years * 0.9) tendance = 'baisse';

    return {
        total_naissances: totalNaissances,
        pic: picYear,
        average_age: averageAge,
        top_region: topRegion,
        peak_decade: peakDecade,
        rank_in_decade: rankInDecade,
        tendance_20_ans: tendance,
        top_departements: Object.entries(dpts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([dpt, n]) => ({ dpt, part: Math.round((n / totalNaissances) * 100) })),
        period: {
            start: firstYear,
            end: lastYear
        },
        generation: picYear ? getGenerationLabel(picYear) : "Inconnue",
        rarete: totalNaissances > 50000 ? "Très Commun" : (totalNaissances > 10000 ? "Commun" : (totalNaissances > 1000 ? "Peu Commun" : "Rare"))
    };
}

function getRankInDecade(prenom, sexe, decade) {
    const cacheKey = `${sexe}_${decade}`;
    if (!rankCache.has(cacheKey)) {
        const sortedNames = db.prepare(`
            SELECT prenom, SUM(n) as total 
            FROM births 
            WHERE sexe = ? AND annee >= ? AND annee < ?
            GROUP BY prenom 
            ORDER BY total DESC
        `).all(sexe, parseInt(decade), parseInt(decade) + 10);
        rankCache.set(cacheKey, sortedNames.map(r => r.prenom));
    }
    const rankList = rankCache.get(cacheKey);
    const rank = rankList.indexOf(prenom) + 1;
    return rank > 0 ? rank : null;
}

function generateStory(prenom, stats) {
    if (!stats) return null;
    const origin = originsMap[prenom];
    let text = "";

    if (origin) {
        text += `${prenom} est un prénom d'origine **${origin.origin}**. Il signifie « *${origin.meaning}* ». ${origin.history} `;
    }

    if (origin || stats.total_naissances > 3000) {
        text += `Statistiquement, ce prénom a connu son apogée en **${stats.pic}**. `;

        if (stats.rank_in_decade && stats.rank_in_decade < 100) {
            text += `Il était d'ailleurs le **${stats.rank_in_decade}${stats.rank_in_decade === 1 ? 'er' : 'e'}** prénom le plus donné des années **${stats.peak_decade}**. `;
        }

        if (stats.top_region) {
            text += `C'est dans la région **${stats.top_region}** qu'il est le plus présent. `;
        }

        if (stats.average_age) {
            text += `On estime l'âge moyen des personnes portant ce prénom à **${Math.round(stats.average_age)} ans**. `;
        }
    }

    return text.trim() || null;
}

function getGenerationLabel(year) {
    if (year < 1940) return "Anciens";
    if (year < 1960) return "Baby Boomers";
    if (year < 1980) return "Génération X";
    if (year < 2000) return "Génération Y";
    return "Génération Z / Alpha";
}

router.get('/suggest', (req, res) => {
    let { startsWith, sexe, limit, sort } = req.query;
    limit = parseInt(limit) || 20;
    let dbSexe = (sexe === '2' || sexe === 'F') ? '2' : '1';
    let query = `SELECT prenom, SUM(n) as total FROM births WHERE prenom LIKE ? AND sexe = ? GROUP BY prenom ORDER BY total DESC LIMIT ?`;
    const results = db.prepare(query).all(`${startsWith.toUpperCase()}%`, dbSexe, limit);
    res.json(results);
});

router.get('/random', async (req, res) => {
    const { gender, number } = req.query;
    const limit = parseInt(number) || 3;
    const dbSexe = (gender === 'f' || gender === '2') ? '2' : '1';
    const results = db.prepare(`SELECT prenom FROM (SELECT prenom, SUM(n) as total FROM births WHERE sexe = ? GROUP BY prenom HAVING total > 1000) ORDER BY RANDOM() LIMIT ?`).all(dbSexe, limit);
    res.json(results.map(r => r.prenom));
});

module.exports = router;
