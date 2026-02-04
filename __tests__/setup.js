const { Client } = require('pg');

const DEFAULT_PASSWORD = 'postgres';

async function resetPassword() {
  // Try to connect with various passwords and reset to default
  const passwords = [DEFAULT_PASSWORD, 'TestPassword123!', "Test'Password\"123!@#$%", 'AnotherTest456!'];

  for (const pwd of passwords) {
    try {
      const client = new Client({
        host: process.env.VCKIT_DATABASE_HOST || process.env.DATABASE_HOST || 'localhost',
        port: parseInt(process.env.VCKIT_DATABASE_PORT || process.env.DATABASE_PORT || '5432'),
        database: 'postgres',
        user: process.env.VCKIT_DATABASE_USERNAME || process.env.DATABASE_USERNAME || 'postgres',
        password: pwd,
      });

      await client.connect();
      await client.query(`ALTER USER postgres WITH PASSWORD '${DEFAULT_PASSWORD}'`);
      await client.end();
      return true;
    } catch (err) {
      // Try next password
    }
  }

  console.warn('Could not reset password - database may be unavailable');
  return false;
}

module.exports = async () => {
  await resetPassword();
};
