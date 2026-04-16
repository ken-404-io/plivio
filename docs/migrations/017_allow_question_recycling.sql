-- Migration 017: Allow quiz questions to recycle after a cooldown window
--
-- Before: user_question_answers had UNIQUE(user_id, question_id), so the
-- same question could only ever be answered once per user. Heavy users
-- (especially Elite, who have no daily cap) burned through the entire
-- chat_questions bank and then hit "No more questions available." with
-- no way back in.
--
-- After:  the UNIQUE constraint is dropped and questions can be answered
-- multiple times. The application layer (quizController.ts) enforces a
-- cooldown window — a question is re-eligible only if the user last
-- answered it more than QUESTION_RECYCLE_DAYS ago (7 days). This keeps
-- gameplay fresh without cutting off the earning loop.
--
-- A new composite index supports the recycle-window queries:
--   - getNextQuestion:    WHERE NOT EXISTS recent answer
--   - submitAnswer check: already answered within window?
-- Ordering answered_at DESC keeps the most recent row first for fast
-- lookups.

ALTER TABLE user_question_answers
  DROP CONSTRAINT IF EXISTS user_question_answers_user_id_question_id_key;

CREATE INDEX IF NOT EXISTS idx_uqa_user_question_answered
  ON user_question_answers (user_id, question_id, answered_at DESC);
