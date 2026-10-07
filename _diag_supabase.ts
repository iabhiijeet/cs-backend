import "dotenv/config";
import { pool } from "./src/db.js";
import { supabase } from "./src/lib/supabase.js";

async function run() {
  const tables = ["official_emission_factors", "emission_factor_mappings", "india_fixed_emission_factors", "climatiq_factor_cache"];

  console.log("POOL DB tables:");
  const poolRes = await pool.query(
    "select table_name from information_schema.tables where table_schema='public' order by table_name"
  );
  const poolTables = new Set(poolRes.rows.map((r: any) => r.table_name));
  for (const t of tables) console.log(`  ${t}: ${poolTables.has(t) ? "EXISTS" : "MISSING"}`);
  console.log("  total tables in pool:", poolTables.size);

  console.log("SUPABASE tables:");
  for (const t of tables) {
    const { error, count } = await supabase.from(t).select("*", { count: "exact", head: true });
    console.log(`  ${t}: ${error ? "ERR " + error.message : `ok count=${count ?? 0}`}`);
  }

  await pool.end();
  process.exit(0);
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});