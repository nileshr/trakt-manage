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

// Fetch recent history
const getRecentHistory = async (type, days) => {
    console.log(`\nRetrieving recent ${type} history from the last ${days} days`);
    
    // Calculate the date from which we want to retrieve history
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateString = startDate.toISOString().split('T')[0];
    
    // URL to get recent history
    const url = `${trakt_api}/users/${username}/history/${type}?limit=100&start_at=${startDateString}`;
    
    try {
        const resp = await session.get(url);
        console.log(`Found ${resp.data.length} ${type} plays in the last ${days} days`);
        return resp.data;
    } catch (error) {
        console.error('Error fetching history:', error.response?.data || error.message);
        return [];
    }
};

// Display recent history in a readable format
const displayRecentHistory = (history, type) => {
    if (history.length === 0) {
        console.log(`No ${type} history found.`);
        return;
    }
    
    console.log(`\nRecent ${type} history:`);
    console.log('=====================================');
    
    const entryType = type === 'movies' ? 'movie' : 'episode';
    
    history.forEach((item, idx) => {
        const watchedAt = new Date(item.watched_at).toLocaleString();
        
        if (type === 'movies') {
            const movieTitle = item[entryType].title;
            const releaseYear = item[entryType].year || 'Unknown Year';
            console.log(`${idx + 1}. ${watchedAt} - ${movieTitle} (${releaseYear})`);
        } else {
            const showName = item.show ? item.show.title : 'Unknown Show';
            const season = item[entryType].season;
            const episode = item[entryType].number;
            const episodeTitle = item[entryType].title;
            const seasonStr = season.toString().padStart(2, '0');
            const episodeStr = episode.toString().padStart(2, '0');
            console.log(`${idx + 1}. ${watchedAt} - ${showName} - S${seasonStr}E${episodeStr} - ${episodeTitle}`);
        }
    });
    
    console.log('=====================================');
};

// Main function
const main = async () => {
    try {
        // Get or load credentials
        [client_id, client_secret, username] = await getCredentials();
        
        await loginToTrakt();
        
        // Ask user for the time period
        const daysInput = await askQuestion("Enter the number of days to look back (default 7): ");
        const days = parseInt(daysInput) || 7;
        
        // Ask for target
        console.log("\nDo you want to view:");
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
        
        // Loop through types (movies, episodes)
        for (const type of types) {
            console.log(type === 'movies' ? "\n ***** MOVIES *****" : "\n ***** EPISODES *****");
            const history = await getRecentHistory(type, days);
            
            // Save history to file
            fs.writeFileSync(`recent_${type}.json`, JSON.stringify(history, null, 4));
            console.log(`Recent ${type} history saved in file recent_${type}.json`);
            
            // Display recent history
            displayRecentHistory(history, type);
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