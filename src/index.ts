// Key rotation
export { rotateEncryptionKey, generateKey, generatePassword, SecretBox } from './rotate-key';

// Backup and restore
export { backupDatabase, restoreDatabase, verifyDatabase } from './backup-restore';

// Password management
export { changePassword } from './change-password';

// UI utilities
export * from './ui';

// Types
export type {
  DbConfig,
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
