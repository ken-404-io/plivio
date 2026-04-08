-- Migration 010: Chat Quiz feature
-- Adds chat_questions and user_question_answers tables

CREATE TABLE IF NOT EXISTS chat_questions (
  id        SERIAL PRIMARY KEY,
  question  TEXT         NOT NULL,
  answer    TEXT         NOT NULL,
  category  VARCHAR(50)  NOT NULL DEFAULT 'general'
);

CREATE TABLE IF NOT EXISTS user_question_answers (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id    INT         NOT NULL REFERENCES chat_questions(id),
  user_answer    TEXT,
  is_correct     BOOLEAN     NOT NULL DEFAULT FALSE,
  reward_earned  NUMERIC(8,2) NOT NULL DEFAULT 0,
  answered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_uqa_user_id ON user_question_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_uqa_answered_at ON user_question_answers(answered_at);
