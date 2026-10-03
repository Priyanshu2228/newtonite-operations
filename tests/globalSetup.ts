import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { Client } from "pg";
import { seed } from "../src/lib/seed";

export default async function globalSetup() {
  const envPath = path.resolve(process.cwd(), ".env");
  const testEnvPath = path.resolve(process.cwd(), ".env.test");

  const devParsed = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};
  const testParsed = fs.existsSync(testEnvPath) ? dotenv.parse(fs.readFileSync(testEnvPath)) : {};

  const devUrl = devParsed.DATABASE_URL || process.env.DATABASE_URL;
  const testUrl = testParsed.DATABASE_URL_TEST || process.env.DATABASE_URL_TEST;

  if (!devUrl || !testUrl) {
    throw new Error("Safety check failed: DATABASE_URL and DATABASE_URL_TEST must both be defined");
  }

  if (devUrl === testUrl) {
    throw new Error("Safety check failed: DATABASE_URL_TEST must differ from DATABASE_URL");
  }

  const testUrlObj = new URL(testUrl);
  const testDbName = testUrlObj.pathname.replace(/^\//, "");

  if (!testDbName.includes("test")) {
    throw new Error(`Safety check failed: Test database name '${testDbName}' does not contain 'test'`);
  }

  // Connect directly to test database to double check active DB name
  const client = new Client({ connectionString: testUrl });
  await client.connect();

  try {
    const res = await client.query("SELECT current_database()");
    const currentDb = res.rows[0].current_database;

    if (!currentDb.includes("test")) {
      throw new Error(`Safety check failed: Connected database '${currentDb}' does not contain 'test'`);
    }

    // Drop and recreate ONLY public schema of test database
    console.log(`[Test Global Setup] Resetting public schema on '${currentDb}'...`);
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    await client.end();
  }

  // Run migrations against test database
  console.log("[Test Global Setup] Running migrations on test database...");
  execSync("npx prisma migrate deploy", {
    env: {
      ...process.env,
      DATABASE_URL: testUrl,
    },
    stdio: "inherit",
  });

  // Explicitly call seed(DATABASE_URL_TEST)
  console.log("[Test Global Setup] Seeding test database...");
  await seed(testUrl);
  console.log("[Test Global Setup] Setup complete!");
}
