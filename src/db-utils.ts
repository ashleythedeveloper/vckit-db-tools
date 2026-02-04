import type { ClientConfig } from 'pg';
import type { DbConfig } from './types';

/**
 * Check if a host is considered local (no SSL needed)
 */
export function isLocalHost(host: string): boolean {
  const localHosts = ['localhost', '127.0.0.1', '::1'];
  return localHosts.includes(host.toLowerCase());
}

/**
 * Build pg ClientConfig from DbConfig with automatic SSL for remote connections
 */
export function buildClientConfig(dbConfig: DbConfig, overrideDatabase?: string): ClientConfig {
  const { host, port, database, user, password, ssl } = dbConfig;

  const config: ClientConfig = {
    host,
    port,
    database: overrideDatabase || database,
    user,
    password,
  };

  // Determine SSL settings
  const isRemote = !isLocalHost(host);

  // SSL is enabled if:
  // 1. Explicitly enabled via ssl.enabled = true, OR
  // 2. Host is remote AND ssl.enabled is not explicitly false
  const sslEnabled = ssl?.enabled === true || (isRemote && ssl?.enabled !== false);

  if (sslEnabled) {
    config.ssl = {
      rejectUnauthorized: ssl?.rejectUnauthorized !== false, // Default to true for security
    };
  }

  return config;
}
