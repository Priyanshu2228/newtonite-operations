import dotenv from "dotenv";
import path from "path";

// Load .env and .env.test before any app code imports Prisma singleton
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.test"), override: true });

const testUrl = process.env.DATABASE_URL_TEST || "postgresql://postgres:postgres@localhost:5433/newtonite_test";

// Enforce process.env.DATABASE_URL = DATABASE_URL_TEST for test worker singleton
process.env.DATABASE_URL = testUrl;
