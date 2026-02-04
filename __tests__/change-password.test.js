const { changePassword } = require('../dist/change-password');
const { Client } = require('pg');

// Test database config
const TEST_DB_CONFIG = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'vckit',
  user: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
};

describe('changePassword', () => {
  const originalPassword = TEST_DB_CONFIG.password;

  afterEach(async () => {
    // Restore original password after each test
    try {
      const client = new Client({
        ...TEST_DB_CONFIG,
        database: 'postgres',
      });
      await client.connect();
      await client.query(`ALTER USER ${TEST_DB_CONFIG.user} WITH PASSWORD '${originalPassword}'`);
      await client.end();
    } catch (err) {
      // Try with any changed password
      const passwords = ['TestPassword123!', 'AnotherTest456!'];
      for (const pwd of passwords) {
        try {
          const client = new Client({
            ...TEST_DB_CONFIG,
            password: pwd,
            database: 'postgres',
          });
          await client.connect();
          await client.query(`ALTER USER ${TEST_DB_CONFIG.user} WITH PASSWORD '${originalPassword}'`);
          await client.end();
          break;
        } catch (e) {
          // Continue trying
        }
      }
    }
  });

  it('should reject password shorter than 8 characters', async () => {
    await expect(
      changePassword({
        newPassword: 'short',
        dbConfig: TEST_DB_CONFIG,
      })
    ).rejects.toThrow('at least 8 characters');
  });

  it('should change password successfully', async () => {
    const newPassword = 'TestPassword123!';

    const result = await changePassword({
      newPassword: newPassword,
      dbConfig: TEST_DB_CONFIG,
    });

    expect(result.success).toBe(true);

    // Verify new password works
    const client = new Client({
      ...TEST_DB_CONFIG,
      password: newPassword,
    });

    await expect(client.connect()).resolves.not.toThrow();
    await client.end();
  });

  it('should handle passwords with special characters', async () => {
    const newPassword = "Test'Password\"123!@#$%";

    const result = await changePassword({
      newPassword: newPassword,
      dbConfig: TEST_DB_CONFIG,
    });

    expect(result.success).toBe(true);

    // Verify new password works
    const client = new Client({
      ...TEST_DB_CONFIG,
      password: newPassword,
    });

    await expect(client.connect()).resolves.not.toThrow();
    await client.end();
  });
});
