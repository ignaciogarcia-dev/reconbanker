// Banco Pichincha Empresas - hook-based persistent monitor script.
// Returns { login, isAuthenticated, poll, keepAlive }. The runMonitor framework
// drives the loop, dedup, 2FA-wait and emission.
//

const host_app = "bancaempresas.pichincha.com";
const host_login = "login.empresas.pichincha.com";
const url_dashboard = "https://bancaempresas.pichincha.com/consolidate-position";
const api_transactions = "/account-overview/accounts/transactions";
const api_transaction_detail = "/account-overview/accounts/transaction-details/search";
const tz_bank = "America/Guayaquil";

const txt_continue_here = /continue here|continuar aquí|continuar aqui/i;
const txt_see_movements = /see movements|ver movimientos/i;
const txt_back_to_accounts = /back to all accounts|volver a (todas )?(mis |las )?cuentas|volver a cuentas/i;
const txt_position_consolidate = /position consolidate|posici[oó]n consolidada/i;
const txt_session_timeout = /do you need more time|your session will end|necesitas más tiempo|tu sesión|tu sesion/i;
const txt_continue_btn = /^\s*(continue|continuar)\s*$/i;
const sel_tx_row = ".transferinfo";
//"Continue" button to resume the session
const sel_continue_btn = "pichincha-old-button.accept";

const MAX_PAGES = 15; // safety cap for the infinite-scroll pagination loop

// --- structured debug logging (context is in module scope via the runner wrapper) ---
const log = (event, data) => {
  try { context.debugLog?.(JSON.stringify({ at: new Date().toISOString(), event, ...(data || {}) })); } catch {}
};

// --- response capture (module-scoped; populated by the page listener) ---
// Captures both fetch and XHR responses (the bank uses XHR for /transactions).
const transactionResponses = [];
const detailResponses = [];

page.on("response", async (response) => {
  const url = response.url();
  try {
    if (url.includes(api_transactions) && response.status() === 200) {
      const json = await response.json();
      transactionResponses.push({ capturedAt: Date.now(), url, json });
    } else if (url.includes(api_transaction_detail) && response.status() === 200) {
      const json = await response.json();
      let uuid = null;
      try { uuid = JSON.parse(response.request().postData() || "{}").transactionUuid; } catch {}
      detailResponses.push({ transactionUuid: uuid, body: json });
    }
  } catch {}
});

const getBankTodayDDMMYYYY = () => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz_bank, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}${get("month")}${get("year")}`;
};
const parseOperationDate = (ddmmyyyy) => {
  const m = String(ddmmyyyy ?? "").match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00-05:00`);
};
const normalizeCurrency = (code = "") => String(code || "USD").toUpperCase();
const isIncoming = (m) =>
  String(m?.type?.code || "").toUpperCase() === "C" ||
  /credito|crédito|credit/i.test(m?.type?.description || "");
const getDetailValue = (detail, key) => {
  const items = detail?.transactions?.[0]?.details;
  if (!Array.isArray(items)) return null;
  return items.find((d) => d?.key === key)?.value ?? null;
};
const sha256 = (str) => page.evaluate(async (input) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}, str);

// Merge every captured /transactions page into a single ordered array, de-duplicated
// by transactionId (the stable "Transaction Number"). Order is preserved (newest first).
const mergeCapturedTransactions = () => {
  const seen = new Set();
  const merged = [];
  for (const r of transactionResponses) {
    const arr = r.json?.transactions;
    if (!Array.isArray(arr)) continue;
    for (const m of arr) {
      const id = m?.transactionId != null ? String(m.transactionId) : "";
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      merged.push(m);
    }
  }
  return merged;
};

// Session keep-alive. Confirmed live: the bank shows <app-alert-modal> with text
// "Do you need more time? Your session will end in N seconds." and two actions —
// "Logout" (left) and "Continue" (yellow, right). The "Continue" action is NOT a
// real <button> (it's text inside a custom component), so getByRole("button")
// alone may miss it; we click it by exact text first (getByText pierces the open
// shadow DOM). We then re-check the banner and retry once to be sure it closed.
const dismissSessionTimeoutModal = async () => {
  try {
    const banner = page.getByText(txt_session_timeout).first();
    if (!(await banner.isVisible().catch(() => false))) return false;
    log("session_timeout_modal_detected");
    const tryClickContinue = async () => {
      // Primary: the exact custom element captured live (most reliable).
      if (await page.locator(sel_continue_btn).first().click({ timeout: 4000 }).then(() => true).catch(() => false)) return true;
      // Fallbacks: by text (pierces shadow DOM), then by role.
      if (await page.getByText(txt_continue_btn).last().click({ timeout: 3000 }).then(() => true).catch(() => false)) return true;
      if (await page.getByRole("button", { name: txt_continue_btn }).first().click({ timeout: 3000 }).then(() => true).catch(() => false)) return true;
      return false;
    };
    let clicked = await tryClickContinue();
    await page.waitForTimeout(600);
    if (await banner.isVisible().catch(() => false)) { clicked = await tryClickContinue(); await page.waitForTimeout(600); }
    const stillUp = await banner.isVisible().catch(() => false);
    log("session_timeout_modal_dismissed", { clicked, stillUp });
    return true;
  } catch { return false; }
};

// Re-open the movements list from the dashboard. The SPA only fetches /transactions
// on (re-)entry, so we must leave and come back each poll.
const goToMovementsFresh = async () => {
  if (page.url().includes("account-movements")) {
    const back = page.getByText(txt_back_to_accounts).first();
    if (await back.isVisible().catch(() => false)) {
      await back.click().catch(() => {});
    } else {
      const nav = page.getByText(txt_position_consolidate).first();
      await nav.click().catch(() => {});
    }
    await page.waitForTimeout(1500);
  }
  if (!page.url().includes("consolidate-position")) {
    await page.goto(url_dashboard, { waitUntil: "domcontentloaded" }).catch((e) => {
      if (!String(e.message).includes("ERR_ABORTED")) log("dashboard_goto_failed", { message: String(e.message) });
    });
    await page.waitForTimeout(1000);
  }
  const link = page.getByText(txt_see_movements).first();
  await link.waitFor({ state: "visible", timeout: 20000 }).catch(() => { log("see_movements_link_not_visible"); });
  await link.click().catch(() => {});
};

// Wait until at least one /transactions page (with a transactions array) is captured.
const waitForAnyTransactions = async (timeoutMs = 25000) => {
  const startedAt = Date.now();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (transactionResponses.some((r) => r.capturedAt >= startedAt - 5000 && Array.isArray(r.json?.transactions))) return true;
    await page.waitForTimeout(300);
  }
  return false;
};

// Scroll the movements list (infinite scroll) to load older pages until every
// "today" movement is covered, the list stops growing, or the safety cap is hit.
const loadAllTodayPages = async (todayStr) => {
  const todayDate = parseOperationDate(todayStr);
  const todayMs = todayDate ? todayDate.getTime() : null;
  let lastCount = -1;
  for (let i = 0; i < MAX_PAGES; i++) {
    const merged = mergeCapturedTransactions();
    // Newest-first: once we have ANY movement older than today, today is fully loaded.
    const passedToday = todayMs != null && merged.some((m) => {
      const d = parseOperationDate(m.operationDate);
      return d && d.getTime() < todayMs;
    });
    if (passedToday) { log("pagination_done", { reason: "passed_today", pages: i, merged: merged.length }); break; }
    if (i > 0 && merged.length === lastCount) { log("pagination_done", { reason: "no_growth", pages: i, merged: merged.length }); break; }
    lastCount = merged.length;
    // Trigger the next page via infinite scroll.
    await page.mouse.wheel(0, 6000).catch(() => {});
    await page.waitForTimeout(1200);
    await dismissSessionTimeoutModal();
    if (i === MAX_PAGES - 1) log("pagination_cap_reached", { pages: MAX_PAGES, merged: mergeCapturedTransactions().length });
  }
  return mergeCapturedTransactions();
};

const fetchDetail = async (rowIndex, expectedUuid) => {
  try {
    await dismissSessionTimeoutModal();
    const rows = page.locator(sel_tx_row); // Playwright pierces open shadow DOM
    const row = rows.nth(rowIndex);
    if (!(await row.count())) { log("detail_row_missing", { rowIndex }); return null; }
    const before = detailResponses.length;
    await row.scrollIntoViewIfNeeded().catch(() => {});
    await row.click({ timeout: 5000 }).catch(() => {});
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      // Accept only a detail whose request uuid matches the movement we clicked.
      const match = detailResponses.slice(before).find((d) => expectedUuid && d.transactionUuid === expectedUuid);
      if (match) return match.body;
      await page.waitForTimeout(250);
    }
    log("detail_uuid_timeout", { rowIndex, expectedUuid });
  } catch (e) { log("detail_fetch_error", { rowIndex, message: String(e?.message) }); }
  return null;
};

return {
  async login(page, context) {
    await page.goto("https://bancaempresas.pichincha.com/", { waitUntil: "domcontentloaded" }).catch((e) => {
      if (!String(e.message).includes("ERR_ABORTED")) throw e;
    });

    const userField = page.locator("#signInName");
    await userField.waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(1000);

    await userField.click();
    await userField.pressSequentially(context.username, { delay: 40 });
    await page.waitForTimeout(1000);

    const passField = page.locator("#password");
    await passField.waitFor({ state: "visible", timeout: 10000 });
    await passField.click();
    await passField.pressSequentially(context.password, { delay: 40 });
    await page.waitForTimeout(1000);

    // Submit. Visible label is "Sign in"; the underlying id varies across B2C
    // policies, so try common ids first, then a text/role fallback.
    const submitSelectors = ["#continue", "#next", "button[type=submit]"];
    let clicked = false;
    for (const sel of submitSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        await el.click().catch(() => {});
        clicked = true;
        log("login_submit_clicked", { via: sel });
        break;
      }
    }
    if (!clicked) {
      await page.getByRole("button", { name: /sign in|iniciar sesi[oó]n|ingresar|continuar|continue/i })
        .first().click({ timeout: 5000 }).catch(() => {});
      log("login_submit_clicked", { via: "text-fallback" });
    }
  },

  async isAuthenticated(page) {
    const url = page.url();
    const credError = await page.getByText(/username or password is wrong|usuario o contraseña|credenciales/i)
      .first().isVisible().catch(() => false);
    if (credError) throw new Error("login_failed: usuario o contraseña incorrectos");
    const here = page.getByText(txt_continue_here).first();
    if (await here.isVisible().catch(() => false)) await here.click().catch(() => {});
    return url.includes(host_app) && !url.includes(host_login);
  },

  async poll(page, context) {
    await dismissSessionTimeoutModal();
    // Reset captured buffers each poll so a multi-day session doesn't leak memory.
    transactionResponses.length = 0;
    detailResponses.length = 0;

    // Always re-open movements so a fresh /transactions request fires.
    await goToMovementsFresh();
    if (!(await waitForAnyTransactions())) { log("transactions_not_captured"); return []; }

    const todayStr = getBankTodayDDMMYYYY();
    // Paginate (infinite scroll) until all of today is loaded.
    const list = await loadAllTodayPages(todayStr);

    // Defensive: a 0-row DOM with a non-empty API list means the selector broke
    // (e.g. a shadow root went closed), NOT that there are no movements.
    const domRowCount = await page.locator(sel_tx_row).count().catch(() => -1);
    if (domRowCount === 0 && list.length > 0) log("dom_rows_missing", { apiCount: list.length });

    const incoming = list.filter((m) => String(m.operationDate) === todayStr).filter(isIncoming);
    log("poll_summary", { merged: list.length, today: todayStr, incoming: incoming.length, domRows: domRowCount, pages: transactionResponses.length });

    const out = [];
    for (const m of incoming) {
      // Identity = transactionId (the stable "Transaction Number"). NEVER fall back
      // to transactionUuid: it changes on every page load and would cause duplicates.
      const externalId = m?.transactionId != null && String(m.transactionId).length ? String(m.transactionId) : null;
      if (!externalId) { log("skip_no_transactionId", { uuid: m?.transactionUuid }); continue; }

      const domIndex = list.indexOf(m);
      const detail = m.hasDetail ? await fetchDetail(domIndex, m.transactionUuid) : null;
      const amount = Number(m.amount) || 0;
      const referenceHash = await sha256(`${amount}|${m.operationDate}|${externalId}`);
      out.push({
        externalId,
        referenceHash,
        amount,
        currency: normalizeCurrency(m.currency?.code),
        senderName: getDetailValue(detail, "ordenante") || m.longDescription || m.description || undefined,
        receivedAt: parseOperationDate(m.operationDate) || new Date(),
        raw: { movement: m, detail },
      });
    }
    return out;
  },

  async keepAlive(page) {
    await dismissSessionTimeoutModal();
    await page.mouse.move(200, 200).catch(() => {});
    await page.mouse.wheel(0, 300).catch(() => {});
    await page.waitForTimeout(300);
    await page.mouse.wheel(0, -300).catch(() => {});
    await dismissSessionTimeoutModal();
  },
};
