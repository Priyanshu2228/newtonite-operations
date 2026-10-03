import { seed } from "../src/lib/seed";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is missing");
  }
  console.log("Seeding development database at:", url);
  await seed(url);
}

main().catch((err) => {
  console.error("Seed script failed:", err);
  process.exit(1);
});
