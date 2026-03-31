/**
 * Multer upload middleware factory.
 *
 * Security:
 *  – Filenames are replaced with crypto-random UUIDs (no user input in path).
 *  – MIME type is validated against an allowlist.
 *  – File size is capped per upload type.
 *  – KYC documents are stored outside express.static coverage.
 */
import path     from 'path';
import fs       from 'fs';
import crypto   from 'crypto';
import multer   from 'multer';
import type { Request } from 'express';
import { ValidationError } from '../utils/errors.ts';

// Resolve paths relative to the project root (backend/)
const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
export const AVATARS_DIR = path.join(UPLOADS_ROOT, 'avatars');
export const KYC_DIR     = path.join(UPLOADS_ROOT, 'kyc');

// Ensure directories exist on startup
[AVATARS_DIR, KYC_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── Allowed MIME types ────────────────────────────────────────────────────

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOC_MIMES   = new Set(['image/jpeg', 'image/png', 'application/pdf']);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg':      '.jpg',
  'image/png':       '.png',
  'image/webp':      '.webp',
  'application/pdf': '.pdf',
};

function randomFilename(mime: string): string {
  return `${crypto.randomBytes(16).toString('hex')}${MIME_TO_EXT[mime] ?? '.bin'}`;
}

// ─── Avatar upload (images only, 2 MB max) ───────────────────────────────

export const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATARS_DIR),
    filename:    (_req, file, cb) => cb(null, randomFilename(file.mimetype)),
  }),
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
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, KYC_DIR),
    filename:    (_req, file, cb) => cb(null, randomFilename(file.mimetype)),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (_req: Request, file, cb) => {
    if (DOC_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError('KYC documents must be JPEG, PNG or PDF') as unknown as null, false);
    }
  },
});
