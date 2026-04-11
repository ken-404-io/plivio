-- Migration 012: Expand chat_questions pool beyond 5,000 unique entries.
--
-- The user_question_answers table already has UNIQUE(user_id, question_id),
-- which means the quiz engine can never serve the same question to a given
-- user twice. To support that promise we also need a large enough pool;
-- this migration tops the pool up to well over 5,000 programmatically-
-- generated questions (mostly arithmetic) using generate_series.
--
-- All inserts are idempotent: running the migration twice does nothing.

-- Guard against duplicate question text so repeated runs are safe.
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_questions_question_unique
  ON chat_questions (question);

-- ── Addition: 1..75 plus 1..75 → 5,625 entries ────────────────────────────
INSERT INTO chat_questions (question, answer, category)
SELECT
  'What is ' || a || ' plus ' || b || '?',
  (a + b)::text,
  'math'
FROM generate_series(1, 75) AS a,
     generate_series(1, 75) AS b
ON CONFLICT (question) DO NOTHING;

-- ── Multiplication: 2..13 × 2..13 → 144 entries ───────────────────────────
INSERT INTO chat_questions (question, answer, category)
SELECT
  'What is ' || a || ' times ' || b || '?',
  (a * b)::text,
  'math'
FROM generate_series(2, 13) AS a,
     generate_series(2, 13) AS b
ON CONFLICT (question) DO NOTHING;

-- ── Subtraction: 20..70 minus 1..20 where a > b → up to 1,020 entries ─────
INSERT INTO chat_questions (question, answer, category)
SELECT
  'What is ' || a || ' minus ' || b || '?',
  (a - b)::text,
  'math'
FROM generate_series(20, 70) AS a,
     generate_series(1, 20)  AS b
WHERE a > b
ON CONFLICT (question) DO NOTHING;
