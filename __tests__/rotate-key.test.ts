import { Client } from 'pg';
import { SecretBox, generateKey, generatePassword, rotateEncryptionKey } from '../src/rotate-key';

// Test database config - uses environment variables or defaults
const TEST_DB_CONFIG = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'vckit',
  user: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
};

describe('SecretBox', () => {
  const testKey = '29739248cad1bd1a0fc4d9b75cd4d2990de535baf5caadfdf8d8f86664aa830c';

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a message', async () => {
      const box = new SecretBox(testKey);
      const message = 'Hello, World!';

      const encrypted = await box.encrypt(message);
      const decrypted = await box.decrypt(encrypted);

      expect(decrypted).toBe(message);
    });

    it('should produce different ciphertext for same message (random nonce)', async () => {
      const box = new SecretBox(testKey);
      const message = 'Hello, World!';

      const encrypted1 = await box.encrypt(message);
      const encrypted2 = await box.encrypt(message);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should fail to decrypt with wrong key', async () => {
      const box1 = new SecretBox(testKey);
      const box2 = new SecretBox(generateKey());
      const message = 'Hello, World!';

      const encrypted = await box1.encrypt(message);

      await expect(box2.decrypt(encrypted)).rejects.toThrow('Decryption failed');
    });

    it('should handle binary data (hex string)', async () => {
      const box = new SecretBox(testKey);
      const hexData = 'deadbeef0123456789abcdef';

      const encrypted = await box.encrypt(hexData);
      const decrypted = await box.decrypt(encrypted);

      expect(decrypted).toBe(hexData);
    });

    it('should produce hex-encoded output', async () => {
      const box = new SecretBox(testKey);
      const message = 'test';

      const encrypted = await box.encrypt(message);

      // Should be valid hex (nonce 24 bytes + ciphertext)
      expect(/^[a-f0-9]+$/i.test(encrypted)).toBe(true);
      expect(encrypted.length).toBeGreaterThan(48); // At least nonce (48 hex chars)
    });
  });
});

describe('generateKey', () => {
  it('should generate a 64-character hex string', () => {
    const key = generateKey();

    expect(key).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/i.test(key)).toBe(true);
  });

  it('should generate unique keys', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      keys.add(generateKey());
    }
    expect(keys.size).toBe(100);
  });
});

describe('generatePassword', () => {
  it('should generate a 24-character password by default', () => {
    const password = generatePassword();

    expect(password).toHaveLength(24);
  });

  it('should generate a password of specified length', () => {
    const password = generatePassword(32);

    expect(password).toHaveLength(32);
  });

  it('should generate unique passwords', () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 100; i++) {
      passwords.add(generatePassword());
    }
    expect(passwords.size).toBe(100);
  });

  it('should only contain allowed characters', () => {
    const password = generatePassword(100);
    const allowedChars = /^[a-zA-Z0-9!@#$%^&*]+$/;

    expect(allowedChars.test(password)).toBe(true);
  });
});

describe('rotateEncryptionKey', () => {
  let client: Client | null = null;
  const oldKey = '29739248cad1bd1a0fc4d9b75cd4d2990de535baf5caadfdf8d8f86664aa830c';
  const newKey = generateKey();

  beforeAll(async () => {
    client = new Client(TEST_DB_CONFIG);
    try {
      await client.connect();
    } catch {
      console.warn('Database not available, skipping integration tests');
    }
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });

  it('should reject invalid old key format', async () => {
    await expect(
      rotateEncryptionKey({
        oldKey: 'invalid',
        newKey: newKey,
        dbConfig: TEST_DB_CONFIG,
      })
    ).rejects.toThrow('OLD_KEY must be 64 hex characters');
  });

  it('should reject invalid new key format', async () => {
    await expect(
      rotateEncryptionKey({
        oldKey: oldKey,
        newKey: 'tooshort',
        dbConfig: TEST_DB_CONFIG,
      })
    ).rejects.toThrow('NEW_KEY must be 64 hex characters');
  });

  it('should rotate keys successfully', async () => {
    // Skip if no database connection
    if (!client || (client as Client & { _ending?: boolean })._ending) {
      console.warn('Skipping: database not available');
      return;
    }

    // Check if there are any keys to rotate
    const result = await client.query('SELECT COUNT(*) FROM "private-key"');
    if (parseInt(result.rows[0].count) === 0) {
      console.warn('Skipping: no private keys in database');
      return;
    }

    // Rotate to new key
    const rotateResult = await rotateEncryptionKey({
      oldKey: oldKey,
      newKey: newKey,
      dbConfig: TEST_DB_CONFIG,
    });

    expect(rotateResult.success).toBeGreaterThan(0);
    expect(rotateResult.errors).toBe(0);

    // Rotate back to original key
    const rotateBackResult = await rotateEncryptionKey({
      oldKey: newKey,
      newKey: oldKey,
      dbConfig: TEST_DB_CONFIG,
    });

    expect(rotateBackResult.success).toBeGreaterThan(0);
    expect(rotateBackResult.errors).toBe(0);
  });
});
