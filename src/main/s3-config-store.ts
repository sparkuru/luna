import { createHash } from 'node:crypto';
import { ObjectStoreError, type ConfigObject, type ConditionalPut, type ConfigObjectStore } from '../sync/s3-config-store';
export * from '../sync/s3-config-store';

/** Deterministic contract adapter used by multi-client tests. */
export class InMemoryConfigObjectStore implements ConfigObjectStore {
  readonly calls: Array<{ operation: 'get' | 'put'; key: string }> = [];
  private readonly objects = new Map<string, ConfigObject>();
  private readonly failures: Array<{
    operation: 'any' | 'get' | 'put';
    error: ObjectStoreError;
  }> = [];

  queueFailure(error: ObjectStoreError): void {
    this.failures.push({ operation: 'any', error });
  }

  queueFailureFor(operation: 'get' | 'put', error: ObjectStoreError): void {
    this.failures.push({ operation, error });
  }

  async get(key: string): Promise<ConfigObject> {
    this.calls.push({ operation: 'get', key });
    this.maybeFail('get');
    const object = this.objects.get(key);
    if (object === undefined) throw new ObjectStoreError('not-found', 'Object was not found.');
    return { body: object.body.slice(), etag: object.etag };
  }

  async put(key: string, body: Uint8Array, condition: ConditionalPut): Promise<{ etag: string }> {
    this.calls.push({ operation: 'put', key });
    this.maybeFail('put');
    const current = this.objects.get(key);
    if (condition.ifNoneMatch === true && current !== undefined) {
      throw new ObjectStoreError('conflict', 'Object already exists.');
    }
    if (condition.ifMatch !== undefined && current?.etag !== condition.ifMatch) {
      throw new ObjectStoreError('conflict', 'Object ETag changed.');
    }
    if (condition.ifNoneMatch !== true && condition.ifMatch === undefined) {
      throw new ObjectStoreError('invalid-response', 'Conditional write token is missing.');
    }
    const stored = body.slice();
    const etag = `"${createHash('sha256').update(stored).digest('hex')}"`;
    this.objects.set(key, { body: stored, etag });
    return { etag };
  }

  peek(key: string): ConfigObject | null {
    const object = this.objects.get(key);
    return object === undefined ? null : { body: object.body.slice(), etag: object.etag };
  }

  private maybeFail(operation: 'get' | 'put'): void {
    const failure = this.failures[0];
    if (failure !== undefined && (failure.operation === 'any' || failure.operation === operation)) {
      this.failures.shift();
      throw failure.error;
    }
  }
}
