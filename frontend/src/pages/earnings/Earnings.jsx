import { useEffect, useState } from 'react';
import api from '../../services/api.js';

const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

export default function Earnings() {
  const [data, setData]       = useState({ data: [], meta: {} });
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/users/me/earnings', { params: { page, limit: 20 } })
      .then(({ data: res }) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.ceil((data.meta.total || 0) / 20);

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Earnings History</h1>
      </header>

      {loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : data.data.length === 0 ? (
        <div className="empty-state">No earnings recorded yet.</div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td><span className="badge">{row.type}</span></td>
                    <td>
                      <span className={`status-dot status-dot--${row.status}`}>
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td className="text-accent">+₱{Number(row.reward_earned).toFixed(2)}</td>
                    <td className="text-muted">
                      {new Date(row.completed_at).toLocaleString('en-PH')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
