import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { useAuth } from '../store/authStore.tsx';
import {
  Sun, Moon, Menu, X,
  CheckCircle2, Wallet,
  Check, Star,
  Smartphone, Flame, Users, RefreshCw, ShieldCheck,
} from 'lucide-react';
import './LandingPage.css';

// ─── Static data ───────────────────────────────────────────────────────────────

const CERTS = [
  {
    logo:  'https://upload.wikimedia.org/wikipedia/commons/4/4e/Securities_and_Exchange_Commission_of_the_Philippines_(SEC).svg',
    title: 'SEC Registered',
    sub:   'Securities and Exchange Commission',
    desc:  'Halvex Digital Inc. is duly registered under the Securities and Exchange Commission of the Philippines as a domestic corporation.',
    badge: 'Verified',
    color: 'green',
    delay: 0,
  },
  {
    logo:  'https://upload.wikimedia.org/wikipedia/commons/f/f2/DTI_PH_new_logo.svg',
    title: 'DTI Registered',
    sub:   'Department of Trade and Industry',
    desc:  "Registered business name under the DTI's business name registration system as a legitimate e-commerce platform.",
    badge: 'Verified',
    color: 'green',
    delay: 60,
  },
  {
    logo:  'https://upload.wikimedia.org/wikipedia/commons/f/f5/National_Privacy_Commission_Philippines.svg',
    title: 'NPC Compliant',
    sub:   'National Privacy Commission',
    desc:  'Fully compliant with Republic Act No. 10173 (Data Privacy Act of 2012). Your personal data is protected and secure.',
    badge: 'Compliant',
    color: 'blue',
    delay: 120,
  },
  {
    logo:  'https://upload.wikimedia.org/wikipedia/commons/5/54/Bureau_of_Internal_Revenue_(BIR).svg',
    title: 'BIR Registered',
    sub:   'Bureau of Internal Revenue',
    desc:  'Registered taxpaying entity compliant with BIR regulations. All user earnings are subject to applicable Philippine tax laws.',
    badge: 'Verified',
    color: 'green',
    delay: 0,
  },
  {
    logo:  'https://upload.wikimedia.org/wikipedia/commons/2/2c/Bangko_Sentral_ng_Pilipinas_2020_logo.svg',
    title: 'BSP Guidelines',
    sub:   'Bangko Sentral ng Pilipinas',
    desc:  'Payout operations follow BSP e-money and digital payment guidelines. GCash and PayPal payouts processed under regulated channels.',
    badge: 'Compliant',
    color: 'blue',
    delay: 60,
  },
  {
    logo:  'https://upload.wikimedia.org/wikipedia/commons/7/7e/Department_of_Information_and_Communications_Technology_(DICT).svg',
    title: 'DICT Aligned',
    sub:   'Dept. of Information & Communications Technology',
    desc:  "Platform developed in alignment with DICT's cybersecurity and digital economy frameworks under the e-Commerce Act (RA 8792).",
    badge: 'Aligned',
    color: 'purple',
    delay: 120,
  },
] as const;

const FEATURES = [
  {
    icon:  Smartphone,
    title: 'Mobile-First Experience',
    desc:  'Designed for Filipinos on the go. Answer quizzes from any phone, anywhere in the country.',
    delay: 0,
  },
  {
    icon:  Wallet,
    title: 'Fast GCash Payouts',
    desc:  'Cash out to GCash or PayPal within 24 hours. Low ₱50 minimum withdrawal.',
    delay: 60,
  },
  {
    icon:  Flame,
    title: 'Daily Streak Bonuses',
    desc:  'Log in every day to build your streak and unlock higher earning multipliers.',
    delay: 120,
  },
  {
    icon:  Users,
    title: 'Refer & Earn',
    desc:  'Earn ₱50 for every friend you invite. No cap on referrals — ever.',
    delay: 0,
  },
  {
    icon:  RefreshCw,
    title: 'New Quizzes Daily',
    desc:  'Fresh quiz categories added every day across finance, tech, culture, science, and more.',
    delay: 60,
  },
  {
    icon:  ShieldCheck,
    title: 'SEC & DTI Registered',
    desc:  'Fully registered and compliant. Your earnings and personal data are protected.',
    delay: 120,
  },
] as const;

const TESTIMONIALS = [
  {
    name:     'Maria Santos',
    location: 'Quezon City',
    initials: 'MS',
    color:    '#1877f2',
    stars:    5,
    text:     'I\'ve been answering quizzes on Plivio for 3 months and already earned over ₱4,000. Verified payouts — my GCash balance grows within 24 hours every time.',
  },
  {
    name:     'Renz Dela Cruz',
    location: 'Davao City',
    initials: 'RD',
    color:    '#3b82f6',
    stars:    5,
    text:     'As a student, this is ideal for consistent income. I answer a few quizzes between classes and the streak system keeps me motivated every day.',
  },
  {
    name:     'Anna Reyes',
    location: 'Cebu City',
    initials: 'AR',
    color:    '#22c55e',
    stars:    5,
    text:     'I was cautious at first, but the SEC registration gave me confidence. I upgraded to Premium and now earn up to ₱100 a day from quizzes I genuinely enjoy.',
  },
  {
    name:     'Jerome Bautista',
    location: 'Batangas',
    initials: 'JB',
    color:    '#f97316',
    stars:    4,
    text:     'Straightforward platform. The quizzes are well-written and the referral bonus is generous — I invited three friends and we all grow our GCash balances together.',
  },
  {
    name:     'Liza Fernandez',
    location: 'Pampanga',
    initials: 'LF',
    color:    '#14b8a6',
    stars:    5,
    text:     'Nasubok ko na ang maraming earning sites, pero si Plivio talaga ang pinaka-legit. Mabilis ang payout at maganda ang quality ng quizzes.',
  },
  {
    name:     'Carlo Mendoza',
    location: 'Manila',
    initials: 'CM',
    color:    '#eab308',
    stars:    5,
    text:     'The coin streak feature turned quiz-answering into part of my daily routine. Already withdrew ₱2,500 to my GCash this month — consistent income from knowledge I already have.',
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
  const { user, loading } = useAuth();
  const [theme, toggleTheme] = useTheme();
  const [email, setEmail]   = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  // Already logged in — send straight to the app
  if (!loading && user) return <Navigate to="/dashboard" replace />;

  // Scroll-reveal refs — each section gets its own observer
  const featuresRef     = useScrollReveal();
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
            <img src="/logo-mark.svg" alt="" className="lp-logo-mark" aria-hidden="true" />
            <span className="lp-logo-text">Plivio</span>
          </a>

          <nav className={`lp-nav-links${menuOpen ? ' lp-nav-links--open' : ''}`}>
            <a href="#features"        onClick={() => setMenuOpen(false)}>Features</a>
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
            Earn Legitimate Income<br />
            <span className="lp-hero-highlight">Online in PH</span>
          </h1>

          <p className="lp-hero-subtitle">
            Answer quick quizzes on topics you already know and receive verified
            payouts directly to your GCash or PayPal. No experience required —
            just your knowledge.
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
              Start Earning Today
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

        {/* Earnings card mockup */}
        <div className="lp-hero-visual" aria-hidden="true">
          <div className="lp-earnings-card">
            <div className="lp-ec-header">
              <div className="lp-ec-avatar">₱</div>
              <div>
                <p className="lp-ec-label">Today's Earnings</p>
                <p className="lp-ec-value">₱84.50</p>
              </div>
            </div>
            <div className="lp-ec-progress">
              <div className="lp-ec-progress-bar" style={{ width: '84%' }} />
            </div>
            <p className="lp-ec-progress-label">84% of daily limit reached</p>
            <div className="lp-ec-tasks">
              <div className="lp-ec-task lp-ec-task--done">
                <CheckCircle2 size={14} />
                <span>General Knowledge</span>
                <span className="lp-ec-earn">+₱2.50</span>
              </div>
              <div className="lp-ec-task lp-ec-task--done">
                <CheckCircle2 size={14} />
                <span>Finance Basics</span>
                <span className="lp-ec-earn">+₱15.00</span>
              </div>
              <div className="lp-ec-task lp-ec-task--active">
                <span className="lp-ec-dot" />
                <span>Daily Challenge</span>
                <span className="lp-ec-earn lp-ec-earn--live">Live</span>
              </div>
            </div>
            <div className="lp-ec-footer">
              <div className="lp-ec-withdraw">
                <Wallet size={13} />
                <span>GCash Ready</span>
              </div>
              <span className="lp-ec-streak">🔥 7-day streak</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features ───────────────────────────────────────────────────── */}
      <section className="lp-section lp-features-section" id="features" ref={featuresRef}>
        <div className="lp-section-inner">
          <div className="lp-section-header reveal">
            <h2 className="lp-section-title">Why Filipinos Choose Plivio</h2>
            <p className="lp-section-subtitle">Everything you need to earn legitimate income online — in one trusted platform</p>
          </div>

          <div className="lp-features-grid">
            {FEATURES.map(({ icon: Icon, title, desc, delay }) => (
              <div key={title} className="lp-feature-card reveal" style={{ transitionDelay: `${delay}ms` }}>
                <div className="lp-feature-icon"><Icon size={22} /></div>
                <h3 className="lp-feature-title">{title}</h3>
                <p className="lp-feature-desc">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials ───────────────────────────────────────────────── */}
      <section className="lp-section lp-testimonials-section" id="testimonials" ref={testimonialsRef}>
        <div className="lp-section-inner">
          <div className="lp-section-header reveal">
            <h2 className="lp-section-title">What Our Earners Are Saying</h2>
            <p className="lp-section-subtitle">
              Honest reviews from verified members of our Filipino community
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
              <span>Verified Payouts</span>
            </div>
            <div className="lp-trust-item">
              <CheckCircle2 size={18} className="lp-trust-icon" />
              <span>No Hidden Fees</span>
            </div>
            <div className="lp-trust-item">
              <CheckCircle2 size={18} className="lp-trust-icon" />
              <span>24-Hour Processing</span>
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
            <h2 className="lp-section-title">Membership Plans</h2>
            <p className="lp-section-subtitle">
              Start free or upgrade to unlock higher daily earning limits
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
                <li><span className="lp-check"><Check size={14} /></span> Access to daily quizzes</li>
                <li><span className="lp-check"><Check size={14} /></span> ₱60/day earning limit</li>
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
                <li><span className="lp-check"><Check size={14} /></span> All quiz categories</li>
                <li><span className="lp-check"><Check size={14} /></span> ₱100/day earning limit</li>
                <li><span className="lp-check"><Check size={14} /></span> Exclusive premium quizzes</li>
                <li><span className="lp-check"><Check size={14} /></span> Distraction-free experience</li>
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
                <li><span className="lp-check"><Check size={14} /></span> All quiz categories</li>
                <li><span className="lp-check lp-check--gold"><Check size={14} /></span> <strong>Unlimited</strong> daily earnings</li>
                <li><span className="lp-check"><Check size={14} /></span> Exclusive elite quizzes</li>
                <li><span className="lp-check"><Check size={14} /></span> Distraction-free experience</li>
                <li><span className="lp-check"><Check size={14} /></span> Early access to new quizzes</li>
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
            {CERTS.map(({ logo, title, sub, desc, badge, color, delay }) => (
              <div key={title} className="lp-cert-card reveal" style={{ transitionDelay: `${delay}ms` }}>
                <div className="lp-cert-icon">
                  <img src={logo} alt={title} className="lp-cert-logo" />
                </div>
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
              Plivio (operated by <strong>Halvex Digital Inc.</strong>) is a legitimate online earning platform
              committed to transparency, data privacy, and consumer protection under Philippine law.
              Your actual earnings from Plivio may be subject to income tax — please consult your local BIR RDO
              for personalized tax guidance.
            </p>
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ─────────────────────────────────────────────────── */}
      <section className="lp-cta-banner">
        <div className="lp-cta-inner">
          <h2 className="lp-cta-title">Ready to Grow Your GCash Balance?</h2>
          <p className="lp-cta-sub">
            Join thousands of Filipinos already earning consistent income with Plivio.
            Free to join — no hidden fees, no obligations.
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
            <img src="/logo-mark.svg" alt="" className="lp-logo-mark" aria-hidden="true" />
            <span className="lp-logo-text">Plivio</span>
            <p className="lp-footer-tagline">Quiz-Based Earning · Philippines</p>
          </div>

          <div className="lp-footer-links">
            <div className="lp-footer-col">
              <h5>Platform</h5>
              <a href="#features">Features</a>
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
