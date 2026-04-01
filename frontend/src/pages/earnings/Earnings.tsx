import { useEffect, useState } from 'react';
import {
  Lock, Play, MousePointerClick, ClipboardList, Users, Zap,
} from 'lucide-react';
import api from '../../services/api.ts';
import type { EarningsResponse, Earning } from '../../types/index.ts';

const STATUS_LABEL: Record<string, string> = {
  pending:  'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const TYPE_ICON: Record<string, React.ReactElement> = {
  captcha:  <Lock              size={18} />,
  video:    <Play              size={18} />,
  ad_click: <MousePointerClick size={18} />,
  survey:   <ClipboardList     size={18} />,
  referral: <Users             size={18} />,
};

function EarningCard({ row }: { row: Earning }) {
  return (
    <div className="earning-row">
      <div className="earning-row-icon">{TYPE_ICON[row.type] ?? <Zap size={18} />}</div>
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
          <h1 className="page-title">Earnings History</h1>
          {total > 0 && (
            <p className="page-subtitle">{total} transaction{total !== 1 ? 's' : ''} total</p>
          )}
        </div>
      </header>

      {loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : data.data.length === 0 ? (
        <div className="empty-state">
          <p>No earnings recorded yet.</p>
          <p className="text-muted" style={{ marginTop: 6, fontSize: 13 }}>Complete tasks to start earning.</p>
        </div>
      ) : (
        <>
          <div className="earnings-list">
            {data.data.map((row) => <EarningCard key={row.id} row={row} />)}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                ← Prev
              </button>
              <span className="pagination-info">Page {page} of {totalPages}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
