-- Migration 013: Remove all questions from the database
-- Clears user_question_answers first (FK dependency), then chat_questions.
-- RESTART IDENTITY resets the serial counters so new seeds start from 1.

TRUNCATE user_question_answers, chat_questions RESTART IDENTITY CASCADE;
