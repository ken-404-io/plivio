/**
 * KYC (Know Your Customer) controller.
 *
 * Files are uploaded to Cloudinary under the `plivio/kyc/{userId}` folder.
 * Cloudinary secure URLs are stored in the database.
 *
 * Security:
 *  – KYC documents are served only to the owning user or an admin
 *    via an authenticated endpoint — never via a public static URL.
 *  – Old pending submissions are cleaned up from Cloudinary to avoid orphans.
 *  – kyc_status column on users is kept in sync for fast lookups.
 */
import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors.ts';
import { createNotification } from '../utils/notify.ts';
import { sendPushToUser }    from '../controllers/pushController.ts';
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicId,
} from '../config/cloudinary.ts';

const VALID_ID_TYPES = new Set([
  'passport', 'national_id', 'drivers_license',
  'sss', 'philhealth', 'pagibig',
]);

// ─── User endpoints ────────────────────────────────────────────────────────

/** POST /kyc — submit KYC documents */
export async function submitKyc(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId  = req.user!.id;
    const files   = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const idFront  = files?.['id_front']?.[0];
    const idSelfie = files?.['id_selfie']?.[0];

    if (!idFront || !idSelfie) {
      throw new ValidationError('Both id_front and id_selfie files are required');
    }

    const { id_type } = req.body as { id_type?: string };
    if (!id_type || !VALID_ID_TYPES.has(id_type)) {
      throw new ValidationError(
        `id_type must be one of: ${[...VALID_ID_TYPES].join(', ')}`,
      );
    }

    // Check if already approved — cannot re-submit
    const existing = await pool.query(
      `SELECT status FROM kyc_submissions WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1`,
      [userId],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      const { status } = existing.rows[0] as { status: string };
      if (status === 'approved') {
        throw new ValidationError('Your KYC is already approved');
      }
      // Delete old rejected/pending submission files from Cloudinary
      const old = await pool.query(
        `DELETE FROM kyc_submissions WHERE user_id = $1 AND status != 'approved'
         RETURNING id_front_path, id_selfie_path`,
        [userId],
      );
      for (const row of old.rows as { id_front_path: string; id_selfie_path: string }[]) {
        for (const url of [row.id_front_path, row.id_selfie_path]) {
          if (url) {
            const publicId = extractPublicId(url);
            if (publicId) void deleteFromCloudinary(publicId);
          }
        }
      }
    }

    // Upload both documents to Cloudinary
    const folder = `plivio/kyc/${userId}`;
    const [frontResult, selfieResult] = await Promise.all([
      uploadToCloudinary(idFront.buffer, folder, {
        public_id: `id_front_${Date.now()}`,
      }),
      uploadToCloudinary(idSelfie.buffer, folder, {
        public_id: `id_selfie_${Date.now()}`,
      }),
    ]);

    await pool.query(
      `INSERT INTO kyc_submissions (user_id, id_type, id_front_path, id_selfie_path)
       VALUES ($1, $2, $3, $4)`,
      [userId, id_type, frontResult.secure_url, selfieResult.secure_url],
    );

    await pool.query(`UPDATE users SET kyc_status = 'pending' WHERE id = $1`, [userId]);

    res.status(201).json({
      success: true,
      message: 'KYC submitted. Our team will review it within 1-2 business days.',
    });
  } catch (err) { next(err); }
}

/** GET /kyc/status — current user's KYC status */
export async function getKycStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, id_type, status, rejection_reason, submitted_at, reviewed_at
       FROM kyc_submissions WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1`,
      [req.user!.id],
    );
    res.json({ success: true, kyc: rows[0] ?? null });
  } catch (err) { next(err); }
}

/** GET /kyc/document/:field — serve KYC document URL to owner or admin */
export async function serveKycDocument(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { field } = req.params as Record<string, string>;
    if (field !== 'id_front' && field !== 'id_selfie') {
      throw new ValidationError('Invalid field');
    }

    const col = field === 'id_front' ? 'id_front_path' : 'id_selfie_path';

    // Admin can view any; user can only view their own
    const isAdmin = req.user!.is_admin;
    const kycId   = req.query.kyc_id as string | undefined;

    let fileUrl: string | null = null;

    if (isAdmin && kycId) {
      if (!/^[0-9a-f-]{36}$/i.test(kycId)) throw new ValidationError('Invalid kyc_id');
      const { rows } = await pool.query(
        `SELECT ${col} FROM kyc_submissions WHERE id = $1`,
        [kycId],
      );
      fileUrl = rows[0]?.[col] as string ?? null;
    } else {
      const { rows } = await pool.query(
        `SELECT ${col} FROM kyc_submissions WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1`,
        [req.user!.id],
      );
      fileUrl = rows[0]?.[col] as string ?? null;
    }

    if (!fileUrl) throw new NotFoundError('Document not found');

    // Cloudinary URLs — redirect to the stored secure URL
    if (fileUrl.startsWith('https://')) {
      res.redirect(fileUrl);
      return;
    }

    // Legacy fallback: if it's a local path, deny access (migration required)
    throw new ForbiddenError('Document storage migration required');
  } catch (err) { next(err); }
}

// ─── Admin endpoints ───────────────────────────────────────────────────────

/** GET /admin/kyc — list pending KYC submissions */
export async function listKycSubmissions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const status = (req.query.status as string) || 'pending';
    const { rows } = await pool.query(
      `SELECT ks.id, ks.user_id, ks.id_type, ks.status,
              ks.rejection_reason, ks.submitted_at, ks.reviewed_at,
              u.username, u.email
       FROM kyc_submissions ks
       JOIN users u ON u.id = ks.user_id
       WHERE ks.status = $1
       ORDER BY ks.submitted_at ASC`,
      [status],
    );
    res.json({ success: true, submissions: rows });
  } catch (err) { next(err); }
}

/** PUT /admin/kyc/:id — approve or reject a KYC submission */
export async function reviewKyc(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id }     = req.params as Record<string, string>;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError('Invalid id');

    const { action, rejection_reason } = req.body as {
      action: 'approve' | 'reject';
      rejection_reason?: string;
    };

    if (!['approve', 'reject'].includes(action)) {
      throw new ValidationError('action must be approve or reject');
    }
    if (action === 'reject' && !rejection_reason?.trim()) {
      throw new ValidationError('rejection_reason is required when rejecting');
    }

    const { rows } = await pool.query(
      `UPDATE kyc_submissions
       SET status = $1, rejection_reason = $2, reviewed_at = NOW(), reviewed_by = $3
       WHERE id = $4 AND status = 'pending'
       RETURNING user_id, id_type`,
      [
        action === 'approve' ? 'approved' : 'rejected',
        rejection_reason ?? null,
        req.user!.id,
        id,
      ],
    );

    if (rows.length === 0) throw new NotFoundError('KYC submission not found or already reviewed');

    const { user_id } = rows[0] as { user_id: string };
    const newStatus   = action === 'approve' ? 'approved' : 'rejected';

    // Sync kyc_status on users table
    await pool.query(`UPDATE users SET kyc_status = $1 WHERE id = $2`, [newStatus, user_id]);

    // In-app notification
    if (action === 'approve') {
      const title = 'KYC Approved';
      const body  = 'Your identity has been verified. You can now request withdrawals.';
      await createNotification(user_id, 'kyc_approved', title, body, '/withdraw');
      void sendPushToUser(user_id, title, body, '/withdraw');
    } else {
      const title = 'KYC Rejected';
      const body  = `Your KYC was rejected: ${rejection_reason ?? ''}. Please resubmit with clearer documents.`;
      await createNotification(user_id, 'kyc_rejected', title, body, '/kyc');
      void sendPushToUser(user_id, title, body, '/kyc');
    }

    res.json({ success: true, status: newStatus });
  } catch (err) { next(err); }
}
