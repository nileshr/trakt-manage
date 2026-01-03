#!/usr/bin/env bun

import { TraktClient } from "../services/trakt";
import { saveHistoryToDb, getHistoryFromDb } from "../services/history";
import { findDuplicates } from "../utils";
import { getItemTitle, type TraktHistoryItem } from "../types";
import pkg from "../../package.json";
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
    const arg = args[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (i + 1 < args.length && nextArg && !nextArg.startsWith("--")) {
        opts[key] = args[i + 1];
        i++;
      } else {
        opts[key] = true;
      }
    } else {
      opts.args.push(arg);
    }
  }
  return opts;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printHelp();
    return;
  }

  const command = args[0];
  const opts = parseOptions(args.slice(1));
  const traktClient = new TraktClient();

  try {
    await traktClient.init();

    if (command === "auth") {
      await traktClient.authenticate();
      console.log("Authenticated successfully.");
      return;
    }

    if (command === "sync") {
      const typeArg = opts.args[0] || opts.type || "all";
      const types = typeArg === "all" ? ["movies", "episodes"] : [typeArg];

      for (const t of types) {
        if (t !== "movies" && t !== "episodes") {
          console.error(`Invalid type: ${t}. Must be 'movies' or 'episodes'.`);
          continue;
        }
        const items = await traktClient.getHistory(t);
        await saveHistoryToDb(items, t);
      }
      return;
    }

    if (command === "duplicates") {
      const typeArg = opts.args[0] || opts.type;
      if (!typeArg || (typeArg !== "movies" && typeArg !== "episodes")) {
        console.error("Please specify type: movies or episodes");
        return;
      }

      // Try load from DB first
      let items = await getHistoryFromDb(typeArg as "movies" | "episodes");
      if (items.length === 0) {
        console.log("No local history found. Syncing...");
        items = await traktClient.getHistory(typeArg as "movies" | "episodes");
        await saveHistoryToDb(items, typeArg);
      }

      const keepPerDay = !!opts.daily;
      const fix = !!opts.fix;

      console.log(`Loaded ${items.length} items from database.`);

      const duplicates = findDuplicates(items, {
        type: typeArg as "movies" | "episodes",
        keepPerDay,
      });

      console.log(`Found ${duplicates.length} duplicates.`);

      if (duplicates.length > 0) {
        // Print details
        for (const item of duplicates) {
          console.log(
            `[${item.watched_at}] ${getItemTitle(item)} (${item.id})`,
          );
        }

        if (fix) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          rl.question(
            `Delete ${duplicates.length} items? (y/N) `,
            async (ans) => {
              if (ans.toLowerCase() === "y") {
                const ids = duplicates.map((d) => d.id);
                await traktClient.removeHistory(ids);
                console.log("Removed.");
                // Resync
                const newItems = await traktClient.getHistory(
                  typeArg as "movies" | "episodes",
                );
                await saveHistoryToDb(newItems, typeArg);
              }
              rl.close();
            },
          );
        }
      }
      return;
    }

    if (command === "remove-date") {
      const date = opts.args[0];
      const typeArg = opts.args[1];

      if (!date || !typeArg) {
        console.error("Usage: trakt remove-date <YYYY-MM-DD> <type>");
        return;
      }

      let items = await getHistoryFromDb(typeArg as "movies" | "episodes");
      if (items.length === 0) {
        items = await traktClient.getHistory(typeArg as "movies" | "episodes");
        await saveHistoryToDb(items, typeArg);
      }

      const toRemove = items.filter((i: TraktHistoryItem) =>
        i.watched_at.startsWith(date),
      );
      console.log(`Found ${toRemove.length} items on ${date}`);
      toRemove.forEach((i: TraktHistoryItem) =>
        console.log(` - ${getItemTitle(i)}`),
      );

      if (toRemove.length > 0) {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.question("Remove these plays? (y/N) ", async (ans) => {
          if (ans.toLowerCase() === "y") {
            await traktClient.removeHistory(
              toRemove.map((i: TraktHistoryItem) => i.id),
            );
            console.log("Removed.");
            // Resync
            const newItems = await traktClient.getHistory(
              typeArg as "movies" | "episodes",
            );
            await saveHistoryToDb(newItems, typeArg);
          }
          rl.close();
        });
      }
      return;
    }

    printHelp();
  } catch (e) {
    console.error("An error occurred:", e);
    process.exit(1);
  }
}

main();
