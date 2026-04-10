import { useState, useEffect, useRef, useCallback, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import BackButton from '../../components/common/BackButton.tsx';
import { useToast } from '../../components/common/Toast.tsx';
import type { KycStatus } from '../../types/index.ts';
import { ClipboardList, Clock, CheckCircle2, XCircle, Camera, Upload } from 'lucide-react';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ID_TYPES = [
  { value: 'passport',        label: 'Passport' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'national_id',     label: 'National ID (PhilSys)' },
  { value: 'sss_id',          label: 'SSS ID' },
  { value: 'umid',            label: 'UMID' },
  { value: 'voters_id',       label: "Voter's ID" },
  { value: 'postal_id',       label: 'Postal ID' },
] as const;

interface KycStatusData {
  status:           KycStatus;
  id_type:          string | null;
  submitted_at:     string | null;
  reviewed_at:      string | null;
  rejection_reason: string | null;
}

const STATUS_CONFIG: Record<KycStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  none:     { label: 'Not submitted', cls: '',               Icon: ClipboardList  },
  pending:  { label: 'Under review',  cls: 'badge--warning', Icon: Clock         },
  approved: { label: 'Approved',      cls: 'badge--success', Icon: CheckCircle2  },
  rejected: { label: 'Rejected',      cls: 'badge--error',   Icon: XCircle       },
};

export default function Kyc() {
  const { user, fetchMe } = useAuth();
  const toast             = useToast();

  const [kycData,       setKycData]       = useState<KycStatusData | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [idType,        setIdType]        = useState<string>(ID_TYPES[0].value);
  const [idFront,       setIdFront]       = useState<File | null>(null);
  const [idSelfie,      setIdSelfie]      = useState<File | null>(null);
  const [frontPreview,  setFrontPreview]  = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [submitting,    setSubmitting]    = useState(false);

  const frontRef  = useRef<HTMLInputElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<KycStatusData>('/kyc/status')
      .then(({ data }) => setKycData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setFile = useCallback((
    field: 'front' | 'selfie',
    file: File | null,
    prevPreview: string | null,
    setPreview: (url: string | null) => void,
    setFileFn: (f: File | null) => void,
  ) => {
    // Revoke old object URL to avoid memory leaks
    if (prevPreview) URL.revokeObjectURL(prevPreview);
    if (!file) { setFileFn(null); setPreview(null); return; }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`${field === 'front' ? 'ID photo' : 'Selfie'} must be under 5 MB.`);
      setFileFn(null); setPreview(null); return;
    }
    setFileFn(file);
    if (file.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null); // PDF — no visual preview
    }
  }, [toast]);

  function handleFileChange(field: 'front' | 'selfie') {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (field === 'front') {
        setFile('front',  file, frontPreview,  setFrontPreview,  setIdFront);
      } else {
        setFile('selfie', file, selfiePreview, setSelfiePreview, setIdSelfie);
      }
      // Reset input so same file can be re-selected after clearing
      e.target.value = '';
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!idFront || !idSelfie) { toast.error('Please upload both required documents.'); return; }

    const formData = new FormData();
    formData.append('id_type',   idType);
    formData.append('id_front',  idFront);
    formData.append('id_selfie', idSelfie);

    setSubmitting(true);
    try {
      await api.post('/kyc', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success("KYC submitted! We'll review it within 1–3 business days.");
      setKycData({ status: 'pending', id_type: idType, submitted_at: new Date().toISOString(), reviewed_at: null, rejection_reason: null });
      setIdFront(null);
      setIdSelfie(null);
      if (frontPreview)  { URL.revokeObjectURL(frontPreview);  setFrontPreview(null);  }
      if (selfiePreview) { URL.revokeObjectURL(selfiePreview); setSelfiePreview(null); }
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
  const cfg       = STATUS_CONFIG[currentStatus];

  if (loading) return (
    <div className="page">
      <div className="sk-section">
        <span className="sk sk-line sk-line--xl skeleton" style={{ width: '40%' }} />
        <span className="sk sk-line--sm skeleton" style={{ width: '55%' }} />
      </div>
      {/* Status banner skeleton */}
      <div className="sk-card sk-row" style={{ padding: 16, gap: 12 }}>
        <span className="sk skeleton sk-circle" style={{ width: 40, height: 40, flexShrink: 0 }} />
        <div className="sk-col" style={{ gap: 6 }}>
          <span className="sk sk-line skeleton" style={{ width: '60%' }} />
          <span className="sk sk-line--sm skeleton" style={{ width: '40%' }} />
        </div>
      </div>
      {/* Upload form skeleton */}
      <div className="sk-card sk-section" style={{ padding: 20, gap: 16 }}>
        <span className="sk sk-line skeleton" style={{ width: '45%' }} />
        <span className="sk sk-line--sm skeleton" style={{ width: '70%' }} />
        <div className="sk-col" style={{ gap: 8 }}>
          <span className="sk sk-line--sm skeleton" style={{ width: '20%' }} />
          <span className="sk skeleton" style={{ height: 44, borderRadius: 8, width: '100%' }} />
        </div>
        <div className="sk-row" style={{ gap: 12 }}>
          <span className="sk skeleton" style={{ flex: 1, height: 130, borderRadius: 10 }} />
          <span className="sk skeleton" style={{ flex: 1, height: 130, borderRadius: 10 }} />
        </div>
        <span className="sk skeleton" style={{ height: 44, borderRadius: 8, width: '100%' }} />
      </div>
    </div>
  );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <BackButton />
          <h1 className="page-title">Verify Identity</h1>
          <p className="page-subtitle">Required to enable withdrawals</p>
        </div>
      </header>

      {/* Status banner */}
      <div className="kyc-status-banner">
        <span className="kyc-status-banner-icon"><cfg.Icon size={22} /></span>
        <div className="kyc-status-banner-body">
          <p className="kyc-status-banner-title">
            Verification status: <span className={`badge ${cfg.cls}`}>{cfg.label}</span>
          </p>
          {kycData?.submitted_at && (
            <p className="kyc-status-banner-sub">
              Submitted {new Date(kycData.submitted_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })}
            </p>
          )}
        </div>
      </div>

      {currentStatus === 'rejected' && kycData?.rejection_reason && (
        <div className="alert alert--error">
          <strong>Rejected:</strong> {kycData.rejection_reason}
        </div>
      )}
      {currentStatus === 'approved' && (
        <div className="alert alert--success">
          Identity verified. You can now withdraw your earnings.
        </div>
      )}
      {currentStatus === 'pending' && (
        <div className="alert alert--info">
          Your documents are under review. This typically takes 1–3 business days.
        </div>
      )}

      {/* Upload form */}
      {canSubmit && (
        <div className="card">
          <h2 className="card-title">
            {currentStatus === 'rejected' ? 'Resubmit documents' : 'Submit your documents'}
          </h2>
          <p className="text-muted kyc-intro">
            Upload a clear photo of a valid government-issued ID and a selfie holding it.
            Accepted: JPEG, PNG, PDF · max 5 MB each.
          </p>

          <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
            <div className="form-group" style={{ marginBottom: 20 }}>
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
              {/* ID Front */}
              <div className="form-group">
                <label className="form-label">
                  ID photo (front)
                  <span className="form-hint">All corners visible</span>
                </label>
                <div
                  className={`kyc-upload-box${idFront ? ' kyc-upload-box--selected' : ''}`}
                  onClick={() => frontRef.current?.click()}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') frontRef.current?.click(); }}
                >
                  {frontPreview ? (
                    <img src={frontPreview} alt="ID front preview" className="kyc-preview-img" />
                  ) : idFront ? (
                    <Upload size={24} />
                  ) : (
                    <Upload size={28} />
                  )}
                  {idFront ? (
                    <>
                      <p className="kyc-upload-filename">{idFront.name}</p>
                      <p className="kyc-upload-filesize">{fmtSize(idFront.size)}</p>
                      <span className="kyc-upload-change">Tap to change</span>
                    </>
                  ) : (
                    <>
                      <p style={{ fontWeight: 600, fontSize: 13 }}>Upload ID front</p>
                      <p style={{ fontSize: 11, opacity: 0.7 }}>JPEG, PNG or PDF · max 5 MB</p>
                    </>
                  )}
                </div>
                <input ref={frontRef} type="file" accept="image/jpeg,image/png,application/pdf"
                  className="kyc-file-input" onChange={handleFileChange('front')} />
              </div>

              {/* Selfie */}
              <div className="form-group">
                <label className="form-label">
                  Selfie with ID
                  <span className="form-hint">Face clearly visible</span>
                </label>
                <div
                  className={`kyc-upload-box${idSelfie ? ' kyc-upload-box--selected' : ''}`}
                  onClick={() => selfieRef.current?.click()}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selfieRef.current?.click(); }}
                >
                  {selfiePreview ? (
                    <img src={selfiePreview} alt="Selfie preview" className="kyc-preview-img" />
                  ) : idSelfie ? (
                    <Camera size={24} />
                  ) : (
                    <Camera size={28} />
                  )}
                  {idSelfie ? (
                    <>
                      <p className="kyc-upload-filename">{idSelfie.name}</p>
                      <p className="kyc-upload-filesize">{fmtSize(idSelfie.size)}</p>
                      <span className="kyc-upload-change">Tap to change</span>
                    </>
                  ) : (
                    <>
                      <p style={{ fontWeight: 600, fontSize: 13 }}>Upload selfie</p>
                      <p style={{ fontSize: 11, opacity: 0.7 }}>Holding your ID · max 5 MB</p>
                    </>
                  )}
                </div>
                <input ref={selfieRef} type="file" accept="image/jpeg,image/png,application/pdf"
                  className="kyc-file-input" onChange={handleFileChange('selfie')} />
              </div>
            </div>

            <div className="kyc-disclaimer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Documents are encrypted and only accessible to our verification team.
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
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
