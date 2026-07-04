-- Add 'chat_webhook' as a third notification transport. It POSTs { "text": ... } to the
-- (reused) notification_endpoint_url for Slack incoming webhooks / Mattermost / any
-- {text}-compatible endpoint. Additive: existing rows keep their current transport.
ALTER TABLE account_config
  DROP CONSTRAINT IF EXISTS account_config_notification_transport_check;

ALTER TABLE account_config
  ADD CONSTRAINT account_config_notification_transport_check
    CHECK (notification_transport IN ('api', 'slack', 'chat_webhook'));
