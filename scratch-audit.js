const db = require("./config/db");

async function checkDetails() {
  const indexes = await db.raw(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE tablename IN ('orders', 'order_items', 'order_messages', 'notifications')
    ORDER BY tablename, indexname;
  `);
  console.log("--- ALL INDEXES ON ORDERS & RELATED TABLES ---");
  console.table(indexes.rows);

  const fks = await db.raw(`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.delete_rule
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN ('orders', 'order_items', 'order_messages', 'notifications')
    ORDER BY tc.table_name, kcu.column_name;
  `);
  console.log("--- FOREIGN KEYS ---");
  console.table(fks.rows);

  process.exit(0);
}
checkDetails().catch((e) => {
  console.error(e);
  process.exit(1);
});

