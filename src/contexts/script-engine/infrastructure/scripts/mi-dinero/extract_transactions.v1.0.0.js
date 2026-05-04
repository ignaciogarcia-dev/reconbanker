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
const sel_empresas_card = '.ProductCard:has-text("MIDINERO EMPRESAS")';
const sel_ingresos_button = 'button:has-text("Ingresos")';
const sel_tx_row = ".MovementsTableSection__row";
const sel_tx_detail_icon = ".Description__detailIcon";
const sel_modal_container = ".TransferDetailModal";
const sel_modal_close = "button.ant-modal-close";
const api_get_movements = "**/api/Account/getMovements";
const api_transfer_detail = "**/api/transfer/transferDetail";

const debugRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const debug = (event, data = {}) => {
  const entry = {
    at: new Date().toISOString(),
    runId: debugRunId,
    event,
    ...data,
  };
  if (typeof context.debugLog === "function") {
    context.debugLog(JSON.stringify(entry));
  }
};
const summarizeMovement = (movement) => ({
  id: movement?.id,
  date: movement?.date,
  amount: movement?.amount?.amount,
  currency: movement?.amount?.currency?.symbol,
  description: movement?.description,
  concept: movement?.concept,
});
const summarizeDetail = (detail) => ({
  referenceNumber: detail?.referenceNumber,
  accountOriginName: detail?.accountOriginName,
  accountOriginNumber: detail?.accountOriginNumber,
  transferDoneDate: detail?.transferDoneDate,
  transferStatusDescription: detail?.transferStatusDescription,
});
const summarizeRow = (row) => ({
  domIndex: row?.domIndex,
  text: row?.text,
});
const getAccountNumberFromMovementsUrl = (url) => {
  try {
    return new URL(url).searchParams.get("accountNumber");
  } catch {
    return null;
  }
};

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
const movementResponses = [];
page.on("response", async (response) => {
  try {
    if (response.url().includes("getMovements") && response.status() === 200) {
      const json = await response.json();
      const accountNumber = getAccountNumberFromMovementsUrl(response.url());
      const capturedAt = Date.now();
      capturedMovements = json;
      movementResponses.push({
        capturedAt,
        url: response.url(),
        accountNumber,
        movements: json,
      });
      debug("get_movements_captured", {
        url: response.url(),
        accountNumber,
        count: Array.isArray(json) ? json.length : null,
        firstMovement: Array.isArray(json) ? summarizeMovement(json[0]) : null,
        lastMovement: Array.isArray(json)
          ? summarizeMovement(json[json.length - 1])
          : null,
      });
    }
  } catch (e) {
    debug("get_movements_capture_failed", { message: e.message });
  }
});

const normalizeCurrency = (symbol = "") => {
  if (symbol.includes("US")) return "USD";
  if (symbol.includes("$") || symbol.toLowerCase().includes("uy")) return "UYU";
  return symbol.replace(/[^A-Za-z]/g, "").toUpperCase() || "UYU";
};

const getMontevideoDateString = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const detailTimeToleranceSeconds = 5 * 60;

const parseWallClockMs = (value) => {
  const match = String(value ?? "").match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
};

const compareMovementAndDetailTimes = (movement, detail) => {
  const movementMs = parseWallClockMs(movement?.date);
  const detailMs = parseWallClockMs(detail?.transferDoneDate);
  const deltaSeconds =
    movementMs === null || detailMs === null
      ? null
      : Math.abs(movementMs - detailMs) / 1000;
  return {
    movementDate: movement?.date,
    detailTransferDoneDate: detail?.transferDoneDate,
    deltaSeconds,
    toleranceSeconds: detailTimeToleranceSeconds,
  };
};

const validateDetailMatchesMovement = (movement, detail) => {
  if (!detail?.referenceNumber) {
    throw new Error(`missing_reference_number: movement ${movement?.id}`);
  }

  const comparison = compareMovementAndDetailTimes(movement, detail);
  if (
    comparison.deltaSeconds === null ||
    comparison.deltaSeconds > detailTimeToleranceSeconds
  ) {
    debug("detail_mismatch", {
      movement: summarizeMovement(movement),
      detail: summarizeDetail(detail),
      comparison,
    });
    throw new Error(
      `detail_mismatch: movement ${movement?.id} reference ${detail.referenceNumber}`,
    );
  }

  return comparison;
};

const getIncomingRows = async () => {
  const rows = await page.$$(sel_tx_row);
  const incomingRows = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const text = (await row.textContent())?.replace(/\s+/g, " ").trim() ?? "";
    const icon = await row.$(sel_tx_detail_icon);
    if (!icon || !text.includes("+")) continue;
    incomingRows.push({
      domIndex: index,
      text: text.slice(0, 500),
      icon,
    });
  }
  return incomingRows;
};

const snapshotProductCardsDom = async (label) =>
  page.evaluate((snapshotLabel) => {
    const truncate = (value, max = 300) =>
      String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    const rectOf = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
      };
    };
    const attrsOf = (element) => {
      if (!element) return {};
      const attrs = {};
      for (const attr of element.attributes ?? []) {
        if (
          attr.name === "class" ||
          attr.name === "id" ||
          attr.name === "role" ||
          attr.name === "tabindex" ||
          attr.name === "style" ||
          attr.name === "aria-label" ||
          attr.name === "title" ||
          attr.name.startsWith("data-")
        ) {
          attrs[attr.name] = truncate(attr.value, 180);
        }
      }
      return attrs;
    };
    const styleOf = (element) => {
      if (!element) return {};
      const style = window.getComputedStyle(element);
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        position: style.position,
        zIndex: style.zIndex,
        overflow: style.overflow,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        transform: style.transform,
        cursor: style.cursor,
        userSelect: style.userSelect,
      };
    };
    const describeElement = (element) => {
      if (!element) return null;
      return {
        tagName: element.tagName,
        className: truncate(element.className, 220),
        id: element.id || undefined,
        role: element.getAttribute?.("role") || undefined,
        text: truncate(element.textContent, 180),
        rect: rectOf(element),
        attrs: attrsOf(element),
        style: styleOf(element),
      };
    };
    const ancestorChain = (element, limit = 6) => {
      const chain = [];
      let current = element;
      while (current && chain.length < limit) {
        chain.push(describeElement(current));
        current = current.parentElement;
      }
      return chain;
    };
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || 1) > 0
      );
    };
    const sampleCardPoints = (card) => {
      const rect = card.getBoundingClientRect();
      const xFractions = [0.06, 0.12, 0.2, 0.35, 0.5, 0.7, 0.9];
      const yFractions = [0.06, 0.12, 0.2, 0.32, 0.48, 0.68, 0.88];
      const points = [];
      for (const yFraction of yFractions) {
        for (const xFraction of xFractions) {
          const clientX = rect.left + rect.width * xFraction;
          const clientY = rect.top + rect.height * yFraction;
          const topElement = document.elementFromPoint(clientX, clientY);
          points.push({
            x: Math.round(clientX),
            y: Math.round(clientY),
            xFraction,
            yFraction,
            cardContainsTopElement: Boolean(topElement && card.contains(topElement)),
            topElement: describeElement(topElement),
            topAncestors: ancestorChain(topElement, 5),
          });
        }
      }
      return points;
    };
    const clickableSelector = [
      "button",
      "a",
      "input",
      "[role]",
      "[onclick]",
      "[tabindex]",
      '[class*="Setting"]',
      '[class*="setting"]',
      '[class*="Icon"]',
      '[class*="icon"]',
      "svg",
    ].join(",");
    const cards = [...document.querySelectorAll(".ProductCard")].map(
      (card, index) => {
        const productName = truncate(
          card.querySelector(".ProductName")?.textContent,
          120,
        );
        return {
          index,
          productName,
          visible: visible(card),
          text: truncate(card.textContent, 500),
          rect: rectOf(card),
          attrs: attrsOf(card),
          style: styleOf(card),
          parentChain: ancestorChain(card.parentElement, 6),
          clickableDescendants: [...card.querySelectorAll(clickableSelector)]
            .slice(0, 20)
            .map((child) => describeElement(child)),
          samplePoints: productName === "MIDINERO EMPRESAS" ? sampleCardPoints(card) : [],
          outerHTML: truncate(card.outerHTML, 1200),
        };
      },
    );
    return {
      label: snapshotLabel,
      url: location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      },
      activeElement: describeElement(document.activeElement),
      selectedText: truncate(window.getSelection?.()?.toString(), 200),
      productCardCount: cards.length,
      cards,
    };
  }, label);

const getMidineroEmpresasSelectionState = async () =>
  page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const rectOf = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const cards = [...document.querySelectorAll(".ProductCard")].map(
      (card, index) => {
        const classList = [...card.classList];
        return {
          index,
          productName: normalize(card.querySelector(".ProductName")?.textContent),
          accountNumber: normalize(
            card.querySelector(".ProductCard__accountNumber")?.textContent,
          ),
          className: String(card.className),
          selected: classList.includes("selected"),
          disabled: classList.includes("ProductCard--disabled"),
          rect: rectOf(card),
        };
      },
    );
    const empresas = cards.find(
      (card) => card.productName === "MIDINERO EMPRESAS",
    );
    const selectedCard = cards.find((card) => card.selected) ?? null;
    return {
      isSelected: Boolean(empresas?.selected),
      empresas: empresas ?? null,
      selectedCard,
      cards,
    };
  });

const clickMidineroEmpresasCard = async (attempt = 1) => {
  const clickTarget = await page.evaluate((clickAttempt) => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity || 1) > 0
      );
    };
    const cards = [...document.querySelectorAll(".ProductCard")].map(
      (card, index) => {
        const rect = card.getBoundingClientRect();
        const name = normalize(card.querySelector(".ProductName")?.textContent);
        return {
          card,
          index,
          name,
          className: card.className,
          visible: isVisible(card),
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      },
    );
    const candidates = cards.filter((candidate) => candidate.name === "MIDINERO EMPRESAS");
    const candidate =
      candidates.find((item) => item.visible) ??
      candidates.find((item) => item.rect.width > 0 && item.rect.height > 0) ??
      candidates[0];
    if (!candidate) {
      throw new Error(
        `tarjeta MIDINERO EMPRESAS no encontrada. Tarjetas: ${JSON.stringify(
          cards.map(({ index, name, visible, rect }) => ({
            index,
            name,
            visible,
            rect,
          })),
        )}`,
      );
    }

    const card = candidate.card;
    card.scrollIntoView({ block: "center", inline: "center" });
    document.getSelection?.()?.removeAllRanges();

    const rect = card.getBoundingClientRect();
    const xFractions = [0.08, 0.16, 0.25, 0.4, 0.6, 0.82];
    const yFractions = [0.08, 0.15, 0.25, 0.35, 0.45, 0.6, 0.8];
    const testedPoints = [];
    let clickPoint = null;
    for (const yFraction of yFractions) {
      for (const xFraction of xFractions) {
        const clientX = rect.left + rect.width * xFraction;
        const clientY = rect.top + rect.height * yFraction;
        const topElement = document.elementFromPoint(clientX, clientY);
        const ownsPoint = Boolean(topElement && card.contains(topElement));
        testedPoints.push({
          clientX: Math.round(clientX),
          clientY: Math.round(clientY),
          ownsPoint,
          topElementTagName: topElement?.tagName,
          topElementClassName: String(topElement?.className ?? ""),
          topElementText: normalize(topElement?.textContent).slice(0, 80),
        });
        if (ownsPoint) {
          clickPoint = {
            clientX,
            clientY,
            topElementTagName: topElement.tagName,
            topElementClassName: String(topElement.className ?? ""),
            topElementText: normalize(topElement.textContent).slice(0, 120),
          };
          break;
        }
      }
      if (clickPoint) break;
    }

    if (!clickPoint) {
      throw new Error(
        `tarjeta MIDINERO EMPRESAS no tiene punto clickeable visible. Puntos: ${JSON.stringify(
          testedPoints,
        )}`,
      );
    }

    return {
      attempt: clickAttempt,
      cardIndex: candidate.index,
      cardText: normalize(card.textContent).slice(0, 300),
      cardClassName: String(card.className),
      clientX: Math.round(clickPoint.clientX),
      clientY: Math.round(clickPoint.clientY),
      targetTagName: clickPoint.topElementTagName,
      targetClassName: clickPoint.topElementClassName,
      targetText: clickPoint.topElementText,
      testedPoints: testedPoints.slice(0, 12),
      candidates: candidates.map(({ index, name, visible, rect, className }) => ({
        index,
        name,
        visible,
        rect,
        className: String(className),
      })),
    };
  }, attempt);
  await page.mouse.move(clickTarget.clientX, clickTarget.clientY);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.evaluate(() => document.getSelection?.()?.removeAllRanges());
  return clickTarget;
};

const waitForEmpresasSelectionProgress = async (previousState, timeoutMs = 3_000) => {
  const deadline = Date.now() + timeoutMs;
  let state = await getMidineroEmpresasSelectionState();
  while (Date.now() < deadline) {
    const becameSelected = state.isSelected;
    const becameEnabled =
      previousState?.empresas?.disabled &&
      state.empresas &&
      !state.empresas.disabled;
    if (becameSelected || becameEnabled) return state;
    await page.waitForTimeout(250);
    state = await getMidineroEmpresasSelectionState();
  }
  return state;
};

const selectMidineroEmpresasCard = async (reason, maxClicks = 3) => {
  let state = await getMidineroEmpresasSelectionState();
  debug("empresas_selection_state", {
    reason,
    phase: "before",
    state,
  });

  const clicks = [];
  for (let clickNumber = 1; clickNumber <= maxClicks && !state.isSelected; clickNumber++) {
    const previousState = state;
    const click = await clickMidineroEmpresasCard(`${reason}:${clickNumber}`);
    state = await waitForEmpresasSelectionProgress(previousState);
    const result = { clickNumber, click, state };
    clicks.push(result);
    debug("empresas_selection_click_result", {
      reason,
      ...result,
    });
  }

  if (!state.isSelected) {
    throw new Error(
      `midinero_empresas_not_selected: selected=${state.selectedCard?.productName ?? "none"}`,
    );
  }

  return {
    reason,
    clickCount: clicks.length,
    state,
    clicks,
  };
};

try {
  debug("navigation_start", { url: sel_login_entry_url });
  await page.goto(sel_login_entry_url, { waitUntil: "commit" }).catch((e) => {
    if (!e.message.includes("ERR_ABORTED")) throw e;
  });
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
  debug("navigation_done", { url: page.url() });
} catch (e) {
  debug("navigation_failed", { message: e.message });
  throw new Error(
    `navigation_failed: could not reach ${sel_login_entry_url} — ${e.message}`,
  );
}

try {
  debug("login_form_fill_start");
  await page.waitForSelector(sel_username_input, { timeout: 10_000 });
  await page.fill(sel_username_input, context.username);
  await page.waitForSelector(sel_password_input, { timeout: 5_000 });
  await page.fill(sel_password_input, context.password);
  debug("login_form_fill_done");
} catch (e) {
  debug("login_form_fill_failed", { message: e.message });
  throw new Error(
    `login_failed: could not find or fill the login form — ${e.message}`,
  );
}

try {
  debug("login_submit_start");
  await page.waitForSelector(sel_submit_button, { timeout: 5_000 });
  await page.click(sel_submit_button);
  await page.waitForURL(sel_post_login_url, { timeout: 25_000 });
  debug("login_submit_done", { url: page.url() });
  // Hacer click obligatorio en la tarjeta "midinero empresas" para cargar la cuenta correcta.
  // La tarjeta EMPRESAS puede necesitar dos clicks: el primero la habilita y el segundo
  // la deja seleccionada. No avanzamos a Ingresos hasta ver la clase `selected`.
  await page.waitForSelector(sel_empresas_card, { timeout: 15_000 });
  debug("product_cards_dom_snapshot", {
    snapshot: await snapshotProductCardsDom("before_empresas_click_initial"),
  });
  debug("empresas_card_click_start");
  const empresasSelection = await selectMidineroEmpresasCard("initial");
  // Resetear movements capturados: el click dispara una nueva llamada getMovements para EMPRESAS
  capturedMovements = null;
  movementResponses.length = 0;
  debug("empresas_card_click_done", empresasSelection);
  debug("product_cards_dom_snapshot", {
    snapshot: await snapshotProductCardsDom("after_empresas_click_initial"),
  });
  // No usamos networkidle — la SPA tiene polling continuo que lo bloquea
  await page.waitForTimeout(1_500);
  await page.waitForSelector(sel_ingresos_button, { timeout: 20_000 });
  debug("ingresos_button_visible");
} catch (e) {
  debug("login_or_account_selection_failed", { message: e.message });
  throw new Error(
    `login_failed: form submitted but authentication timed out — ${e.message}`,
  );
}

let movements = [];
try {
  let selectedMovementResponse = null;
  const maxAccountSelectionAttempts = 3;
  let movementsWaitStartedAt = 0;
  for (let accountAttempt = 1; accountAttempt <= maxAccountSelectionAttempts; accountAttempt++) {
    if (accountAttempt > 1) {
      debug("empresas_card_retry_start", { accountAttempt });
      debug("product_cards_dom_snapshot", {
        snapshot: await snapshotProductCardsDom(
          `before_empresas_click_retry_${accountAttempt}`,
        ),
      });
      const empresasSelection = await selectMidineroEmpresasCard(
        `retry_${accountAttempt}`,
      );
      capturedMovements = null;
      movementResponses.length = 0;
      debug("empresas_card_retry_done", empresasSelection);
      debug("product_cards_dom_snapshot", {
        snapshot: await snapshotProductCardsDom(
          `after_empresas_click_retry_${accountAttempt}`,
        ),
      });
      await page.waitForTimeout(1_500);
    }

    await page.waitForSelector(sel_ingresos_button, { timeout: 10_000 });
    debug("ingresos_click_start", { accountAttempt });
    movementsWaitStartedAt = Date.now();
    await page.click(sel_ingresos_button);
    debug("ingresos_click_done", { accountAttempt });

    // Al cambiar a EMPRESAS la SPA puede emitir primero una respuesta vacía de
    // otra cuenta. Esperamos una respuesta con movimientos y elegimos la mejor
    // candidata del intervalo, en vez de tomar la primera que llegue.
    selectedMovementResponse = null;
    const minWaitMs = 8_000;
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      const candidates = movementResponses.filter(
        (candidate) => candidate.capturedAt >= movementsWaitStartedAt,
      );
      if (candidates.length > 0) {
        selectedMovementResponse = candidates.reduce((best, candidate) => {
          const bestCount = Array.isArray(best.movements)
            ? best.movements.length
            : -1;
          const candidateCount = Array.isArray(candidate.movements)
            ? candidate.movements.length
            : -1;
          return candidateCount >= bestCount ? candidate : best;
        }, candidates[0]);
      }

      const selectedCount = Array.isArray(selectedMovementResponse?.movements)
        ? selectedMovementResponse.movements.length
        : 0;
      if (selectedCount > 0 && Date.now() - movementsWaitStartedAt >= minWaitMs) {
        break;
      }

      await new Promise((r) => setTimeout(r, 300));
    }

    if (!selectedMovementResponse) {
      debug("movements_attempt_no_response", { accountAttempt });
      continue;
    }

    movements = selectedMovementResponse.movements;
    const selectedCount = Array.isArray(movements) ? movements.length : 0;
    debug("movements_attempt_done", {
      accountAttempt,
      count: selectedCount,
      accountNumber: selectedMovementResponse.accountNumber,
      url: selectedMovementResponse.url,
    });
    if (selectedCount > 0) break;
  }

  if (!selectedMovementResponse)
    throw new Error("getMovements API no detectada en 25s");

  debug("movements_selected_for_processing", {
    count: Array.isArray(movements) ? movements.length : null,
    accountNumber: selectedMovementResponse.accountNumber,
    url: selectedMovementResponse.url,
    candidateCount: movementResponses.filter(
      (candidate) => candidate.capturedAt >= movementsWaitStartedAt,
    ).length,
    firstMovement: Array.isArray(movements) ? summarizeMovement(movements[0]) : null,
    lastMovement: Array.isArray(movements)
      ? summarizeMovement(movements[movements.length - 1])
      : null,
  });
} catch (e) {
  debug("movements_fetch_failed", { message: e.message });
  throw new Error(
    `movements_fetch_failed: could not load the Ingresos transaction list — ${e.message}`,
  );
}

if (!Array.isArray(movements) || movements.length === 0) {
  debug("movements_empty_or_invalid", { isArray: Array.isArray(movements) });
  throw new Error(
    "movements_empty_after_account_selection: getMovements returned no movements after waiting for account data",
  );
}

// Filtrar movimientos de hoy y luego quedarnos solo con ingresos, que son los
// que tienen icono de detalle en la tabla de Ingresos.
const todayStr = getMontevideoDateString(); // 'YYYY-MM-DD'
const movementsBeforeTodayFilter = movements;
const todayMovements = movements.filter(
  (m) => m.date && m.date.startsWith(todayStr),
);
debug("movements_filtered_today", {
  todayStr,
  timezone: "America/Montevideo",
  beforeCount: movementsBeforeTodayFilter.length,
  afterCount: todayMovements.length,
  kept: todayMovements.map(summarizeMovement),
});

if (todayMovements.length === 0) {
  debug("no_today_movements");
  return [];
}

const incomingMovements = todayMovements.filter(
  (m) => (m.amount?.amount ?? 0) > 0,
);
debug("incoming_movements_filtered", {
  beforeCount: todayMovements.length,
  afterCount: incomingMovements.length,
  kept: incomingMovements.map(summarizeMovement),
});

if (incomingMovements.length === 0) {
  debug("no_incoming_movements");
  return [];
}

const transactions = [];
try {
  await page.waitForSelector(sel_tx_row, { timeout: 10_000 });
  const visibleRows = await page.$$eval(sel_tx_row, (rows) =>
    rows.map((row, index) => ({
      index,
      text: row.textContent?.replace(/\s+/g, " ").trim().slice(0, 500),
    })),
  );
  const incomingRows = await getIncomingRows();
  const incomingRowsForProcessing = incomingRows.slice(
    0,
    incomingMovements.length,
  );
  debug("detail_iteration_start", {
    incomingMovementCount: incomingMovements.length,
    incomingRowCount: incomingRows.length,
    tableRowCount: visibleRows.length,
    incomingRowsForProcessing: incomingRowsForProcessing.map(summarizeRow),
    incomingRowsPreviewAfterProcessing: incomingRows
      .slice(incomingMovements.length, incomingMovements.length + 5)
      .map(summarizeRow),
    visibleRowsPreview: visibleRows.slice(0, 60),
  });

  if (incomingRows.length < incomingMovements.length) {
    throw new Error(
      `incoming_row_count_mismatch: ${incomingRows.length} positive clickable rows for ${incomingMovements.length} incoming movements`,
    );
  }

  for (let i = 0; i < incomingMovements.length; i++) {
    const movement = incomingMovements[i];
    const incomingRow = incomingRows[i];
    if (!movement) continue;
    debug("detail_iteration_item_start", {
      index: i,
      row: {
        domIndex: incomingRow?.domIndex,
        text: incomingRow?.text,
      },
      movement: summarizeMovement(movement),
    });

    debug("detail_icon_click_start", {
      index: i,
      row: {
        domIndex: incomingRow?.domIndex,
        text: incomingRow?.text,
      },
      movement: summarizeMovement(movement),
    });

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("transferDetail") && r.status() === 200,
        { timeout: 60_000 },
      ),
      incomingRow.icon.click(),
    ]);

    const detail = await response.json();
    debug("detail_wait_response_done", {
      index: i,
      url: response.url(),
      row: {
        domIndex: incomingRow.domIndex,
        text: incomingRow.text,
      },
      movement: summarizeMovement(movement),
      detail: summarizeDetail(detail),
    });

    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(150);

    const comparison = validateDetailMatchesMovement(movement, detail);
    debug("detail_iteration_item_done", {
      index: i,
      row: {
        domIndex: incomingRow.domIndex,
        text: incomingRow.text,
      },
      movement: summarizeMovement(movement),
      detail: summarizeDetail(detail),
      comparison,
    });

    const externalId = String(detail.referenceNumber);
    if (
      context.lastExternalId &&
      externalId === String(context.lastExternalId)
    ) {
      debug("detail_iteration_break_last_external_id", {
        index: i,
        lastExternalId: context.lastExternalId,
        movement: summarizeMovement(movement),
        detail: summarizeDetail(detail),
      });
      break;
    }

    const amountValue = movement.amount?.amount ?? 0;
    debug("transaction_build_item_start", {
      movement: summarizeMovement(movement),
      detail: summarizeDetail(detail),
      comparison,
    });

    const currency = normalizeCurrency(movement.amount?.currency?.symbol ?? "");
    const hashSource = `${amountValue}|${movement.date}|${externalId}`;
    const referenceHash = await sha256(hashSource);
    const transaction = {
      externalId,
      referenceHash,
      amount: amountValue,
      currency,
      senderName: detail.accountOriginName || undefined,
      receivedAt: new Date(`${movement.date}-03:00`),
      raw: { movement, detail, validation: comparison },
    };
    transactions.push(transaction);
    debug("transaction_build_item_done", {
      externalId: transaction.externalId,
      senderName: transaction.senderName,
      amount: transaction.amount,
      currency: transaction.currency,
      movement: summarizeMovement(movement),
      detail: summarizeDetail(detail),
      comparison,
    });
  }
} catch (e) {
  debug("detail_extraction_failed", { message: e.message });
  throw new Error(
    `detail_extraction_failed: error iterating transaction rows — ${e.message}`,
  );
}

debug("script_done", {
  transactionCount: transactions.length,
  transactions: transactions.map((tx) => ({
    externalId: tx.externalId,
    senderName: tx.senderName,
    amount: tx.amount,
    currency: tx.currency,
    receivedAt: tx.receivedAt,
  })),
});

return transactions;
