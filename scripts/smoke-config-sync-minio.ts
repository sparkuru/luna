import { CreateBucketCommand, DeleteBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE_FILE = path.join(ROOT, 'compose.minio.yaml');
const PROJECT = 'luna-minio-smoke';
const ENDPOINT = 'http://127.0.0.1:19000';
const MINIO_VERSION = 'RELEASE.2025-09-07T16-13-09Z';
const ACCESS_KEY_ID = 'luna-test-access';
const SECRET_ACCESS_KEY = 'luna-test-secret-2026';
const PASSPHRASE = 'luna-test-passphrase-2026';
const HEALTH_URL = `${ENDPOINT}/minio/health/live`;

let bucket: string | null = null;
let failure: unknown = null;
let stage = 'project-preflight';
let ownsProject = false;

async function run(): Promise<void> {
  const successEvidence: string[] = [];
  try {
    assertProjectAbsent();
    ownsProject = true;
    stage = 'compose-up';
    runCompose(['up', '-d', 'minio']);
    stage = 'health';
    await waitForMinio();
    stage = 'create-bucket';
    bucket = `luna-config-test-${randomUUID().replaceAll('-', '')}`;
    const client = new S3Client({
      endpoint: ENDPOINT,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
    });
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } finally {
      client.destroy();
    }

    stage = 'provider-conformance';
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    let output: string;
    try {
      output = execFileSync(npmCommand, ['run', 'smoke:config-sync:provider'], {
        cwd: ROOT,
        env: {
          ...process.env,
          LUNA_S3_CONFORMANCE_PROVIDER: 'MinIO',
          LUNA_S3_CONFORMANCE_PROVIDER_VERSION: MINIO_VERSION,
          LUNA_S3_CONFORMANCE_ENDPOINT: ENDPOINT,
          LUNA_S3_CONFORMANCE_REGION: 'us-east-1',
          LUNA_S3_CONFORMANCE_BUCKET: bucket,
          LUNA_S3_CONFORMANCE_ACCESS_KEY_ID: ACCESS_KEY_ID,
          LUNA_S3_CONFORMANCE_SECRET_ACCESS_KEY: SECRET_ACCESS_KEY,
          LUNA_S3_CONFORMANCE_TEST_PASSPHRASE: PASSPHRASE,
          LUNA_S3_CONFORMANCE_BASE_PREFIX: '',
          LUNA_S3_CONFORMANCE_FORCE_PATH_STYLE: 'true',
          LUNA_S3_CONFORMANCE_ALLOW_EXACT_OBJECT_WRITE: 'true',
        },
        encoding: 'utf8',
        timeout: 120_000,
        maxBuffer: 1_000_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new Error(`provider child failed: ${safeProviderFailure(error)}`);
    }
    const evidence = parseProviderEvidence(output, 'LUNA_CONFIG_SYNC_PROVIDER_CONFORMANCE_OK');
    const ledger = parseProviderEvidence(output, 'LUNA_LEDGER_SYNC_PROVIDER_CONFORMANCE_OK');
    successEvidence.push(`LUNA_CONFIG_SYNC_MINIO_OK provider=MinIO version=${MINIO_VERSION} get=${evidence.get} put=${evidence.put} cleanup=${evidence.cleanup}`);
    successEvidence.push(`LUNA_LEDGER_SYNC_MINIO_OK provider=MinIO version=${MINIO_VERSION} get=${ledger.get} put=${ledger.put} cleanup=${ledger.cleanup}`);
  } catch (error) {
    failure = error instanceof Error ? error : new Error(`stage=${stage}`);
  } finally {
    await cleanupBucket();
    if (ownsProject) {
      try {
        runCompose(['down', '--remove-orphans']);
      } catch (error) {
        if (failure === null) failure = error;
      }
    }
  }
  if (failure !== null) {
    const detail = failure instanceof Error ? `: ${failure.message}` : '';
    throw new Error(`MinIO config-sync smoke failed at ${stage}${detail}`);
  }
  for (const evidence of successEvidence) console.log(evidence);
}

function assertProjectAbsent(): void {
  for (const args of [
    ['ps', '-a', '--filter', `label=com.docker.compose.project=${PROJECT}`, '--format', '{{.ID}}'],
    ['network', 'ls', '--filter', `label=com.docker.compose.project=${PROJECT}`, '--format', '{{.ID}}'],
  ]) {
    const existing = execFileSync('docker', args, {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000,
    });
    if (existing.trim() !== '') throw new Error('Refusing to reuse or tear down a pre-existing MinIO smoke project.');
  }
}

function runCompose(args: string[]): void {
  try {
    execFileSync('docker', ['compose', '-p', PROJECT, '-f', COMPOSE_FILE, ...args], {
      cwd: ROOT,
      env: {
        ...process.env,
        LUNA_MINIO_ROOT_USER: ACCESS_KEY_ID,
        LUNA_MINIO_ROOT_PASSWORD: SECRET_ACCESS_KEY,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
      maxBuffer: 1_000_000,
    });
  } catch {
    throw new Error(`MinIO compose ${args[0] ?? 'command'} failed.`);
  }
}

async function waitForMinio(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(HEALTH_URL);
      if (response.ok) return;
    } catch {
      // The container is still starting; retry within the bounded window.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('MinIO health check timed out.');
}

function parseProviderEvidence(output: string, marker: string): { get: number; put: number; cleanup: string } {
  const line = output.split('\n').find((value) => value.startsWith(`${marker} `));
  if (line === undefined) throw new Error('Provider conformance did not emit bounded evidence.');
  const payload = JSON.parse(line.slice(line.indexOf('{')) as string) as {
    cleanup?: unknown;
    operations?: { get?: unknown; put?: unknown };
  };
  if (
    payload.cleanup !== 'deleted' ||
    typeof payload.operations?.get !== 'number' ||
    typeof payload.operations.put !== 'number' ||
    !Number.isSafeInteger(payload.operations.get) || payload.operations.get < 0 ||
    !Number.isSafeInteger(payload.operations.put) || payload.operations.put < 0
  ) {
    throw new Error('Provider conformance evidence was malformed.');
  }
  return { cleanup: payload.cleanup, get: payload.operations.get, put: payload.operations.put };
}

function safeProviderFailure(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'child exited';
  const stderr = 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : '';
  const line = stderr
    .split('\n')
    .map((value) => value.replace(/\x1b\[[0-9;]*m/g, '').trim())
    .find((value) => value.startsWith('LUNA_CONFIG_SYNC_PROVIDER_CONFORMANCE_FAILED '));
  return line === undefined ? 'child exited' : line.slice('LUNA_CONFIG_SYNC_PROVIDER_CONFORMANCE_FAILED '.length);
}

async function cleanupBucket(): Promise<void> {
  if (bucket === null) return;
  try {
    const client = new S3Client({
      endpoint: ENDPOINT,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
    });
    try {
      await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    } finally {
      client.destroy();
    }
  } catch {
    // The exact compose teardown below removes the tmpfs even if a failed
    // conformance run left a test object behind.
  }
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'MinIO config-sync smoke failed.');
  process.exitCode = 1;
});
