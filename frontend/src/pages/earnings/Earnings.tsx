import { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck, Play, MousePointerClick, ClipboardList, Users, Zap,
  TrendingUp, Clock, CalendarCheck,
} from 'lucide-react';
import api from '../../services/api.ts';
import BackButton from '../../components/common/BackButton.tsx';
import type { EarningsResponse, Earning, EarningsSummary, TaskType } from '../../types/index.ts';

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: '',         label: 'All'      },
  { value: 'approved', label: 'Approved' },
  { value: 'pending',  label: 'Pending'  },
  { value: 'rejected', label: 'Rejected' },
] as const;

const TYPE_FILTERS = [
  { value: '',          label: 'All types' },
  { value: 'captcha',   label: 'Captcha'   },
  { value: 'video',     label: 'Video'     },
  { value: 'ad_click',  label: 'Ad Click'  },
  { value: 'survey',    label: 'Survey'    },
  { value: 'referral',  label: 'Referral'  },
] as const;

const STATUS_LABEL: Record<string, string> = {
  pending:  'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function EarningTypeIcon({ type }: { type: string }) {
  const size = 16;
  if (type === 'captcha')  return <ShieldCheck      size={size} />;
  if (type === 'video')    return <Play             size={size} />;
  if (type === 'ad_click') return <MousePointerClick size={size} />;
  if (type === 'survey')   return <ClipboardList    size={size} />;
  if (type === 'referral') return <Users            size={size} />;
  return <Zap size={size} />;
}

function EarningRow({ row }: { row: Earning }) {
  return (
    <div className="earning-row">
      <div className="earning-row-icon">
        <EarningTypeIcon type={row.type} />
      </div>
      <div className="earning-row-body">
        <p className="earning-row-title">{row.title}</p>
        <div className="earning-row-meta">
          <span className={`status-dot status-dot--${row.status}`}>
            {STATUS_LABEL[row.status] ?? row.status}
          </span>
          <span className="earning-row-date">
            {new Date(row.completed_at).toLocaleDateString('en-PH', {
              month: 'short', day: 'numeric', year: 'numeric',
            })}
          </span>
        </div>
      </div>
      <span className="earning-row-amount">+₱{Number(row.reward_earned).toFixed(2)}</span>
    </div>
  );
}

function SummaryBar({ s }: { s: EarningsSummary }) {
  return (
    <div className="earnings-summary-bar">
      <div className="earnings-summary-item">
        <div className="earnings-summary-icon earnings-summary-icon--green">
          <TrendingUp size={16} />
        </div>
        <div>
          <p className="earnings-summary-label">Total Earned</p>
          <p className="earnings-summary-value">₱{s.total_earned.toFixed(2)}</p>
        </div>
      </div>
      <div className="earnings-summary-divider" />
      <div className="earnings-summary-item">
        <div className="earnings-summary-icon earnings-summary-icon--yellow">
          <Clock size={16} />
        </div>
        <div>
          <p className="earnings-summary-label">Pending</p>
          <p className="earnings-summary-value">₱{s.pending_amount.toFixed(2)}</p>
          <p className="earnings-summary-sub">{s.pending_count} task{s.pending_count !== 1 ? 's' : ''}</p>
        </div>
      </div>
      <div className="earnings-summary-divider" />
      <div className="earnings-summary-item">
        <div className="earnings-summary-icon earnings-summary-icon--purple">
          <CalendarCheck size={16} />
        </div>
        <div>
          <p className="earnings-summary-label">Today</p>
          <p className="earnings-summary-value">₱{s.today_earned.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Earnings() {
  const [data,    setData]    = useState<EarningsResponse | null>(null);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    const params: Record<string, string | number> = { page, limit: 20 };
    if (statusFilter) params.status = statusFilter;
    if (typeFilter)   params.type   = typeFilter;

    api.get<EarningsResponse>('/users/me/earnings', { params })
      .then(({ data: res }) => setData(res))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page, statusFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 when filters change
  function applyStatusFilter(v: string) {
    setStatusFilter(v);
    setPage(1);
  }
  function applyTypeFilter(v: string) {
    setTypeFilter(v);
    setPage(1);
  }

  const rows       = data?.data ?? [];
  const summary    = data?.summary;
  const total      = data?.meta.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <BackButton />
          <h1 className="page-title">Earnings</h1>
          <p className="page-subtitle">{total} transaction{total !== 1 ? 's' : ''}</p>
        </div>
      </header>

      {/* Summary bar — shown from first load onwards */}
      {summary && <SummaryBar s={summary} />}

      {/* Status filter tabs */}
      <div className="earnings-filter-row">
        <div className="tabs">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              className={`tab-btn${statusFilter === value ? ' tab-btn--active' : ''}`}
              onClick={() => applyStatusFilter(value)}
            >
              {label}
              {value === 'pending'  && summary && summary.pending_count  > 0 && (
                <span className="tab-badge">{summary.pending_count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Type filter dropdown */}
        <select
          className="form-input earnings-type-filter"
          value={typeFilter}
          onChange={(e) => applyTypeFilter(e.target.value)}
          aria-label="Filter by type"
        >
          {TYPE_FILTERS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="page-loading"><div className="spinner" /><span>Loading…</span></div>
      ) : error ? (
        <div className="empty-state">
          <p style={{ color: 'var(--error)', marginBottom: 12 }}>
            Failed to load earnings. Please check your connection and try again.
          </p>
          <button className="btn btn-primary btn-sm" onClick={load}>Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <p>
            {statusFilter || typeFilter
              ? 'No earnings match this filter.'
              : 'No earnings yet. Complete tasks to start earning.'}
          </p>
        </div>
      ) : (
        <div className="earnings-list">
          {rows.map((row) => <EarningRow key={row.id} row={row} />)}
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="btn btn-ghost btn-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="pagination-info">{page} / {totalPages}</span>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
