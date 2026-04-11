-- Migration 012: Expand chat_questions pool beyond 5,000 unique entries.
--
-- The user_question_answers table already has UNIQUE(user_id, question_id),
-- which means the quiz engine can never serve the same question to a given
-- user twice. To support that promise we also need a large enough pool;
-- this migration tops the pool up to well over 5,000 programmatically-
-- generated questions (mostly arithmetic) using generate_series.
--
-- All inserts are idempotent: running the migration twice does nothing.

-- ─── Step 0: Deduplicate any existing duplicate question texts ────────────
-- The previous seed (011_chat_questions_seed.sql) allowed duplicate question
-- strings to slip in, so we can't blindly add a UNIQUE index. This block
-- collapses any duplicate rows down to a single canonical row per question,
-- carefully preserving user_question_answers by (1) deleting any answer
-- rows that would violate UNIQUE(user_id, question_id) after the repoint,
-- (2) repointing the remaining answers to the canonical row, and
-- (3) deleting the now-orphaned duplicate chat_questions rows.

-- (1) Drop user answers that would collide with the canonical row's answers.
DELETE FROM user_question_answers
WHERE id IN (
  SELECT u.id
  FROM user_question_answers u
  JOIN chat_questions q ON q.id = u.question_id
  JOIN (
    SELECT question, MIN(id) AS keep_id
    FROM chat_questions
    GROUP BY question
    HAVING COUNT(*) > 1
  ) dup ON dup.question = q.question
  WHERE u.question_id <> dup.keep_id
    AND EXISTS (
      SELECT 1 FROM user_question_answers u2
      WHERE u2.user_id = u.user_id AND u2.question_id = dup.keep_id
    )
);

-- (2) Repoint the remaining user answers onto the canonical (lowest-id) row.
UPDATE user_question_answers u
SET question_id = dup.keep_id
FROM chat_questions q,
     (SELECT question, MIN(id) AS keep_id
      FROM chat_questions
      GROUP BY question
      HAVING COUNT(*) > 1) dup
WHERE u.question_id = q.id
  AND q.question = dup.question
  AND q.id <> dup.keep_id;

-- (3) Delete the duplicate chat_questions rows, keeping only the canonical row.
DELETE FROM chat_questions
WHERE id IN (
  SELECT cq.id
  FROM chat_questions cq
  JOIN (
    SELECT question, MIN(id) AS keep_id
    FROM chat_questions
    GROUP BY question
    HAVING COUNT(*) > 1
  ) dup ON dup.question = cq.question
  WHERE cq.id <> dup.keep_id
);

-- ─── Step 1: Enforce uniqueness on question text (now safe) ───────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_questions_question_unique
  ON chat_questions (question);

-- ─── Step 2: Bulk seed additional unique questions ────────────────────────

-- Addition: 1..75 plus 1..75 → 5,625 entries
INSERT INTO chat_questions (question, answer, category)
SELECT
  'What is ' || a || ' plus ' || b || '?',
  (a + b)::text,
  'math'
FROM generate_series(1, 75) AS a,
     generate_series(1, 75) AS b
ON CONFLICT (question) DO NOTHING;

-- Multiplication: 2..13 × 2..13 → 144 entries
INSERT INTO chat_questions (question, answer, category)
SELECT
  'What is ' || a || ' times ' || b || '?',
  (a * b)::text,
  'math'
FROM generate_series(2, 13) AS a,
     generate_series(2, 13) AS b
ON CONFLICT (question) DO NOTHING;

-- Subtraction: 20..70 minus 1..20 where a > b → up to 1,020 entries
INSERT INTO chat_questions (question, answer, category)
SELECT
  'What is ' || a || ' minus ' || b || '?',
  (a - b)::text,
  'math'
FROM generate_series(20, 70) AS a,
     generate_series(1, 20)  AS b
WHERE a > b
ON CONFLICT (question) DO NOTHING;
