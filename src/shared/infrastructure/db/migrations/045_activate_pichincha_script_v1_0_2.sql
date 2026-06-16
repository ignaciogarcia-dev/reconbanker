-- Activate Banco Pichincha extract_transactions v1.0.2 (programmatic SMS OTP).
-- v1.0.2 was seeded as 'review' in 042 pending confirmation of the OTP selectors
-- against a real Pichincha SMS prompt; this is the deliberate activation step.
-- Deprecates v1.0.1 (b3010000-...) and promotes v1.0.2 (b3020000-...).
-- Mirrors the v1.0.1 activation flow in 038. Code is loaded from disk by ScriptLoader:
--   scripts/bancopichincha/extract_transactions.v1.0.2.js

-- Deprecate the previous active version first to satisfy uq_bank_script_active
UPDATE bank_scripts
SET status = 'deprecated'
WHERE id = 'b3010000-0000-0000-0000-000000000001'
  AND status = 'active';

UPDATE bank_scripts
SET status = 'active'
WHERE id = 'b3020000-0000-0000-0000-000000000001'
  AND status = 'review';
