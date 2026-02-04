/**
 * Database configuration options
 */
export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
}

/**
 * Options for rotating encryption keys
 */
export interface RotateKeyOptions {
  oldKey: string;
  newKey: string;
  dbConfig: DbConfig;
}

/**
 * Result of key rotation
 */
export interface RotateKeyResult {
  success: number;
  errors: number;
}

/**
 * Options for database backup
 */
export interface BackupOptions {
  output: string;
  container?: string;
  dbConfig: DbConfig;
}

/**
 * Result of database backup
 */
export interface BackupResult {
  file: string;
  size: number;
  lines: number;
}

/**
 * Options for database restore
 */
export interface RestoreOptions {
  input: string;
  container?: string;
  drop?: boolean;
  dbConfig: DbConfig;
}

/**
 * Result of database restore
 */
export interface RestoreResult {
  success: boolean;
  statements?: number;
  errors?: number;
}

/**
 * Options for database verification
 */
export interface VerifyOptions {
  container?: string;
  dbConfig: DbConfig;
}

/**
 * Result of database verification
 */
export interface VerifyResult {
  valid: boolean;
  missing: string[];
}

/**
 * Options for changing database password
 */
export interface ChangePasswordOptions {
  newPassword: string;
  targetUser?: string;
  container?: string;
  dbConfig: DbConfig;
}

/**
 * Result of password change
 */
export interface ChangePasswordResult {
  success: boolean;
}
