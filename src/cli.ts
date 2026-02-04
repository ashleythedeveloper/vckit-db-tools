#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { rotateEncryptionKey, generateKey, generatePassword } from './rotate-key';
import { backupDatabase, restoreDatabase, verifyDatabase } from './backup-restore';
import { changePassword } from './change-password';
import { colors, printLogo, drawBox, spacer, errorBox } from './ui';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../package.json');

/**
 * Load environment variables from a file
 */
function loadEnvFile(filePath: string): void {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`${colors.red('✖')} Environment file not found: ${colors.cyan(absolutePath)}`);
    process.exit(1);
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

/**
 * Update a value in an env file
 * Returns 'updated' if key was found and updated, 'appended' if key was added, or false if file not found
 */
function updateEnvFile(
  filePath: string,
  key: string,
  newValue: string
): 'updated' | 'appended' | false {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    return false;
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  const lines = content.split('\n');
  let found = false;

  const updatedLines = lines.map((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && match[1].trim() === key) {
      found = true;
      // Preserve any quotes from original
      const oldValue = match[2].trim();
      if (oldValue.startsWith('"') && oldValue.endsWith('"')) {
        return `${key}="${newValue}"`;
      } else if (oldValue.startsWith("'") && oldValue.endsWith("'")) {
        return `${key}='${newValue}'`;
      }
      return `${key}=${newValue}`;
    }
    return line;
  });

  // If key wasn't found, append it
  if (!found) {
    updatedLines.push(`${key}=${newValue}`);
  }

  fs.writeFileSync(absolutePath, updatedLines.join('\n'));
  return found ? 'updated' : 'appended';
}

// Pre-parse --dotenv
const dotenvIndex = process.argv.indexOf('--dotenv');
if (dotenvIndex !== -1 && process.argv[dotenvIndex + 1]) {
  loadEnvFile(process.argv[dotenvIndex + 1]);
}

const getEnv = (name: string, defaultVal?: string): string | undefined =>
  process.env[name] || defaultVal;

// Custom help
program
  .name('vckit-db')
  .description('Database management tools for VCKit')
  .version(pkg.version)
  .option('--dotenv <path>', 'Load environment variables from file')
  .configureOutput({
    outputError: (str) => {
      errorBox('ERROR', str.replace('error: ', ''));
    },
  })
  .addHelpText('beforeAll', () => {
    printLogo();
    return '';
  });

// Generate key command
program
  .command('generate-key')
  .description('Generate a new 256-bit encryption key')
  .addHelpText(
    'after',
    `
${colors.cyan('Example:')}
  $ vckit-db generate-key
`
  )
  .action(() => {
    const key = generateKey();
    spacer();
    console.log(
      drawBox(
        [
          colors.gray('Your new 256-bit encryption key:'),
          '',
          colors.cyan(key),
          '',
          colors.gray('Store this securely and update DATABASE_ENCRYPTION_KEY'),
        ],
        '🔑 KEY GENERATED',
        72
      )
    ); // Wider box to fit 64-char key
    spacer();
  });

// Generate password command
program
  .command('generate-password')
  .description('Generate a secure random password')
  .option('-l, --length <length>', 'Password length', '24')
  .addHelpText(
    'after',
    `
${colors.cyan('Examples:')}
  $ vckit-db generate-password
  $ vckit-db generate-password --length 32
`
  )
  .action((options) => {
    const password = generatePassword(parseInt(options.length));
    spacer();
    console.log(
      drawBox(
        [
          colors.gray('Your new secure password:'),
          '',
          colors.cyan(password),
          '',
          colors.gray('Store this securely and update DATABASE_PASSWORD'),
        ],
        '🔐 PASSWORD GENERATED'
      )
    );
    spacer();
  });

// Rotate key command
program
  .command('rotate-key')
  .description('Rotate the database encryption key')
  .requiredOption('--old-key <key>', 'Current 64-character hex encryption key')
  .requiredOption('--new-key <key>', 'New 64-character hex encryption key')
  .option('--host <host>', 'Database host', getEnv('DATABASE_HOST', 'localhost'))
  .option('--port <port>', 'Database port', getEnv('DATABASE_PORT', '5432'))
  .option('--database <name>', 'Database name', getEnv('DATABASE_NAME', 'vckit'))
  .option('--user <user>', 'Database user', getEnv('DATABASE_USERNAME', 'postgres'))
  .option('--password <password>', 'Database password', getEnv('DATABASE_PASSWORD', 'postgres'))
  .option('--update-env', 'Update DATABASE_ENCRYPTION_KEY in the --dotenv file after success')
  .addHelpText(
    'after',
    `
${colors.cyan('Examples:')}
  $ vckit-db rotate-key --old-key abc123... --new-key def456...
  $ vckit-db rotate-key --old-key $OLD_KEY --new-key $NEW_KEY --dotenv .env
  $ vckit-db rotate-key --old-key $OLD_KEY --new-key $NEW_KEY --dotenv .env --update-env
`
  )
  .action(async (options) => {
    try {
      await rotateEncryptionKey({
        oldKey: options.oldKey,
        newKey: options.newKey,
        dbConfig: {
          host: options.host,
          port: parseInt(options.port),
          database: options.database,
          user: options.user,
          password: options.password,
        },
      });

      if (options.updateEnv) {
        const envFile = program.opts().dotenv;
        if (!envFile) {
          console.log(`${colors.yellow('⚠')} --update-env requires --dotenv to be specified`);
        } else {
          const result = updateEnvFile(envFile, 'DATABASE_ENCRYPTION_KEY', options.newKey);
          spacer();
          if (result === 'updated') {
            console.log(
              `${colors.green('✔')} Updated ${colors.cyan('DATABASE_ENCRYPTION_KEY')} in ${colors.cyan(envFile)}`
            );
          } else if (result === 'appended') {
            console.log(
              `${colors.yellow('⚠')} ${colors.cyan('DATABASE_ENCRYPTION_KEY')} was not found in ${colors.cyan(envFile)}`
            );
            console.log(
              `${colors.yellow('⚠')} Added ${colors.cyan('DATABASE_ENCRYPTION_KEY')} to end of file`
            );
            console.log(
              `${colors.yellow('⚠')} If your app uses a different variable name, update it manually`
            );
          } else {
            console.log(
              `${colors.yellow('⚠')} Could not update ${colors.cyan(envFile)} - file not found`
            );
          }
        }
      }
    } catch (err) {
      errorBox('FATAL ERROR', (err as Error).message);
      process.exit(1);
    }
  });

// Backup command
program
  .command('backup')
  .description('Backup the VCKit database')
  .requiredOption('--output <file>', 'Output file path for the backup')
  .option('--host <host>', 'Database host', getEnv('DATABASE_HOST', 'localhost'))
  .option('--port <port>', 'Database port', getEnv('DATABASE_PORT', '5432'))
  .option('--database <name>', 'Database name', getEnv('DATABASE_NAME', 'vckit'))
  .option('--user <user>', 'Database user', getEnv('DATABASE_USERNAME', 'postgres'))
  .option('--password <password>', 'Database password', getEnv('DATABASE_PASSWORD'))
  .option('--container <name>', 'Docker container name')
  .addHelpText(
    'after',
    `
${colors.cyan('Examples:')}
  $ vckit-db backup --output ./backup.sql --password mypass
  $ vckit-db backup --output ./backup.sql --container vckit-postgres
  $ vckit-db backup --output ./backup.sql --dotenv .env
`
  )
  .action(async (options) => {
    try {
      await backupDatabase({
        output: options.output,
        container: options.container,
        dbConfig: {
          host: options.host,
          port: parseInt(options.port),
          database: options.database,
          user: options.user,
          password: options.password,
        },
      });
    } catch (err) {
      errorBox('FATAL ERROR', (err as Error).message);
      process.exit(1);
    }
  });

// Restore command
program
  .command('restore')
  .description('Restore the VCKit database from backup')
  .requiredOption('--input <file>', 'Input backup file path')
  .option('--host <host>', 'Database host', getEnv('DATABASE_HOST', 'localhost'))
  .option('--port <port>', 'Database port', getEnv('DATABASE_PORT', '5432'))
  .option('--database <name>', 'Database name', getEnv('DATABASE_NAME', 'vckit'))
  .option('--user <user>', 'Database user', getEnv('DATABASE_USERNAME', 'postgres'))
  .option('--password <password>', 'Database password', getEnv('DATABASE_PASSWORD'))
  .option('--container <name>', 'Docker container name')
  .option('--drop', 'Drop and recreate database before restore', false)
  .addHelpText(
    'after',
    `
${colors.cyan('Examples:')}
  $ vckit-db restore --input ./backup.sql --password mypass
  $ vckit-db restore --input ./backup.sql --drop --container vckit-postgres
  $ vckit-db restore --input ./backup.sql --dotenv .env
`
  )
  .action(async (options) => {
    try {
      await restoreDatabase({
        input: options.input,
        container: options.container,
        drop: options.drop,
        dbConfig: {
          host: options.host,
          port: parseInt(options.port),
          database: options.database,
          user: options.user,
          password: options.password,
        },
      });
    } catch (err) {
      errorBox('FATAL ERROR', (err as Error).message);
      process.exit(1);
    }
  });

// Verify command
program
  .command('verify')
  .description('Verify database tables exist')
  .option('--host <host>', 'Database host', getEnv('DATABASE_HOST', 'localhost'))
  .option('--port <port>', 'Database port', getEnv('DATABASE_PORT', '5432'))
  .option('--database <name>', 'Database name', getEnv('DATABASE_NAME', 'vckit'))
  .option('--user <user>', 'Database user', getEnv('DATABASE_USERNAME', 'postgres'))
  .option('--password <password>', 'Database password', getEnv('DATABASE_PASSWORD'))
  .option('--container <name>', 'Docker container name')
  .addHelpText(
    'after',
    `
${colors.cyan('Examples:')}
  $ vckit-db verify --password mypass
  $ vckit-db verify --container vckit-postgres
  $ vckit-db verify --dotenv .env
`
  )
  .action(async (options) => {
    try {
      const result = await verifyDatabase({
        container: options.container,
        dbConfig: {
          host: options.host,
          port: parseInt(options.port),
          database: options.database,
          user: options.user,
          password: options.password,
        },
      });
      if (!result.valid) {
        process.exit(1);
      }
    } catch (err) {
      errorBox('FATAL ERROR', (err as Error).message);
      process.exit(1);
    }
  });

// Change password command
program
  .command('change-password')
  .description('Change the database user password')
  .option('--new-password <password>', 'New database password')
  .option('--generate', 'Auto-generate a secure password')
  .option('-l, --length <length>', 'Generated password length', '24')
  .option('--target-user <user>', 'User whose password to change')
  .option('--host <host>', 'Database host', getEnv('DATABASE_HOST', 'localhost'))
  .option('--port <port>', 'Database port', getEnv('DATABASE_PORT', '5432'))
  .option('--database <name>', 'Database name', getEnv('DATABASE_NAME', 'vckit'))
  .option('--user <user>', 'Database user to connect as', getEnv('DATABASE_USERNAME', 'postgres'))
  .option('--password <password>', 'Current database password', getEnv('DATABASE_PASSWORD'))
  .option('--container <name>', 'Docker container name')
  .option('--update-env', 'Update DATABASE_PASSWORD in the --dotenv file after success')
  .addHelpText(
    'after',
    `
${colors.cyan('Examples:')}
  $ vckit-db change-password --new-password newpass123 --password oldpass
  $ vckit-db change-password --generate --dotenv .env --update-env
  $ vckit-db change-password --generate --length 32 --container vckit-postgres
`
  )
  .action(async (options) => {
    try {
      // Determine new password
      let newPassword = options.newPassword;
      if (options.generate) {
        newPassword = generatePassword(parseInt(options.length));
        console.log(`${colors.green('✔')} Generated password: ${colors.cyan(newPassword)}`);
        spacer();
      }

      if (!newPassword) {
        errorBox('ERROR', 'Either --new-password or --generate is required');
        process.exit(1);
      }

      await changePassword({
        newPassword,
        targetUser: options.targetUser || options.user,
        container: options.container,
        dbConfig: {
          host: options.host,
          port: parseInt(options.port),
          database: options.database,
          user: options.user,
          password: options.password,
        },
      });

      if (options.updateEnv) {
        const envFile = program.opts().dotenv;
        if (!envFile) {
          console.log(`${colors.yellow('⚠')} --update-env requires --dotenv to be specified`);
        } else {
          const result = updateEnvFile(envFile, 'DATABASE_PASSWORD', newPassword);
          spacer();
          if (result === 'updated') {
            console.log(
              `${colors.green('✔')} Updated ${colors.cyan('DATABASE_PASSWORD')} in ${colors.cyan(envFile)}`
            );
          } else if (result === 'appended') {
            console.log(
              `${colors.yellow('⚠')} ${colors.cyan('DATABASE_PASSWORD')} was not found in ${colors.cyan(envFile)}`
            );
            console.log(
              `${colors.yellow('⚠')} Added ${colors.cyan('DATABASE_PASSWORD')} to end of file`
            );
            console.log(
              `${colors.yellow('⚠')} If your app uses a different variable name, update it manually`
            );
          } else {
            console.log(
              `${colors.yellow('⚠')} Could not update ${colors.cyan(envFile)} - file not found`
            );
          }
        }
      }
    } catch (err) {
      errorBox('FATAL ERROR', (err as Error).message);
      process.exit(1);
    }
  });

program.parse();
