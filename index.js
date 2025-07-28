const fs = require('fs');
const readline = require('readline');
const axios = require('axios');

// File to store the credentials
const CREDENTIALS_FILE = 'trakt_credentials.json';

// Global variables
let client_id, client_secret, username;
let trakt_api = 'https://api.trakt.tv';
let auth_get_token_url = `${trakt_api}/oauth/token`;
let get_history_url, sync_history_url;
let session;

// Helper function to create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Promise wrapper for readline question
const askQuestion = (question) => {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
};

// Credentials management
const saveCredentials = (clientId, clientSecret, user) => {
    const credentials = {
        client_id: clientId,
        client_secret: clientSecret,
        username: user
    };
    
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
    console.log(`Credentials saved to ${CREDENTIALS_FILE}. You can delete or edit this file if needed.\n`);
};

const loadCredentials = () => {
    if (fs.existsSync(CREDENTIALS_FILE)) {
        const data = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
        return JSON.parse(data);
    }
    return null;
};

const getCredentials = async () => {
    const credentials = loadCredentials();
    
    if (credentials) {
        console.log(`Loaded credentials from ${CREDENTIALS_FILE}`);
        return [credentials.client_id, credentials.client_secret, credentials.username];
    } else {
        // Ask user for credentials and save them
        const clientId = await askQuestion('Enter your Trakt client ID: ');
        const clientSecret = await askQuestion('Enter your Trakt client secret: ');
        const user = await askQuestion('Enter your Trakt username: ');
        
        saveCredentials(clientId, clientSecret, user);
        return [clientId, clientSecret, user];
    }
};

// Authentication
const loginToTrakt = async () => {
    console.log('Authentication');
    console.log('Open the link in a browser and paste the pin');
    console.log(`https://trakt.tv/oauth/authorize?response_type=code&client_id=${client_id}&redirect_uri=urn:ietf:wg:oauth:2.0:oob`);
    console.log('');
    
    const pin = await askQuestion('Pin: ');
    
    // Configure axios instance
    session = axios.create({
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'Betaseries to Trakt',
            'Connection': 'Keep-Alive'
        }
    });
    
    const postData = {
        code: pin,
        client_id: client_id,
        client_secret: client_secret,
        redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
        grant_type: 'authorization_code'
    };
    
    try {
        const response = await session.post(auth_get_token_url, postData);
        console.log(response.data);
        console.log('');
        
        // Update session headers with auth token
        session.defaults.headers.common['Content-Type'] = 'application/json';
        session.defaults.headers.common['trakt-api-version'] = '2';
        session.defaults.headers.common['trakt-api-key'] = client_id;
        session.defaults.headers.common['Authorization'] = `Bearer ${response.data.access_token}`;
        
    } catch (error) {
        console.error('Authentication failed:', error.response?.data || error.message);
        process.exit(1);
    }
};

// Fetch history
const getHistory = async (type) => {
    let results = [];
    let urlParams = {
        page: 1,
        limit: 1000,
        type: type
    };
    
    console.log(`\nRetrieving history for ${type}`);
    
    while (true) {
        const url = get_history_url.replace('{type}', urlParams.type)
                                  .replace('{page}', urlParams.page)
                                  .replace('{limit}', urlParams.limit);
        console.log(url);
        
        try {
            const resp = await session.get(url);
            results = results.concat(resp.data);
            
            const pageCount = parseInt(resp.headers['x-pagination-page-count']);
            if (pageCount !== urlParams.page) {
                urlParams.page += 1;
            } else {
                break;
            }
        } catch (error) {
            console.error('Error fetching history:', error.response?.data || error.message);
            continue;
        }
    }
    
    console.log(`Done retrieving ${type} history`);
    return results;
};

// Remove duplicates
const removeDuplicate = async (history, type, keepPerDay) => {
    console.log(`Removing ${type} duplicates`);
    
    const entryType = type === 'movies' ? 'movie' : 'episode';
    const entries = {};
    const duplicates = [];
    
    // Process history in reverse order
    for (const item of history.reverse()) {
        const traktId = item[entryType].ids.trakt;
        const watchedDate = item.watched_at.split('T')[0];
        
        if (traktId in entries) {
            if (!keepPerDay || watchedDate === entries[traktId]) {
                duplicates.push(item.id);
            }
        } else {
            entries[traktId] = watchedDate;
        }
    }
    
    if (duplicates.length > 0) {
        console.log(`${duplicates.length} ${type} duplicate plays to be removed`);
        
        try {
            await session.post(sync_history_url, { ids: duplicates });
            console.log(`${duplicates.length} ${type} duplicates successfully removed!`);
        } catch (error) {
            console.error('Error removing duplicates:', error.response?.data || error.message);
        }
    } else {
        console.log(`No ${type} duplicates found`);
    }
};

// Remove plays from specific date
const removePlaysFromSpecificDate = async (history, type, dateToRemove) => {
    console.log('');
    console.log(`Searching for ${type} plays from ${dateToRemove}`);
    
    const entryType = type === 'movies' ? 'movie' : 'episode';
    let playsToRemove = [];
    
    // Filter entries by date
    for (const item of history) {
        const watchedAt = item.watched_at.split('T')[0];
        if (watchedAt === dateToRemove) {
            playsToRemove.push(item);
        }
    }
    
    if (playsToRemove.length > 0) {
        while (true) {
            // Print the plays found to be removed with index
            console.log(`${playsToRemove.length} ${type} plays found:`);
            playsToRemove.forEach((play, idx) => {
                const watchedAt = play.watched_at;
                
                if (type === 'movies') {
                    const movieTitle = play.movie.title;
                    const releaseYear = play.movie.year || 'Unknown Year';
                    console.log(`[${idx}] ${watchedAt} - ${movieTitle} (${releaseYear})`);
                } else {
                    const showName = play.show ? play.show.title : '';
                    const season = play[entryType].season;
                    const episode = play[entryType].number;
                    const episodeTitle = play[entryType].title;
                    const seasonStr = season.toString().padStart(2, '0');
                    const episodeStr = episode.toString().padStart(2, '0');
                    console.log(`[${idx}]\t${watchedAt} - ${showName} - S${seasonStr}E${episodeStr} - ${episodeTitle}`);
                }
            });
            
            // Ask for confirmation or specify which plays to keep
            console.log('');
            console.log(" - Enter 'y' to remove all plays listed above from your history");
            console.log(" - Enter 'n' to cancel and exit");
            console.log(" - Enter '0 3 12' (example indexes) to specify what plays you want to keep, and print the list again to check it.");
            
            const confirm = (await askQuestion("Choose an option: ")).toLowerCase();
            
            if (confirm === 'y') {
                const playIds = playsToRemove.map(play => play.id);
                try {
                    await session.post(sync_history_url, { ids: playIds });
                    console.log(`${playIds.length} ${type} plays successfully removed!`);
                } catch (error) {
                    console.error('Error removing plays:', error.response?.data || error.message);
                }
                break;
            } else if (confirm === 'n') {
                console.log('Removal canceled.');
                break;
            } else {
                try {
                    // Parse the indexes the user wants to skip
                    const skipIndexes = confirm.split(' ').map(x => parseInt(x.trim()));
                    // Filter out the specified indexes from playsToRemove
                    playsToRemove = playsToRemove.filter((play, idx) => !skipIndexes.includes(idx));
                    
                    if (playsToRemove.length === 0) {
                        console.log('No plays left to remove. Exiting.');
                        break;
                    }
                } catch (error) {
                    console.log("Invalid input. Please enter 'y', 'n', or a list of indexes (e.g., '0 3 12').");
                }
            }
        }
    } else {
        console.log(`No ${type} plays found from ${dateToRemove}`);
    }
};

// Main function
const main = async () => {
    try {
        // Get or load credentials
        [client_id, client_secret, username] = await getCredentials();
        
        // Set up URLs
        get_history_url = `${trakt_api}/users/${username}/history/{type}?page={page}&limit={limit}`;
        sync_history_url = `${trakt_api}/sync/history/remove`;
        
        await loginToTrakt();
        
        // Ask for purpose
        console.log("\nSelect an operation:");
        console.log("[1] Bulk remove duplicate plays at any date");
        console.log("[2] Bulk remove plays from a specified date");
        const operation = await askQuestion("Enter the number of the operation (1 or 2): ");
        
        // Ask for target
        console.log("\nDo you want to affect:");
        console.log("[1] Movies only");
        console.log("[2] Episodes only");
        console.log("[3] Both movies and episodes");
        const contentTypeChoice = await askQuestion("Enter your choice (1, 2, or 3): ");
        
        // Set types based on user's selection
        let types;
        if (contentTypeChoice.trim() === '1') {
            types = ['movies'];
        } else if (contentTypeChoice.trim() === '2') {
            types = ['episodes'];
        } else if (contentTypeChoice.trim() === '3') {
            types = ['movies', 'episodes'];
        } else {
            console.log("Invalid choice. Please enter '1', '2', or '3'.");
            rl.close();
            return;
        }
        
        // Execute operations
        if (operation.trim() === '1') {
            // Remove duplicates operation
            console.log("\nYou have selected: Remove duplicate plays");
            const keepPerDayInput = await askQuestion("Do you want to keep one entry per day? (y/n): ");
            const keepPerDay = keepPerDayInput.trim().toLowerCase() === 'y';
            console.log("\nRemoving duplicates...\n");
            
            // Loop through types (movies, episodes)
            for (const type of types) {
                console.log(type === 'movies' ? " ***** MOVIES *****" : " ***** EPISODES *****");
                const history = await getHistory(type);
                
                // Save history to file
                fs.writeFileSync(`${type}.json`, JSON.stringify(history, null, 4));
                console.log(`History saved in file ${type}.json`);
                
                await removeDuplicate(history, type, keepPerDay);
            }
        } else if (operation.trim() === '2') {
            // Bulk remove by specific date
            console.log("\nYou have selected: Bulk remove plays from a specific date");
            const specificDate = await askQuestion("Enter the date to remove plays from (YYYY-MM-DD): ");
            console.log(`\nRemoving plays from ${specificDate.trim()}...\n`);
            
            // Loop through types (movies, episodes)
            for (const type of types) {
                console.log(type === 'movies' ? " ***** MOVIES *****" : " ***** EPISODES *****");
                const history = await getHistory(type);
                
                // Save history to file
                fs.writeFileSync(`${type}.json`, JSON.stringify(history, null, 4));
                console.log(`History saved in file ${type}.json`);
                
                // Remove plays from the specified date
                await removePlaysFromSpecificDate(history, type, specificDate.trim());
            }
        } else {
            console.log("Invalid option. Please enter '1' or '2'.");
        }
        
    } catch (error) {
        console.error('An error occurred:', error.message);
    } finally {
        rl.close();
    }
};

// Run the script
if (require.main === module) {
    main();
}