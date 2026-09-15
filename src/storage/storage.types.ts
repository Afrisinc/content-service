export interface StoredObject {
  key: string;
  bytes: number;
  checksum: string;
  contentType: string;
  etag?: string;
}

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
}

export interface ObjectStorage {
  put(input: PutObjectInput): Promise<StoredObject>;
  putIfAbsent(input: PutObjectInput): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  head(key: string): Promise<StoredObject | null>;
  exists(key: string): Promise<boolean>;
  list(prefix: string, limit?: number): Promise<string[]>;
  remove(key: string): Promise<void>;
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  publicUrl(key: string): string;
  healthy(): Promise<boolean>;
}
