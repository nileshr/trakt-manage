import { getConfig, setConfig, getJsonConfig, setJsonConfig } from "./config";
import * as readline from "readline";
import { existsSync, readFileSync } from "fs";

const TRAKT_API = 'https://api.trakt.tv';

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  created_at: number;
}

interface Credentials {
    client_id: string;
    client_secret: string;
    username: string;
}

export interface TraktHistoryItem {
    id: number;
    watched_at: string;
    action: string;
    type: 'movie' | 'episode';
    movie?: {
        title: string;
        year: number;
        ids: { trakt: number; slug: string; imdb: string; tmdb: number };
    };
    show?: {
        title: string;
        year: number;
        ids: { trakt: number; slug: string; imdb: string; tmdb: number };
    };
    episode?: {
        season: number;
        number: number;
        title: string;
        ids: { trakt: number; imdb: string; tmdb: number };
    };
}

function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => rl.question(query, (ans) => {
        rl.close();
        resolve(ans);
    }));
}

export class TraktClient {
    private clientId: string = "";
    private clientSecret: string = "";
    private username: string = "";
    private tokens: Tokens | null = null;

    async init() {
        let creds = await getJsonConfig<Credentials>("credentials");
        
        // Migration: Check for legacy file
        if (!creds && existsSync('trakt_credentials.json')) {
            console.log("Migrating credentials from trakt_credentials.json...");
            try {
                const data = JSON.parse(readFileSync('trakt_credentials.json', 'utf8'));
                creds = {
                    client_id: data.client_id,
                    client_secret: data.client_secret,
                    username: data.username
                };
                await setJsonConfig("credentials", creds);
            } catch (e) {
                console.error("Failed to migrate credentials:", e);
            }
        }

        if (creds) {
            this.clientId = creds.client_id;
            this.clientSecret = creds.client_secret;
            this.username = creds.username;
        } else {
            console.log("First time setup - Enter Trakt Credentials");
            this.clientId = await askQuestion('Client ID: ');
            this.clientSecret = await askQuestion('Client Secret: ');
            this.username = await askQuestion('Username: ');
            await setJsonConfig("credentials", {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                username: this.username
            });
        }

        this.tokens = await getJsonConfig<Tokens>("tokens");
        
        // Migration: Check for legacy token file
        if (!this.tokens && existsSync('trakt_token.json')) {
             console.log("Migrating tokens from trakt_token.json...");
             try {
                 const data = JSON.parse(readFileSync('trakt_token.json', 'utf8'));
                 this.tokens = {
                     access_token: data.access_token,
                     refresh_token: data.refresh_token,
                     expires_in: data.expires_in,
                     created_at: data.created_at
                 };
                 await setJsonConfig("tokens", this.tokens);
             } catch (e) {
                 console.error("Failed to migrate tokens:", e);
             }
        }

        // Don't auto auth here, do it on demand
    }

    async ensureAuth() {
        if (!this.tokens) {
            await this.authenticate();
        } else if (this.isTokenExpired()) {
            await this.refreshTokens();
        }
    }

    isTokenExpired() {
        if (!this.tokens) return true;
        const now = Math.floor(Date.now() / 1000);
        return now >= (this.tokens.created_at + this.tokens.expires_in - 300);
    }

    async authenticate() {
        console.log('Authentication required');
        const url = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${this.clientId}&redirect_uri=urn:ietf:wg:oauth:2.0:oob`;
        console.log(`Open: ${url}`);
        const pin = await askQuestion('Enter PIN: ');

        const res = await fetch(`${TRAKT_API}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: pin,
                client_id: this.clientId,
                client_secret: this.clientSecret,
                redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
                grant_type: 'authorization_code'
            })
        });

        if (!res.ok) throw new Error(`Auth failed: ${await res.text()}`);
        const data = await res.json();
        await this.saveTokens(data);
    }

    async refreshTokens() {
        console.log("Refreshing tokens...");
        if (!this.tokens?.refresh_token) return this.authenticate();

        const res = await fetch(`${TRAKT_API}/oauth/token`, {
             method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                refresh_token: this.tokens.refresh_token,
                client_id: this.clientId,
                client_secret: this.clientSecret,
                redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
                grant_type: 'refresh_token'
            })
        });

        if (!res.ok) {
             console.error("Refresh failed, re-authenticating...");
             return this.authenticate();
        }
        const data = await res.json();
        await this.saveTokens(data);
    }

    async saveTokens(data: any) {
        this.tokens = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in,
            created_at: data.created_at || Math.floor(Date.now() / 1000)
        };
        await setJsonConfig("tokens", this.tokens);
    }

    async fetch(endpoint: string, options: any = {}) {
        await this.ensureAuth();
        const headers = {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': this.clientId,
            'Authorization': `Bearer ${this.tokens?.access_token}`,
            ...options.headers
        };
        
        try {
            const res = await fetch(`${TRAKT_API}${endpoint}`, {
                ...options,
                headers
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`API Request failed: ${res.status} ${text}`);
            }
            return res; 
        } catch (error) {
            console.error(`Fetch error for ${endpoint}:`, error);
            throw error;
        }
    }

    async getHistory(type: 'movies' | 'episodes'): Promise<TraktHistoryItem[]> {
        let results: TraktHistoryItem[] = [];
        let page = 1;
        const limit = 100; // Trakt limit
        
        console.log(`Fetching ${type} history...`);
        
        while (true) {
            const url = `/users/${this.username}/history/${type}?page=${page}&limit=${limit}`;
            const res = await this.fetch(url);
            const data = await res.json() as TraktHistoryItem[];
            results = results.concat(data);
            
            const pageCountHeader = res.headers.get('x-pagination-page-count');
            const pageCount = pageCountHeader ? parseInt(pageCountHeader) : 1;
            process.stdout.write(`\rPage ${page}/${pageCount} (${results.length} items)`);
            
            if (page >= pageCount) break;
            page++;
        }
        console.log("\nDone.");
        return results;
    }

    async removeHistory(ids: number[]) {
        if (ids.length === 0) return;
        
        await this.fetch('/sync/history/remove', {
            method: 'POST',
            body: JSON.stringify({ ids })
        });
    }
}
