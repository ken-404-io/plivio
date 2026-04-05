import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useScrollReveal } from '../hooks/useScrollReveal';
import {
  Zap, Sun, Moon, Menu, X,
  UserPlus, CheckCircle2, Wallet,
  Building2, Building, Lock, FileText, CreditCard, ShieldCheck,
  Check, Star,
} from 'lucide-react';
import './LandingPage.css';

// ─── Static data ───────────────────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    name:     'Maria Santos',
    location: 'Quezon City',
    initials: 'MS',
    color:    '#aa3bff',
    stars:    5,
    text:     'I\'ve been using Plivio for 3 months and already earned over ₱4,000. It\'s legit — money hits my GCash within 24 hours every time!',
  },
  {
    name:     'Renz Dela Cruz',
    location: 'Davao City',
    initials: 'RD',
    color:    '#3b82f6',
    stars:    5,
    text:     'As a student, this is perfect for extra income. I do tasks during breaks and the streak system keeps me motivated every day.',
  },
  {
    name:     'Anna Reyes',
    location: 'Cebu City',
    initials: 'AR',
    color:    '#22c55e',
    stars:    5,
    text:     'I was skeptical at first but the SEC registration badge gave me confidence. I upgraded to Premium and now I earn up to ₱100 a day!',
  },
  {
    name:     'Jerome Bautista',
    location: 'Batangas',
    initials: 'JB',
    color:    '#f97316',
    stars:    4,
    text:     'Super easy to use. Tasks are straightforward and the referral bonus is great — I invited my 3 friends and we all earn together.',
  },
  {
    name:     'Liza Fernandez',
    location: 'Pampanga',
    initials: 'LF',
    color:    '#14b8a6',
    stars:    5,
    text:     'Nasubok ko na ang maraming GPT sites pero si Plivio talaga ang pinaka-legit. Mabilis ang payout at maganda ang support.',
  },
  {
    name:     'Carlo Mendoza',
    location: 'Manila',
    initials: 'CM',
    color:    '#eab308',
    stars:    5,
    text:     'I love the coin streak feature. It gamifies earning and makes me want to log in every single day. Already withdrew ₱2,500 this month!',
  },
] as const;

// ─── Sub-components ────────────────────────────────────────────────────────────

function StarRating({ count }: { count: number }) {
  return (
    <div className="lp-stars" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={14}
          fill={i < count ? '#eab308' : 'none'}
          stroke={i < count ? '#eab308' : 'currentColor'}
        />
      ))}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [theme, toggleTheme] = useTheme();
  const [email, setEmail]   = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  // Scroll-reveal refs — each section gets its own observer
  const stepsRef        = useScrollReveal();
  const testimonialsRef = useScrollReveal();
  const plansRef        = useScrollReveal();
  const certsRef        = useScrollReveal();

  function handleCTA(e: React.FormEvent) {
    e.preventDefault();
    window.location.href = `/register${email ? `?email=${encodeURIComponent(email)}` : ''}`;
  }

  return (
    <div className="lp-root">
      {/* ─── Navbar ─────────────────────────────────────────────────────── */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <a href="/" className="lp-logo">
            <span className="lp-logo-bolt"><Zap size={20} /></span>
            <span className="lp-logo-text">Plivio</span>
          </a>

          <nav className={`lp-nav-links${menuOpen ? ' lp-nav-links--open' : ''}`}>
            <a href="#how-it-works"   onClick={() => setMenuOpen(false)}>How It Works</a>
            <a href="#testimonials"   onClick={() => setMenuOpen(false)}>Reviews</a>
            <a href="#plans"          onClick={() => setMenuOpen(false)}>Plans</a>
            <a href="#certifications" onClick={() => setMenuOpen(false)}>Certifications</a>
            <Link to="/login"         onClick={() => setMenuOpen(false)}>Login</Link>
            <Link to="/register" className="lp-nav-cta" onClick={() => setMenuOpen(false)}>
              Get Started
            </Link>
          </nav>

          <div className="lp-nav-actions">
            <button
              className="lp-theme-toggle"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="lp-menu-btn"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-content">
          <div className="lp-hero-tag">
            <span className="lp-tag-dot" />
            Registered in the Philippines
          </div>

          <h1 className="lp-hero-title">
            Earn Real Money<br />
            <span className="lp-hero-highlight">Online in PH</span>
          </h1>

          <p className="lp-hero-subtitle">
            Complete simple tasks — watch videos, answer surveys, click ads —
            and get paid directly to your GCash or PayPal. No experience needed.
          </p>

          <form className="lp-hero-form" onSubmit={handleCTA}>
            <input
              type="email"
              placeholder="Enter your email address"
              className="lp-hero-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email address"
            />
            <button type="submit" className="lp-hero-btn">
              Start Earning Free
            </button>
          </form>

          <p className="lp-hero-note">
            Free to join · No credit card required · Withdraw via GCash
          </p>

          <div className="lp-hero-stats">
            <div className="lp-stat">
              <strong>10,000+</strong>
              <span>Active Earners</span>
            </div>
            <div className="lp-stat-divider" />
            <div className="lp-stat">
              <strong>₱2M+</strong>
              <span>Paid Out</span>
            </div>
            <div className="lp-stat-divider" />
            <div className="lp-stat">
              <strong>4.8★</strong>
              <span>User Rating</span>
            </div>
          </div>
        </div>

        {/* Lightning bolt graphic */}
        <div className="lp-hero-visual" aria-hidden="true">
          <div className="lp-bolt-glow" />
          <svg className="lp-bolt-svg" viewBox="0 0 300 500" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="boltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#7fff00" />
                <stop offset="50%"  stopColor="#39d353" />
                <stop offset="100%" stopColor="#1a7a2a" />
              </linearGradient>
              <linearGradient id="boltGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#a8ff3e" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#2d9e44" stopOpacity="0.3" />
              </linearGradient>
              <filter id="boltBlur">
                <feGaussianBlur stdDeviation="8" />
              </filter>
            </defs>
            <polygon
              points="175,10 80,270 155,270 125,490 230,200 148,200 210,10"
              fill="url(#boltGrad2)"
              filter="url(#boltBlur)"
              transform="translate(5,5)"
            />
            <polygon
              points="175,10 80,270 155,270 125,490 230,200 148,200 210,10"
              fill="url(#boltGrad)"
            />
            <polygon
              points="175,10 140,140 165,140 155,270 180,175 160,175 190,10"
              fill="rgba(255,255,255,0.25)"
            />
          </svg>
          <div className="lp-bolt-reflection" />
        </div>
      </section>

      {/* ─── How It Works ───────────────────────────────────────────────── */}
      <section className="lp-section lp-steps-section" id="how-it-works" ref={stepsRef}>
        <div className="lp-section-inner">
          <div className="lp-section-header reveal">
            <h2 className="lp-section-title">How To Start Earning</h2>
            <p className="lp-section-subtitle">Three simple steps to your first payout</p>
          </div>

          <div className="lp-steps">
            <div className="lp-step reveal" style={{ transitionDelay: '0ms' }}>
              <div className="lp-step-num">01</div>
              <div className="lp-step-icon"><UserPlus size={28} /></div>
              <h3 className="lp-step-title">Create Free Account</h3>
              <p className="lp-step-desc">
                Sign up with your email in under 60 seconds. No fees, no credit card.
                Verified Filipino platform.
              </p>
            </div>

            <div className="lp-step-arrow" aria-hidden="true">→</div>

            <div className="lp-step reveal" style={{ transitionDelay: '120ms' }}>
              <div className="lp-step-num">02</div>
              <div className="lp-step-icon"><CheckCircle2 size={28} /></div>
              <h3 className="lp-step-title">Complete Tasks</h3>
              <p className="lp-step-desc">
                Watch videos, solve captchas, answer surveys, and click ads.
                New tasks available every day.
              </p>
            </div>

            <div className="lp-step-arrow" aria-hidden="true">→</div>

            <div className="lp-step reveal" style={{ transitionDelay: '240ms' }}>
              <div className="lp-step-num">03</div>
              <div className="lp-step-icon"><Wallet size={28} /></div>
              <h3 className="lp-step-title">Withdraw Earnings</h3>
              <p className="lp-step-desc">
                Cash out to GCash or PayPal once you reach ₱50.
                Processed within 24 hours.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Testimonials ───────────────────────────────────────────────── */}
      <section className="lp-section lp-testimonials-section" id="testimonials" ref={testimonialsRef}>
        <div className="lp-section-inner">
          <div className="lp-section-header reveal">
            <h2 className="lp-section-title">What Earners Are Saying</h2>
            <p className="lp-section-subtitle">
              Real reviews from our verified Filipino community members
            </p>
          </div>

          <div className="lp-testimonials-grid">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={t.name}
                className="lp-testimonial-card reveal"
                style={{ transitionDelay: `${(i % 3) * 80}ms` }}
              >
                <StarRating count={t.stars} />
                <p className="lp-testimonial-text">"{t.text}"</p>
                <div className="lp-testimonial-author">
                  <div
                    className="lp-testimonial-avatar"
                    style={{ background: t.color }}
                    aria-hidden="true"
                  >
                    {t.initials}
                  </div>
                  <div>
                    <p className="lp-testimonial-name">{t.name}</p>
                    <p className="lp-testimonial-location">{t.location}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Trust badge row */}
          <div className="lp-trust-row reveal">
            <div className="lp-trust-item">
              <CheckCircle2 size={18} className="lp-trust-icon" />
              <span>100% Legit Payouts</span>
            </div>
            <div className="lp-trust-item">
              <CheckCircle2 size={18} className="lp-trust-icon" />
              <span>No Hidden Fees</span>
            </div>
            <div className="lp-trust-item">
              <CheckCircle2 size={18} className="lp-trust-icon" />
              <span>24hr Processing</span>
            </div>
            <div className="lp-trust-item">
              <CheckCircle2 size={18} className="lp-trust-icon" />
              <span>GCash & PayPal</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Plans ──────────────────────────────────────────────────────── */}
      <section className="lp-section lp-plans-section" id="plans" ref={plansRef}>
        <div className="lp-section-inner">
          <div className="lp-section-header reveal">
            <h2 className="lp-section-title">Earning Plans</h2>
            <p className="lp-section-subtitle">
              Start free or upgrade to unlock higher daily limits
            </p>
          </div>

          <div className="lp-plans-grid">
            <div className="lp-plan-card reveal" style={{ transitionDelay: '0ms' }}>
              <div className="lp-plan-name">Free</div>
              <div className="lp-plan-price">
                <span className="lp-price-free">₱0</span>
                <span className="lp-price-period">/month</span>
              </div>
              <ul className="lp-plan-features">
                <li><span className="lp-check"><Check size={14} /></span> Basic tasks access</li>
                <li><span className="lp-check"><Check size={14} /></span> ₱20/day earning limit</li>
                <li><span className="lp-check"><Check size={14} /></span> GCash &amp; PayPal withdrawal</li>
                <li><span className="lp-check"><Check size={14} /></span> Referral bonuses</li>
              </ul>
              <Link to="/register" className="lp-plan-btn lp-plan-btn--outline">
                Get Started Free
              </Link>
            </div>

            <div className="lp-plan-card lp-plan-card--featured reveal" style={{ transitionDelay: '80ms' }}>
              <div className="lp-plan-badge">Most Popular</div>
              <div className="lp-plan-name">Premium</div>
              <div className="lp-plan-price">
                <span className="lp-price-currency">₱</span>
                <span className="lp-price-amount">249</span>
                <span className="lp-price-period">/month</span>
              </div>
              <ul className="lp-plan-features">
                <li><span className="lp-check"><Check size={14} /></span> All task types</li>
                <li><span className="lp-check"><Check size={14} /></span> ₱100/day earning limit</li>
                <li><span className="lp-check"><Check size={14} /></span> Exclusive premium tasks</li>
                <li><span className="lp-check"><Check size={14} /></span> No ads</li>
                <li><span className="lp-check"><Check size={14} /></span> Priority support</li>
              </ul>
              <Link to="/register" className="lp-plan-btn lp-plan-btn--primary">
                Upgrade to Premium
              </Link>
            </div>

            <div className="lp-plan-card reveal" style={{ transitionDelay: '160ms' }}>
              <div className="lp-plan-name">Elite</div>
              <div className="lp-plan-price">
                <span className="lp-price-currency">₱</span>
                <span className="lp-price-amount">499</span>
                <span className="lp-price-period">/month</span>
              </div>
              <ul className="lp-plan-features">
                <li><span className="lp-check"><Check size={14} /></span> All task types</li>
                <li><span className="lp-check lp-check--gold"><Check size={14} /></span> <strong>Unlimited</strong> daily earnings</li>
                <li><span className="lp-check"><Check size={14} /></span> Exclusive elite tasks</li>
                <li><span className="lp-check"><Check size={14} /></span> No ads</li>
                <li><span className="lp-check"><Check size={14} /></span> Early access to new tasks</li>
                <li><span className="lp-check"><Check size={14} /></span> VIP support</li>
              </ul>
              <Link to="/register" className="lp-plan-btn lp-plan-btn--outline">
                Go Elite
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Certifications ─────────────────────────────────────────────── */}
      <section className="lp-section lp-certs-section" id="certifications" ref={certsRef}>
        <div className="lp-section-inner">
          <div className="lp-section-header reveal">
            <h2 className="lp-section-title">Legally Registered &amp; Compliant</h2>
            <p className="lp-section-subtitle">
              Plivio is a duly registered and regulated online earning platform in the Philippines
            </p>
          </div>

          <div className="lp-certs-grid">
            {[
              { Icon: Building2, title: 'SEC Registered', sub: 'Securities and Exchange Commission', desc: 'Halvex Digital Inc. is duly registered under the Securities and Exchange Commission of the Philippines as a domestic corporation.', badge: 'Verified', color: 'green', delay: 0 },
              { Icon: Building,  title: 'DTI Registered', sub: 'Department of Trade and Industry', desc: 'Registered business name under the DTI\'s business name registration system as a legitimate e-commerce platform.', badge: 'Verified', color: 'green', delay: 60 },
              { Icon: Lock,      title: 'NPC Compliant',  sub: 'National Privacy Commission', desc: 'Fully compliant with Republic Act No. 10173 (Data Privacy Act of 2012). Your personal data is protected and secure.', badge: 'Compliant', color: 'blue', delay: 120 },
              { Icon: FileText,  title: 'BIR Registered', sub: 'Bureau of Internal Revenue', desc: 'Registered taxpaying entity compliant with BIR regulations. All user earnings are subject to applicable Philippine tax laws.', badge: 'Verified', color: 'green', delay: 0 },
              { Icon: CreditCard, title: 'BSP Guidelines', sub: 'Bangko Sentral ng Pilipinas', desc: 'Payout operations follow BSP e-money and digital payment guidelines. GCash and PayPal payouts processed under regulated channels.', badge: 'Compliant', color: 'blue', delay: 60 },
              { Icon: ShieldCheck, title: 'DICT Aligned',  sub: 'Dept. of Information & Communications Technology', desc: 'Platform developed in alignment with DICT\'s cybersecurity and digital economy frameworks under the e-Commerce Act (RA 8792).', badge: 'Aligned', color: 'purple', delay: 120 },
            ].map(({ Icon, title, sub, desc, badge, color, delay }) => (
              <div key={title} className="lp-cert-card reveal" style={{ transitionDelay: `${delay}ms` }}>
                <div className="lp-cert-icon"><Icon size={26} /></div>
                <div className="lp-cert-body">
                  <h4 className="lp-cert-title">{title}</h4>
                  <p className="lp-cert-sub">{sub}</p>
                  <p className="lp-cert-desc">{desc}</p>
                  <span className={`lp-cert-badge lp-cert-badge--${color}`}>{badge}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="lp-legal-notice reveal">
            <p>
              Plivio (operated by <strong>Halvex Digital Inc.</strong>) is a legitimate online earning platform.
              We are committed to transparency, data privacy, and consumer protection under Philippine law.
              Earnings from Plivio may be subject to income tax — please consult your local BIR RDO for guidance.
            </p>
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ─────────────────────────────────────────────────── */}
      <section className="lp-cta-banner">
        <div className="lp-cta-inner">
          <div className="lp-cta-bolt" aria-hidden="true"><Zap size={32} /></div>
          <h2 className="lp-cta-title">Ready to Start Earning?</h2>
          <p className="lp-cta-sub">
            Join thousands of Filipinos already earning with Plivio.
            Free to join, no hidden fees.
          </p>
          <Link to="/register" className="lp-cta-btn">
            Create Free Account →
          </Link>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <span className="lp-logo-bolt"><Zap size={18} /></span>
            <span className="lp-logo-text">Plivio</span>
            <p className="lp-footer-tagline">Get Paid To · Philippines</p>
          </div>

          <div className="lp-footer-links">
            <div className="lp-footer-col">
              <h5>Platform</h5>
              <a href="#how-it-works">How It Works</a>
              <a href="#testimonials">Reviews</a>
              <a href="#plans">Plans &amp; Pricing</a>
              <Link to="/register">Sign Up</Link>
              <Link to="/login">Login</Link>
            </div>
            <div className="lp-footer-col">
              <h5>Legal</h5>
              <a href="#certifications">Certifications</a>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms of Service</Link>
              <a href="#certifications">Cookie Policy</a>
            </div>
            <div className="lp-footer-col">
              <h5>Contact</h5>
              <a href="mailto:support@plivio.ph">support@plivio.ph</a>
              <a href="#" rel="noopener noreferrer">Facebook Page</a>
              <Link to="/contact">Help Center</Link>
            </div>
          </div>
        </div>

        <div className="lp-footer-bottom">
          <p>© {new Date().getFullYear()} Halvex Digital Inc. · Plivio · All rights reserved.</p>
          <p className="lp-footer-reg">
            SEC Registered · DTI Registered · NPC Compliant · Philippine e-Commerce Act (RA 8792)
          </p>
        </div>
      </footer>
    </div>
  );
}
