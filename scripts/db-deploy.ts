import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const LOCAL_PRISMA = join(process.cwd(), 'node_modules', '.bin', 'prisma');
const PRISMA_BIN = existsSync(LOCAL_PRISMA) ? LOCAL_PRISMA : 'npx';
const PRISMA_ARGS = existsSync(LOCAL_PRISMA) ? [] : ['prisma'];
const SCHEMA = join('prisma', 'schema.prisma');
const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');
const DRY_RUN = process.argv.includes('--dry-run');
const REPAIR_HISTORY = process.argv.includes('--repair-history');
const LOCK_TIMEOUT_MS = 15000;

function migrationEnv(): NodeJS.ProcessEnv {
  const url = process.env.DATABASE_URL;
  if (!url || /[?&]options=/.test(url)) {
    return process.env;
  }
  const separator = url.includes('?') ? '&' : '?';
  const options = encodeURIComponent(`-c lock_timeout=${LOCK_TIMEOUT_MS}`);
  return { ...process.env, DATABASE_URL: `${url}${separator}options=${options}` };
}

interface MigrationObjects {
  tables: string[];
  columns: Array<{ table: string; column: string }>;
  indexes: string[];
  types: string[];
}

function runPrisma(args: string[]): void {
  execFileSync(PRISMA_BIN, [...PRISMA_ARGS, ...args, '--schema', SCHEMA], {
    stdio: 'inherit',
    env: migrationEnv(),
  });
}

interface HistoryRow {
  applied: boolean;
  rolledBack: boolean;
  failed: boolean;
}

interface Catalog {
  tables: Set<string>;
  columns: Set<string>;
  indexes: Set<string>;
  types: Set<string>;
  history: Map<string, HistoryRow>;
}

// One connection and five catalog queries, rather than a prisma subprocess per
// check: the per-object approach spent minutes spawning processes on a history
// this size, which reads as a hang.
async function readCatalog(prisma: PrismaClient): Promise<Catalog> {
  const [tables, columns, indexes, types, historyExists] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public'`
    ),
    prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT table_name || '.' || column_name AS name FROM information_schema.columns` +
        ` WHERE table_schema = 'public'`
    ),
    prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'`
    ),
    prisma.$queryRawUnsafe<Array<{ name: string }>>(`SELECT typname AS name FROM pg_type`),
    prisma.$queryRawUnsafe<Array<{ present: string | null }>>(
      `SELECT to_regclass('public._prisma_migrations')::text AS present`
    ),
  ]);

  const history = new Map<string, HistoryRow>();
  if (historyExists[0]?.present) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ name: string; finished: boolean; rolled_back: boolean }>
    >(
      `SELECT migration_name AS name, finished_at IS NOT NULL AS finished,` +
        ` rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations"`
    );
    for (const row of rows) {
      history.set(row.name, {
        applied: row.finished && !row.rolled_back,
        rolledBack: row.rolled_back,
        failed: !row.finished && !row.rolled_back,
      });
    }
  }

  return {
    tables: new Set(tables.map(row => row.name)),
    columns: new Set(columns.map(row => row.name)),
    indexes: new Set(indexes.map(row => row.name)),
    types: new Set(types.map(row => row.name)),
    history,
  };
}

function matchAll(sql: string, pattern: RegExp): string[] {
  return [...sql.matchAll(pattern)].map(match => match[1]);
}

function parseObjects(sql: string): MigrationObjects {
  const tables = matchAll(sql, /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([^"\s(]+)"?/gi);
  const indexes = matchAll(
    sql,
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([^"\s(]+)"?/gi
  );
  const types = matchAll(sql, /CREATE\s+TYPE\s+"?([^"\s]+)"?/gi);

  const columns: Array<{ table: string; column: string }> = [];
  for (const statement of sql.split(';')) {
    const target = /ALTER\s+TABLE\s+(?:ONLY\s+)?"?([^"\s]+)"?/i.exec(statement);
    if (!target) {
      continue;
    }
    for (const column of matchAll(
      statement,
      /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([^"\s]+)"?/gi
    )) {
      columns.push({ table: target[1], column });
    }
  }

  const created = new Set(tables);
  return {
    tables,
    columns: columns.filter(entry => !created.has(entry.table)),
    indexes,
    types,
  };
}

function objectCount(objects: MigrationObjects): number {
  return (
    objects.tables.length + objects.columns.length + objects.indexes.length + objects.types.length
  );
}

function objectNames(objects: MigrationObjects): Array<{ key: string; set: keyof Catalog }> {
  return [
    ...objects.tables.map(table => ({ key: table, set: 'tables' as const })),
    ...objects.columns.map(entry => ({
      key: `${entry.table}.${entry.column}`,
      set: 'columns' as const,
    })),
    ...objects.indexes.map(index => ({ key: index, set: 'indexes' as const })),
    ...objects.types.map(type => ({ key: type, set: 'types' as const })),
  ];
}

function isPresent(entry: { key: string; set: keyof Catalog }, catalog: Catalog): boolean {
  return (catalog[entry.set] as Set<string>).has(entry.key);
}

function alreadyInDatabase(objects: MigrationObjects, catalog: Catalog): boolean {
  return objectNames(objects).every(entry => isPresent(entry, catalog));
}

function absentFromDatabase(objects: MigrationObjects, catalog: Catalog): boolean {
  return objectNames(objects).every(entry => !isPresent(entry, catalog));
}

function isRecorded(name: string, catalog: Catalog): boolean {
  return catalog.history.get(name)?.applied === true;
}

function hasRow(name: string, catalog: Catalog): boolean {
  return catalog.history.has(name);
}

function isFailed(name: string, catalog: Catalog): boolean {
  return catalog.history.get(name)?.failed === true;
}

function hasExistingSchema(catalog: Catalog): boolean {
  return catalog.tables.size > 0;
}

function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

function readMigration(name: string): MigrationObjects {
  return parseObjects(readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));
}

function findNewestApplied(migrations: string[], catalog: Catalog): number {
  for (let index = migrations.length - 1; index >= 0; index -= 1) {
    const objects = readMigration(migrations[index]);
    if (objectCount(objects) === 0) {
      continue;
    }
    if (alreadyInDatabase(objects, catalog)) {
      return index;
    }
  }
  return -1;
}

function baseline(migrations: string[], catalog: Catalog): void {
  const newestApplied = findNewestApplied(migrations, catalog);

  if (newestApplied < 0) {
    console.log('  no migration matches this database — deploying the full history');
    return;
  }

  for (const name of migrations.slice(0, newestApplied + 1)) {
    if (isRecorded(name, catalog)) {
      console.log(`  ${name}: already in migration history`);
      continue;
    }

    if (hasRow(name, catalog) && absentFromDatabase(readMigration(name), catalog)) {
      console.log(`  ${name}: rolled back and still absent, left for deploy`);
      continue;
    }
    if (!DRY_RUN) {
      runPrisma(['migrate', 'resolve', '--applied', name]);
    }
    console.log(`  ${name}: ${DRY_RUN ? 'would mark' : 'marked'} applied`);
  }
  for (const name of migrations.slice(newestApplied + 1)) {
    console.log(`  ${name}: changes not in database`);
  }
}

function reconcileFailed(migrations: string[], catalog: Catalog): void {
  for (const name of migrations) {
    if (!isFailed(name, catalog)) {
      continue;
    }

    const objects = readMigration(name);
    if (objectCount(objects) === 0) {
      throw new Error(
        `${name} is recorded as failed and has no schema objects to verify. ` +
          `Inspect it and resolve it manually with prisma migrate resolve.`
      );
    }

    if (alreadyInDatabase(objects, catalog)) {
      console.log(`  ${name}: failed record, but its changes are present — marking applied`);
      if (!DRY_RUN) {
        runPrisma(['migrate', 'resolve', '--applied', name]);
      }
      continue;
    }

    if (absentFromDatabase(objects, catalog)) {
      console.log(`  ${name}: failed record, changes rolled back — marking rolled back to retry`);
      if (!DRY_RUN) {
        runPrisma(['migrate', 'resolve', '--rolled-back', name]);
      }
      continue;
    }

    throw new Error(
      `${name} is recorded as failed and only partly present in the database. ` +
        `Finish or undo it by hand, then re-run. Its error is in the logs column of ` +
        `the _prisma_migrations row.`
    );
  }
}

// Tables and enums are the reliable signal that a migration truly never ran: later
// migrations in this history drop columns and indexes, but never a table. Judging a
// migration by its columns would flag a healthy one whose columns a successor
// removed.
function createsMissingTables(name: string, catalog: Catalog): boolean {
  const objects = readMigration(name);
  const created = [
    ...objects.tables.map(table => ({ key: table, set: 'tables' as const })),
    ...objects.types.map(type => ({ key: type, set: 'types' as const })),
  ];
  return created.length > 0 && created.every(entry => !isPresent(entry, catalog));
}

function findPhantoms(migrations: string[], catalog: Catalog): string[] {
  return migrations.filter(
    name => isRecorded(name, catalog) && createsMissingTables(name, catalog)
  );
}

// A phantom older than the newest fully-present migration is not a gap to replay —
// it is one a later migration superseded, and re-running it would recreate objects
// the schema abandoned. Those are reported and left alone. Only phantoms after that
// boundary are real gaps that will break the next migration to depend on them.
async function reportPhantoms(
  phantoms: string[],
  migrations: string[],
  catalog: Catalog,
  prisma: PrismaClient
): Promise<void> {
  const boundary = findNewestApplied(migrations, catalog);
  const superseded = phantoms.filter(name => migrations.indexOf(name) <= boundary);
  const gaps = phantoms.filter(name => migrations.indexOf(name) > boundary);

  if (superseded.length > 0) {
    console.log('Superseded by later migrations, left as applied:');
    for (const name of superseded) {
      console.log(`  ${name}`);
    }
  }

  if (gaps.length === 0) {
    return;
  }

  // Everything from the earliest gap onward was built on tables that never existed,
  // so the whole tail is replayed rather than the gaps alone. Re-applying only the
  // gaps would leave the ALTER-only migrations between them permanently skipped,
  // and their columns missing from the tables being recreated.
  const firstGap = Math.min(...gaps.map(name => migrations.indexOf(name)));
  const tail = migrations.slice(firstGap).filter(name => hasRow(name, catalog));

  console.log(`Never applied to this database, starting at ${migrations[firstGap]}:`);
  for (const name of tail) {
    console.log(`  ${name}`);
  }

  if (!REPAIR_HISTORY) {
    throw new Error(
      `History does not match the database. Re-run with --repair-history to drop ` +
        `these history rows so the migrations are applied again, after confirming ` +
        `the tables they create are genuinely absent.`
    );
  }

  // prisma migrate resolve --rolled-back only accepts a migration in a failed
  // state (P3012), so a row claiming success cannot be reset through the CLI.
  // Deleting the row is the only way to make deploy apply the migration again.
  for (const name of tail) {
    if (!DRY_RUN) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "_prisma_migrations" WHERE migration_name = $1`,
        name
      );
    }
    console.log(`  ${name}: ${DRY_RUN ? 'would drop' : 'dropped'} history row to re-apply`);
  }
}

async function main(): Promise<void> {
  const migrations = listMigrations();
  const newest = migrations.at(-1);

  const prisma = new PrismaClient();
  try {
    const catalog = await readCatalog(prisma);

    if (hasExistingSchema(catalog) && newest && !isRecorded(newest, catalog)) {
      console.log('Reconciling migration history with the live database:');
      reconcileFailed(migrations, catalog);
      baseline(migrations, catalog);

      const phantoms = findPhantoms(migrations, catalog);
      if (phantoms.length > 0) {
        await reportPhantoms(phantoms, migrations, catalog, prisma);
      }
      console.log('');
    }
  } finally {
    await prisma.$disconnect();
  }

  if (DRY_RUN) {
    console.log('Dry run — nothing was written.');
    return;
  }

  runPrisma(['migrate', 'deploy']);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
