-- VCKit/Veramo minimal schema for testing
-- This creates the core tables needed for vckit-db-tools tests

CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  timestamp BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS identifier (
  did VARCHAR(255) PRIMARY KEY,
  alias VARCHAR(255),
  provider VARCHAR(255),
  "controllerKeyId" VARCHAR(255),
  "saveDate" TIMESTAMP DEFAULT NOW(),
  "updateDate" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS key (
  kid VARCHAR(255) PRIMARY KEY,
  kms VARCHAR(255) NOT NULL,
  type VARCHAR(255) NOT NULL,
  "publicKeyHex" TEXT NOT NULL,
  meta TEXT
);

CREATE TABLE IF NOT EXISTS "private-key" (
  alias VARCHAR(255) PRIMARY KEY,
  type VARCHAR(255) NOT NULL,
  "privateKeyHex" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credential (
  hash VARCHAR(255) PRIMARY KEY,
  raw TEXT NOT NULL,
  id VARCHAR(255),
  "issuanceDate" TIMESTAMP,
  "expirationDate" TIMESTAMP,
  context TEXT,
  type TEXT,
  issuer TEXT,
  subject TEXT
);

-- Insert a test key for rotation tests
-- Encrypted with key: 29739248cad1bd1a0fc4d9b75cd4d2990de535baf5caadfdf8d8f86664aa830c
-- Original value: deadbeef0123456789abcdef0123456789abcdef0123456789abcdef01234567
INSERT INTO "private-key" (alias, type, "privateKeyHex")
VALUES (
  'test-key-1',
  'Secp256k1',
  '0a2e52f66a748910e60ff34c21b009eae8d91da78245ef6a039384a34ad5052b73653526a4d2c2f0daedffe20217323b25bc437adcabb054db7fdc546a1e07ab33f6d0f04547f56a9ab34b6bc6dc6ab9c24693a33a1fe9089c699d44815afd64f01e6f6596ba3c4c'
) ON CONFLICT (alias) DO NOTHING;

-- Insert a test identifier
INSERT INTO identifier (did, alias, provider)
VALUES (
  'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  'test-identifier',
  'did:key'
) ON CONFLICT (did) DO NOTHING;
