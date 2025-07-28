const fs = require('fs');
const readline = require('readline');
const axios = require('axios');

// Files to store the credentials and tokens
const CREDENTIALS_FILE = 'trakt_credentials.json';
const TOKEN_FILE = 'trakt_token.json';

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

// Token management
const saveTokens = (tokenData) => {
    const tokens = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        created_at: Math.floor(Date.now() / 1000) // Current timestamp in seconds
    };
    
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    console.log(`Tokens saved to ${TOKEN_FILE}\n`);
};

const loadTokens = () => {
    if (fs.existsSync(TOKEN_FILE)) {
        const data = fs.readFileSync(TOKEN_FILE, 'utf8');
        return JSON.parse(data);
    }
    return null;
};

const isTokenExpired = (tokenData) => {
    if (!tokenData || !tokenData.created_at || !tokenData.expires_in) {
        return true;
    }
    
    const currentTime = Math.floor(Date.now() / 1000);
    const expirationTime = tokenData.created_at + tokenData.expires_in;
    
    // Add 5 minute buffer before expiration
    return currentTime >= (expirationTime - 300);
};

const refreshAccessToken = async () => {
    const tokenData = loadTokens();
    
    if (!tokenData || !tokenData.refresh_token) {
        console.log('No refresh token found. Need to authenticate.');
        return null;
    }
    
    console.log('Attempting to refresh access token...');
    
    const postData = {
        refresh_token: tokenData.refresh_token,
        client_id: client_id,
        client_secret: client_secret,
        redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
        grant_type: 'refresh_token'
    };
    
    try {
        const tempSession = axios.create({
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Betaseries to Trakt',
                'Connection': 'Keep-Alive'
            }
        });
        
        const response = await tempSession.post(auth_get_token_url, postData);
        console.log('Access token refreshed successfully!');
        
        // Save the new tokens
        saveTokens(response.data);
        
        return response.data;
    } catch (error) {
        console.error('Failed to refresh token:', error.response?.data || error.message);
        console.log('Will need to re-authenticate with PIN.');
        return null;
    }
};
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
    // First, try to use existing tokens
    const existingTokens = loadTokens();
    
    if (existingTokens && !isTokenExpired(existingTokens)) {
        console.log('Using existing valid access token...');
        setupSessionWithToken(existingTokens.access_token);
        return;
    }
    
    // Try to refresh token if we have one
    if (existingTokens && existingTokens.refresh_token) {
        const refreshedTokens = await refreshAccessToken();
        if (refreshedTokens) {
            setupSessionWithToken(refreshedTokens.access_token);
            return;
        }
    }
    
    // If all else fails, do PIN authentication
    console.log('Authentication required');
    console.log('Open the link in a browser and paste the pin');
    console.log(`https://trakt.tv/oauth/authorize?response_type=code&client_id=${client_id}&redirect_uri=urn:ietf:wg:oauth:2.0:oob`);
    console.log('');
    
    const pin = await askQuestion('Pin: ');
    
    // Configure temporary axios instance for authentication
    const tempSession = axios.create({
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
        const response = await tempSession.post(auth_get_token_url, postData);
        console.log('Authentication successful!');
        
        // Save tokens for future use
        saveTokens(response.data);
        
        // Setup session with new token
        setupSessionWithToken(response.data.access_token);
        
    } catch (error) {
        console.error('Authentication failed:', error.response?.data || error.message);
        process.exit(1);
    }
};

const setupSessionWithToken = (accessToken) => {
    // Configure axios instance with authentication
    session = axios.create({
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'Betaseries to Trakt',
            'Connection': 'Keep-Alive',
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': client_id,
            'Authorization': `Bearer ${accessToken}`
        }
    });
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

// List duplicates (view only)
const listDuplicates = async (history, type, keepPerDay) => {
    console.log(`Checking for ${type} duplicates`);
    
    const entryType = type === 'movies' ? 'movie' : 'episode';
    const entries = {};
    const duplicateGroups = {}; // Group duplicates by content
    
    // Process history in reverse order
    for (const item of history.reverse()) {
        const traktId = item[entryType].ids.trakt;
        const watchedDate = item.watched_at.split('T')[0];
        
        if (traktId in entries) {
            if (!keepPerDay || watchedDate === entries[traktId]) {
                // This is a duplicate
                if (!(traktId in duplicateGroups)) {
                    duplicateGroups[traktId] = [];
                    // Find and add the original entry
                    const originalItem = history.find(h => h[entryType].ids.trakt === traktId && h.id !== item.id);
                    if (originalItem) {
                        duplicateGroups[traktId].push(originalItem);
                    }
                }
                duplicateGroups[traktId].push(item);
            }
        } else {
            entries[traktId] = watchedDate;
        }
    }
    
    const duplicateCount = Object.values(duplicateGroups).reduce((total, group) => total + group.length - 1, 0);
    
    if (duplicateCount > 0) {
        console.log(`\n${duplicateCount} ${type} duplicate plays found across ${Object.keys(duplicateGroups).length} titles:`);
        console.log('=====================================');
        
        // Display duplicates grouped by content
        Object.entries(duplicateGroups).forEach(([traktId, items]) => {
            const firstItem = items[0];
            
            if (type === 'movies') {
                const movieTitle = firstItem.movie.title;
                const releaseYear = firstItem.movie.year || 'Unknown Year';
                console.log(`\n📽️  ${movieTitle} (${releaseYear}) - ${items.length} plays:`);
            } else {
                const showName = firstItem.show ? firstItem.show.title : '';
                const season = firstItem[entryType].season;
                const episode = firstItem[entryType].number;
                const episodeTitle = firstItem[entryType].title;
                const seasonStr = season.toString().padStart(2, '0');
                const episodeStr = episode.toString().padStart(2, '0');
                console.log(`\n📺 ${showName} - S${seasonStr}E${episodeStr} - ${episodeTitle} - ${items.length} plays:`);
            }
            
            // Show all plays for this content
            items.forEach((item, idx) => {
                const watchedAt = item.watched_at;
                console.log(`   ${idx + 1}. ${watchedAt}`);
            });
        });
        
        console.log('=====================================');
        console.log(`\nTotal: ${duplicateCount} duplicate entries found that would be removed.`);
        console.log(`Note: This is view-only mode. Use option 1 to actually remove duplicates.`);
    } else {
        console.log(`No ${type} duplicates found`);
    }
};
const removeDuplicate = async (history, type, keepPerDay) => {
    console.log(`Checking for ${type} duplicates`);
    
    const entryType = type === 'movies' ? 'movie' : 'episode';
    const entries = {};
    const duplicates = [];
    const duplicateItems = []; // Store full duplicate items for display
    
    // Process history in reverse order
    for (const item of history.reverse()) {
        const traktId = item[entryType].ids.trakt;
        const watchedDate = item.watched_at.split('T')[0];
        
        if (traktId in entries) {
            if (!keepPerDay || watchedDate === entries[traktId]) {
                duplicates.push(item.id);
                duplicateItems.push(item);
            }
        } else {
            entries[traktId] = watchedDate;
        }
    }
    
    if (duplicates.length > 0) {
        console.log(`\n${duplicates.length} ${type} duplicate plays found:`);
        console.log('=====================================');
        
        // Display duplicates to user
        duplicateItems.forEach((item, idx) => {
            const watchedAt = item.watched_at;
            
            if (type === 'movies') {
                const movieTitle = item.movie.title;
                const releaseYear = item.movie.year || 'Unknown Year';
                console.log(`[${idx}] ${watchedAt} - ${movieTitle} (${releaseYear})`);
            } else {
                const showName = item.show ? item.show.title : '';
                const season = item[entryType].season;
                const episode = item[entryType].number;
                const episodeTitle = item[entryType].title;
                const seasonStr = season.toString().padStart(2, '0');
                const episodeStr = episode.toString().padStart(2, '0');
                console.log(`[${idx}] ${watchedAt} - ${showName} - S${seasonStr}E${episodeStr} - ${episodeTitle}`);
            }
        });
        
        console.log('=====================================');
        console.log(`\nThese ${duplicates.length} duplicate ${type} entries will be removed from your Trakt history.`);
        
        // Ask for confirmation
        const confirm = await askQuestion("Do you want to proceed with removing these duplicates? (y/n): ");
        
        if (confirm.toLowerCase().trim() === 'y') {
            try {
                await session.post(sync_history_url, { ids: duplicates });
                console.log(`${duplicates.length} ${type} duplicates successfully removed!`);
            } catch (error) {
                console.error('Error removing duplicates:', error.response?.data || error.message);
            }
        } else {
            console.log(`Duplicate removal for ${type} cancelled.`);
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
        console.log("[3] List duplicate plays across any date (view only)");
        const operation = await askQuestion("Enter the number of the operation (1, 2, or 3): ");
        
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
        } else if (operation.trim() === '3') {
            // List duplicates (view only)
            console.log("\nYou have selected: List duplicate plays (view only)");
            const keepPerDayInput = await askQuestion("Do you want to consider entries on the same day as duplicates? (y/n): ");
            const keepPerDay = keepPerDayInput.trim().toLowerCase() === 'y';
            console.log("\nSearching for duplicates...\n");
            
            // Loop through types (movies, episodes)
            for (const type of types) {
                console.log(type === 'movies' ? " ***** MOVIES *****" : " ***** EPISODES *****");
                const history = await getHistory(type);
                
                // Save history to file
                fs.writeFileSync(`${type}.json`, JSON.stringify(history, null, 4));
                console.log(`History saved in file ${type}.json`);
                
                await listDuplicates(history, type, keepPerDay);
            }
        } else {
            console.log("Invalid option. Please enter '1', '2', or '3'.");
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