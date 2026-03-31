-- Migration 006: Seed recommended tasks for Plivio GPT platform
-- Run ONCE after all previous migrations.
-- These are the default tasks shown to all users.

-- ─── Captcha tasks ────────────────────────────────────────────────────────────

INSERT INTO tasks (title, type, reward_amount, min_plan, is_active, verification_config)
VALUES (
  'Daily Check-in Captcha',
  'captcha',
  0.10,
  'free',
  TRUE,
  '{"type":"captcha","auto":true}'
)
ON CONFLICT DO NOTHING;

-- ─── Video Ad tasks ────────────────────────────────────────────────────────────

INSERT INTO tasks (title, type, reward_amount, min_plan, is_active, verification_config)
VALUES (
  'Watch a Short Video Ad',
  'video',
  0.50,
  'free',
  TRUE,
  '{"type":"video","duration_seconds":30,"networks":[]}'
)
ON CONFLICT DO NOTHING;

INSERT INTO tasks (title, type, reward_amount, min_plan, is_active, verification_config)
VALUES (
  'Watch Premium Video Ad',
  'video',
  1.50,
  'premium',
  TRUE,
  '{"type":"video","duration_seconds":60,"networks":[]}'
)
ON CONFLICT DO NOTHING;

INSERT INTO tasks (title, type, reward_amount, min_plan, is_active, verification_config)
VALUES (
  'Elite Video Campaign',
  'video',
  3.00,
  'elite',
  TRUE,
  '{"type":"video","duration_seconds":60,"networks":[]}'
)
ON CONFLICT DO NOTHING;

-- ─── Ad Click tasks ────────────────────────────────────────────────────────────

INSERT INTO tasks (title, type, reward_amount, min_plan, is_active, verification_config)
VALUES (
  'Click & View Banner Ad',
  'ad_click',
  0.25,
  'free',
  TRUE,
  '{"type":"ad_click","duration_seconds":15,"networks":[]}'
)
ON CONFLICT DO NOTHING;

INSERT INTO tasks (title, type, reward_amount, min_plan, is_active, verification_config)
VALUES (
  'Premium Ad Click Pack',
  'ad_click',
  0.50,
  'premium',
  TRUE,
  '{"type":"ad_click","duration_seconds":20,"networks":[]}'
)
ON CONFLICT DO NOTHING;

-- ─── Survey tasks ─────────────────────────────────────────────────────────────

INSERT INTO tasks (title, type, reward_amount, min_plan, is_active, verification_config)
VALUES (
  'Quick Opinion Survey',
  'survey',
  2.00,
  'free',
  TRUE,
  '{
    "type": "survey",
    "questions": [
      {"id":"q1","text":"What product or service have you purchased online in the past month?","min_length":20},
      {"id":"q2","text":"How satisfied are you with online shopping in the Philippines? Why?","min_length":20},
      {"id":"q3","text":"What would make you spend more time on apps like Plivio?","min_length":20}
    ]
  }'
)
ON CONFLICT DO NOTHING;

INSERT INTO tasks (title, type, reward_amount, min_plan, is_active, verification_config)
VALUES (
  'Detailed Product Survey',
  'survey',
  5.00,
  'premium',
  TRUE,
  '{
    "type": "survey",
    "questions": [
      {"id":"q1","text":"Describe a product or app you use daily and why you love it.","min_length":30},
      {"id":"q2","text":"What features would you want in a perfect earning app?","min_length":30},
      {"id":"q3","text":"How do you usually discover new apps or online services?","min_length":25},
      {"id":"q4","text":"What is your biggest challenge when earning money online?","min_length":25},
      {"id":"q5","text":"Would you recommend Plivio to friends? Give your honest feedback.","min_length":30}
    ]
  }'
)
ON CONFLICT DO NOTHING;

INSERT INTO tasks (title, type, reward_amount, min_plan, is_active, verification_config)
VALUES (
  'Elite Market Research Survey',
  'survey',
  10.00,
  'elite',
  TRUE,
  '{
    "type": "survey",
    "questions": [
      {"id":"q1","text":"What brands or companies do you trust most in the Philippines and why?","min_length":40},
      {"id":"q2","text":"Describe your ideal online shopping experience from start to finish.","min_length":40},
      {"id":"q3","text":"How has digital technology changed your daily life in the past 3 years?","min_length":40},
      {"id":"q4","text":"What type of online content do you consume the most and why?","min_length":30},
      {"id":"q5","text":"If you could improve one thing about the Philippine internet economy, what would it be?","min_length":40}
    ]
  }'
)
ON CONFLICT DO NOTHING;

-- ─── Referral task ────────────────────────────────────────────────────────────

INSERT INTO tasks (title, type, reward_amount, min_plan, is_active, verification_config)
VALUES (
  'Refer a Friend',
  'referral',
  10.00,
  'free',
  TRUE,
  '{"type":"referral","auto":true}'
)
ON CONFLICT DO NOTHING;
