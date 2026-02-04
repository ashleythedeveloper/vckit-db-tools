import type { ClientConfig } from 'pg';
import type { DbConfig } from './types';

/**
 * Check if a host is considered local (no SSL needed)
 * Covers:
 * - localhost, ::1, and 0:0:0:0:0:0:0:1 (exact matches)
 * - Full 127.x.x.x IPv4 loopback range (via regex)
 * - IPv4-mapped IPv6 loopback (::ffff:127.x.x.x)
 * - Common Docker internal hostnames
 *
 * Note: Empty/undefined hosts are treated as local (safe default for
 * misconfiguration or intentional local-only usage).
 */
export function isLocalHost(host: string): boolean {
  // Treat undefined/empty as local (safe default - no SSL for missing host)
  if (!host) return true;

  const lowerHost = host.toLowerCase();

  // Exact localhost names
  const localHosts = [
    'localhost',
    '::1',
    '0:0:0:0:0:0:0:1', // Long form IPv6 localhost
  ];
  if (localHosts.includes(lowerHost)) {
    return true;
  }

  // Check for 127.x.x.x loopback range
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return true;
  }

  // IPv4-mapped IPv6 localhost (::ffff:127.x.x.x)
  if (/^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i.test(host)) {
    return true;
  }

  // Common Docker internal hostnames (typically don't have SSL)
  const dockerHosts = [
    'host.docker.internal',
    'docker.for.mac.localhost',
    'docker.for.win.localhost',
    'gateway.docker.internal',
  ];
  if (dockerHosts.includes(lowerHost)) {
    return true;
  }

  return false;
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
