// Banco Pichincha Empresas — hook-based persistent monitor script.
// Returns { login, isAuthenticated, poll, keepAlive }. The runMonitor framework
// drives the loop, dedup, 2FA-wait and emission.

const host_app = "bancaempresas.pichincha.com";
const host_login = "login.empresas.pichincha.com";
const api_transactions = "/account-overview/accounts/transactions";
const api_transaction_detail = "/account-overview/accounts/transaction-details/search";
const tz_bank = "America/Guayaquil";

const txt_continue_here = /continue here|continuar aquí|continuar aqui/i;
const txt_see_movements = /see movements|ver movimientos/i;
const txt_session_timeout = /do you need more time|your session will end|necesitas más tiempo|tu sesión|tu sesion/i;
const txt_continue_btn = /^\s*(continue|continuar)\s*$/i;
const sel_tx_row = ".transferinfo";

// --- response capture (module-scoped; populated by the page listener) ---
const transactionResponses = [];
const detailResponses = [];

page.on("response", async (response) => {
  const url = response.url();
  try {
    if (url.includes(api_transactions) && response.status() === 200) {
      const json = await response.json();
      transactionResponses.push({ capturedAt: Date.now(), json });
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

const dismissSessionTimeoutModal = async () => {
  try {
    const banner = page.getByText(txt_session_timeout).first();
    if (!(await banner.isVisible().catch(() => false))) return false;
    const cont = page.getByText(txt_continue_btn).last();
    await cont.click({ timeout: 5000 }).catch(async () => {
      await page.getByRole("button", { name: txt_continue_btn }).first().click({ timeout: 3000 }).catch(() => {});
    });
    await page.waitForTimeout(500);
    return true;
  } catch { return false; }
};

const waitForTransactions = async (timeoutMs = 25000) => {
  const startedAt = Date.now();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const candidate = transactionResponses
      .filter((r) => r.capturedAt >= startedAt - 5000)
      .map((r) => r.json).reverse()
      .find((j) => Array.isArray(j?.transactions));
    if (candidate) return candidate.transactions;
    await page.waitForTimeout(300);
  }
  return null;
};

const fetchDetail = async (rowIndex, expectedUuid) => {
  try {
    await dismissSessionTimeoutModal();
    const rows = page.locator(sel_tx_row);
    const row = rows.nth(rowIndex);
    if (!(await row.count())) return null;
    const before = detailResponses.length;
    await row.scrollIntoViewIfNeeded().catch(() => {});
    await row.click({ timeout: 5000 }).catch(() => {});
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const match = detailResponses.slice(before).find((d) => !expectedUuid || d.transactionUuid === expectedUuid)
        || detailResponses[detailResponses.length - 1];
      if (match && (!expectedUuid || match.transactionUuid === expectedUuid)) return match.body;
      await page.waitForTimeout(250);
    }
  } catch {}
  return null;
};

return {
  async login(page, context) {
    // Load the login page; the SPA may ABORT the initial navigation, which is benign.
    await page.goto("https://bancaempresas.pichincha.com/", { waitUntil: "domcontentloaded" }).catch((e) => {
      if (!String(e.message).includes("ERR_ABORTED")) throw e;
    });

    // Wait until the username field is actually visible (not just attached), then
    // give the Azure AD B2C form a moment to finish wiring its handlers.
    const userField = page.locator("#signInName");
    await userField.waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(1000);

    // Type username → wait → type password → wait → submit (staged, not all-at-once).
    await userField.click();
    await userField.pressSequentially(context.username, { delay: 40 });
    await page.waitForTimeout(1000);

    const passField = page.locator("#password");
    await passField.waitFor({ state: "visible", timeout: 10000 });
    await passField.click();
    await passField.pressSequentially(context.password, { delay: 40 });
    await page.waitForTimeout(1000);

    const continueBtn = page.locator("#continue");
    await continueBtn.waitFor({ state: "visible", timeout: 10000 });
    await continueBtn.click();
  },

  async isAuthenticated(page) {
    const url = page.url();
    // Abort on a credentials error so we don't retry into a lockout.
    const credError = await page.getByText(/username or password is wrong|usuario o contraseña/i)
      .first().isVisible().catch(() => false);
    if (credError) throw new Error("login_failed: usuario o contraseña incorrectos");
    // "Continue here" device modal — dismiss it opportunistically.
    const here = page.getByText(txt_continue_here).first();
    if (await here.isVisible().catch(() => false)) await here.click().catch(() => {});
    return url.includes(host_app) && !url.includes(host_login);
  },

  async poll(page, context) {
    await dismissSessionTimeoutModal();
    // Reset captured buffers each poll so a multi-day session doesn't leak memory.
    transactionResponses.length = 0;
    detailResponses.length = 0;

    if (!page.url().includes("account-movements")) {
      const link = page.getByText(txt_see_movements).first();
      await link.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
      await link.click().catch(() => {});
    }

    const list = await waitForTransactions();
    if (!Array.isArray(list)) return [];

    const todayStr = getBankTodayDDMMYYYY();
    const incoming = list.filter((m) => String(m.operationDate) === todayStr).filter(isIncoming);

    const out = [];
    for (const m of incoming) {
      const externalId = String(m.transactionId ?? m.transactionUuid);
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
    await page.mouse.wheel(0, 400).catch(() => {});
    await page.waitForTimeout(300);
    await page.mouse.wheel(0, -400).catch(() => {});
  },
};
