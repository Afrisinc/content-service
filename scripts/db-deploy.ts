import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PRISMA_BIN = join(process.cwd(), 'node_modules', '.bin', 'prisma');
const SCHEMA = join('prisma', 'schema.prisma');
const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');
const DRY_RUN = process.argv.includes('--dry-run');

interface MigrationObjects {
  tables: string[];
  columns: Array<{ table: string; column: string }>;
  indexes: string[];
  types: string[];
}

function runPrisma(args: string[], attempts = 3): void {
  for (let attempt = 1; ; attempt += 1) {
    try {
      execFileSync(PRISMA_BIN, [...args, '--schema', SCHEMA], { stdio: 'inherit' });
      return;
    } catch (error) {
      if (attempt >= attempts) {
        throw error;
      }
      console.log(`  retrying (${attempt}/${attempts - 1})`);
    }
  }
}

function probe(sql: string): boolean {
  try {
    execFileSync(PRISMA_BIN, ['db', 'execute', '--schema', SCHEMA, '--stdin'], {
      input: sql,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

function guard(condition: string, label: string): string {
  return `IF NOT EXISTS (${condition}) THEN RAISE EXCEPTION '${label}'; END IF;`;
}

function assertSql(guards: string[]): string {
  return `DO $$ BEGIN ${guards.join(' ')} END $$;`;
}

function isIdentifier(name: string): boolean {
  return /^[A-Za-z0-9_.$-]+$/.test(name);
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

function alreadyInDatabase(objects: MigrationObjects): boolean {
  const names = [
    ...objects.tables,
    ...objects.indexes,
    ...objects.types,
    ...objects.columns.flatMap(entry => [entry.table, entry.column]),
  ];
  if (!names.every(isIdentifier)) {
    return false;
  }

  const guards = [
    ...objects.tables.map(table =>
      guard(
        `SELECT 1 FROM information_schema.tables` +
          ` WHERE table_schema = 'public' AND table_name = '${table}'`,
        `table ${table}`
      )
    ),
    ...objects.columns.map(entry =>
      guard(
        `SELECT 1 FROM information_schema.columns` +
          ` WHERE table_schema = 'public'` +
          ` AND table_name = '${entry.table}' AND column_name = '${entry.column}'`,
        `column ${entry.table}.${entry.column}`
      )
    ),
    ...objects.indexes.map(index =>
      guard(
        `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = '${index}'`,
        `index ${index}`
      )
    ),
    ...objects.types.map(type =>
      guard(`SELECT 1 FROM pg_type WHERE typname = '${type}'`, `type ${type}`)
    ),
  ];

  return probe(assertSql(guards));
}

function isRecorded(name: string): boolean {
  if (!isIdentifier(name)) {
    return false;
  }
  return probe(
    assertSql([
      guard(
        `SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '${name}'` +
          ` AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
        'not recorded'
      ),
    ])
  );
}

function hasExistingSchema(): boolean {
  return probe(
    assertSql([
      guard(
        `SELECT 1 FROM information_schema.tables` +
          ` WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
        'empty schema'
      ),
    ])
  );
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

function findNewestApplied(migrations: string[]): number {
  for (let index = migrations.length - 1; index >= 0; index -= 1) {
    const objects = readMigration(migrations[index]);
    if (objectCount(objects) === 0) {
      continue;
    }
    if (alreadyInDatabase(objects)) {
      return index;
    }
  }
  return -1;
}

function baseline(migrations: string[]): void {
  const newestApplied = findNewestApplied(migrations);

  if (newestApplied < 0) {
    console.log('  no migration matches this database — deploying the full history');
    return;
  }

  for (const name of migrations.slice(0, newestApplied + 1)) {
    if (isRecorded(name)) {
      console.log(`  ${name}: already recorded`);
      continue;
    }
    if (!DRY_RUN) {
      runPrisma(['migrate', 'resolve', '--applied', name]);
    }
    console.log(`  ${name}: ${DRY_RUN ? 'would mark' : 'marked'} applied`);
  }
  for (const name of migrations.slice(newestApplied + 1)) {
    console.log(`  ${name}: pending, will be applied by deploy`);
  }
}

function main(): void {
  const migrations = listMigrations();
  const newest = migrations.at(-1);

  if (hasExistingSchema() && newest && !isRecorded(newest)) {
    console.log('Reconciling migration history with the live database:');
    baseline(migrations);
    console.log('');
  }

  if (DRY_RUN) {
    console.log('Dry run — nothing was written.');
    return;
  }

  runPrisma(['migrate', 'deploy']);
}

main();
