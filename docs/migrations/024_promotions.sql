-- 24-hour "500 bonus questions" promo for Free plan users.
--
-- Design: a promotion row defines the window and bonus-question grant.
-- Each answer submitted during an active promo is tagged with that
-- promo's id via user_question_answers.promo_id. Free plan's lifetime
-- question counter excludes promo-tagged rows, so when the promo ends
-- users' baseline state is automatically restored. Earning caps are
-- lifted for Free while a promo is active.

CREATE TABLE IF NOT EXISTS promotions (
  id                SERIAL PRIMARY KEY,
  key               TEXT        NOT NULL UNIQUE,
  description       TEXT,
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ NOT NULL,
  bonus_questions   INTEGER     NOT NULL DEFAULT 0,
  lift_free_earn_cap BOOLEAN    NOT NULL DEFAULT FALSE,
  applies_to_plan   TEXT        NOT NULL DEFAULT 'free',
  launched_at       TIMESTAMPTZ,  -- stamped once start-side effects (email + notifications) fire
  ended_at          TIMESTAMPTZ,  -- stamped once the end transition is processed
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_window ON promotions (starts_at, ends_at);

ALTER TABLE user_question_answers
  ADD COLUMN IF NOT EXISTS promo_id INTEGER REFERENCES promotions(id);

CREATE INDEX IF NOT EXISTS idx_uqa_promo ON user_question_answers (user_id, promo_id);

-- Seed the launch promo: 500 bonus questions for Free users,
-- 2026-04-20 00:00 to 2026-04-21 00:00 Asia/Manila (UTC+8).
INSERT INTO promotions (key, description, starts_at, ends_at, bonus_questions, lift_free_earn_cap, applies_to_plan)
VALUES (
  'free_500_launch_2026_04_20',
  '500 free bonus questions for Free plan users, 24-hour window',
  '2026-04-20 00:00:00+08',
  '2026-04-21 00:00:00+08',
  500,
  TRUE,
  'free'
)
ON CONFLICT (key) DO NOTHING;
