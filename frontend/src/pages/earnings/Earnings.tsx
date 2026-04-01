import { useEffect, useState } from 'react';
import api from '../../services/api.ts';
import type { EarningsResponse, Earning } from '../../types/index.ts';
import {
  ShieldCheck,
  Play,
  MousePointerClick,
  ClipboardList,
  Users,
  Zap,
} from 'lucide-react';

const STATUS_LABEL: Record<string, string> = {
  pending:  'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

function EarningTypeIcon({ type }: { type: string }) {
  const size = 16;
  if (type === 'captcha')  return <ShieldCheck size={size} />;
  if (type === 'video')    return <Play size={size} />;
  if (type === 'ad_click') return <MousePointerClick size={size} />;
  if (type === 'survey')   return <ClipboardList size={size} />;
  if (type === 'referral') return <Users size={size} />;
  return <Zap size={size} />;
}

function EarningCard({ row }: { row: Earning }) {
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

export default function Earnings() {
  const [data, setData]       = useState<EarningsResponse>({ success: true, data: [], meta: { page: 1, limit: 20, total: 0 } });
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<EarningsResponse>('/users/me/earnings', { params: { page, limit: 20 } })
      .then(({ data: res }) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.ceil((data.meta.total ?? 0) / 20);
  const total      = data.meta.total ?? 0;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Earnings</h1>
          <p className="page-subtitle">{total} total transaction{total !== 1 ? 's' : ''}</p>
        </div>
      </header>

      {loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : data.data.length === 0 ? (
        <div className="empty-state">
          <p>No earnings yet. Complete tasks to start earning.</p>
        </div>
      ) : (
        <div className="earnings-list">
          {data.data.map((row) => <EarningCard key={row.id} row={row} />)}
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
