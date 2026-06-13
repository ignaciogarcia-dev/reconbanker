// Banco Pichincha Empresas hook-based monitor v1.0.2 with programmatic SMS OTP via context.requestOtp() falling back to manual auth when absent

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
// "Continue" button to resume the session
const sel_continue_btn = "pichincha-old-button.accept";

const MAX_PAGES = 15; // safety cap for the infinite-scroll pagination loop

// Structured debug logging where context is in module scope via the runner wrapper
const log = (event, data) => {
  try { context.debugLog?.(JSON.stringify({ at: new Date().toISOString(), event, ...(data || {}) })); } catch {}
};

// Captures both fetch and XHR responses since the bank uses XHR for /transactions
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

// Merge captured /transactions pages newest first de-duplicated by the stable transactionId
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

// The "Continue" action is NOT a real button so click by exact text first since getByText pierces the open shadow DOM then re-check and retry once
const dismissSessionTimeoutModal = async () => {
  try {
    const banner = page.getByText(txt_session_timeout).first();
    if (!(await banner.isVisible().catch(() => false))) return false;
    log("session_timeout_modal_detected");
    const tryClickContinue = async () => {
      // The exact custom element captured live is most reliable
      if (await page.locator(sel_continue_btn).first().click({ timeout: 4000 }).then(() => true).catch(() => false)) return true;
      // Fall back to text which pierces shadow DOM then to role
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

// The SPA only fetches /transactions on entry so we must leave and come back each poll
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

// Wait until at least one /transactions page with a transactions array is captured
const waitForAnyTransactions = async (timeoutMs = 25000) => {
  const startedAt = Date.now();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (transactionResponses.some((r) => r.capturedAt >= startedAt - 5000 && Array.isArray(r.json?.transactions))) return true;
    await page.waitForTimeout(300);
  }
  return false;
};

// Infinite scroll older pages until today is fully covered or the list stops growing or the cap is hit
const loadAllTodayPages = async (todayStr) => {
  const todayDate = parseOperationDate(todayStr);
  const todayMs = todayDate ? todayDate.getTime() : null;
  let lastCount = -1;
  for (let i = 0; i < MAX_PAGES; i++) {
    const merged = mergeCapturedTransactions();
    // The list is newest first so ANY movement older than today means today is fully loaded
    const passedToday = todayMs != null && merged.some((m) => {
      const d = parseOperationDate(m.operationDate);
      return d && d.getTime() < todayMs;
    });
    if (passedToday) { log("pagination_done", { reason: "passed_today", pages: i, merged: merged.length }); break; }
    if (i > 0 && merged.length === lastCount) { log("pagination_done", { reason: "no_growth", pages: i, merged: merged.length }); break; }
    lastCount = merged.length;
    // Trigger the next page via infinite scroll
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
      // Accept only a detail whose request uuid matches the movement we clicked
      const match = detailResponses.slice(before).find((d) => expectedUuid && d.transactionUuid === expectedUuid);
      if (match) return match.body;
      await page.waitForTimeout(250);
    }
    log("detail_uuid_timeout", { rowIndex, expectedUuid });
  } catch (e) { log("detail_fetch_error", { rowIndex, message: String(e?.message) }); }
  return null;
};

// TODO confirm these best-effort B2C selectors against a live Pichincha SMS prompt
const OTP_INPUT_SELECTORS = [
  "#otpCode",
  "#oneTimeCode",
  "input[autocomplete='one-time-code']",
  "input[name*='otp' i]",
  "input[id*='otp' i]",
  "input[inputmode='numeric']",
];
// Buttons to confirm the code and to request a new SMS
const OTP_SUBMIT_SELECTORS = ["#verifyCode", "#continue", "button[type=submit]"];
const txt_otp_verify = /verify|verificar|continuar|continue|confirmar/i;
const txt_otp_resend = /resend|reenviar|send.*new.*code|enviar.*nuevo.*c[oó]digo|reenv[ií]ar/i;
const OTP_LENGTH = 6; // Pichincha SMS code length to confirm against a real SMS

// Returns the first visible OTP input locator or null if the OTP page isn't shown
const findOtpInput = async (page) => {
  for (const sel of OTP_INPUT_SELECTORS) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) return el;
  }
  return null;
};

// Returns true if it handled an OTP step and the coordinator owns the wait and resend policy while onResend clicks resend here
const handleOtp = async (page, context) => {
  // Briefly poll the race between reaching the dashboard and the OTP input appearing
  const deadline = Date.now() + 20000;
  let otpInput = null;
  while (Date.now() < deadline) {
    const currentUrl = page.url();
    let currentHost = "";
    try {
      currentHost = new URL(currentUrl).hostname.toLowerCase();
    } catch (_) {}
    if (currentHost === host_app && currentHost !== host_login) return false;
    otpInput = await findOtpInput(page);
    if (otpInput) break;
    await page.waitForTimeout(500);
  }
  if (!otpInput) return false;
  if (typeof context.requestOtp !== "function") {
    log("otp_no_requestotp_support"); // leave the page for a human as headful manual fallback
    return false;
  }

  log("otp_page_detected");
  const onResend = async () => {
    const link = page.getByText(txt_otp_resend).first();
    if (await link.isVisible().catch(() => false)) {
      await link.click().catch(() => {});
      log("otp_resend_clicked");
    }
  };

  const code = await context.requestOtp({ length: OTP_LENGTH, type: "numeric", purpose: "login" }, onResend);

  const input = (await findOtpInput(page)) || otpInput;
  await input.click().catch(() => {});
  await input.fill("").catch(() => {});
  await input.pressSequentially(String(code), { delay: 40 });
  await page.waitForTimeout(300);

  let submitted = false;
  for (const sel of OTP_SUBMIT_SELECTORS) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      submitted = true;
      log("otp_submit_clicked", { via: sel });
      break;
    }
  }
  if (!submitted) {
    await page.getByRole("button", { name: txt_otp_verify }).first().click({ timeout: 5000 }).catch(() => {});
    log("otp_submit_clicked", { via: "text-fallback" });
  }
  return true;
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

    // The submit id varies across B2C policies so try common ids first then a text and role fallback
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

    // SMS OTP step that no-ops when the bank skips OTP or requestOtp is unsupported and isAuthenticated() then drives the wait
    await handleOtp(page, context).catch((e) => log("otp_handling_error", { message: String(e?.message || e) }));
  },

  async isAuthenticated(page) {
    const url = page.url();
    const credError = await page.getByText(/username or password is wrong|usuario o contraseña|credenciales/i)
      .first().isVisible().catch(() => false);
    if (credError) throw new Error("login_failed: usuario o contraseña incorrectos");
    const here = page.getByText(txt_continue_here).first();
    if (await here.isVisible().catch(() => false)) await here.click().catch(() => {});
    try {
      const { hostname } = new URL(url);
      return hostname === host_app && hostname !== host_login;
    } catch (_) {
      return false;
    }
  },

  async poll(page, context) {
    await dismissSessionTimeoutModal();
    // Reset captured buffers each poll so a multi-day session doesn't leak memory
    transactionResponses.length = 0;
    detailResponses.length = 0;

    // A wedged SPA silently no-ops the movements click so retry once behind a hard reload that re-bootstraps it
    let captured = false;
    for (let attempt = 0; attempt < 2 && !captured; attempt++) {
      if (attempt > 0) {
        log("movements_reload_retry", { attempt });
        await page.goto(url_dashboard, { waitUntil: "domcontentloaded" }).catch((e) => {
          if (!String(e.message).includes("ERR_ABORTED")) log("dashboard_reload_failed", { message: String(e.message) });
        });
        await page.waitForTimeout(1500);
      }
      await goToMovementsFresh();
      captured = await waitForAnyTransactions();
    }
    if (!captured) { log("transactions_not_captured"); return []; }

    const todayStr = getBankTodayDDMMYYYY();
    // Paginate via infinite scroll until all of today is loaded
    const list = await loadAllTodayPages(todayStr);

    // A 0-row DOM with a non-empty API list means the selector broke and NOT that there are no movements
    const domRowCount = await page.locator(sel_tx_row).count().catch(() => -1);
    if (domRowCount === 0 && list.length > 0) log("dom_rows_missing", { apiCount: list.length });

    const incoming = list.filter((m) => String(m.operationDate) === todayStr).filter(isIncoming);
    log("poll_summary", { merged: list.length, today: todayStr, incoming: incoming.length, domRows: domRowCount, pages: transactionResponses.length });

    const out = [];
    for (const m of incoming) {
      // NEVER fall back to transactionUuid since it changes on every page load and would cause duplicates
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
