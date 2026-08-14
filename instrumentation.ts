export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.RUN_MIGRATIONS === "false") return;
  const [{ migrate }, { db }] = await Promise.all([
    import("drizzle-orm/postgres-js/migrator"),
    import("./db"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });
  const { bootstrapInitialAdmin } = await import("./db/bootstrap");
  await bootstrapInitialAdmin();
}
