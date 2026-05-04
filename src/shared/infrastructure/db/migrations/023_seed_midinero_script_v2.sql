-- Register Mi Dinero extract_transactions v2.0.0 as the new active script.
-- Deprecates v1.0.0 (b1000000-0000-0000-0000-000000000001).
-- Code is loaded from disk by ScriptLoader:
--   src/contexts/script-engine/infrastructure/scripts/mi-dinero/extract_transactions.v2.0.0.js

-- Deprecate the previous active version first to satisfy uq_bank_script_active
UPDATE bank_scripts
SET status = 'deprecated'
WHERE id = 'b1000000-0000-0000-0000-000000000001'
  AND status = 'active';

INSERT INTO bank_scripts (id, bank, flow_type, version, status, origin, selector_map, bank_id, base_script_id)
SELECT
  'b2000000-0000-0000-0000-000000000001',
  'mi-dinero',
  'extract_transactions',
  '2.0.0',
  'active',
  'system',
  '{}',
  b.id,
  'b1000000-0000-0000-0000-000000000001'
FROM banks b
WHERE b.code = 'mi-dinero'
ON CONFLICT (id) DO NOTHING;
