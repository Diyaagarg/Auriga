import { useEffect, useState } from 'react';
import api from './api';
import { getErrorMessage } from './errorMessage';

const LIMIT = 10;

export default function MembersTable() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('name');
  const [order, setOrder] = useState('asc');

  const [data, setData] = useState({ members: [], total: 0, page: 1, limit: LIMIT, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Debounce free-text search so we don't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .get('/api/members', { params: { search: debouncedSearch || undefined, page, limit: LIMIT, sort, order } })
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, page, sort, order]);

  function toggleSort(column) {
    if (sort === column) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(column);
      setOrder('asc');
    }
    setPage(1);
  }

  function sortIndicator(column) {
    if (sort !== column) return '';
    return order === 'asc' ? ' ▲' : ' ▼';
  }

  return (
    <div className="page">
      <h2>All Members</h2>

      <div className="row">
        <input
          type="text"
          placeholder="Search by phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <p className="error">{error}</p>}

      <table className="members-table">
        <thead>
          <tr>
            <th onClick={() => toggleSort('name')} className="sortable">
              Name{sortIndicator('name')}
            </th>
            <th>Phone</th>
            <th onClick={() => toggleSort('tier')} className="sortable">
              Tier{sortIndicator('tier')}
            </th>
            <th>Lifetime pts</th>
            <th onClick={() => toggleSort('points_balance')} className="sortable">
              Balance{sortIndicator('points_balance')}
            </th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={5}>Loading…</td>
            </tr>
          )}
          {!loading && data.members.length === 0 && (
            <tr>
              <td colSpan={5}>No members found.</td>
            </tr>
          )}
          {!loading &&
            data.members.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{m.phone}</td>
                <td>
                  <span className={`tier-badge tier-${m.tier.toLowerCase()}`}>{m.tier}</span>
                </td>
                <td>{m.lifetime_points}</td>
                <td>{m.points_balance}</td>
              </tr>
            ))}
        </tbody>
      </table>

      <div className="row pagination">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          Prev
        </button>
        <span>
          Page {data.page} of {Math.max(data.totalPages, 1)} ({data.total} members)
        </span>
        <button
          onClick={() => setPage((p) => Math.min(data.totalPages || 1, p + 1))}
          disabled={page >= data.totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
}
