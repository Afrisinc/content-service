import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@/config/env';
import { ServerError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { checksumOf } from './keys';
import type { ObjectStorage, PutObjectInput, StoredObject } from './storage.types';

async function collect(stream: unknown): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = env.STUDIO_S3_BUCKET;
    this.client = new S3Client({
      region: env.STUDIO_S3_REGION,
      endpoint: env.STUDIO_S3_ENDPOINT || undefined,
      forcePathStyle: env.STUDIO_S3_FORCE_PATH_STYLE,
      credentials: env.STUDIO_S3_ACCESS_KEY
        ? { accessKeyId: env.STUDIO_S3_ACCESS_KEY, secretAccessKey: env.STUDIO_S3_SECRET_KEY }
        : undefined,
    });
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const checksum = checksumOf(input.body);
    try {
      const response = await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          CacheControl: input.cacheControl,
          Metadata: { ...input.metadata, checksum },
        })
      );
      return {
        key: input.key,
        bytes: input.body.byteLength,
        checksum,
        contentType: input.contentType,
        etag: response.ETag,
      };
    } catch (err) {
      logger.error({ key: input.key, error: String(err) }, 'Object storage write failed');
      throw new ServerError('object storage write failed');
    }
  }

  async putIfAbsent(input: PutObjectInput): Promise<StoredObject> {
    const existing = await this.head(input.key);
    if (existing) {
      return existing;
    }
    return this.put(input);
  }

  async get(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return await collect(response.Body);
    } catch (err) {
      logger.error({ key, error: String(err) }, 'Object storage read failed');
      throw new ServerError('object storage read failed');
    }
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return {
        key,
        bytes: Number(response.ContentLength ?? 0),
        checksum: response.Metadata?.checksum ?? '',
        contentType: response.ContentType ?? 'application/octet-stream',
        etag: response.ETag,
      };
    } catch {
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async list(prefix: string, limit = 1000): Promise<string[]> {
    const response = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, MaxKeys: limit })
    );
    return (response.Contents ?? []).map(item => item.Key ?? '').filter(Boolean);
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async signedUrl(
    key: string,
    expiresInSeconds = env.STUDIO_S3_SIGNED_URL_TTL_SECONDS
  ): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  publicUrl(key: string): string {
    const base = env.STUDIO_S3_PUBLIC_URL || env.STUDIO_S3_ENDPOINT;
    if (!base) {
      return key;
    }
    return `${base.replace(/\/$/, '')}/${this.bucket}/${key}`;
  }

  async healthy(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}

let storage: ObjectStorage | undefined;

export function getObjectStorage(): ObjectStorage {
  if (!storage) {
    storage = new S3ObjectStorage();
  }
  return storage;
}

export function setObjectStorage(next: ObjectStorage): void {
  storage = next;
}
