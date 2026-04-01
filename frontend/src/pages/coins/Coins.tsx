import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import type { CoinsResponse, CoinTransaction } from '../../types/index.ts';
import {
  Coins as CoinsIcon,
  Flame,
  Trophy,
  ArrowRightLeft,
  History,
  Tv,
  Wallet,
  ChevronRight,
  TrendingUp,
  Plus,
  Minus,
} from 'lucide-react';

// ─── Streak Recovery Modal ────────────────────────────────────────────────────

interface RecoveryModalProps {
  beforeBreak: number;
  coins: number;
  onRecover: (method: 'ad' | 'coins') => Promise<void>;
  onDismiss: () => void;
}

function RecoveryModal({ beforeBreak, coins, onRecover, onDismiss }: RecoveryModalProps) {
  const [loading, setLoading] = useState(false);

  async function handle(method: 'ad' | 'coins') {
    setLoading(true);
    await onRecover(method);
    setLoading(false);
  }

  return (
    <div className="modal-overlay" onClick={onDismiss}>
      <div className="modal-card recovery-modal" onClick={(e) => e.stopPropagation()}>
        <div className="recovery-modal-icon">
          <Flame size={40} className="recovery-flame" />
        </div>
        <h2 className="recovery-modal-title">Streak Broken!</h2>
        <p className="recovery-modal-sub">
          You missed a day and your <strong>{beforeBreak}-day streak</strong> was reset.
          Recover it now before the window closes!
        </p>

        <div className="recovery-options">
          <button
            className="recovery-option recovery-option--free"
            onClick={() => { void handle('ad'); }}
            disabled={loading}
          >
            <span className="recovery-option-icon"><Tv size={22} /></span>
            <div className="recovery-option-body">
              <span className="recovery-option-title">Recover for Free</span>
              <span className="recovery-option-sub">Watch a short ad</span>
            </div>
            <ChevronRight size={18} className="recovery-option-arrow" />
          </button>

          <button
            className={`recovery-option recovery-option--coins${coins < 10 ? ' recovery-option--disabled' : ''}`}
            onClick={() => { void handle('coins'); }}
            disabled={loading || coins < 10}
          >
            <span className="recovery-option-icon"><CoinsIcon size={22} /></span>
            <div className="recovery-option-body">
              <span className="recovery-option-title">Recover with Coins</span>
              <span className="recovery-option-sub">
                {coins < 10
                  ? `Need 10 coins (you have ${coins})`
                  : 'Spend 10 Plivio Coins'}
              </span>
            </div>
            <ChevronRight size={18} className="recovery-option-arrow" />
          </button>
        </div>

        <button className="recovery-dismiss" onClick={onDismiss}>
          Skip — start new streak
        </button>
      </div>
    </div>
  );
}

// ─── Transaction icon ─────────────────────────────────────────────────────────

function TxIcon({ type, amount }: { type: string; amount: number }) {
  if (type === 'streak_bonus')    return <Trophy size={18} />;
  if (type === 'conversion')      return <ArrowRightLeft size={18} />;
  if (type === 'streak_recovery') return <Flame size={18} />;
  return amount >= 0 ? <Plus size={18} /> : <Minus size={18} />;
}

// ─── Coins page ───────────────────────────────────────────────────────────────

export default function Coins() {
  const { user, fetchMe } = useAuth();
  const toast = useToast();

  const [info,     setInfo]     = useState<CoinsResponse | null>(null);
  const [txList,   setTxList]   = useState<CoinTransaction[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [checking, setChecking] = useState(false);
  const [converting, setConverting] = useState(false);
  const [amount,   setAmount]   = useState('');
  const [showRecovery, setShowRecovery] = useState(false);

  const load = useCallback(async () => {
    try {
      const [coinsRes, txRes] = await Promise.all([
        api.get<CoinsResponse>('/coins'),
        api.get<{ data: CoinTransaction[] }>('/coins/transactions', { params: { limit: 20 } }),
      ]);
      setInfo(coinsRes.data);
      setTxList(txRes.data.data);

      // Show recovery modal if there's a recoverable broken streak
      if (coinsRes.data.can_recover && coinsRes.data.streak_before_break > 0) {
        setShowRecovery(true);
      }
    } catch {
      toast.error('Failed to load coins data.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  async function handleCheckIn() {
    setChecking(true);
    try {
      const { data } = await api.post<{
        success: boolean;
        already_checked_in?: boolean;
        streak_count: number;
        coins_awarded: number;
        bonus_day: boolean;
        streak_broken?: boolean;
        message?: string;
      }>('/coins/checkin');

      if (data.already_checked_in) {
        toast.info(data.message ?? 'Already checked in today.');
      } else if (data.bonus_day) {
        toast.success(`Day ${data.streak_count} streak! +50 coins bonus!`);
      } else if (data.streak_broken) {
        toast.warning('Streak broken — new streak started.');
      } else {
        toast.success(`Day ${data.streak_count} streak! Keep it up.`);
      }
      await load();
      fetchMe();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Check-in failed.');
    } finally {
      setChecking(false);
    }
  }

  async function handleConvert(e: React.FormEvent) {
    e.preventDefault();
    const coins = Number(amount);
    if (!coins || coins < 50) { toast.error('Minimum conversion is 50 coins.'); return; }
    if (coins > Number(user?.coins ?? 0)) { toast.error('Insufficient coins.'); return; }

    setConverting(true);
    try {
      const { data } = await api.post<{ message: string }>('/coins/convert', { amount: coins });
      toast.success(data.message);
      setAmount('');
      await load();
      fetchMe();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Conversion failed.');
    } finally {
      setConverting(false);
    }
  }

  async function handleRecover(method: 'ad' | 'coins') {
    try {
      const { data } = await api.post<{ streak_count: number; coins_spent: number }>(
        '/coins/streak/recover',
        { method },
      );
      toast.success(`Streak recovered! You're back to a ${data.streak_count}-day streak.`);
      setShowRecovery(false);
      await load();
      fetchMe();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Recovery failed.');
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>;

  const coins       = Number(info?.coins ?? user?.coins ?? 0);
  const streak      = info?.streak_count ?? 0;
  const nextBonusIn = streak > 0 ? 7 - (streak % 7) : 7;
  const daysPct     = Math.round(((7 - nextBonusIn) / 7) * 100);

  const coinsNum  = Number(amount) || 0;
  const feeAmt    = Math.round(coinsNum * 0.07 * 100) / 100;
  const netPayout = Math.max(0, Math.floor(coinsNum * 0.93 * 100) / 100);

  const today = new Date().toISOString().slice(0, 10);
  const checkedInToday = info?.last_streak_date === today;

  return (
    <>
      <div className="page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Plivio Coins</h1>
            <p className="page-subtitle">1 coin = ₱1 · Convert to GCash</p>
          </div>
        </header>

        {/* ── Coins balance hero ── */}
        <div className="coins-hero-card">
          <div className="coins-hero-icon"><CoinsIcon size={32} /></div>
          <div className="coins-hero-body">
            <span className="coins-hero-label">Your Coins</span>
            <span className="coins-hero-value">{coins.toLocaleString()}</span>
            <span className="coins-hero-sub">≈ ₱{coins.toLocaleString()} value</span>
          </div>
          <div className="coins-hero-rate">
            <span className="coins-rate-badge">1 coin = ₱1</span>
          </div>
        </div>

        {/* ── Streak card ── */}
        <div className="streak-card">
          <div className="streak-card-header">
            <div className="streak-card-left">
              <Flame size={22} className={streak > 0 ? 'streak-flame--active' : 'streak-flame'} />
              <div>
                <span className="streak-card-title">Daily Streak</span>
                <span className="streak-card-sub">
                  {streak > 0
                    ? `${streak} day${streak !== 1 ? 's' : ''} in a row`
                    : 'Check in to start your streak'}
                </span>
              </div>
            </div>
            <div className="streak-card-badge">
              <Trophy size={14} />
              <span>Day {streak}</span>
            </div>
          </div>

          {/* Progress to next bonus */}
          <div className="streak-progress-wrap">
            <div className="streak-progress-row">
              <span className="streak-progress-label">
                {nextBonusIn === 7 ? 'Bonus at day 7' : `${nextBonusIn} day${nextBonusIn !== 1 ? 's' : ''} to bonus`}
              </span>
              <span className="streak-progress-bonus">+50 coins</span>
            </div>
            <div className="streak-progress-bar">
              <div className="streak-progress-fill" style={{ width: `${daysPct}%` }} />
            </div>
            <div className="streak-days-row">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <div
                  key={d}
                  className={`streak-day-dot${d <= (7 - nextBonusIn) ? ' streak-day-dot--done' : ''}${d === 7 ? ' streak-day-dot--bonus' : ''}`}
                >
                  {d === 7 ? <Trophy size={10} /> : d}
                </div>
              ))}
            </div>
          </div>

          <button
            className={`btn btn-primary btn-full${checkedInToday ? ' btn-checked-in' : ''}`}
            onClick={() => { void handleCheckIn(); }}
            disabled={checking || checkedInToday}
          >
            <Flame size={16} />
            {checkedInToday ? 'Checked In Today' : checking ? 'Checking in…' : 'Check In'}
          </button>
        </div>

        {/* ── Convert coins ── */}
        <section className="card">
          <div className="card-title-row">
            <ArrowRightLeft size={18} />
            <h2 className="card-title">Convert to GCash</h2>
          </div>
          <p className="coins-convert-hint text-muted">
            7% fee applies · Minimum 50 coins · Processed within 24h
          </p>

          <form onSubmit={(e) => { void handleConvert(e); }} className="coins-convert-form">
            <div className="coins-convert-input-wrap">
              <CoinsIcon size={16} className="coins-convert-prefix-icon" />
              <input
                className="form-input coins-convert-input"
                type="number"
                placeholder="Coins to convert"
                min={50}
                max={10000}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            {coinsNum >= 50 && (
              <div className="coins-convert-preview">
                <div className="coins-convert-preview-row">
                  <span>Coins</span>
                  <span>{coinsNum.toLocaleString()}</span>
                </div>
                <div className="coins-convert-preview-row coins-convert-fee">
                  <span>Fee (7%)</span>
                  <span>−{feeAmt.toFixed(2)}</span>
                </div>
                <div className="coins-convert-preview-row coins-convert-total">
                  <span>GCash payout</span>
                  <span className="coins-convert-payout">₱{netPayout.toFixed(2)}</span>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={converting || !amount || Number(amount) < 50 || Number(amount) > coins}
            >
              <Wallet size={16} />
              {converting ? 'Processing…' : 'Convert to GCash'}
            </button>
          </form>
        </section>

        {/* ── How to earn coins ── */}
        <section className="card">
          <div className="card-title-row">
            <TrendingUp size={18} />
            <h2 className="card-title">How to Earn Coins</h2>
          </div>
          <div className="coins-earn-list">
            <div className="coins-earn-row">
              <div className="coins-earn-icon"><Flame size={18} /></div>
              <div className="coins-earn-body">
                <span className="coins-earn-title">7-Day Streak Bonus</span>
                <span className="coins-earn-sub">Check in daily — get 50 coins every 7th day</span>
              </div>
              <span className="coins-earn-amount">+50</span>
            </div>
          </div>
        </section>

        {/* ── Transaction history ── */}
        <section className="section">
          <div className="section-header">
            <div className="section-title-row">
              <History size={16} />
              <h2 className="section-title">Coin History</h2>
            </div>
          </div>

          {txList.length === 0 ? (
            <div className="empty-state">
              <CoinsIcon size={32} className="empty-state-icon" />
              <p>No transactions yet. Start your daily streak to earn coins!</p>
            </div>
          ) : (
            <div className="earnings-list">
              {txList.map((tx) => (
                <div key={tx.id} className="earning-row">
                  <div className={`earning-row-icon ${tx.amount >= 0 ? 'earning-row-icon--credit' : 'earning-row-icon--debit'}`}>
                    <TxIcon type={tx.type} amount={tx.amount} />
                  </div>
                  <div className="earning-row-body">
                    <p className="earning-row-title">{tx.description}</p>
                    <p className="earning-row-date text-muted">
                      {new Date(tx.created_at).toLocaleDateString('en-PH', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </p>
                  </div>
                  <span className={`earning-row-amount ${tx.amount < 0 ? 'earning-row-amount--debit' : ''}`}>
                    {tx.amount >= 0 ? '+' : ''}{tx.amount} coins
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showRecovery && info && (
        <RecoveryModal
          beforeBreak={info.streak_before_break}
          coins={coins}
          onRecover={handleRecover}
          onDismiss={() => setShowRecovery(false)}
        />
      )}
    </>
  );
}
