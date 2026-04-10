/**
 * Cloudinary configuration and upload helpers.
 *
 * Required environment variables:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 */
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface CloudinaryResult {
  secure_url: string;
  public_id:  string;
}

/**
 * Upload a buffer to Cloudinary.
 * Returns the secure URL and public ID for future deletion.
 */
export async function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  options?: Record<string, unknown>,
): Promise<CloudinaryResult> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
        ...options,
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload failed'));
        } else {
          resolve({
            secure_url: result.secure_url,
            public_id:  result.public_id,
          });
        }
      },
    );
    Readable.from(buffer).pipe(stream);
  });
}

/**
 * Delete a resource from Cloudinary by public ID.
 */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // Non-fatal — stale files are cleaned up by Cloudinary lifecycle rules
  }
}

/**
 * Extract the public_id from a Cloudinary secure_url.
 * e.g. https://res.cloudinary.com/demo/image/upload/v123/plivio/avatars/abc.jpg → plivio/avatars/abc
 */
export function extractPublicId(url: string): string | null {
  try {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export default cloudinary;
