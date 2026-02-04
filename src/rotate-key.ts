import { Client } from 'pg';
import * as nacl from 'tweetnacl';
import * as crypto from 'crypto';
import type { RotateKeyOptions, RotateKeyResult } from './types';
import {
  colors,
  Spinner,
  ProgressBar,
  status,
  resultBox,
  nextSteps,
  operationBanner,
  spacer,
  divider,
} from './ui';
import { buildClientConfig } from './db-utils';

const NONCE_BYTES = 24;

/**
 * SecretBox implementation matching Veramo's format (hex encoded, nonce prefix)
 */
export class SecretBox {
  private secretKey: Uint8Array;

  constructor(secretKeyHex: string) {
    this.secretKey = Buffer.from(secretKeyHex, 'hex');
  }

  async encrypt(message: string): Promise<string> {
    const nonce = nacl.randomBytes(NONCE_BYTES);
    const messageBytes = Buffer.from(message, 'utf8');
    const ciphertext = nacl.secretbox(messageBytes, nonce, this.secretKey);
    const combined = Buffer.concat([Buffer.from(nonce), Buffer.from(ciphertext)]);
    return combined.toString('hex');
  }

  async decrypt(encryptedHex: string): Promise<string> {
    const combined = Buffer.from(encryptedHex, 'hex');
    const nonce = combined.slice(0, NONCE_BYTES);
    const ciphertext = combined.slice(NONCE_BYTES);
    const decrypted = nacl.secretbox.open(ciphertext, nonce, this.secretKey);
    if (!decrypted) {
      throw new Error('Decryption failed - wrong key or corrupted data');
    }
    return Buffer.from(decrypted).toString('utf8');
  }
}

/**
 * Generate a new 256-bit encryption key
 * @returns 64-character hex string
 */
export function generateKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a secure random password
 * @param length Password length (default 24)
 * @returns Secure password string
 */
export function generatePassword(length = 24): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

/**
 * Rotate the database encryption key
 */
export async function rotateEncryptionKey({
  oldKey,
  newKey,
  dbConfig,
}: RotateKeyOptions): Promise<RotateKeyResult> {
  await operationBanner('Encryption Key Rotation');

  // Validate keys
  if (!/^[a-fA-F0-9]{64}$/.test(oldKey)) {
    throw new Error('OLD_KEY must be 64 hex characters');
  }
  if (!/^[a-fA-F0-9]{64}$/.test(newKey)) {
    throw new Error('NEW_KEY must be 64 hex characters');
  }

  const oldBox = new SecretBox(oldKey);
  const newBox = new SecretBox(newKey);

  const client = new Client(buildClientConfig(dbConfig));

  try {
    // Connect
    const connectSpinner = new Spinner('Establishing secure connection...');
    connectSpinner.start();

    await client.connect();
    connectSpinner.success(
      `Connected to ${colors.cyan(dbConfig.host)}:${colors.cyan(String(dbConfig.port))}/${colors.cyan(dbConfig.database)}`
    );

    // Fetch all private keys
    const fetchSpinner = new Spinner('Scanning private keys...');
    fetchSpinner.start();

    const result = await client.query('SELECT alias, type, "privateKeyHex" FROM "private-key"');
    fetchSpinner.success(`Found ${colors.magenta(String(result.rows.length))} private key(s)`);

    if (result.rows.length === 0) {
      status.warning('No private keys found. Nothing to rotate.');
      return { success: 0, errors: 0 };
    }

    spacer();
    divider();
    status.step('Processing keys...');
    divider();
    spacer();

    const progress = new ProgressBar(result.rows.length, '  Rotating');
    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ alias: string; message: string }> = [];

    for (const row of result.rows) {
      const { alias, privateKeyHex } = row;
      const shortAlias = alias.substring(0, 20) + (alias.length > 20 ? '...' : '');

      try {
        // Decrypt with old key
        const decrypted = await oldBox.decrypt(privateKeyHex);

        // Re-encrypt with new key
        const reencrypted = await newBox.encrypt(decrypted);

        // Verify the new encryption works
        const verify = await newBox.decrypt(reencrypted);
        if (verify !== decrypted) {
          throw new Error('Verification failed - encryption round-trip mismatch');
        }

        // Update database
        await client.query('UPDATE "private-key" SET "privateKeyHex" = $1 WHERE alias = $2', [
          reencrypted,
          alias,
        ]);

        successCount++;
      } catch (err) {
        errors.push({ alias: shortAlias, message: (err as Error).message });
        errorCount++;
      }

      progress.increment();
    }
    progress.complete();

    // Print errors after progress bar is done
    if (errors.length > 0) {
      spacer();
      for (const err of errors) {
        console.log(`${colors.red('  ✖')} ${colors.gray(err.alias)}: ${colors.red(err.message)}`);
      }
    }

    spacer();

    // Results
    resultBox('ROTATION COMPLETE', [
      { label: 'Successful', value: String(successCount), color: 'green' },
      { label: 'Failed', value: String(errorCount), color: errorCount > 0 ? 'red' : 'green' },
      { label: 'Total', value: String(result.rows.length), color: 'cyan' },
    ]);

    if (errorCount > 0) {
      spacer();
      status.error('Some keys failed to rotate. DO NOT update your environment variable!');
      throw new Error(`${errorCount} key(s) failed to rotate`);
    }

    spacer();
    nextSteps([
      `Update ${colors.cyan('DATABASE_ENCRYPTION_KEY')} in your env file`,
      `New key: ${colors.yellow(newKey.substring(0, 8))}...${colors.yellow(newKey.substring(56))}`,
      'Restart vckit-api to apply changes',
    ]);

    return { success: successCount, errors: errorCount };
  } finally {
    await client.end();
  }
}
