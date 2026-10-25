import { dataSourceOptions } from "@/config/.";
import { DataSource } from "typeorm";
import { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";

async function migrateRun(): Promise<void> {
  const dataSource = new DataSource(dataSourceOptions as PostgresConnectionOptions);
  try {
    await dataSource.initialize();
    console.log("Running database migrations...");
    const migrations = await dataSource.runMigrations();
    if (migrations.length === 0) console.log("No pending migrations.");
    else console.log(`Completed ${migrations.length} migration(s): ${migrations.map((m) => m.name).join(", ")}`);
  } catch (error) {
    console.error("Database migration failed:", error);
    process.exitCode = 1;
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

void migrateRun();
