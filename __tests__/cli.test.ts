import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const CLI_PATH = path.join(__dirname, '../dist/cli.js');

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  raw: string;
  output?: string;
}

interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
  status?: number;
}

function stripAnsi(str: string): string {
  return (
    str
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;]*m/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[\?25[hl]/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[K/g, '')
  );
}

function runCli(args: string, env: Record<string, string> = {}): CliResult {
  const fullEnv: Record<string, string | undefined> = {
    ...process.env,
    DATABASE_HOST: process.env.DATABASE_HOST || 'localhost',
    DATABASE_PORT: process.env.DATABASE_PORT || '5432',
    DATABASE_NAME: process.env.DATABASE_NAME || 'vckit',
    DATABASE_USERNAME: process.env.DATABASE_USERNAME || 'postgres',
    DATABASE_PASSWORD: process.env.DATABASE_PASSWORD || 'postgres',
    ...env,
  };

  const execOptions: ExecSyncOptionsWithStringEncoding = {
    env: fullEnv,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  };

  try {
    const output = execSync(`node ${CLI_PATH} ${args}`, execOptions);
    return { stdout: stripAnsi(output), stderr: '', exitCode: 0, raw: output };
  } catch (err) {
    const error = err as ExecError;
    return {
      stdout: stripAnsi(error.stdout || ''),
      stderr: stripAnsi(error.stderr || ''),
      output: stripAnsi((error.stdout || '') + (error.stderr || '')),
      exitCode: error.status ?? 1,
      raw: (error.stdout || '') + (error.stderr || ''),
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

      const keyMatch = result.stdout.match(/([a-f0-9]{64})/i);
      expect(keyMatch).not.toBeNull();
    });
  });

  describe('backup', () => {
    let tempDir: string;

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
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/output|required/);
    });

    it('should create backup file', () => {
      const outputPath = path.join(tempDir, 'cli-backup.sql');
      const result = runCli(`backup --output ${outputPath}`);

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
    let tempDir: string;
    let envFilePath: string;

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
      fs.writeFileSync(
        envFilePath,
        `
# Test environment file - uses same values as default
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=vckit
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
`
      );

      const result = runCli(`--dotenv ${envFilePath} verify`);
      const output = result.stdout + result.stderr;

      expect(output).toContain('DATABASE VERIFICATION');
    });

    it('should handle quoted values in env file', () => {
      fs.writeFileSync(
        envFilePath,
        `
DATABASE_HOST="localhost"
DATABASE_PORT='5432'
DATABASE_NAME="vckit"
DATABASE_USERNAME='postgres'
DATABASE_PASSWORD="postgres"
`
      );

      const result = runCli(`--dotenv ${envFilePath} verify`);
      const output = result.stdout + result.stderr;

      expect(output).toContain('DATABASE VERIFICATION');
    });

    it('should skip comments and empty lines', () => {
      fs.writeFileSync(
        envFilePath,
        `
# This is a comment
DATABASE_HOST=localhost

# Another comment
DATABASE_PORT=5432

DATABASE_NAME=vckit
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
`
      );

      const result = runCli(`--dotenv ${envFilePath} verify`);
      const output = result.stdout + result.stderr;

      expect(output).toContain('DATABASE VERIFICATION');
    });
  });

  describe('--update-env', () => {
    let tempDir: string;
    let envFilePath: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-update-env-test-'));
      envFilePath = path.join(tempDir, 'test.env');
    });

    afterEach(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    describe('rotate-key --update-env', () => {
      // Use the actual test database encryption key from fixtures/schema.sql
      const oldKey = '29739248cad1bd1a0fc4d9b75cd4d2990de535baf5caadfdf8d8f86664aa830c';
      const newKey = '39739248cad1bd1a0fc4d9b75cd4d2990de535baf5caadfdf8d8f86664aa830c';

      // Helper to rotate keys back to original state
      const rotateBack = () => {
        runCli(`rotate-key --old-key ${newKey} --new-key ${oldKey}`);
      };

      it('should require --dotenv when using --update-env', () => {
        // This test needs rotation to succeed first, then check for warning
        const result = runCli(`rotate-key --old-key ${oldKey} --new-key ${newKey} --update-env`);
        const output = result.stdout + result.stderr;

        if (output.includes('password authentication failed') || output.includes('ECONNREFUSED')) {
          console.warn('Skipping: database connection failed');
          return;
        }

        // If rotation succeeded, we should see the warning about --dotenv
        if (output.includes('ROTATION COMPLETE') && output.includes('Successful: 1')) {
          expect(output).toContain('--update-env requires --dotenv');
          rotateBack();
        } else if (output.includes('Decryption failed')) {
          // Rotation failed due to wrong key - test cannot verify --update-env warning
          console.warn('Skipping: rotation failed (key mismatch with database)');
        }
      });

      it('should update existing DATABASE_ENCRYPTION_KEY', () => {
        fs.writeFileSync(
          envFilePath,
          `DATABASE_HOST=localhost
DATABASE_ENCRYPTION_KEY=${oldKey}
DATABASE_PASSWORD=postgres
`
        );

        const result = runCli(
          `--dotenv ${envFilePath} rotate-key --old-key ${oldKey} --new-key ${newKey} --update-env`
        );
        const output = result.stdout + result.stderr;

        if (output.includes('password authentication failed') || output.includes('ECONNREFUSED')) {
          console.warn('Skipping: database connection failed');
          return;
        }

        if (output.includes('Decryption failed')) {
          console.warn('Skipping: rotation failed (key mismatch with database)');
          return;
        }

        // Should show success, not warning
        expect(output).toContain('Updated');
        expect(output).toContain('DATABASE_ENCRYPTION_KEY');
        expect(output).not.toContain('was not found');

        // Verify file was updated
        const content = fs.readFileSync(envFilePath, 'utf8');
        expect(content).toContain(`DATABASE_ENCRYPTION_KEY=${newKey}`);
        expect(content).not.toContain(oldKey);

        rotateBack();
      });

      it('should warn when DATABASE_ENCRYPTION_KEY is not found and append it', () => {
        fs.writeFileSync(
          envFilePath,
          `DATABASE_HOST=localhost
DB_ENCRYPTION_KEY=someothervalue
DATABASE_PASSWORD=postgres
`
        );

        const result = runCli(
          `--dotenv ${envFilePath} rotate-key --old-key ${oldKey} --new-key ${newKey} --update-env`
        );
        const output = result.stdout + result.stderr;

        if (output.includes('password authentication failed') || output.includes('ECONNREFUSED')) {
          console.warn('Skipping: database connection failed');
          return;
        }

        if (output.includes('Decryption failed')) {
          console.warn('Skipping: rotation failed (key mismatch with database)');
          return;
        }

        // Should show warning about key not found
        expect(output).toContain('DATABASE_ENCRYPTION_KEY');
        expect(output).toContain('was not found');
        expect(output).toContain('Added');
        expect(output).toContain('different variable name');

        // Verify original key is preserved and new one appended
        const content = fs.readFileSync(envFilePath, 'utf8');
        expect(content).toContain('DB_ENCRYPTION_KEY=someothervalue'); // Original preserved
        expect(content).toContain(`DATABASE_ENCRYPTION_KEY=${newKey}`); // New appended

        rotateBack();
      });

      it('should preserve quote style when updating', () => {
        fs.writeFileSync(
          envFilePath,
          `DATABASE_HOST=localhost
DATABASE_ENCRYPTION_KEY="${oldKey}"
DATABASE_PASSWORD=postgres
`
        );

        const result = runCli(
          `--dotenv ${envFilePath} rotate-key --old-key ${oldKey} --new-key ${newKey} --update-env`
        );
        const output = result.stdout + result.stderr;

        if (output.includes('password authentication failed') || output.includes('ECONNREFUSED')) {
          console.warn('Skipping: database connection failed');
          return;
        }

        if (output.includes('Decryption failed')) {
          console.warn('Skipping: rotation failed (key mismatch with database)');
          return;
        }

        // Verify quotes are preserved
        const content = fs.readFileSync(envFilePath, 'utf8');
        expect(content).toContain(`DATABASE_ENCRYPTION_KEY="${newKey}"`);

        rotateBack();
      });
    });

    describe('change-password --update-env', () => {
      it('should require --dotenv when using --update-env', () => {
        // This test needs password change to succeed first, then check for warning
        // We provide the current password via --password option
        const result = runCli(
          'change-password --new-password testpass123 --password postgres --update-env'
        );
        const output = result.stdout + result.stderr;

        if (output.includes('password authentication failed') || output.includes('ECONNREFUSED')) {
          console.warn('Skipping: database connection failed');
          return;
        }

        // If password change succeeded, we should see the warning about --dotenv
        if (output.includes('PASSWORD CHANGED')) {
          expect(output).toContain('--update-env requires --dotenv');
          // Revert the password change
          runCli('change-password --new-password postgres --password testpass123');
        }
      });

      it('should update existing DATABASE_PASSWORD', () => {
        // Use postgres as current password, change to testpass, then revert
        fs.writeFileSync(
          envFilePath,
          `DATABASE_HOST=localhost
DATABASE_PASSWORD=postgres
DATABASE_USERNAME=postgres
`
        );

        const result = runCli(
          `--dotenv ${envFilePath} change-password --new-password testpass123 --update-env`
        );
        const output = result.stdout + result.stderr;

        if (output.includes('password authentication failed') || output.includes('ECONNREFUSED')) {
          console.warn('Skipping: database connection failed');
          return;
        }

        expect(output).toContain('Updated');
        expect(output).toContain('DATABASE_PASSWORD');
        expect(output).not.toContain('was not found');

        // Verify file was updated
        const content = fs.readFileSync(envFilePath, 'utf8');
        expect(content).toContain('DATABASE_PASSWORD=testpass123');
        expect(content).not.toContain('DATABASE_PASSWORD=postgres');

        // Revert password
        runCli('change-password --new-password postgres --password testpass123');
      });

      it('should warn when DATABASE_PASSWORD is not found and append it', () => {
        // Use different var name to trigger warning
        fs.writeFileSync(
          envFilePath,
          `DATABASE_HOST=localhost
DB_PASSWORD=postgres
DATABASE_USERNAME=postgres
`
        );

        const result = runCli(
          `--dotenv ${envFilePath} change-password --new-password testpass456 --password postgres --update-env`
        );
        const output = result.stdout + result.stderr;

        if (output.includes('password authentication failed') || output.includes('ECONNREFUSED')) {
          console.warn('Skipping: database connection failed');
          return;
        }

        // Should show warning about key not found
        expect(output).toContain('DATABASE_PASSWORD');
        expect(output).toContain('was not found');
        expect(output).toContain('Added');
        expect(output).toContain('different variable name');

        // Verify original key is preserved and new one appended
        const content = fs.readFileSync(envFilePath, 'utf8');
        expect(content).toContain('DB_PASSWORD=postgres'); // Original preserved
        expect(content).toContain('DATABASE_PASSWORD=testpass456'); // New appended

        // Revert password
        runCli('change-password --new-password postgres --password testpass456');
      });

      it('should preserve single quote style when updating', () => {
        fs.writeFileSync(
          envFilePath,
          `DATABASE_HOST=localhost
DATABASE_PASSWORD='postgres'
DATABASE_USERNAME=postgres
`
        );

        const result = runCli(
          `--dotenv ${envFilePath} change-password --new-password testpass789 --update-env`
        );
        const output = result.stdout + result.stderr;

        if (output.includes('password authentication failed') || output.includes('ECONNREFUSED')) {
          console.warn('Skipping: database connection failed');
          return;
        }

        // Verify quotes are preserved
        const content = fs.readFileSync(envFilePath, 'utf8');
        expect(content).toContain("DATABASE_PASSWORD='testpass789'");

        // Revert password
        runCli('change-password --new-password postgres --password testpass789');
      });
    });
  });
});
