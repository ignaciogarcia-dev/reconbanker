/**
 * Mi Dinero — Playwright Transaction Scraper
 * ============================================
 * Bank:    Mi Dinero (https://webapp.midinero.com.uy/)
 * Runner:  Receives `page` (Playwright Page) and `context` { accountId, username, password }
 * Returns: Array of incoming transaction records
 */

const sel_login_entry_url = "https://webpersonas.midinero.com.uy/";
const sel_username_input = "#usernameUserInput";
const sel_password_input = "#password";
const sel_submit_button = "#sign-in-button";
const sel_post_login_url = "**/app/**";
const sel_empresas_card = ':is(button, div, a):has-text("midinero empresas")';
const sel_ingresos_button = 'button:has-text("Ingresos")';
const sel_tx_row = ".MovementsTableSection__row";
const sel_tx_detail_icon = ".Description__detailIcon";
const sel_modal_container = ".TransferDetailModal";
const sel_modal_close = "button.ant-modal-close";
const api_get_movements = "**/api/Account/getMovements";
const api_transfer_detail = "**/api/transfer/transferDetail";

const sha256 = (str) =>
  page.evaluate(async (input) => {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(input),
    );
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }, str);

// Escuchar getMovements desde el principio — puede llegar antes de que clickeemos Ingresos
let capturedMovements = null;
page.on("response", async (response) => {
  try {
    if (response.url().includes("getMovements") && response.status() === 200) {
      capturedMovements = await response.json();
    }
  } catch {}
});

const normalizeCurrency = (symbol = "") => {
  if (symbol.includes("US")) return "USD";
  if (symbol.includes("$") || symbol.toLowerCase().includes("uy")) return "UYU";
  return symbol.replace(/[^A-Za-z]/g, "").toUpperCase() || "UYU";
};

try {
  await page.goto(sel_login_entry_url, { waitUntil: "commit" }).catch((e) => {
    if (!e.message.includes("ERR_ABORTED")) throw e;
  });
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
} catch (e) {
  throw new Error(
    `navigation_failed: could not reach ${sel_login_entry_url} — ${e.message}`,
  );
}

try {
  await page.waitForSelector(sel_username_input, { timeout: 10_000 });
  await page.fill(sel_username_input, context.username);
  await page.waitForSelector(sel_password_input, { timeout: 5_000 });
  await page.fill(sel_password_input, context.password);
} catch (e) {
  throw new Error(
    `login_failed: could not find or fill the login form — ${e.message}`,
  );
}

try {
  await page.waitForSelector(sel_submit_button, { timeout: 5_000 });
  await page.click(sel_submit_button);
  await page.waitForURL(sel_post_login_url, { timeout: 25_000 });
  // Hacer click obligatorio en la tarjeta "midinero empresas" para cargar la cuenta correcta
  await page.waitForSelector(sel_empresas_card, { timeout: 15_000 });
  await page.click(sel_empresas_card);
  // No usamos networkidle — la SPA tiene polling continuo que lo bloquea
  await page.waitForSelector(sel_ingresos_button, { timeout: 20_000 });
} catch (e) {
  throw new Error(
    `login_failed: form submitted but authentication timed out — ${e.message}`,
  );
}

const detailMap = {};
let currentMovementId = null;

try {
  await page.route(api_transfer_detail, async (route) => {
    try {
      const response = await route.fetch();
      const body = await response.body();
      const headers = response.headers();
      let json = null;
      try {
        json = JSON.parse(body.toString("utf-8"));
      } catch {}
      if (currentMovementId !== null && json) {
        detailMap[String(currentMovementId)] = json;
      }
      await route.fulfill({ status: response.status(), headers, body });
    } catch {
      await route.continue();
    }
  });
} catch (e) {
  throw new Error(
    `route_setup_failed: could not install transferDetail interceptor — ${e.message}`,
  );
}

let movements = [];
try {
  await page.waitForSelector(sel_ingresos_button, { timeout: 10_000 });
  await page.click(sel_ingresos_button);

  // Esperar hasta 15s a que llegue getMovements (puede haber llegado ya durante el page load)
  const deadline = Date.now() + 15_000;
  while (capturedMovements === null && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
  }
  if (capturedMovements === null)
    throw new Error("getMovements API no detectada en 15s");
  movements = capturedMovements;
} catch (e) {
  throw new Error(
    `movements_fetch_failed: could not load the Ingresos transaction list — ${e.message}`,
  );
}

if (!Array.isArray(movements) || movements.length === 0) return [];

// Filtrar solo movimientos de hoy
const todayStr = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
movements = movements.filter((m) => m.date && m.date.startsWith(todayStr));

if (movements.length === 0) return [];

// Si el movimiento más nuevo ya está registrado, no hay nada nuevo que procesar
if (
  context.lastExternalId &&
  String(movements[0].id) === String(context.lastExternalId)
)
  return [];

try {
  await page.waitForSelector(sel_tx_row, { timeout: 10_000 });
  const detailIcons = await page.$$(sel_tx_detail_icon);
  const count = Math.min(detailIcons.length, movements.length);

  for (let i = 0; i < count; i++) {
    const movement = movements[i];
    if (!movement) continue;

    // Cortar al llegar a un movimiento ya registrado — los siguientes también lo están
    if (
      context.lastExternalId &&
      String(movement.id) === String(context.lastExternalId)
    )
      break;

    // Solo buscar detalles de ingresos (positivos) — los egresos no tienen sender relevante
    const amount = movement.amount?.amount ?? 0;
    if (amount <= 0) continue;

    currentMovementId = movement.id;
    await detailIcons[i].click().catch(() => {});
    // Esperar solo la respuesta de la API, no las animaciones del modal
    await page
      .waitForResponse(
        (r) => r.url().includes("transferDetail") && r.status() === 200,
        { timeout: 60_000 },
      )
      .catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(150);
  }
} catch (e) {
  throw new Error(
    `detail_extraction_failed: error iterating transaction rows — ${e.message}`,
  );
}

const transactions = [];
for (const m of movements) {
  try {
    // Cortar al llegar a un movimiento ya registrado — los siguientes también lo están
    if (
      context.lastExternalId &&
      String(m.id) === String(context.lastExternalId)
    )
      break;

    const detail = detailMap[String(m.id)] || {};
    const amountValue = m.amount?.amount ?? 0;

    // Skip egresos
    if (amountValue <= 0) continue;

    const currency = normalizeCurrency(m.amount?.currency?.symbol ?? "");
    const hashSource = `${amountValue}|${m.date}|${m.id}`;
    const referenceHash = await sha256(hashSource);
    transactions.push({
      externalId: String(m.id),
      referenceHash,
      amount: amountValue,
      currency,
      senderName: detail.accountOriginName || undefined,
      receivedAt: new Date(m.date),
      raw: { movement: m, detail },
    });
  } catch {}
}

return transactions;
