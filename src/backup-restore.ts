import { exec } from 'child_process';
import { promisify } from 'util';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import type {
  BackupOptions,
  BackupResult,
  RestoreOptions,
  RestoreResult,
  VerifyOptions,
  VerifyResult,
} from './types';
import {
  colors,
  Spinner,
  ProgressBar,
  status,
  resultBox,
  nextSteps,
  operationBanner,
  spacer,
  table,
} from './ui';

const execAsync = promisify(exec);

interface ColumnInfo {
  column_name: string;
  udt_name: string;
  data_type: string;
  character_maximum_length: number | null;
  is_nullable: string;
  column_default: string | null;
}

interface PrimaryKeyMap {
  [tableName: string]: string[];
}

/**
 * Get table schema DDL with proper type handling
 */
async function getTableSchema(client: Client, tableName: string): Promise<string> {
  const columnsResult = await client.query<ColumnInfo>(
    `
    SELECT
      column_name,
      udt_name,
      data_type,
      character_maximum_length,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `,
    [tableName]
  );

  const columns = columnsResult.rows.map((col) => {
    let dataType: string;

    if (col.column_default && col.column_default.includes('nextval')) {
      dataType = 'SERIAL';
    } else if (col.udt_name === 'int4') {
      dataType = 'INTEGER';
    } else if (col.udt_name === 'int8') {
      dataType = 'BIGINT';
    } else if (col.udt_name === 'varchar') {
      dataType = col.character_maximum_length
        ? `VARCHAR(${col.character_maximum_length})`
        : 'VARCHAR';
    } else if (col.udt_name === 'text') {
      dataType = 'TEXT';
    } else if (col.udt_name === 'bool') {
      dataType = 'BOOLEAN';
    } else if (col.udt_name === 'timestamp') {
      dataType = 'TIMESTAMP';
    } else if (col.udt_name === 'timestamptz') {
      dataType = 'TIMESTAMPTZ';
    } else {
      dataType = col.data_type.toUpperCase();
      if (col.character_maximum_length) {
        dataType += `(${col.character_maximum_length})`;
      }
    }

    let def = `"${col.column_name}" ${dataType}`;

    if (col.column_default && !col.column_default.includes('nextval')) {
      def += ` DEFAULT ${col.column_default}`;
    }

    if (col.is_nullable === 'NO' && dataType !== 'SERIAL') {
      def += ' NOT NULL';
    }

    return def;
  });

  return `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${columns.join(',\n  ')}\n);`;
}

/**
 * Get table data as INSERT statements
 */
async function getTableData(client: Client, tableName: string): Promise<string> {
  const result = await client.query(`SELECT * FROM "${tableName}"`);

  if (result.rows.length === 0) {
    return '';
  }

  const columns = result.fields.map((f) => `"${f.name}"`).join(', ');
  const inserts = result.rows.map((row) => {
    const values = result.fields.map((f) => {
      const val = row[f.name];
      if (val === null) return 'NULL';
      if (typeof val === 'number') return val;
      if (typeof val === 'boolean') return val;
      if (val instanceof Date) return `'${val.toISOString()}'`;
      return `'${String(val).replace(/'/g, "''")}'`;
    });
    return `INSERT INTO "${tableName}" (${columns}) VALUES (${values.join(', ')});`;
  });

  return inserts.join('\n');
}

/**
 * Get primary key constraints
 */
async function getPrimaryKeys(client: Client): Promise<PrimaryKeyMap> {
  const result = await client.query<{ table_name: string; column_name: string }>(`
    SELECT
      tc.table_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name, kcu.ordinal_position
  `);

  const pks: PrimaryKeyMap = {};
  for (const row of result.rows) {
    if (!pks[row.table_name]) pks[row.table_name] = [];
    pks[row.table_name].push(row.column_name);
  }
  return pks;
}

/**
 * Format file size
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Backup the VCKit database
 */
export async function backupDatabase({
  output,
  container,
  dbConfig,
}: BackupOptions): Promise<BackupResult> {
  await operationBanner('Database Backup');

  const outputPath = path.resolve(output);
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (container) {
    const spinner = new Spinner(`Using Docker container ${colors.cyan(container)}...`);
    spinner.start();

    const command = `docker exec ${container} pg_dump -U ${dbConfig.user} ${dbConfig.database}`;

    try {
      spinner.update('Running pg_dump...');
      const result = await execAsync(command);
      fs.writeFileSync(outputPath, result.stdout);
      const stats = fs.statSync(outputPath);
      const lines = result.stdout.split('\n').length;

      spinner.success('Backup created via Docker');
      spacer();

      resultBox('BACKUP COMPLETE', [
        { label: 'File', value: outputPath, color: 'cyan' },
        { label: 'Size', value: formatSize(stats.size), color: 'green' },
        { label: 'Lines', value: String(lines), color: 'yellow' },
      ]);

      return { file: outputPath, size: stats.size, lines };
    } catch (err) {
      spinner.fail('Backup failed');
      throw new Error(`Backup failed: ${(err as Error).message}`);
    }
  }

  // Pure JavaScript backup
  const connectSpinner = new Spinner('Establishing connection...');
  connectSpinner.start();

  const client = new Client(dbConfig);

  try {
    await client.connect();
  } catch (err) {
    connectSpinner.fail('Connection failed');
    throw err;
  }
  connectSpinner.success(
    `Connected to ${colors.cyan(dbConfig.host)}:${colors.cyan(String(dbConfig.port))}`
  );

  try {
    const scanSpinner = new Spinner('Scanning database schema...');
    scanSpinner.start();

    const lines: string[] = [];
    lines.push('-- VCKit Database Backup');
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push('-- Tool: vckit-db-tools');
    lines.push('');
    lines.push("SET client_encoding = 'UTF8';");
    lines.push('');

    const tablesResult = await client.query<{ tablename: string }>(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    const tables = tablesResult.rows.map((r) => r.tablename);
    scanSpinner.success(`Found ${colors.magenta(String(tables.length))} tables`);

    const primaryKeys = await getPrimaryKeys(client);

    spacer();
    const progress = new ProgressBar(tables.length, '  Exporting');

    for (const tableName of tables) {
      lines.push(`-- Table: ${tableName}`);
      lines.push(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);

      const schema = await getTableSchema(client, tableName);
      lines.push(schema);
      lines.push('');

      if (primaryKeys[tableName]) {
        const pkCols = primaryKeys[tableName].map((c) => `"${c}"`).join(', ');
        lines.push(`ALTER TABLE "${tableName}" ADD PRIMARY KEY (${pkCols});`);
        lines.push('');
      }

      const data = await getTableData(client, tableName);
      if (data) {
        lines.push(data);
        lines.push('');
      }

      progress.increment();
    }
    progress.complete();

    const content = lines.join('\n');
    fs.writeFileSync(outputPath, content);
    const stats = fs.statSync(outputPath);

    spacer();
    resultBox('BACKUP COMPLETE', [
      { label: 'File', value: outputPath, color: 'cyan' },
      { label: 'Size', value: formatSize(stats.size), color: 'green' },
      { label: 'Lines', value: String(lines.length), color: 'yellow' },
      { label: 'Tables', value: String(tables.length), color: 'magenta' },
    ]);

    return { file: outputPath, size: stats.size, lines: lines.length };
  } finally {
    await client.end();
  }
}

/**
 * Restore the VCKit database from backup
 */
export async function restoreDatabase({
  input,
  container,
  drop,
  dbConfig,
}: RestoreOptions): Promise<RestoreResult> {
  await operationBanner('Database Restore');

  const inputPath = path.resolve(input);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Backup file not found: ${inputPath}`);
  }

  const content = fs.readFileSync(inputPath, 'utf8');
  const stats = fs.statSync(inputPath);

  status.info(`Source: ${colors.cyan(inputPath)}`);
  status.info(`Size: ${colors.yellow(formatSize(stats.size))}`);
  spacer();

  if (container) {
    const spinner = new Spinner(`Using Docker container ${colors.cyan(container)}...`);
    spinner.start();

    try {
      if (drop) {
        spinner.update('Dropping existing database...');
        await execAsync(
          `docker exec ${container} psql -U ${dbConfig.user} -c "DROP DATABASE IF EXISTS ${dbConfig.database};"`
        );
        await execAsync(
          `docker exec ${container} psql -U ${dbConfig.user} -c "CREATE DATABASE ${dbConfig.database};"`
        );
      }

      spinner.update('Restoring from backup...');

      const tempFile = `/tmp/vckit_restore_${Date.now()}.sql`;
      fs.writeFileSync(tempFile, content);

      await execAsync(`docker cp ${tempFile} ${container}:/tmp/restore.sql`);
      await execAsync(
        `docker exec ${container} psql -U ${dbConfig.user} -d ${dbConfig.database} -f /tmp/restore.sql`
      );
      await execAsync(`docker exec ${container} rm /tmp/restore.sql`);

      fs.unlinkSync(tempFile);

      spinner.success('Restore complete');
      spacer();

      resultBox('RESTORE COMPLETE', [
        { label: 'Status', value: 'Success', color: 'green' },
        { label: 'Database', value: dbConfig.database, color: 'cyan' },
      ]);

      spacer();
      nextSteps(['Restart vckit-api if it was running']);

      return { success: true };
    } catch (err) {
      spinner.fail('Restore failed');
      throw new Error(`Restore failed: ${(err as Error).message}`);
    }
  }

  // Pure JavaScript restore
  if (drop) {
    const dropSpinner = new Spinner('Recreating database...');
    dropSpinner.start();

    const adminClient = new Client({ ...dbConfig, database: 'postgres' });
    try {
      await adminClient.connect();
    } catch (err) {
      dropSpinner.fail('Connection to postgres database failed');
      throw new Error(`Restore failed: ${(err as Error).message}`);
    }

    try {
      await adminClient.query(
        `
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = $1
          AND pid <> pg_backend_pid()
      `,
        [dbConfig.database]
      );

      await adminClient.query(`DROP DATABASE IF EXISTS "${dbConfig.database}"`);
      await adminClient.query(`CREATE DATABASE "${dbConfig.database}"`);
      await adminClient.end();

      dropSpinner.success('Database recreated');
    } catch (err) {
      dropSpinner.fail('Database recreation failed');
      await adminClient.end();
      throw new Error(`Restore failed: ${(err as Error).message}`);
    }
  }

  const connectSpinner = new Spinner('Connecting...');
  connectSpinner.start();

  const client = new Client(dbConfig);
  try {
    await client.connect();
  } catch (err) {
    connectSpinner.fail('Connection failed');
    throw new Error(`Restore failed: ${(err as Error).message}`);
  }
  connectSpinner.success(`Connected to ${colors.cyan(dbConfig.database)}`);

  // Parse statements
  const statements: string[] = [];
  let current = '';

  for (const line of content.split('\n')) {
    if (line.trim().startsWith('--') || line.trim() === '') {
      continue;
    }

    current += line + '\n';

    if (line.trim().endsWith(';')) {
      statements.push(current.trim());
      current = '';
    }
  }

  spacer();
  const progress = new ProgressBar(statements.length, '  Executing');
  let successCount = 0;
  let errorCount = 0;

  for (const stmt of statements) {
    try {
      await client.query(stmt);
      successCount++;
    } catch (err) {
      const message = (err as Error).message;
      if (!message.includes('already exists') && !message.includes('duplicate key')) {
        errorCount++;
      }
    }
    progress.increment();
  }
  progress.complete();

  await client.end();

  spacer();
  resultBox('RESTORE COMPLETE', [
    { label: 'Statements', value: String(successCount), color: 'green' },
    { label: 'Errors', value: String(errorCount), color: errorCount > 0 ? 'yellow' : 'green' },
  ]);

  spacer();
  nextSteps(['Restart vckit-api if it was running']);

  return { success: true, statements: successCount, errors: errorCount };
}

/**
 * Verify database tables exist
 */
export async function verifyDatabase({
  container,
  dbConfig,
}: VerifyOptions): Promise<VerifyResult> {
  await operationBanner('Database Verification');

  const expectedTables = ['identifier', 'key', 'private-key', 'credential', 'migrations'];

  if (container) {
    const spinner = new Spinner('Querying via Docker...');
    spinner.start();

    const command = `docker exec ${container} psql -U ${dbConfig.user} -d ${dbConfig.database} -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';"`;
    try {
      const result = await execAsync(command);
      spinner.success('Query complete');

      const output = result.stdout.toLowerCase();
      const missing = expectedTables.filter((t) => !output.includes(t.toLowerCase()));

      spacer();
      if (missing.length > 0) {
        status.error(`Missing tables: ${colors.red(missing.join(', '))}`);
        return { valid: false, missing };
      }

      status.done('All expected tables present');
      return { valid: true, missing: [] };
    } catch (err) {
      spinner.fail('Verification failed');
      throw new Error(`Verification failed: ${(err as Error).message}`);
    }
  }

  const spinner = new Spinner('Connecting to database...');
  spinner.start();

  const client = new Client(dbConfig);

  try {
    await client.connect();
  } catch (err) {
    spinner.fail('Connection failed');
    throw new Error(`Verification failed: ${(err as Error).message}`);
  }
  spinner.success(`Connected to ${colors.cyan(dbConfig.database)}`);

  try {
    const result = await client.query<{ tablename: string }>(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const tables = result.rows.map((r) => r.tablename);
    const missing = expectedTables.filter(
      (t) => !tables.map((x) => x.toLowerCase()).includes(t.toLowerCase())
    );

    spacer();
    console.log(
      table(
        ['Table', 'Status'],
        tables.map((t) => [
          colors.white(t),
          expectedTables.includes(t.toLowerCase())
            ? colors.green('● Core')
            : colors.gray('○ Other'),
        ])
      )
    );

    spacer();
    if (missing.length > 0) {
      status.error(`Missing expected tables: ${colors.red(missing.join(', '))}`);
      return { valid: false, missing };
    }

    status.done(`All ${colors.cyan(String(expectedTables.length))} core tables verified`);
    return { valid: true, missing: [] };
  } finally {
    await client.end();
  }
}
