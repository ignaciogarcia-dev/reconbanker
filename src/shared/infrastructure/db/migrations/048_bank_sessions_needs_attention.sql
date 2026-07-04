-- Adds a 'needs_attention' state to bank_sessions.status.
--
-- Assisted persistent sessions (login_mode='assisted', session_type='persistent')
-- no longer auto-relaunch on a failed/lost login. Instead they park in
-- 'needs_attention' (reason stored in the existing stop_reason column) until an
-- operator reactivates them manually. Expand-only / forward-only: drop and re-add
-- the CHECK so older app versions still serving during the deploy keep working with
-- the existing 'running'/'stopped' values.
ALTER TABLE bank_sessions DROP CONSTRAINT IF EXISTS bank_sessions_status_check;
ALTER TABLE bank_sessions ADD CONSTRAINT bank_sessions_status_check
  CHECK (status IN ('running', 'stopped', 'needs_attention'));
