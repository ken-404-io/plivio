import { Link } from 'react-router-dom';

export default function TermsOfService() {
  return (
    <div className="static-page">
      <div className="static-page-inner">
        <Link to="/" className="static-page-back">← Back to Home</Link>

        <h1 className="static-page-title">Terms of Service</h1>
        <p className="static-page-meta">Last updated: January 1, 2025 · Halvex Digital Inc.</p>

        <section className="static-section">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using Plivio ("the Platform"), you agree to be bound by these Terms of
            Service and all applicable laws and regulations. If you do not agree with any part of
            these terms, you may not use the Platform.
          </p>
        </section>

        <section className="static-section">
          <h2>2. Eligibility</h2>
          <p>
            You must be at least 18 years old to use Plivio. By using the Platform, you represent
            and warrant that you meet this age requirement and have the legal capacity to enter into
            a binding agreement.
          </p>
        </section>

        <section className="static-section">
          <h2>3. Account Responsibilities</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials.
            Each person may only maintain one account. Creating multiple accounts to circumvent
            earning limits or restrictions is strictly prohibited and will result in permanent
            suspension.
          </p>
        </section>

        <section className="static-section">
          <h2>4. Earning & Rewards</h2>
          <p>
            Earnings credited to your balance are subject to verification. Plivio reserves the
            right to withhold or reverse earnings that result from fraudulent activity, bot usage,
            VPN/proxy abuse, or any attempt to game the platform's reward system.
          </p>
          <p>
            Daily earning limits apply per plan tier. Limits reset at midnight UTC. Unused limits
            do not carry over to the next day.
          </p>
        </section>

        <section className="static-section">
          <h2>5. Withdrawals</h2>
          <p>
            Withdrawal requests are processed within 1–3 business days. A minimum balance of ₱50
            is required to initiate a withdrawal. Plivio may require identity verification (KYC)
            before processing withdrawals. We reserve the right to delay or refuse withdrawals
            suspected of fraud.
          </p>
        </section>

        <section className="static-section">
          <h2>6. Prohibited Conduct</h2>
          <ul>
            <li>Using bots, scripts, or automation to complete tasks</li>
            <li>Using VPNs, proxies, or anonymising services to manipulate rewards</li>
            <li>Creating fake accounts or using stolen identities</li>
            <li>Attempting to reverse-engineer or tamper with the Platform</li>
            <li>Engaging in any activity that violates applicable law</li>
          </ul>
        </section>

        <section className="static-section">
          <h2>7. Subscriptions</h2>
          <p>
            Premium and Elite plan subscriptions are billed as one-time payments for the stated
            duration. Subscriptions are non-refundable once activated. Plan benefits apply for the
            full subscription period and do not renew automatically unless you purchase again.
          </p>
        </section>

        <section className="static-section">
          <h2>8. Termination</h2>
          <p>
            Plivio reserves the right to suspend or terminate any account at any time, with or
            without notice, for violations of these Terms or for any activity we determine to be
            harmful to the Platform or its users. Upon termination, any pending balance may be
            forfeited.
          </p>
        </section>

        <section className="static-section">
          <h2>9. Limitation of Liability</h2>
          <p>
            The Platform is provided "as is" without warranties of any kind. Plivio shall not be
            liable for any indirect, incidental, or consequential damages arising from your use
            of the Platform, including loss of earnings or data.
          </p>
        </section>

        <section className="static-section">
          <h2>10. Changes to Terms</h2>
          <p>
            We may update these Terms at any time. Continued use of the Platform after changes
            are posted constitutes acceptance of the revised Terms. We will notify users of
            significant changes via email or in-app notification.
          </p>
        </section>

        <section className="static-section">
          <h2>11. Contact</h2>
          <p>
            For questions about these Terms, please contact us at{' '}
            <Link to="/contact">our contact page</Link> or email{' '}
            <a href="mailto:support@plivio.com">support@plivio.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
