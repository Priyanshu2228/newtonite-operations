import { Client } from "pg";

async function main() {
  const testUrl = process.env.DATABASE_URL_TEST || "postgresql://postgres:postgres@localhost:5433/newtonite_test";
  const urlObj = new URL(testUrl);
  const dbName = urlObj.pathname.replace(/^\//, "");

  if (!dbName.includes("test")) {
    throw new Error(`Refusing to create database: name '${dbName}' does not contain 'test'`);
  }

  // Connect to default 'postgres' database to run CREATE DATABASE
  urlObj.pathname = "/postgres";
  const client = new Client({ connectionString: urlObj.toString() });
  await client.connect();

  try {
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Successfully created test database: ${dbName}`);
    } else {
      console.log(`Test database '${dbName}' already exists.`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Failed to create test database:", err);
  process.exit(1);
});
