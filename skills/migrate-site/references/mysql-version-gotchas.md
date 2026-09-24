# MySQL Version Gotchas

## MySQL 5.7 → 8.0

MySQL 8.0 changed several defaults that can cause silent failures when a database
created under 5.7 is used with an 8.0 server.

### Default Collation Change

MySQL 5.7 default: `utf8mb4_general_ci`
MySQL 8.0 default: `utf8mb4_0900_ai_ci`

If some tables were created with 5.7 defaults and others with 8.0 defaults,
joins between them will fail with:

```
ERROR 1267 (HY000): Illegal mix of collations (utf8mb4_general_ci, IMPLICIT)
and (utf8mb4_0900_ai_ci, IMPLICIT) for operation '='
```

This looks like an application bug. It is a collation mismatch.

### Detecting the Problem

```sql
-- Check collations in the database
SELECT table_name, table_collation
FROM information_schema.tables
WHERE table_schema = 'acme';

-- Check column-level collations
SELECT table_name, column_name, character_set_name, collation_name
FROM information_schema.columns
WHERE table_schema = 'acme'
  AND character_set_name IS NOT NULL
ORDER BY table_name, column_name;
```

### Fixing the Collation Mismatch

Option A: Force consistent collation on the target server

```sql
-- Set database-level default
ALTER DATABASE acme
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- Fix all tables (run this and execute the output)
SELECT CONCAT(
    'ALTER TABLE `', table_name, '` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'
) FROM information_schema.tables
WHERE table_schema = 'acme';
```

Option B: Set MySQL 8.0 to use the old collation by default

```ini
# /etc/mysql/conf.d/collation.cnf
[mysqld]
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
```

**Important:** Decide before restoring the dump. Changing collation after restore
requires re-running the alter table statements and may take significant time on
large tables.

### Other MySQL 8.0 Changes

| Change | Impact | Fix |
|--------|--------|-----|
| `NO_ZERO_IN_DATE`, `NO_ZERO_DATE` strict mode defaults | `0000-00-00` dates rejected | Fix data or disable strict mode |
| `utf8` alias now maps to `utf8mb3` | Deprecation warnings | Change to `utf8mb4` |
| Auth plugin: `caching_sha2_password` default | Some older clients can't connect | `ALTER USER ... IDENTIFIED WITH mysql_native_password` |
| `GROUP BY` requiring full functional dependency | Queries that worked in 5.7 fail | Fix queries or enable `ONLY_FULL_GROUP_BY` exception |
| `SHOW VARIABLES` output changes | Monitoring scripts may break | Update queries |

### Checking for Reserved Words

MySQL 8.0 added new reserved words. If a table or column uses them as an identifier
without backticks, the query will fail:

```bash
# Check common new reserved words in schema
mysql acme -e "SHOW CREATE TABLE users\G" | grep -iE 'rank|groups|system|json'
```

## Dump Compatibility

When dumping from MySQL 5.7 and importing to 8.0:

```bash
mysqldump --compatible=ansi --column-statistics=0 \
    --single-transaction "$DB_NAME" > dump.sql
```

`--column-statistics=0` prevents mysqldump 8.0 from adding `ANALYZE TABLE` statements
that 5.7 can't restore from. Use this on the target's mysqldump binary when creating
dumps from a 5.7 source via SSH.
