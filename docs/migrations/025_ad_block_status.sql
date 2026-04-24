-- Track whether a user has an ad blocker or filtering DNS active.
-- Updated by the client on every heartbeat once detection has run.
-- Values: 'blocked' (ad blocker detected), 'allowed' (none detected), NULL (not yet reported).
ALTER TABLE users ADD COLUMN IF NOT EXISTS ad_block_status VARCHAR(10) DEFAULT NULL;
