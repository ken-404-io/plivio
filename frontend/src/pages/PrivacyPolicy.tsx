import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  return (
    <div className="static-page">
      <div className="static-page-inner">
        <Link to="/" className="static-page-back">← Back to Home</Link>

        <h1 className="static-page-title">Privacy Policy</h1>
        <p className="static-page-meta">Last updated: January 1, 2025 · Halvex Digital Inc.</p>

        <section className="static-section">
          <h2>1. Information We Collect</h2>
          <p>We collect information you provide directly to us when you:</p>
          <ul>
            <li>Create an account (username, email address, password)</li>
            <li>Complete identity verification / KYC (government-issued ID, selfie)</li>
            <li>Request a withdrawal (payment account details)</li>
            <li>Contact our support team (message content, email)</li>
          </ul>
          <p>
            We also automatically collect certain technical information such as your IP address,
            browser type, device information, and usage data when you interact with the Platform.
          </p>
        </section>

        <section className="static-section">
          <h2>2. How We Use Your Information</h2>
          <ul>
            <li>To create and manage your account</li>
            <li>To process earnings, withdrawals, and subscription payments</li>
            <li>To verify your identity and prevent fraud</li>
            <li>To send transactional emails (verification, password reset, withdrawal status)</li>
            <li>To enforce our Terms of Service and prevent abuse</li>
            <li>To improve the Platform through aggregated analytics</li>
          </ul>
        </section>

        <section className="static-section">
          <h2>3. Information Sharing</h2>
          <p>
            We do not sell your personal information. We may share your data only with:
          </p>
          <ul>
            <li>
              <strong>Payment processors</strong> (e.g., PayMongo) to facilitate withdrawals
              and subscription payments
            </li>
            <li>
              <strong>Service providers</strong> who assist in operating the Platform under
              strict confidentiality agreements
            </li>
            <li>
              <strong>Law enforcement</strong> when required by law or to protect the rights
              and safety of our users
            </li>
          </ul>
        </section>

        <section className="static-section">
          <h2>4. Data Retention</h2>
          <p>
            We retain your personal data for as long as your account is active or as needed to
            provide services and comply with legal obligations. KYC documents are retained for a
            minimum of 5 years as required by anti-money laundering regulations. You may request
            deletion of your account by contacting us.
          </p>
        </section>

        <section className="static-section">
          <h2>5. Security</h2>
          <p>
            We implement industry-standard security measures including encryption at rest and in
            transit (HTTPS/TLS), hashed password storage (bcrypt), rate limiting, and access
            controls. Despite these measures, no system is completely secure and we cannot
            guarantee absolute security.
          </p>
        </section>

        <section className="static-section">
          <h2>6. Cookies</h2>
          <p>
            We use essential cookies to maintain your login session and protect against
            cross-site request forgery (CSRF). We do not use third-party tracking or advertising
            cookies. You can disable cookies in your browser, but this will prevent you from
            logging in.
          </p>
        </section>

        <section className="static-section">
          <h2>7. Your Rights</h2>
          <p>
            Depending on your jurisdiction, you may have the right to:
          </p>
          <ul>
            <li>Access a copy of the personal data we hold about you</li>
            <li>Correct inaccurate personal data</li>
            <li>Request deletion of your personal data</li>
            <li>Object to or restrict certain processing</li>
          </ul>
          <p>
            To exercise these rights, please contact us via our{' '}
            <Link to="/contact">contact page</Link>.
          </p>
        </section>

        <section className="static-section">
          <h2>8. Children's Privacy</h2>
          <p>
            The Platform is not directed at children under 18. We do not knowingly collect
            personal information from minors. If we become aware that a minor has created an
            account, we will terminate it and delete associated data.
          </p>
        </section>

        <section className="static-section">
          <h2>9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of significant
            changes via email or in-app notification. Your continued use of the Platform after
            changes take effect constitutes acceptance of the revised Policy.
          </p>
        </section>

        <section className="static-section">
          <h2>10. Contact Us</h2>
          <p>
            For privacy-related concerns, please reach out via our{' '}
            <Link to="/contact">contact page</Link> or email{' '}
            <a href="mailto:privacy@plivio.com">privacy@plivio.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
