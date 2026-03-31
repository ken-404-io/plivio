import { useState, type FormEvent, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api.ts';
import { useToast } from '../components/common/Toast.tsx';

interface ContactForm {
  name:    string;
  email:   string;
  subject: string;
  message: string;
}

const EMPTY: ContactForm = { name: '', email: '', subject: '', message: '' };

export default function Contact() {
  const toast = useToast();

  const [form,    setForm]    = useState<ContactForm>(EMPTY);
  const [busy,    setBusy]    = useState(false);
  const [sent,    setSent]    = useState(false);

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (form.message.trim().length < 10) {
      toast.error('Message must be at least 10 characters.');
      return;
    }

    setBusy(true);
    try {
      await api.post('/contact', form);
      setSent(true);
      setForm(EMPTY);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Failed to send message. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="static-page">
      <div className="static-page-inner">
        <Link to="/" className="static-page-back">← Back to Home</Link>

        <h1 className="static-page-title">Contact Us</h1>
        <p className="static-page-meta">
          We typically respond within 24 hours on business days.
        </p>

        {sent ? (
          <div className="contact-success">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="11" stroke="var(--success)" strokeWidth="1.5" />
              <path d="M7 12l3.5 3.5L17 9" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2>Message sent!</h2>
            <p>Thanks for reaching out. We'll get back to you within 24 hours.</p>
            <button className="btn btn-primary" onClick={() => setSent(false)}>
              Send another message
            </button>
          </div>
        ) : (
          <form className="contact-form card" onSubmit={(e) => { void handleSubmit(e); }} noValidate>
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label" htmlFor="name">Your name</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  className="form-input"
                  value={form.name}
                  onChange={handleChange}
                  maxLength={100}
                  required
                  autoComplete="name"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="email">Email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="form-input"
                  value={form.email}
                  onChange={handleChange}
                  maxLength={254}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="subject">Subject</label>
              <input
                id="subject"
                name="subject"
                type="text"
                className="form-input"
                value={form.subject}
                onChange={handleChange}
                maxLength={200}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="message">
                Message
                <span className="form-hint">({form.message.length}/4000)</span>
              </label>
              <textarea
                id="message"
                name="message"
                className="form-input contact-textarea"
                value={form.message}
                onChange={handleChange}
                minLength={10}
                maxLength={4000}
                rows={7}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !form.name || !form.email || !form.subject || form.message.length < 10}
            >
              {busy ? 'Sending…' : 'Send message'}
            </button>
          </form>
        )}

        <div className="contact-alt">
          <p className="text-muted">
            You can also reach us at{' '}
            <a href="mailto:support@plivio.com">support@plivio.com</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
