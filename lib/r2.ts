import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

export const r2 = process.env.R2_ACCOUNT_ID
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  : null

/**
 * Upload a buffer to R2 and return the public URL.
 * Falls back to null if R2 is not configured (local dev).
 */
export async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<string | null> {
  if (!r2) return null
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))
  return `${process.env.NEXT_PUBLIC_CLIPS_BASE_URL}/${key}`
}
