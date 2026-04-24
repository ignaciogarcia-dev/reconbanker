interface SendWebhookOptions {
  url: string
  payload: Record<string, unknown>
  authType: 'bearer' | 'api_key' | null
  authToken: string | null
}

export async function sendWebhook({ url, payload, authType, authToken }: SendWebhookOptions): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json' }
  if (authToken) {
    headers['Authorization'] = authType === 'api_key' ? `Api-Key ${authToken}` : `Bearer ${authToken}`
  }

  const body = JSON.stringify(payload)
  console.log(`[webhook] POST ${url}`)
  console.log(`[webhook] headers:`, JSON.stringify(headers))
  console.log(`[webhook] body:`, body)

  const response = await fetch(url, { method: 'POST', headers, body })
  const responseBody = await response.text().catch(() => '')
  console.log(`[webhook] response: ${response.status} ${response.statusText} — ${responseBody}`)

  if (!response.ok) {
    throw new Error(
      `Webhook failed: ${response.status} ${response.statusText}` +
      (responseBody ? ` — ${responseBody.slice(0, 300)}` : '')
    )
  }
}
