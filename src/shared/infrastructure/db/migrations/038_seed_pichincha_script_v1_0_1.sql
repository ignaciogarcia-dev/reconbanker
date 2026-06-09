-- Register Banco Pichincha extract_transactions v1.0.1 as the new active script.
-- Deprecates v1.0.0 (b3000000-0000-0000-0000-000000000001).
-- Code is loaded from disk by ScriptLoader:
--   scripts/bancopichincha/extract_transactions.v1.0.1.js

-- Deprecate the previous active version first to satisfy uq_bank_script_active
UPDATE bank_scripts
SET status = 'deprecated'
WHERE id = 'b3000000-0000-0000-0000-000000000001'
  AND status = 'active';

INSERT INTO bank_scripts (id, bank, flow_type, version, status, origin, selector_map, bank_id, base_script_id)
SELECT
  'b3010000-0000-0000-0000-000000000001',
  'bancopichincha',
  'extract_transactions',
  '1.0.1',
  'active',
  'system',
  '{}',
  b.id,
  'b3000000-0000-0000-0000-000000000001'
FROM banks b
WHERE b.code = 'bancopichincha'
ON CONFLICT (id) DO NOTHING;
