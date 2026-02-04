import { exec } from 'child_process';
import { promisify } from 'util';
import { Client } from 'pg';
import type { ChangePasswordOptions, ChangePasswordResult } from './types';
import { colors, Spinner, status, resultBox, nextSteps, operationBanner, spacer } from './ui';

const execAsync = promisify(exec);

/**
 * Change the database user password
 */
export async function changePassword({
  newPassword,
  targetUser,
  container,
  dbConfig,
}: ChangePasswordOptions): Promise<ChangePasswordResult> {
  await operationBanner('Password Change');

  const userToChange = targetUser || dbConfig.user;
  status.info(`Target user: ${colors.cyan(userToChange)}`);
  spacer();

  if (!newPassword || newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters');
  }

  const escapedPassword = newPassword.replace(/'/g, "''");
  const sql = `ALTER USER ${userToChange} WITH PASSWORD '${escapedPassword}';`;

  if (container) {
    const spinner = new Spinner(`Connecting via Docker container ${colors.cyan(container)}...`);
    spinner.start();

    try {
      await execAsync(`docker exec ${container} psql -U ${dbConfig.user} -c "${sql}"`);
      spinner.success('Password updated');
    } catch (err) {
      spinner.fail('Connection failed');
      throw new Error(`Password change failed: ${(err as Error).message}`);
    }
  } else {
    const spinner = new Spinner(
      `Connecting to ${colors.cyan(dbConfig.host)}:${colors.cyan(String(dbConfig.port))}...`
    );
    spinner.start();

    const client = new Client({
      ...dbConfig,
      database: 'postgres',
    });

    try {
      await client.connect();
      await client.query(sql);
      await client.end();
      spinner.success('Password updated');
    } catch (err) {
      spinner.fail('Connection failed');
      throw new Error(`Password change failed: ${(err as Error).message}`);
    }
  }

  spacer();
  resultBox('PASSWORD CHANGED', [
    { label: 'User', value: userToChange, color: 'cyan' },
    { label: 'Status', value: 'Success', color: 'green' },
  ]);

  spacer();
  nextSteps([
    `Update ${colors.cyan('DATABASE_PASSWORD')} in your env file`,
    'Restart vckit-api with: docker compose up -d --force-recreate vckit-api',
  ]);

  return { success: true };
}
