-- ============================================
-- PLIVIO SEED DATA
-- Halvex Digital Inc.
-- Run this ONCE after schema.sql
-- ============================================

-- ─── Tasks ────────────────────────────────────────────────────────────────────
-- Captcha tasks (Free+)
INSERT INTO tasks (title, type, reward_amount, min_plan) VALUES
  ('Solve Basic Captcha',        'captcha', 0.50, 'free'),
  ('Image Recognition Captcha',  'captcha', 0.75, 'free'),
  ('Text Verification Captcha',  'captcha', 0.50, 'free'),
  ('reCAPTCHA Challenge',        'captcha', 1.00, 'free');

-- Ad click tasks (Free+)
INSERT INTO tasks (title, type, reward_amount, min_plan) VALUES
  ('View Shopee Advertisement',       'ad_click', 0.25, 'free'),
  ('View Lazada Product Ad',          'ad_click', 0.25, 'free'),
  ('View GCash Promo Ad',             'ad_click', 0.50, 'free'),
  ('View Mobile Game Advertisement',  'ad_click', 0.25, 'free'),
  ('View Food Delivery App Ad',       'ad_click', 0.50, 'free'),
  ('View Bank Promo Advertisement',   'ad_click', 0.75, 'premium'),
  ('View Real Estate Ad',             'ad_click', 1.00, 'premium');

-- Video watch tasks (Free+)
INSERT INTO tasks (title, type, reward_amount, min_plan) VALUES
  ('Watch 30-second Product Video',   'video', 1.00, 'free'),
  ('Watch App Tutorial Video',        'video', 1.50, 'free'),
  ('Watch Brand Commercial (60s)',    'video', 2.00, 'free'),
  ('Watch Gaming Promo Video',        'video', 1.00, 'free'),
  ('Watch Telecom Promo Video',       'video', 1.50, 'premium'),
  ('Watch Finance App Explainer',     'video', 2.00, 'premium'),
  ('Watch Sponsored Documentary',     'video', 5.00, 'elite');

-- Survey tasks (Premium+)
INSERT INTO tasks (title, type, reward_amount, min_plan) VALUES
  ('Consumer Preference Survey',      'survey',  5.00, 'premium'),
  ('Mobile Shopping Habits Survey',   'survey',  8.00, 'premium'),
  ('Food & Lifestyle Survey',         'survey',  7.00, 'premium'),
  ('Financial Products Survey',       'survey', 10.00, 'premium'),
  ('Brand Awareness Survey',          'survey', 12.00, 'elite'),
  ('In-depth Market Research Survey', 'survey', 15.00, 'elite');

-- Referral tasks (Free+)
INSERT INTO tasks (title, type, reward_amount, min_plan) VALUES
  ('Refer a Friend to Plivio',        'referral', 10.00, 'free'),
  ('Refer a Premium Member',          'referral', 25.00, 'free');
