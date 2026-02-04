// Key rotation
export { rotateEncryptionKey, generateKey, generatePassword, SecretBox } from './rotate-key';

// Backup and restore
export { backupDatabase, restoreDatabase, verifyDatabase } from './backup-restore';

// Password management
export { changePassword } from './change-password';

// Database utilities
export { buildClientConfig, isLocalHost } from './db-utils';

// UI utilities
export * from './ui';

// Types
export type {
  DbConfig,
  SslConfig,
  RotateKeyOptions,
  RotateKeyResult,
  BackupOptions,
  BackupResult,
  RestoreOptions,
  RestoreResult,
  VerifyOptions,
  VerifyResult,
  ChangePasswordOptions,
  ChangePasswordResult,
} from './types';
