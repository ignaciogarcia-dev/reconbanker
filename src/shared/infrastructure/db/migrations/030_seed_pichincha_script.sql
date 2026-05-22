-- Register Banco Pichincha Empresas and its extract_transactions v1.0.0 hook-based script.
-- Code is loaded from disk by ScriptLoader:
--   scripts/bancopichincha/extract_transactions.v1.0.0.js

INSERT INTO banks (id, code, name, login_url, status)
VALUES (
  gen_random_uuid(), 'bancopichincha', 'Banco Pichincha Empresas',
  'https://bancaempresas.pichincha.com/', 'ready'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO bank_scripts (id, bank, flow_type, version, status, origin, selector_map, bank_id)
SELECT
  'b3000000-0000-0000-0000-000000000001',
  'bancopichincha',
  'extract_transactions',
  '1.0.0',
  'active',
  'system',
  '{}',
  b.id
FROM banks b
WHERE b.code = 'bancopichincha'
ON CONFLICT (id) DO NOTHING;
