#!/usr/bin/env bun
import { initializeDatabase } from "./db";
import { TraktClient } from "./trakt";
import { history, config } from "./db/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import pkg from "./package.json";
import * as readline from "readline";

function printHelp() {
    console.log(`
Trakt Manager CLI v${pkg.version}

Usage:
  trakt <command> [options]

Commands:
  auth                    Authenticate with Trakt
  sync [type]             Fetch and cache history (type: movies, episodes, all)
  duplicates [type]       List duplicates (options: --fix, --daily)
  remove-date <date>      Remove plays on a specific date (YYYY-MM-DD)
  help                    Show this help

Options:
  --fix                   Automatically remove found duplicates (interactive confirmation)
  --daily                 Keep one play per day (treat multiple plays on same day as duplicates)
  --type <type>           Specify 'movies' or 'episodes'
`);
}

function parseOptions(args: string[]) {
    const opts: any = { args: [] };
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].slice(2);
            if (i + 1 < args.length && !args[i+1].startsWith('--')) {
                 opts[key] = args[i+1];
                 i++;
            } else {
                 opts[key] = true;
            }
        } else {
            opts.args.push(args[i]);
        }
    }
    return opts;
}

async function saveHistoryToDb(items: any[], type: string) {
    console.log(`Saving ${items.length} ${type} to database...`);
    // Clear existing for this type to avoid mess? Or upsert?
    // Original script overwrote JSONs.
    // Let's clear for simplicity and consistency with "sync" concept.
    await db.delete(history).where(eq(history.type, type === 'movies' ? 'movie' : 'episode'));

    const batchSize = 100;
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const values = batch.map((item: any) => {
             const entryType = type === 'movies' ? 'movie' : 'episode';
             const entryData = item[entryType];
             return {
                 traktId: entryData.ids.trakt,
                 type: entryType,
                 title: entryData.title,
                 year: entryData.year || null,
                 season: item.episode?.season || null,
                 episode: item.episode?.number || null,
                 watchedAt: item.watched_at,
                 rawJson: JSON.stringify(item)
             };
        });
        await db.insert(history).values(values);
    }
    console.log("Database updated.");
}

async function getHistoryFromDb(type: 'movies' | 'episodes') {
    const entryType = type === 'movies' ? 'movie' : 'episode';
    const rows = await db.select().from(history).where(eq(history.type, entryType));
    return rows.map(r => JSON.parse(r.rawJson || '{}'));
}

async function main() {
    initializeDatabase();
    
    const args = process.argv.slice(2);
    if (args.length === 0) {
        printHelp();
        return;
    }

    const command = args[0];
    const opts = parseOptions(args.slice(1));
    const client = new TraktClient();
    await client.init();

    if (command === 'auth') {
        await client.authenticate();
        console.log("Authenticated successfully.");
        return;
    }

    if (command === 'sync') {
        const typeArg = opts.args[0] || 'all';
        const types = typeArg === 'all' ? ['movies', 'episodes'] : [typeArg];
        
        for (const t of types) {
             const items = await client.getHistory(t as any);
             await saveHistoryToDb(items, t);
        }
        return;
    }

    if (command === 'duplicates') {
        const typeArg = opts.args[0];
        if (!typeArg || (typeArg !== 'movies' && typeArg !== 'episodes')) {
            console.error("Please specify type: movies or episodes");
            return;
        }

        // Try load from DB first
        let items = await getHistoryFromDb(typeArg as any);
        if (items.length === 0) {
            console.log("No local history found. Syncing...");
            items = await client.getHistory(typeArg as any);
            await saveHistoryToDb(items, typeArg);
        }

        const keepPerDay = !!opts.daily;
        const fix = !!opts.fix;
        const entryType = typeArg === 'movies' ? 'movie' : 'episode';
        
        const seen: Record<string, string> = {}; // id -> date
        const duplicates: any[] = [];
        const duplicateGroups: Record<string, any[]> = {};

        // Process in reverse (oldest first? original script said "reverse order")
        // Original: entries[traktId] = watchedDate. if exists -> duplicate.
        // If we process reverse (oldest first), the first one we see is the "original" (kept).
        // Later ones are duplicates.
        // Wait, original script: `history.reverse()`.
        // If history comes from API, it's usually newest first.
        // Reverse -> Oldest first.
        // loop:
        //   item (oldest) -> seen[id] = date.
        //   item (newer) -> seen[id] exists -> duplicate.
        // So we keep the OLDEST play.

        const sortedItems = [...items].sort((a, b) => new Date(a.watched_at).getTime() - new Date(b.watched_at).getTime());
        
        for (const item of sortedItems) {
            const traktId = item[entryType].ids.trakt;
            const date = item.watched_at.split('T')[0];
            
            if (seen[traktId]) {
                if (!keepPerDay || seen[traktId] === date) {
                    duplicates.push(item);
                    if (!duplicateGroups[traktId]) duplicateGroups[traktId] = [];
                    duplicateGroups[traktId].push(item);
                }
            } else {
                seen[traktId] = date;
            }
        }

        console.log(`Found ${duplicates.length} duplicates.`);
        
        if (duplicates.length > 0) {
             // Print details...
             for (const item of duplicates) {
                 const title = item[entryType].title;
                 console.log(`[${item.watched_at}] ${title} (${item.id})`);
             }

             if (fix) {
                 const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                 rl.question(`Delete ${duplicates.length} items? (y/N) `, async (ans) => {
                     if (ans.toLowerCase() === 'y') {
                         const ids = duplicates.map(d => d.id);
                         await client.removeHistory(ids);
                         console.log("Removed.");
                         // Resync
                         const newItems = await client.getHistory(typeArg as any);
                         await saveHistoryToDb(newItems, typeArg);
                     }
                     rl.close();
                 });
             }
        }
        return;
    }

    if (command === 'remove-date') {
        const date = opts.args[0];
        const typeArg = opts.args[1];

        if (!date || !typeArg) {
            console.error("Usage: trakt remove-date <YYYY-MM-DD> <type>");
            return;
        }

        let items = await getHistoryFromDb(typeArg as any);
         if (items.length === 0) {
            items = await client.getHistory(typeArg as any);
            await saveHistoryToDb(items, typeArg);
        }

        const toRemove = items.filter(i => i.watched_at.startsWith(date));
        console.log(`Found ${toRemove.length} items on ${date}`);
        toRemove.forEach(i => console.log(` - ${i[typeArg === 'movies' ? 'movie' : 'episode'].title}`));

        if (toRemove.length > 0) {
             const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
             rl.question("Remove these plays? (y/N) ", async (ans) => {
                 if (ans.toLowerCase() === 'y') {
                     await client.removeHistory(toRemove.map(i => i.id));
                     console.log("Removed.");
                     // Resync
                     const newItems = await client.getHistory(typeArg as any);
                     await saveHistoryToDb(newItems, typeArg);
                 }
                 rl.close();
             });
        }
        return;
    }

    printHelp();
}

main().catch(console.error);
