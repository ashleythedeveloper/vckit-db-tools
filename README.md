# vckit-db-tools

Database management tools for [VCKit](https://github.com/uncefact/project-vckit) - backup, restore, and encryption key rotation.

## Installation

```bash
npm install -g vckit-db-tools
```

Or use directly with npx:

```bash
npx vckit-db-tools <command>
```

## Commands

### Generate Encryption Key

Generate a new 256-bit encryption key:

```bash
npx vckit-db-tools generate-key
```

### Generate Password

Generate a secure random password:

```bash
npx vckit-db-tools generate-password
npx vckit-db-tools generate-password --length 32
```

### Rotate Encryption Key

Rotate the database encryption key (re-encrypts all private keys):

```bash
npx vckit-db-tools rotate-key \
  --old-key <current-64-char-hex-key> \
  --new-key <new-64-char-hex-key> \
  --host localhost \
  --port 5432 \
  --database vckit \
  --user postgres \
  --password postgres
```

Or using an env file with auto-update:

```bash
npx vckit-db-tools rotate-key \
  --old-key <current-key> \
  --new-key <new-key> \
  --dotenv ./local.env \
  --update-env
```

The `--update-env` flag automatically updates `DATABASE_ENCRYPTION_KEY` in your env file after successful rotation.

### Backup Database

Create a database backup:

```bash
# Direct connection (pure JavaScript - no pg_dump required)
npx vckit-db-tools backup \
  --output ./backups/vckit_$(date +%Y%m%d).sql \
  --host localhost \
  --password postgres

# Using Docker container (uses pg_dump for faster/more complete backups)
npx vckit-db-tools backup \
  --output ./backups/vckit_$(date +%Y%m%d).sql \
  --container app_db_1
```

**Note:** When using `--container`, the tool uses `pg_dump` inside the container for a complete backup. Direct connections use a pure JavaScript implementation that doesn't require PostgreSQL tools installed.

### Restore Database

Restore from a backup:

```bash
# Direct connection (pure JavaScript - no psql required)
npx vckit-db-tools restore \
  --input ./backups/vckit_20260204.sql \
  --host localhost \
  --password postgres \
  --drop  # Optional: drop and recreate database first

# Using Docker container (uses psql for faster restores)
npx vckit-db-tools restore \
  --input ./backups/vckit_20260204.sql \
  --container app_db_1 \
  --drop
```

### Verify Database

Check that all expected tables exist:

```bash
# Direct connection
npx vckit-db-tools verify \
  --host localhost \
  --password postgres

# Using Docker container
npx vckit-db-tools verify --container app_db_1
```

### Change Database Password

Change the PostgreSQL user password:

```bash
# With specific password
npx vckit-db-tools change-password \
  --new-password "MyNewSecurePassword123" \
  --password current_password

# Auto-generate secure password
npx vckit-db-tools change-password \
  --generate \
  --dotenv ./local.env \
  --update-env

# Auto-generate with custom length
npx vckit-db-tools change-password \
  --generate --length 32 \
  --container app_db_1
```

The `--generate` flag creates a secure random password. Use with `--update-env` to automatically save it to your env file.

## Environment Variables

All commands support these environment variables as defaults (override with `--database`, `--host`, etc.):

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_HOST` | PostgreSQL host | `localhost` |
| `DATABASE_PORT` | PostgreSQL port | `5432` |
| `DATABASE_NAME` | Database name | `vckit` |
| `DATABASE_USERNAME` | Database user | `postgres` |
| `DATABASE_PASSWORD` | Database password | - |
| `DATABASE_ENCRYPTION_KEY` | 64-char hex key for private key encryption | - |

### Using an Environment File

You can point directly to your env file using the `--dotenv` option:

```bash
# Use local.env file
npx vckit-db-tools --dotenv ./local.env verify

# Use different env files for different environments
npx vckit-db-tools --dotenv ./production.env backup --output ./backup.sql
npx vckit-db-tools --dotenv ./staging.env verify
```

**Note:** The `--dotenv` option must come before the command name.

The `--dotenv` option works with all commands and supports standard `.env` format:
- `KEY=value`
- `KEY="quoted value"`
- `KEY='single quoted'`
- Comments with `#`

**Alternative:** You can also source your env file before running commands:
```bash
source local.env
npx vckit-db-tools verify
```

## Programmatic Usage

```typescript
import {
  rotateEncryptionKey,
  generateKey,
  generatePassword,
  backupDatabase,
  restoreDatabase,
  changePassword,
} from 'vckit-db-tools';

// Generate a new key
const newKey = generateKey();

// Rotate encryption key
await rotateEncryptionKey({
  oldKey: 'current-64-char-hex-key',
  newKey: newKey,
  dbConfig: {
    host: 'localhost',
    port: 5432,
    database: 'vckit',
    user: 'postgres',
    password: 'postgres',
  },
});

// Backup database
await backupDatabase({
  output: './backup.sql',
  dbConfig: { /* ... */ },
});

// Restore database
await restoreDatabase({
  input: './backup.sql',
  drop: true,
  dbConfig: { /* ... */ },
});
```

## Full Rotation Procedure

### Using Docker Compose

If you're running VCKit with Docker Compose:

1. **Generate new key:**
   ```bash
   npx vckit-db-tools generate-key
   # Save the output!
   ```

2. **Stop the API:**
   ```bash
   docker compose stop vckit-api
   ```

3. **Rotate keys in database (with auto-update):**
   ```bash
   npx vckit-db-tools rotate-key \
     --old-key <current-key> \
     --new-key <new-key> \
     --dotenv ./local.env \
     --update-env
   ```
   This automatically updates `DATABASE_ENCRYPTION_KEY` in your env file.

5. **Restart API:**
   ```bash
   docker compose up -d --force-recreate vckit-api
   ```

6. **Verify:**
   ```bash
   curl -X POST http://localhost:3332/agent/didManagerFind \
     -H "Authorization: Bearer <api-key>" \
     -H "Content-Type: application/json" -d '{}'
   ```

### Direct Connection (No Docker)

If you're connecting directly to a PostgreSQL database:

1. **Generate new key:**
   ```bash
   npx vckit-db-tools generate-key
   # Save the output!
   ```

2. **Stop your VCKit API service** (however you run it)

3. **Rotate keys in database:**
   ```bash
   npx vckit-db-tools rotate-key \
     --old-key <current-key> \
     --new-key <new-key> \
     --host db.example.com \
     --port 5432 \
     --database vckit \
     --user postgres \
     --password <db-password>
   ```

4. **Update your environment/configuration** with the new encryption key

5. **Restart your VCKit API service**

6. **Verify the API is working**

## License

MIT
