-- Register Banco Pichincha extract_transactions v1.0.2 (programmatic SMS OTP).
-- Seeded as 'review' (NOT active): the OTP field selectors still need confirming
-- against a real Pichincha SMS prompt. Activation is a separate, deliberate step
-- (deprecate v1.0.1, set this to 'active') mirroring the v1.0.1 activation flow.
-- Code is loaded from disk by ScriptLoader:
--   scripts/bancopichincha/extract_transactions.v1.0.2.js

INSERT INTO bank_scripts (id, bank, flow_type, version, status, origin, selector_map, bank_id, base_script_id)
SELECT
  'b3020000-0000-0000-0000-000000000001',
  'bancopichincha',
  'extract_transactions',
  '1.0.2',
  'review',
  'system',
  '{}',
  b.id,
  'b3010000-0000-0000-0000-000000000001'
FROM banks b
WHERE b.code = 'bancopichincha'
ON CONFLICT (id) DO NOTHING;
