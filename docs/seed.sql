-- ============================================================
-- PLIVIO SEED DATA
-- Halvex Digital Inc.
-- Run ONCE after schema.sql + all migrations
-- ============================================================

-- ─── Captcha tasks (Free+) ────────────────────────────────────────────────────

INSERT INTO tasks (title, type, reward_amount, min_plan, verification_config) VALUES
  ('Solve Basic Captcha',
   'captcha', 0.50, 'free',
   '{"type":"captcha","duration_seconds":60}'),

  ('Image Recognition Captcha',
   'captcha', 0.75, 'free',
   '{"type":"captcha","duration_seconds":60}'),

  ('Text Verification Captcha',
   'captcha', 0.50, 'free',
   '{"type":"captcha","duration_seconds":60}'),

  ('reCAPTCHA Challenge',
   'captcha', 1.00, 'free',
   '{"type":"captcha","duration_seconds":90}');

-- ─── Ad click tasks ───────────────────────────────────────────────────────────

INSERT INTO tasks (title, type, reward_amount, min_plan, verification_config) VALUES
  ('View Shopee Advertisement',
   'ad_click', 0.25, 'free',
   '{"type":"ad_click","duration_seconds":10}'),

  ('View Lazada Product Ad',
   'ad_click', 0.25, 'free',
   '{"type":"ad_click","duration_seconds":10}'),

  ('View GCash Promo Ad',
   'ad_click', 0.50, 'free',
   '{"type":"ad_click","duration_seconds":15}'),

  ('View Mobile Game Advertisement',
   'ad_click', 0.25, 'free',
   '{"type":"ad_click","duration_seconds":10}'),

  ('View Food Delivery App Ad',
   'ad_click', 0.50, 'free',
   '{"type":"ad_click","duration_seconds":15}'),

  ('View Bank Promo Advertisement',
   'ad_click', 0.75, 'premium',
   '{"type":"ad_click","duration_seconds":20}'),

  ('View Real Estate Ad',
   'ad_click', 1.00, 'premium',
   '{"type":"ad_click","duration_seconds":20}');

-- ─── Video watch tasks ────────────────────────────────────────────────────────

INSERT INTO tasks (title, type, reward_amount, min_plan, verification_config) VALUES
  ('Watch 30-second Product Video',
   'video', 1.00, 'free',
   '{"type":"video","duration_seconds":30}'),

  ('Watch App Tutorial Video',
   'video', 1.50, 'free',
   '{"type":"video","duration_seconds":45}'),

  ('Watch Brand Commercial (60s)',
   'video', 2.00, 'free',
   '{"type":"video","duration_seconds":60}'),

  ('Watch Gaming Promo Video',
   'video', 1.00, 'free',
   '{"type":"video","duration_seconds":30}'),

  ('Watch Telecom Promo Video',
   'video', 1.50, 'premium',
   '{"type":"video","duration_seconds":60}'),

  ('Watch Finance App Explainer',
   'video', 2.00, 'premium',
   '{"type":"video","duration_seconds":90}'),

  ('Watch Sponsored Documentary',
   'video', 5.00, 'elite',
   '{"type":"video","duration_seconds":120}');

-- ─── Survey tasks (Premium+) ──────────────────────────────────────────────────

INSERT INTO tasks (title, type, reward_amount, min_plan, verification_config) VALUES
  ('Consumer Preference Survey',
   'survey', 5.00, 'premium',
   '{"type":"survey","questions":[
     {"id":"q1","text":"Which brands do you regularly purchase from and why?","min_length":30},
     {"id":"q2","text":"How do you typically discover new products?","min_length":30},
     {"id":"q3","text":"What factors most influence your purchasing decisions?","min_length":30}
   ]}'),

  ('Mobile Shopping Habits Survey',
   'survey', 8.00, 'premium',
   '{"type":"survey","questions":[
     {"id":"q1","text":"How often do you shop online using your mobile phone?","min_length":20},
     {"id":"q2","text":"Which shopping platforms do you use most and why?","min_length":30},
     {"id":"q3","text":"What improvements would you like to see in mobile shopping apps?","min_length":30}
   ]}'),

  ('Food & Lifestyle Survey',
   'survey', 7.00, 'premium',
   '{"type":"survey","questions":[
     {"id":"q1","text":"Describe your typical weekly meal routine.","min_length":30},
     {"id":"q2","text":"How often do you order food delivery? Which apps do you use?","min_length":20},
     {"id":"q3","text":"What health or lifestyle goals are you currently working towards?","min_length":30}
   ]}'),

  ('Financial Products Survey',
   'survey', 10.00, 'premium',
   '{"type":"survey","questions":[
     {"id":"q1","text":"Which digital banking or e-wallet apps do you currently use?","min_length":20},
     {"id":"q2","text":"How do you manage your monthly budget and savings?","min_length":30},
     {"id":"q3","text":"What financial products or services would you be interested in?","min_length":30},
     {"id":"q4","text":"What are your main concerns when using online financial services?","min_length":30}
   ]}'),

  ('Brand Awareness Survey',
   'survey', 12.00, 'elite',
   '{"type":"survey","questions":[
     {"id":"q1","text":"Name 3 local Filipino brands you trust and explain why.","min_length":40},
     {"id":"q2","text":"How does social media influence your opinion of brands?","min_length":30},
     {"id":"q3","text":"Describe your ideal brand values and what makes a company trustworthy.","min_length":40},
     {"id":"q4","text":"What marketing campaigns have recently caught your attention and why?","min_length":40}
   ]}'),

  ('In-depth Market Research Survey',
   'survey', 15.00, 'elite',
   '{"type":"survey","questions":[
     {"id":"q1","text":"Describe your current lifestyle and how your spending habits reflect it.","min_length":50},
     {"id":"q2","text":"How has your consumer behavior changed in the past two years?","min_length":40},
     {"id":"q3","text":"What industries or sectors do you think are growing in the Philippines?","min_length":40},
     {"id":"q4","text":"How do you research and evaluate products before making a purchase?","min_length":40},
     {"id":"q5","text":"What role does brand reputation play in your buying decisions?","min_length":40}
   ]}');

-- ─── Referral tasks (Free+) ───────────────────────────────────────────────────
-- Rewards are issued automatically on registration; these entries exist for
-- display and earnings tracking only.

INSERT INTO tasks (title, type, reward_amount, min_plan, verification_config) VALUES
  ('Refer a Friend to Plivio',
   'referral', 10.00, 'free',
   '{"type":"referral","auto":true}'),

  ('Refer a Premium Member',
   'referral', 25.00, 'free',
   '{"type":"referral","auto":true}');
