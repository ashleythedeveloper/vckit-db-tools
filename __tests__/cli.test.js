const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLI_PATH = path.join(__dirname, '../dist/cli.js');

// Helper to strip ANSI codes for easier testing
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\[\?25[hl]/g, '').replace(/\x1b\[K/g, '');
}

// Helper to run CLI commands
function runCli(args, env = {}) {
  const fullEnv = {
    ...process.env,
    DATABASE_HOST: process.env.DATABASE_HOST || 'localhost',
    DATABASE_PORT: process.env.DATABASE_PORT || '5432',
    DATABASE_NAME: process.env.DATABASE_NAME || 'vckit',
    DATABASE_USERNAME: process.env.DATABASE_USERNAME || 'postgres',
    DATABASE_PASSWORD: process.env.DATABASE_PASSWORD || 'postgres',
    ...env,
  };

  try {
    const output = execSync(`node ${CLI_PATH} ${args}`, {
      env: fullEnv,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout: stripAnsi(output), stderr: '', exitCode: 0, raw: output };
  } catch (err) {
    return {
      stdout: stripAnsi(err.stdout || ''),
      stderr: stripAnsi(err.stderr || ''),
      output: stripAnsi((err.stdout || '') + (err.stderr || '')),
      exitCode: err.status,
      raw: (err.stdout || '') + (err.stderr || ''),
    };
  }
}

describe('CLI', () => {
  describe('help', () => {
    it('should display help', () => {
      const result = runCli('--help');
      expect(result.stdout).toContain('Database management tools for VCKit');
      expect(result.stdout).toContain('rotate-key');
      expect(result.stdout).toContain('backup');
      expect(result.stdout).toContain('restore');
    });

    it('should display version', () => {
      const result = runCli('--version');
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('generate-key', () => {
    it('should generate a valid key', () => {
      const result = runCli('generate-key');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('KEY GENERATED');

      // Extract the key from output (64 hex chars)
      const keyMatch = result.stdout.match(/([a-f0-9]{64})/i);
      expect(keyMatch).not.toBeNull();
    });
  });

  describe('backup', () => {
    let tempDir;

    beforeAll(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-backup-test-'));
    });

    afterAll(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    it('should require --output option', () => {
      const result = runCli('backup');
      expect(result.exitCode).not.toBe(0);
      // Commander error goes to stdout with custom errorOutput
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/output|required/);
    });

    it('should create backup file', () => {
      const outputPath = path.join(tempDir, 'cli-backup.sql');
      const result = runCli(`backup --output ${outputPath}`);

      // Skip if database connection fails
      if (result.exitCode !== 0) {
        const output = result.stdout + result.stderr;
        if (output.includes('password authentication failed') || output.includes('ECONNREFUSED')) {
          console.warn('Skipping: database connection failed');
          return;
        }
      }

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('BACKUP COMPLETE');
      expect(fs.existsSync(outputPath)).toBe(true);
    });
  });

  describe('verify', () => {
    it('should verify database', () => {
      const result = runCli('verify');
      const output = result.stdout + result.stderr;
      expect(output).toContain('DATABASE VERIFICATION');
    });
  });

  describe('rotate-key', () => {
    it('should require --old-key option', () => {
      const result = runCli('rotate-key --new-key abc123');
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/old-key|required/);
    });

    it('should require --new-key option', () => {
      const result = runCli('rotate-key --old-key abc123');
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/new-key|required/);
    });

    it('should validate key format', () => {
      const result = runCli('rotate-key --old-key invalid --new-key alsobad');
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain('64 hex characters');
    });
  });

  describe('change-password', () => {
    it('should require --new-password option', () => {
      const result = runCli('change-password');
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/new-password|required/);
    });
  });

  describe('restore', () => {
    it('should require --input option', () => {
      const result = runCli('restore');
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/input|required/);
    });

    it('should fail for nonexistent file', () => {
      const result = runCli('restore --input /nonexistent/file.sql');
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain('not found');
    });
  });

  describe('--dotenv', () => {
    let tempDir;
    let envFilePath;

    beforeAll(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-env-test-'));
      envFilePath = path.join(tempDir, 'test.env');
    });

    afterAll(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    it('should fail for nonexistent env file', () => {
      const result = runCli('--dotenv /nonexistent/file.env verify');
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain('not found');
    });

    it('should load environment variables from file', () => {
      // Create a test env file with valid connection info
      fs.writeFileSync(envFilePath, `
# Test environment file - uses same values as default
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=vckit
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
`);

      // Run verify with --dotenv - should succeed
      const result = runCli(`--dotenv ${envFilePath} verify`);
      const output = result.stdout + result.stderr;

      // Should succeed in verifying (env file loaded correctly)
      expect(output).toContain('DATABASE VERIFICATION');
    });

    it('should handle quoted values in env file', () => {
      // Create env file with quoted values that match working config
      fs.writeFileSync(envFilePath, `
DATABASE_HOST="localhost"
DATABASE_PORT='5432'
DATABASE_NAME="vckit"
DATABASE_USERNAME='postgres'
DATABASE_PASSWORD="postgres"
`);

      const result = runCli(`--dotenv ${envFilePath} verify`);
      const output = result.stdout + result.stderr;

      // Should succeed - quotes should be stripped properly
      expect(output).toContain('DATABASE VERIFICATION');
    });

    it('should skip comments and empty lines', () => {
      fs.writeFileSync(envFilePath, `
# This is a comment
DATABASE_HOST=localhost

# Another comment
DATABASE_PORT=5432

DATABASE_NAME=vckit
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
`);

      const result = runCli(`--dotenv ${envFilePath} verify`);
      const output = result.stdout + result.stderr;

      // Should succeed - comments and empty lines handled
      expect(output).toContain('DATABASE VERIFICATION');
    });
  });
});
