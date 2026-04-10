/**
 * Multer upload middleware factory.
 *
 * Files are uploaded to memory (Buffer) then forwarded to Cloudinary
 * by the respective controller. This avoids local disk dependencies
 * and works in serverless / containerised environments.
 *
 * Security:
 *  – MIME type is validated against an allowlist.
 *  – File size is capped per upload type.
 */
import multer   from 'multer';
import type { Request } from 'express';
import { ValidationError } from '../utils/errors.ts';

// ─── Allowed MIME types ────────────────────────────────────────────────────

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOC_MIMES   = new Set(['image/jpeg', 'image/png', 'application/pdf']);

// ─── Memory storage (buffers passed to Cloudinary) ─────────────────────────

const memStorage = multer.memoryStorage();

// ─── Avatar upload (images only, 2 MB max) ───────────────────────────────

export const avatarUpload = multer({
  storage: memStorage,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req: Request, file, cb) => {
    if (IMAGE_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError('Avatar must be JPEG, PNG or WEBP') as unknown as null, false);
    }
  },
});

// ─── KYC upload (images + PDF, 5 MB max per file) ────────────────────────

export const kycUpload = multer({
  storage: memStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (_req: Request, file, cb) => {
    if (DOC_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError('KYC documents must be JPEG, PNG or PDF') as unknown as null, false);
    }
  },
});
