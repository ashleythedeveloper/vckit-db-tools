import { backupDatabase, restoreDatabase, verifyDatabase } from '../src/backup-restore';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { DbConfig } from '../src/types';

const TEST_DB_CONFIG: DbConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'vckit',
  user: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
};

describe('backupDatabase', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vckit-db-tools-test-'));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should create a backup file', async () => {
    const outputPath = path.join(tempDir, 'backup.sql');

    const result = await backupDatabase({
      output: outputPath,
      dbConfig: TEST_DB_CONFIG,
    });

    expect(result.file).toBe(outputPath);
    expect(result.size).toBeGreaterThan(0);
    expect(result.lines).toBeGreaterThan(0);
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  it('should create output directory if it does not exist', async () => {
    const nestedPath = path.join(tempDir, 'nested', 'dir', 'backup.sql');

    await backupDatabase({
      output: nestedPath,
      dbConfig: TEST_DB_CONFIG,
    });

    expect(fs.existsSync(nestedPath)).toBe(true);
  });

  it('should include table definitions in backup', async () => {
    const outputPath = path.join(tempDir, 'schema-check.sql');

    await backupDatabase({
      output: outputPath,
      dbConfig: TEST_DB_CONFIG,
    });

    const content = fs.readFileSync(outputPath, 'utf8');

    expect(content).toContain('identifier');
    expect(content).toContain('private-key');
    expect(content).toContain('CREATE TABLE');
  });

  it('should include data in backup', async () => {
    const outputPath = path.join(tempDir, 'data-check.sql');

    await backupDatabase({
      output: outputPath,
      dbConfig: TEST_DB_CONFIG,
    });

    const content = fs.readFileSync(outputPath, 'utf8');

    expect(content).toMatch(/INSERT INTO|-- VCKit Database Backup/);
  });
});

describe('restoreDatabase', () => {
  let tempDir: string;
  let backupPath: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vckit-db-tools-restore-'));
    backupPath = path.join(tempDir, 'backup.sql');

    await backupDatabase({
      output: backupPath,
      dbConfig: TEST_DB_CONFIG,
    });
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should throw error if backup file does not exist', async () => {
    await expect(
      restoreDatabase({
        input: '/nonexistent/file.sql',
        dbConfig: TEST_DB_CONFIG,
      })
    ).rejects.toThrow('Backup file not found');
  });

  it('should restore from backup with drop option', async () => {
    const result = await restoreDatabase({
      input: backupPath,
      drop: true,
      dbConfig: TEST_DB_CONFIG,
    });

    expect(result.success).toBe(true);
  });

  it('should restore tables correctly', async () => {
    await restoreDatabase({
      input: backupPath,
      drop: true,
      dbConfig: TEST_DB_CONFIG,
    });

    const verifyResult = await verifyDatabase({
      dbConfig: TEST_DB_CONFIG,
    });

    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.missing).toHaveLength(0);
  });
});

describe('verifyDatabase', () => {
  it('should return valid when all tables exist', async () => {
    const result = await verifyDatabase({
      dbConfig: TEST_DB_CONFIG,
    });

    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('missing');

    if (result.valid) {
      expect(result.missing).toHaveLength(0);
    }
  });

  it('should list all tables', async () => {
    const client = new Client(TEST_DB_CONFIG);
    await client.connect();

    const tablesResult = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
    `);

    await client.end();

    const tables = tablesResult.rows.map((r: { tablename: string }) => r.tablename);
    expect(tables.length).toBeGreaterThan(0);
  });
});

describe('backup and restore round-trip', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vckit-roundtrip-'));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should preserve data through backup and restore', async () => {
    const client = new Client(TEST_DB_CONFIG);
    await client.connect();

    const beforeResult = await client.query('SELECT COUNT(*) as count FROM identifier');
    const beforeCount = parseInt(beforeResult.rows[0].count);

    await client.end();

    const backupPath = path.join(tempDir, 'roundtrip.sql');
    await backupDatabase({
      output: backupPath,
      dbConfig: TEST_DB_CONFIG,
    });

    await restoreDatabase({
      input: backupPath,
      drop: true,
      dbConfig: TEST_DB_CONFIG,
    });

    const client2 = new Client(TEST_DB_CONFIG);
    await client2.connect();

    const afterResult = await client2.query('SELECT COUNT(*) as count FROM identifier');
    const afterCount = parseInt(afterResult.rows[0].count);

    await client2.end();

    expect(afterCount).toBe(beforeCount);
  });
});
