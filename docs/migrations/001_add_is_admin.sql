-- Migration 001: Add is_admin column to users table
-- Run this against existing databases that were created before this field was added to schema.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
