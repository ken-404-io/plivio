import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import type { KycStatus } from '../../types/index.ts';

const ID_TYPES = [
  { value: 'passport',       label: 'Passport' },
  { value: 'drivers_license',label: "Driver's License" },
  { value: 'national_id',    label: 'National ID (PhilSys)' },
  { value: 'sss_id',         label: 'SSS ID' },
  { value: 'umid',           label: 'UMID' },
  { value: 'voters_id',      label: "Voter's ID" },
  { value: 'postal_id',      label: 'Postal ID' },
] as const;

interface KycStatusData {
  status:           KycStatus;
  id_type:          string | null;
  submitted_at:     string | null;
  reviewed_at:      string | null;
  rejection_reason: string | null;
}

function StatusBadge({ status }: { status: KycStatus }) {
  const map: Record<KycStatus, { label: string; cls: string }> = {
    none:     { label: 'Not submitted', cls: '' },
    pending:  { label: 'Under review',  cls: 'badge--warning' },
    approved: { label: 'Approved',      cls: 'badge--success' },
    rejected: { label: 'Rejected',      cls: 'badge--error' },
  };
  const { label, cls } = map[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function Kyc() {
  const { user, fetchMe } = useAuth();
  const toast             = useToast();

  const [kycData,    setKycData]    = useState<KycStatusData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [idType,     setIdType]     = useState<string>(ID_TYPES[0].value);
  const [idFront,    setIdFront]    = useState<File | null>(null);
  const [idSelfie,   setIdSelfie]   = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const frontRef  = useRef<HTMLInputElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadStatus() {
      try {
        const { data } = await api.get<KycStatusData>('/kyc/status');
        setKycData(data);
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    }
    void loadStatus();
  }, []);

  function handleFileChange(field: 'front' | 'selfie') {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (field === 'front')  setIdFront(file);
      if (field === 'selfie') setIdSelfie(file);
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!idFront || !idSelfie) {
      toast.error('Please upload both required documents.');
      return;
    }

    const formData = new FormData();
    formData.append('id_type',   idType);
    formData.append('id_front',  idFront);
    formData.append('id_selfie', idSelfie);

    setSubmitting(true);
    try {
      await api.post('/kyc', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('KYC submitted successfully. We will review it within 1-3 business days.');
      setKycData({ status: 'pending', id_type: idType, submitted_at: new Date().toISOString(), reviewed_at: null, rejection_reason: null });
      setIdFront(null);
      setIdSelfie(null);
      if (frontRef.current)  frontRef.current.value  = '';
      if (selfieRef.current) selfieRef.current.value = '';
      await fetchMe();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const currentStatus: KycStatus = user?.kyc_status ?? 'none';
  const canSubmit = currentStatus === 'none' || currentStatus === 'rejected';

  if (loading) return <div className="page-loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Identity Verification</h1>
          <p className="page-subtitle">
            KYC is required before you can withdraw your earnings.
          </p>
        </div>
      </header>

      {/* Status card */}
      <div className="card kyc-status-card">
        <div className="kyc-status-row">
          <div>
            <p className="kyc-status-label">Verification status</p>
            <StatusBadge status={currentStatus} />
          </div>
          {kycData?.submitted_at && (
            <div className="kyc-status-meta">
              <p className="text-muted">Submitted</p>
              <p>{new Date(kycData.submitted_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</p>
            </div>
          )}
        </div>

        {currentStatus === 'rejected' && kycData?.rejection_reason && (
          <div className="alert alert--error kyc-rejection-reason">
            <strong>Reason for rejection:</strong> {kycData.rejection_reason}
          </div>
        )}

        {currentStatus === 'approved' && (
          <div className="alert alert--success">
            Your identity has been verified. You can now withdraw your earnings.
          </div>
        )}

        {currentStatus === 'pending' && (
          <div className="alert alert--info">
            Your documents are under review. This typically takes 1–3 business days.
          </div>
        )}
      </div>

      {/* Submission form */}
      {canSubmit && (
        <div className="card">
          <h2 className="card-title">
            {currentStatus === 'rejected' ? 'Resubmit documents' : 'Submit your documents'}
          </h2>
          <p className="text-muted kyc-intro">
            Upload a clear photo of a valid government-issued ID and a selfie holding that ID.
            Accepted formats: JPEG, PNG, PDF (max 5 MB per file).
          </p>

          <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="id_type">ID type</label>
              <select
                id="id_type"
                className="form-input"
                value={idType}
                onChange={(e) => setIdType(e.target.value)}
              >
                {ID_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="kyc-upload-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="id_front">
                  ID photo (front)
                  <span className="form-hint">Clear, all corners visible</span>
                </label>
                <div
                  className={`kyc-upload-box${idFront ? ' kyc-upload-box--selected' : ''}`}
                  onClick={() => frontRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') frontRef.current?.click(); }}
                >
                  {idFront ? (
                    <p className="kyc-upload-filename">{idFront.name}</p>
                  ) : (
                    <>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
                          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p>Click to upload ID front</p>
                    </>
                  )}
                </div>
                <input
                  ref={frontRef}
                  id="id_front"
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  className="kyc-file-input"
                  onChange={handleFileChange('front')}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="id_selfie">
                  Selfie with ID
                  <span className="form-hint">Face clearly visible, holding your ID</span>
                </label>
                <div
                  className={`kyc-upload-box${idSelfie ? ' kyc-upload-box--selected' : ''}`}
                  onClick={() => selfieRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selfieRef.current?.click(); }}
                >
                  {idSelfie ? (
                    <p className="kyc-upload-filename">{idSelfie.name}</p>
                  ) : (
                    <>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      <p>Click to upload selfie</p>
                    </>
                  )}
                </div>
                <input
                  ref={selfieRef}
                  id="id_selfie"
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  className="kyc-file-input"
                  onChange={handleFileChange('selfie')}
                  required
                />
              </div>
            </div>

            <div className="kyc-disclaimer text-muted">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Your documents are encrypted and stored securely. They are only accessible to
              our verification team and are retained as required by regulations.
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !idFront || !idSelfie}
            >
              {submitting ? 'Submitting…' : 'Submit for verification'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
