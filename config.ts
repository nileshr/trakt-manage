import { db } from "./db";
import { config } from "./db/schema";
import { eq } from "drizzle-orm";

export async function getConfig(key: string): Promise<string | null> {
  const result = await db.select().from(config).where(eq(config.key, key));
  return result[0]?.value ?? null;
}

export async function setConfig(key: string, value: string) {
  await db
    .insert(config)
    .values({ key, value })
    .onConflictDoUpdate({ target: config.key, set: { value } });
}

export async function getJsonConfig<T>(key: string): Promise<T | null> {
  const val = await getConfig(key);
  return val ? JSON.parse(val) : null;
}

export async function setJsonConfig(key: string, value: any) {
  await setConfig(key, JSON.stringify(value));
}
