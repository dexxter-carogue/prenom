document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('generator-form');
    const resultsSection = document.getElementById('results');
    const namesGrid = document.getElementById('names-grid');
    const resetBtn = document.getElementById('reset-btn');
    const generateBtn = document.getElementById('generate-btn');
    const moreBtn = document.getElementById('more-btn');
    const downloadBtn = document.getElementById('download-btn');

    let lastInputs = [];
    let currentResults = [];

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        lastInputs = [
            document.getElementById('name1').value.trim(),
            document.getElementById('name2').value.trim(),
            document.getElementById('name3').value.trim()
        ];

        setLoading(true);
        try {
            await generateAndDisplay(lastInputs);
        } catch (err) {
            console.error('Erreur lors de la génération:', err);
            alert('Une erreur est survenue lors de la génération des suggestions.');
        } finally {
            setLoading(false);
        }
    });

    resetBtn.addEventListener('click', () => {
        resultsSection.classList.add('hidden');
        form.reset();
        lastInputs = [];
        currentResults = [];
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    downloadBtn.addEventListener('click', () => {
        if (currentResults.length === 0) return;

        let content = "MA LISTE DE PRÉNOMS\n";
        content += "====================\n\n";

        currentResults.forEach((data, index) => {
            const stats = data.stats;
            content += `${index + 1}. ${data.prenom.toUpperCase()} (${data.sexe === 'M' ? 'Garçon' : 'Fille'})\n`;
            content += `   Âge Moyen : ${Math.round(stats.average_age)} ans\n`;
            content += `   Top Région : ${stats.top_region}\n`;
            content += `   Total naissances : ${stats.total_naissances.toLocaleString()}\n`;
            content += `   Année pic : ${stats.pic || 'N/A'}\n`;
            if (stats.rank_in_decade) {
                content += `   Top décennie : #${stats.rank_in_decade} (années ${stats.peak_decade})\n`;
            }

            if (data.story) {
                const plainStory = data.story.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
                content += `   Note : ${plainStory}\n`;
            }
            content += "\n";
        });

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mes-prenoms-${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    moreBtn.addEventListener('click', async () => {
        setLoadingMore(true);
        try {
            await generateAndDisplay(lastInputs, true);
        } catch (err) {
            console.error('Erreur lors de la génération supplémentaire:', err);
        } finally {
            setLoadingMore(false);
        }
    });

    function setLoadingMore(isLoading) {
        if (isLoading) {
            moreBtn.classList.add('loading');
            moreBtn.disabled = true;
        } else {
            moreBtn.classList.remove('loading');
            moreBtn.disabled = false;
        }
    }

    function setLoading(isLoading) {
        if (isLoading) {
            generateBtn.classList.add('loading');
            generateBtn.disabled = true;
        } else {
            generateBtn.classList.remove('loading');
            generateBtn.disabled = false;
        }
    }

    async function generateAndDisplay(userNames, append = false) {
        // 1. Détecter le genre dominant parmi les prénoms saisis
        const genderPromises = userNames.map(name =>
            fetch(`/api/name?prenom=${encodeURIComponent(name)}`).then(r => r.json())
        );

        const nameResults = await Promise.all(genderPromises);

        // On compte les votes pour M vs F
        let votesM = 0;
        let votesF = 0;

        nameResults.forEach(res => {
            if (res && res.sexe) {
                if (res.sexe === 'M') votesM++;
                else if (res.sexe === 'F') votesF++;
            }
        });

        // Si aucun vote n'est trouvé (prénoms inconnus), on peut alterner ou rester neutre
        // Ici, on suit la majorité stricte. En cas d'égalité, on reste sur F par précaution.
        let dominantGender = 'M';
        if (votesF > votesM) {
            dominantGender = 'F';
        } else if (votesF === votesM && votesF > 0) {
            dominantGender = 'F'; // Égalité entre prénoms connus
        } else if (votesF === 0 && votesM === 0) {
            dominantGender = 'F'; // Aucun prénom connu, défaut F
        }

        console.log(`Analyse des votes : Masculin=${votesM}, Féminin=${votesF} => Choix: ${dominantGender}`);
        console.log("Pour ouvrir cette console : Clic droit sur la page > Inspecter > Onglet Console");

        // 2. Chercher des suggestions
        const firstPrenom = userNames[0];
        const response = await fetch(`/api/suggest?startsWith=${firstPrenom.substring(0, 2)}&sexe=${dominantGender}&limit=20&sort=recent`);
        let suggestions = await response.json();

        // Si pas de suggestions avec le préfixe, on prend des prénoms aléatoires du bon genre
        if (!suggestions || suggestions.length < 5) {
            const randomResp = await fetch(`/api/random?gender=${dominantGender.toLowerCase()}&number=10`);
            const randomNames = await randomResp.json();
            suggestions = randomNames.map(n => ({ prenom: n }));
        }

        // On mélange et on prend 6 noms
        const selectedNames = suggestions
            .filter(s => !userNames.includes(s.prenom))
            .sort(() => Math.random() - 0.5)
            .slice(0, 6);

        // 3. Récupérer les détails de chaque suggestion
        const detailsPromises = selectedNames.map(s =>
            fetch(`/api/name?prenom=${encodeURIComponent(s.prenom)}&sexe=${dominantGender}`).then(r => r.json())
        );

        const enrichedResults = await Promise.all(detailsPromises);

        // Accumuler les résultats
        currentResults = append ? [...currentResults, ...enrichedResults] : enrichedResults;

        displayResults(enrichedResults, append);
    }

    function displayResults(names, append = false) {
        if (!append) {
            namesGrid.innerHTML = '';
        }

        const firstNewCardIndex = namesGrid.children.length;

        names.forEach(data => {
            const n = data.prenom;
            const stats = data.stats;
            if (!stats) return;

            const card = document.createElement('div');
            card.className = 'name-card';

            const genderLabel = data.sexe === 'M' ? 'Garçon' : 'Fille';
            const genderClass = data.sexe ? data.sexe.toLowerCase() : 'm';

            card.innerHTML = `
                <div class="card-header">
                    <span class="gender-badge badge-${genderClass}">${genderLabel}</span>
                    <div class="badges">
                        <span class="rarity-badge">${stats.rarete}</span>
                        <span class="trend-tag trend-${stats.tendance_20_ans}">${stats.tendance_20_ans}</span>
                    </div>
                </div>
                <h3>${n}</h3>
                
                <div class="stats-mini">
                    <div class="stat-item">
                        <span class="label">Âge Moyen</span>
                        <span class="value">${Math.round(stats.average_age)} ans</span>
                    </div>
                    <div class="stat-item">
                        <span class="label">Top Région</span>
                        <span class="value">${stats.top_region}</span>
                    </div>
                    <div class="stat-item">
                        <span class="label">Rang Peak</span>
                        <span class="value">#${stats.rank_in_decade || 'N/A'}</span>
                    </div>
                </div>

                <div class="stats-mini stats-secondary">
                    <div class="stat-item">
                        <span class="label">Total</span>
                        <span class="value">${stats.total_naissances.toLocaleString()}</span>
                    </div>
                    <div class="stat-item">
                        <span class="label">Année Pic</span>
                        <span class="value">${stats.pic}</span>
                    </div>
                    <div class="stat-item">
                        <span class="label">Génération</span>
                        <span class="value">${stats.generation}</span>
                    </div>
                </div>

                <div class="enriched-data">
                    <div class="period">
                        <span class="label">Période :</span>
                        <span class="value">${stats.period.start} - ${stats.period.end}</span>
                    </div>
                    ${stats.top_departements.length > 0 ? `
                    <div class="top-dpts">
                        <span class="label">Top Départements :</span>
                        <div class="dpt-list">
                            ${stats.top_departements.slice(0, 3).map(d => `<span class="dpt-tag">${d.dpt}</span>`).join('')}
                        </div>
                    </div>
                    ` : ''}
                    ${data.enrichment && data.enrichment.length > 0 && data.enrichment[0].usages ? `
                    <div class="btn-usages">
                        <span class="label">Usages (Behind the Name) :</span>
                        <div class="dpt-list">
                            ${data.enrichment[0].usages.map(u => `<span class="dpt-tag">${u.usage_full}</span>`).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>

                ${data.story ? `
                <div class="name-story">
                    <p>${data.story.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')}</p>
                </div>
                ` : ''}

                <div class="card-footer">
                    <p class="generation">${stats.generation}</p>
                </div>
            `;

            namesGrid.appendChild(card);
        });

        if (!append) {
            resultsSection.scrollIntoView({ behavior: 'smooth' });
        } else if (namesGrid.children.length > firstNewCardIndex) {
            // Petit délai pour laisser le layout se stabiliser
            setTimeout(() => {
                namesGrid.children[firstNewCardIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }

        resultsSection.classList.remove('hidden');
    }
});
