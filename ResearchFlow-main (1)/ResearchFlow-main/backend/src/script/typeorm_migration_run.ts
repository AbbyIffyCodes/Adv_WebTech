import { DataSource } from "typeorm";
import { dataSourceOptions } from "../config/database.config";

async function migrate() {
  const source = new DataSource(dataSourceOptions);
  try {
    await source.initialize();
    const migrations = await source.runMigrations({ transaction: "all" });
    console.log(
      "Migrations completed:",
      migrations.map((migration) => migration.name).join(", ") ||
        "already up to date",
    );
  } finally {
    if (source.isInitialized) await source.destroy();
  }
}
migrate().catch((error) => {
  console.error(
    "Migration failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});
