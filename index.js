const fs = require('fs');

// Read JSON files
const movies = JSON.parse(fs.readFileSync('movies.json', 'utf8'));
const episodes = JSON.parse(fs.readFileSync('episodes.json', 'utf8'));

// Find duplicate entries by ID - fixed logic
function findDuplicates(entries) {
    const idMap = new Map();
    const duplicates = new Map();

    entries.forEach(entry => {
        const id = entry.id;
        if (idMap.has(id)) {
            // First time we see this ID as duplicate - add both entries
            if (!duplicates.has(id)) {
                duplicates.set(id, [idMap.get(id)]);
            }
            // Add current duplicate entry
            duplicates.get(id).push(entry);
        } else {
            // First occurrence of this ID
            idMap.set(id, entry);
        }
    });

    return duplicates;
}

// Find duplicates
const movieDuplicates = findDuplicates(movies);
const episodeDuplicates = findDuplicates(episodes);

// Print movie duplicates
console.log('\nDuplicate Movies (same ID):');
console.log('=========================');
if (movieDuplicates.size === 0) {
    console.log('No duplicate movie IDs found.');
} else {
    movieDuplicates.forEach((duplicates, id) => {
        const movie = duplicates[0].movie;
        console.log(`\n${movie.title} (${movie.year}) - ID: ${id}`);
        duplicates.forEach(entry => {
            console.log(`  - Watched at: ${new Date(entry.watched_at).toLocaleString()}`);
        });
    });
}

// Print episode duplicates
console.log('\nDuplicate Episodes (same ID):');
console.log('===========================');
if (episodeDuplicates.size === 0) {
    console.log('No duplicate episode IDs found.');
} else {
    episodeDuplicates.forEach((duplicates, id) => {
        const episode = duplicates[0].episode;
        console.log(`\nS${episode.season}E${episode.number} - ${episode.title} - ID: ${id}`);
        duplicates.forEach(entry => {
            console.log(`  - Watched at: ${new Date(entry.watched_at).toLocaleString()}`);
        });
    });
}

console.log(`\nTotal duplicate movies (by ID): ${movieDuplicates.size}`);
console.log(`Total duplicate episodes (by ID): ${episodeDuplicates.size}`);