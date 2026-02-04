import { isLocalHost, buildClientConfig } from '../src/db-utils';
import type { DbConfig } from '../src/types';

describe('isLocalHost', () => {
  describe('should return true for localhost variants', () => {
    it('localhost', () => {
      expect(isLocalHost('localhost')).toBe(true);
    });

    it('LOCALHOST (case insensitive)', () => {
      expect(isLocalHost('LOCALHOST')).toBe(true);
    });

    it('Localhost (mixed case)', () => {
      expect(isLocalHost('Localhost')).toBe(true);
    });
  });

  describe('should return true for IPv4 loopback addresses', () => {
    it('127.0.0.1', () => {
      expect(isLocalHost('127.0.0.1')).toBe(true);
    });

    it('127.0.0.2', () => {
      expect(isLocalHost('127.0.0.2')).toBe(true);
    });

    it('127.255.255.255 (end of loopback range)', () => {
      expect(isLocalHost('127.255.255.255')).toBe(true);
    });

    it('127.1.2.3 (middle of loopback range)', () => {
      expect(isLocalHost('127.1.2.3')).toBe(true);
    });
  });

  describe('should return true for IPv6 localhost variants', () => {
    it('::1 (short form)', () => {
      expect(isLocalHost('::1')).toBe(true);
    });

    it('0:0:0:0:0:0:0:1 (long form)', () => {
      expect(isLocalHost('0:0:0:0:0:0:0:1')).toBe(true);
    });

    it('::ffff:127.0.0.1 (IPv4-mapped)', () => {
      expect(isLocalHost('::ffff:127.0.0.1')).toBe(true);
    });

    it('::FFFF:127.0.0.1 (IPv4-mapped, uppercase)', () => {
      expect(isLocalHost('::FFFF:127.0.0.1')).toBe(true);
    });

    it('::ffff:127.255.255.255 (IPv4-mapped, end of range)', () => {
      expect(isLocalHost('::ffff:127.255.255.255')).toBe(true);
    });
  });

  describe('should return true for Docker internal hostnames', () => {
    it('host.docker.internal', () => {
      expect(isLocalHost('host.docker.internal')).toBe(true);
    });

    it('HOST.DOCKER.INTERNAL (case insensitive)', () => {
      expect(isLocalHost('HOST.DOCKER.INTERNAL')).toBe(true);
    });

    it('docker.for.mac.localhost', () => {
      expect(isLocalHost('docker.for.mac.localhost')).toBe(true);
    });

    it('docker.for.win.localhost', () => {
      expect(isLocalHost('docker.for.win.localhost')).toBe(true);
    });

    it('gateway.docker.internal', () => {
      expect(isLocalHost('gateway.docker.internal')).toBe(true);
    });
  });

  describe('should return true for empty/undefined hosts (safe default)', () => {
    it('empty string', () => {
      expect(isLocalHost('')).toBe(true);
    });

    it('undefined (cast to string)', () => {
      expect(isLocalHost(undefined as unknown as string)).toBe(true);
    });
  });

  describe('should return false for remote hosts', () => {
    it('db.example.com', () => {
      expect(isLocalHost('db.example.com')).toBe(false);
    });

    it('192.168.1.1 (private network)', () => {
      expect(isLocalHost('192.168.1.1')).toBe(false);
    });

    it('10.0.0.1 (private network)', () => {
      expect(isLocalHost('10.0.0.1')).toBe(false);
    });

    it('172.16.0.1 (private network)', () => {
      expect(isLocalHost('172.16.0.1')).toBe(false);
    });

    it('rds.amazonaws.com', () => {
      expect(isLocalHost('rds.amazonaws.com')).toBe(false);
    });

    it('postgres.railway.app', () => {
      expect(isLocalHost('postgres.railway.app')).toBe(false);
    });

    it('128.0.0.1 (not loopback - starts with 128)', () => {
      expect(isLocalHost('128.0.0.1')).toBe(false);
    });

    it('1270.0.0.1 (not loopback - invalid format)', () => {
      expect(isLocalHost('1270.0.0.1')).toBe(false);
    });

    it('::ffff:192.168.1.1 (IPv4-mapped non-loopback)', () => {
      expect(isLocalHost('::ffff:192.168.1.1')).toBe(false);
    });
  });
});

describe('buildClientConfig', () => {
  const baseDbConfig: DbConfig = {
    host: 'localhost',
    port: 5432,
    database: 'testdb',
    user: 'testuser',
    password: 'testpass',
  };

  describe('basic config passthrough', () => {
    it('should pass through basic connection parameters', () => {
      const result = buildClientConfig(baseDbConfig);
      expect(result.host).toBe('localhost');
      expect(result.port).toBe(5432);
      expect(result.database).toBe('testdb');
      expect(result.user).toBe('testuser');
      expect(result.password).toBe('testpass');
    });

    it('should allow database override', () => {
      const result = buildClientConfig(baseDbConfig, 'overridedb');
      expect(result.database).toBe('overridedb');
    });
  });

  describe('SSL auto-detection for local hosts', () => {
    it('should not enable SSL for localhost', () => {
      const config: DbConfig = { ...baseDbConfig, host: 'localhost' };
      const result = buildClientConfig(config);
      expect(result.ssl).toBeUndefined();
    });

    it('should not enable SSL for 127.0.0.1', () => {
      const config: DbConfig = { ...baseDbConfig, host: '127.0.0.1' };
      const result = buildClientConfig(config);
      expect(result.ssl).toBeUndefined();
    });

    it('should not enable SSL for ::1', () => {
      const config: DbConfig = { ...baseDbConfig, host: '::1' };
      const result = buildClientConfig(config);
      expect(result.ssl).toBeUndefined();
    });

    it('should not enable SSL for Docker internal hostname', () => {
      const config: DbConfig = { ...baseDbConfig, host: 'host.docker.internal' };
      const result = buildClientConfig(config);
      expect(result.ssl).toBeUndefined();
    });
  });

  describe('SSL auto-detection for remote hosts', () => {
    it('should enable SSL for remote hostname', () => {
      const config: DbConfig = { ...baseDbConfig, host: 'db.example.com' };
      const result = buildClientConfig(config);
      expect(result.ssl).toEqual({ rejectUnauthorized: true });
    });

    it('should enable SSL for remote IP', () => {
      const config: DbConfig = { ...baseDbConfig, host: '192.168.1.100' };
      const result = buildClientConfig(config);
      expect(result.ssl).toEqual({ rejectUnauthorized: true });
    });

    it('should enable SSL for cloud database hostname', () => {
      const config: DbConfig = { ...baseDbConfig, host: 'postgres.railway.app' };
      const result = buildClientConfig(config);
      expect(result.ssl).toEqual({ rejectUnauthorized: true });
    });
  });

  describe('explicit SSL configuration', () => {
    it('should enable SSL when explicitly enabled for localhost', () => {
      const config: DbConfig = {
        ...baseDbConfig,
        host: 'localhost',
        ssl: { enabled: true },
      };
      const result = buildClientConfig(config);
      expect(result.ssl).toEqual({ rejectUnauthorized: true });
    });

    it('should disable SSL when explicitly disabled for remote host', () => {
      const config: DbConfig = {
        ...baseDbConfig,
        host: 'db.example.com',
        ssl: { enabled: false },
      };
      const result = buildClientConfig(config);
      expect(result.ssl).toBeUndefined();
    });

    it('should respect rejectUnauthorized: false', () => {
      const config: DbConfig = {
        ...baseDbConfig,
        host: 'db.example.com',
        ssl: { rejectUnauthorized: false },
      };
      const result = buildClientConfig(config);
      expect(result.ssl).toEqual({ rejectUnauthorized: false });
    });

    it('should default rejectUnauthorized to true when not specified', () => {
      const config: DbConfig = {
        ...baseDbConfig,
        host: 'db.example.com',
        ssl: { enabled: true },
      };
      const result = buildClientConfig(config);
      expect(result.ssl).toEqual({ rejectUnauthorized: true });
    });
  });

  describe('undefined ssl.enabled (auto-detection)', () => {
    it('should auto-detect SSL for remote when ssl.enabled is undefined', () => {
      const config: DbConfig = {
        ...baseDbConfig,
        host: 'db.example.com',
        ssl: { enabled: undefined, rejectUnauthorized: false },
      };
      const result = buildClientConfig(config);
      // Remote host + undefined enabled = SSL enabled
      expect(result.ssl).toEqual({ rejectUnauthorized: false });
    });

    it('should not enable SSL for local when ssl.enabled is undefined', () => {
      const config: DbConfig = {
        ...baseDbConfig,
        host: 'localhost',
        ssl: { enabled: undefined },
      };
      const result = buildClientConfig(config);
      expect(result.ssl).toBeUndefined();
    });
  });
});
