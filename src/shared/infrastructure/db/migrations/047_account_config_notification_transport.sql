-- Notification delivery transport selector. 'api' (default) keeps the existing
-- generic webhook behavior (notification_endpoint_url + auth). 'slack' delivers via
-- Slack chat.postMessage using the (reused, encrypted) notification_auth_token as the
-- bot token and notification_slack_channel as the target channel.
-- Additive: existing rows default to 'api', so behavior is unchanged.
ALTER TABLE account_config
  ADD COLUMN IF NOT EXISTS notification_transport TEXT NOT NULL DEFAULT 'api'
    CHECK (notification_transport IN ('api', 'slack')),
  ADD COLUMN IF NOT EXISTS notification_slack_channel TEXT;
