-- Per-user/per-account script ownership. NULL user_id/account_id = official
-- system script (unchanged behavior for all existing rows). A non-null
-- user_id scopes a script to that user across all their accounts; a
-- non-null account_id further narrows it to one specific account.
ALTER TABLE bank_scripts ADD COLUMN IF NOT EXISTS user_id UUID NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE bank_scripts ADD COLUMN IF NOT EXISTS account_id UUID NULL REFERENCES accounts(id) ON DELETE CASCADE;

-- Replace the single active-script index (025) with three scope-specific ones,
-- so a system script, a user-wide override, and an account-specific override
-- can each be active for the same (bank, flow_type) at the same time.
DROP INDEX IF EXISTS uq_bank_script_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_script_active_system
  ON bank_scripts (bank, flow_type)
  WHERE status = 'active' AND user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_script_active_user
  ON bank_scripts (bank, flow_type, user_id)
  WHERE status = 'active' AND user_id IS NOT NULL AND account_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_script_active_account
  ON bank_scripts (bank, flow_type, account_id)
  WHERE status = 'active' AND account_id IS NOT NULL;
