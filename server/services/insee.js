const axios = require('axios');
const { parse } = require('csv-parse');
const { db } = require('../lib/database');
const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');

/**
 * Recherche la ressource INSEE la plus récente sur data.gouv.fr
 */
async function fetchLatestInseeResource() {
    // Utilisation du slug plutôt que de l'ID numérique qui peut changer
    const slug = 'fichier-des-prenoms-depuis-1900';
    const url = `https://www.data.gouv.fr/api/1/datasets/${slug}/`;

    const response = await axios.get(url);
    const resources = response.data.resources;

    // On cherche le fichier national. On est flexible sur le format car Insee met souvent 'csv dbase' ou 'zip'.
    const resource = resources.find(r =>
        (r.format.includes('csv') || r.format.includes('zip')) &&
        (r.title.toLowerCase().includes('national') || r.title.toLowerCase().includes('fichier des prénoms'))
    );

    if (!resource) {
        // Fallback sur le lien connu si la découverte échoue
        return {
            url: 'https://www.insee.fr/fr/statistiques/fichier/7633685/nat2022_csv.zip',
            title: 'Fichier des prénoms 2022 (Fallback)'
        };
    }

    return {
        url: resource.latest || resource.url,
        title: resource.title,
        last_modified: resource.last_modified
    };
}

/**
 * Importe le fichier INSEE dans la base de données
 * Gère automatiquement le dézippage si nécessaire
 */
async function importInseeData(url) {
    console.log(`Downloading and importing from ${url}...`);

    const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream'
    });

    let stream = response.data;

    // Si c'est un ZIP, on extrait le premier fichier (qui est le CSV)
    if (url.includes('.zip')) {
        console.log('Unzipping file...');
        stream = response.data.pipe(unzipper.ParseOne());
    }

    // On prépare l'insertion
    db.prepare('DELETE FROM births').run();
    const insert = db.prepare('INSERT INTO births (sexe, prenom, annee, dpt, n) VALUES (?, ?, ?, ?, ?)');

    let count = 0;
    const parser = stream.pipe(parse({
        delimiter: ';',
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true // Parfois les colonnes varient sur les prénoms rares
    }));

    // On utilise une transaction pour les performances (TRÈS important pour SQLite)
    const runTransaction = db.transaction((records) => {
        for (const record of records) {
            insert.run(
                record.sexe,
                record.preusuel.toUpperCase(),
                record.annais === 'XXXX' ? null : parseInt(record.annais),
                record.dpt || 'XX',
                parseInt(record.nombre)
            );
        }
    });

    let buffer = [];
    for await (const record of parser) {
        buffer.push(record);
        count++;

        if (buffer.length >= 5000) {
            runTransaction(buffer);
            buffer = [];
            console.log(`${count} rows imported...`);
        }
    }

    // Insert remaining
    if (buffer.length > 0) {
        runTransaction(buffer);
    }

    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('imported_at', new Date().toISOString());
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('source_url', url);
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('rows_count', count.toString());

    return count;
}

module.exports = {
    fetchLatestInseeResource,
    importInseeData
};
