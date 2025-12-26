// content.js

console.log("[DailySale] content script loaded");

const SALES_URL = "https://www.etsy.com/your/shops/me/sales-discounts";
const LICENSE_API_BASE = "https://api.dailysale.app/api/license";

let esmLicenseCache = {
  valid: false,
  plan: null,
  remainingRuns: 0,
  remainingCredits: 0,
  creditsPerRun: 1,
  lastChecked: 0, // timestamp
};

function isOnSalesPromotionsPage() {
  // we consider the "needed" page to be the Promotions tab, not Details & Stats
  const href = window.location.href;
  return (
      href.startsWith(SALES_URL) &&
      !href.startsWith(SALES_URL + "/details-stats")
  );
}

function isOnShopManager() {
  //return window.location.href.includes("/your/shops/");
  return window.location.href.includes("/your/shops/me/sales-discounts");
}

// ---------- Helpers ----------

function waitForSelector(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const el = document.querySelector(selector);
      // console.log("CHECK (sel, el): ", selector, el);
      if (el) return resolve(el);
      if (Date.now() - start > timeout) {
        return reject(new Error("Timeout waiting for " + selector));
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function findButtonByText(textArray) {
  const buttons = Array.from(document.querySelectorAll("button, a"));
  for (const t of textArray) {
    const btn = buttons.find((b) =>
        b.innerText.trim().toLowerCase().includes(t.toLowerCase())
    );
    if (btn) return btn;
  }
  return null;
}

function getMonthAbbr(date) {
  return date.toLocaleString("en-US", { month: "short" }).toUpperCase(); // e.g. NOV
}



function setInputValue(el, value) {
  if (!el) return;
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setSelectValue(el, value) {
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function isoToUSDate(iso) {
  // "2025-11-26" -> "11/26/2025"
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function formatLocalYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ensureEsmStyles() {
  if (document.getElementById("esm-styles")) return;

  const style = document.createElement("style");
  style.id = "esm-styles";
  style.textContent = `
    #esm-panel {
      max-width: 360px;
    }
    #esm-panel .esm-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed; /* forces columns to fit panel width */
    }
    #esm-panel .esm-table th,
    #esm-panel .esm-table td {
      padding: 4px 6px;
      font-size: 11px;
      word-wrap: break-word;
    }
    #esm-panel .esm-sale-name {
      font-weight: 600;
    }
    #esm-panel .esm-sale-meta {
      font-size: 10px;
      color: #666;
    }
    #esm-panel .esm-sale-status {
      display: inline-block;
      margin-top: 2px;
      font-size: 10px;
    }
    #esm-panel .esm-remove-btn {
      border: none;
      background: none;
      cursor: pointer;
      font-size: 12px;
      padding: 0;
      color: #b91c1c;
    }
    #esm-panel .esm-remove-btn:hover {
      color: #ef4444;
    }
    
    #esm-panel #esm-header-right {
      margin-left: auto;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    #esm-panel .esm-link-btn {
      background: none;
      border: none;
      padding: 0;
      font-size: 11px;
      text-decoration: underline;
      cursor: pointer;
      color: #2563eb;
    }
  `;
  document.head.appendChild(style);
}

async function removeSaleById(id) {
  const sales = await loadSales();
  const filtered = sales.filter((s) => s.id !== id);
  await saveSales(filtered);
}


// ---------- Storage layer ----------

async function loadSales() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["esmSales"], (data) => {
      resolve(data.esmSales || []);
    });
  });
}

async function saveSales(sales) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ esmSales: sales }, () => resolve());
  });
}

async function updateSaleStatus(id, updater) {
  const sales = await loadSales();
  const idx = sales.findIndex((s) => s.id === id);
  if (idx !== -1) {
    sales[idx] = { ...sales[idx], ...updater(sales[idx]) };
    await saveSales(sales);
  }
}

// ----- License ----

function loadLicenseKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["esmLicenseKey"], (data) => {
      resolve(data.esmLicenseKey || "");
    });
  });
}

function saveLicenseKey(key) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ esmLicenseKey: key }, () => resolve());
  });
}

/**
 * Check license on server and optionally consume runs.
 * requestedRuns = how many sales you’re about to create (e.g. numDays).
 */
async function checkLicenseOnServer(requestedRuns = 0) {
  const key = await loadLicenseKey();
  if (!key) {
    throw new Error(
        "No license key set. Open the Sale Manager panel and enter your license key first."
    );
  }

  // Simple cache: if we checked within last 60 sec & requestedRuns=0, reuse
  const now = Date.now();
  if (
      requestedRuns === 0 &&
      esmLicenseCache.lastChecked &&
      now - esmLicenseCache.lastChecked < 60_000
  ) {
    if (!esmLicenseCache.valid) {
      throw new Error("License is invalid or disabled.");
    }
    return esmLicenseCache;
  }
  //console.log(`${LICENSE_API_BASE}/check-and-consume`);

  try {
    const res = await fetch(`${LICENSE_API_BASE}/check-and-consume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key,
        requestedRuns, // how many sales we plan to create
        // you can add extra info if needed:
        // clientId: chrome.runtime.id,
        // extensionVersion: chrome.runtime.getManifest().version,
      }),
    });


    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data?.message || "License check failed.";
      throw new Error(msg);
    }
    // expected shape: { valid, plan, remainingRuns, remainingCredits, creditsPerRun, message? }
    esmLicenseCache = {
      valid: !!data.valid,
      plan: data.plan || null,
      remainingRuns: data.remainingRuns ?? 0,
      remainingCredits: data.remainingCredits ?? 0,
      creditsPerRun: data.creditsPerRun ?? 1,
      lastChecked: Date.now(),
    };

    if (!esmLicenseCache.valid) {
      throw new Error(data.message || "License is invalid or disabled.");
    }
    return esmLicenseCache;
  } catch (e) {
    const msg = e?.message || "License check failed.";
    throw new Error(msg);
  }
}


// ---------- Panel UI ----------

async function createPanel() {
  if (!isOnShopManager()) return;
  if (document.getElementById("esm-panel")) return;

  const onNeededPage = isOnSalesPromotionsPage();

  const panel = document.createElement("div");
  panel.id = "esm-panel";

  // Navigation section: only when NOT on needed page
  const navigationSection = !onNeededPage
      ? `
      <div class="esm-section">
        <div class="esm-section-title">1. Navigation</div>
        <div class="esm-small">
          You are not on the Sales & Discounts → Promotions page yet.
        </div>
        <button id="esm-go-sales" class="esm-btn secondary">Go to Sales & Discounts</button>
      </div>

      <hr/>
    `
      : ""; // nothing when we're already on Promotions tab

  panel.innerHTML = `
    <div id="esm-panel-header">
      <h3>Sale Manager</h3>
       <div id="esm-header-right">
        <button id="esm-license-toggle" class="esm-link-btn" type="button">Credits</button>
        <button id="esm-close-btn" title="Hide">×</button>
      </div>
    </div>
    <div id="esm-panel-body">
      
      <div id="esm-license-section" class="esm-section">
        <div class="esm-section-title">Account & Credits</div>
        <div class="esm-small">
          Enter your license key to load your credit balance. Each new sale day uses credits.
        </div>
        <div class="esm-input-row">
          <input id="esm-license-key" type="text" placeholder="XXXX-XXXX-XXXX" />
          <button id="esm-save-license" class="esm-btn secondary">Save & Check</button>
        </div>
        <div class="esm-small">
          <a href="https://dailysale.app" target="_blank" rel="noopener noreferrer">
            Refill credits
          </a>
        </div>
        <div id="esm-license-status" class="esm-small"></div>
        <hr/>
      </div>

      
      ${navigationSection}

      <div class="esm-section">
        <div class="esm-section-title">${onNeededPage ? "1." : "2."} Your latest sales</div>
        <div class="esm-small">
          Shows the most recent sale per scope (Whole shop or each section) created via this extension.
        </div>
        <div id="esm-sales-table-wrapper"></div>
      </div>

      <hr/>

      <div class="esm-section">
        <div class="esm-section-title">${onNeededPage ? "2." : "3."} Create sale(s)</div>
        <div class="esm-small">
          Set discount, scope, start date and number of days.
          The extension will create one Etsy sale per day in sequence.
          
          Will generate sale names like <code>DS25DEC01P20ALL</code>, where <code>DS&lt;Year&gt;&lt;Month&gt;&lt;Day&gt;P&lt;Proc%&gt;&lt;Name&gt;</code>. 
        </div>

        <div class="esm-input-row">
          %<input id="esm-percent" type="number" min="5" max="90" value="20" />
          <select id="esm-scope">
            <option value="ALL">Whole shop</option>
            <option value="SECTION">By section</option>
          </select>
        </div>

        <div class="esm-input-row">
          <input id="esm-scope-name" type="text" placeholder="Section name (or part of it)" />
        </div>

        <div class="esm-input-row">
          Days:<input id="esm-days" type="number" min="1" max="30" value="1" title="How many separate sales to create (1 per day)" />
          <input id="esm-sale-length" type="hidden" value="1" />
          Start: <input id="esm-start-date" type="date" />
        </div>

        <button id="esm-run-one" class="esm-btn">
          Run sale${onNeededPage ? "(s)" : "(s)"} now
        </button>
        ${
      !onNeededPage
          ? `<div class="esm-small">To actually create sales automatically, open the Sales & Discounts → Promotions page first.</div>`
          : ""
  }
      </div>
    </div>
  `;

  document.body.appendChild(panel);
  document.getElementById("esm-close-btn").onclick = () => panel.remove();
  const licenseSection = document.getElementById("esm-license-section");
  const licenseToggle = document.getElementById("esm-license-toggle");

  function setLicenseSectionVisible(visible) {
    if (!licenseSection) return;
    licenseSection.style.display = visible ? "" : "none";
  }

  if (licenseToggle) {
    licenseToggle.addEventListener("click", () => {
      if (!licenseSection) return;
      const isHidden =
          licenseSection.style.display === "none" ||
          getComputedStyle(licenseSection).display === "none";
      setLicenseSectionVisible(isHidden);
    });
  }
  // LICENSE UI logic
  const licenseInput = document.getElementById("esm-license-key");
  const licenseStatusEl = document.getElementById("esm-license-status");
  const saveLicenseBtn = document.getElementById("esm-save-license");

  // Load stored key into input
  loadLicenseKey().then(async (storedKey) => {
    if (licenseInput && storedKey) {
      licenseInput.value = storedKey;
    }

    // No key => show license block
    if (!storedKey) {
      setLicenseSectionVisible(true);
      return;
    }

    // Have key => auto-check with server
    licenseStatusEl.textContent = "Checking credits...";
    try {
      const info = await checkLicenseOnServer(0);
      licenseStatusEl.textContent = `✅ Credits: ${info.remainingCredits} (${info.remainingRuns} runs available, ${info.creditsPerRun} credits/run)`;
      // Hide block by default when license is valid
      setLicenseSectionVisible(false);
    } catch (e) {
      console.error("[DailySale] auto license check error", e);
      licenseStatusEl.textContent = `❌ ${
          e.message || "Account invalid or server error."
      }`;
      setLicenseSectionVisible(true);
    }
  });

  if (saveLicenseBtn) {
    saveLicenseBtn.onclick = async () => {
      const key = (licenseInput?.value || "").trim();
      if (!key) {
        alert("Please paste your license key first.");
        return;
      }
      await saveLicenseKey(key);
      licenseStatusEl.textContent = "Checking credits...";
      try {
        const info = await checkLicenseOnServer(0);
        licenseStatusEl.textContent = `✅ Credits: ${info.remainingCredits} (${info.remainingRuns} runs available, ${info.creditsPerRun} credits/run)`;
        setLicenseSectionVisible(false);
      } catch (e) {
        console.error("[DailySale] license error", e);
        licenseStatusEl.textContent = `❌ ${e.message || "Account invalid or server error."}`;
        setLicenseSectionVisible(true);
      }
    };
  }

  document.getElementById("esm-close-btn").onclick = () => panel.remove();

  const goSalesBtn = document.getElementById("esm-go-sales");
  if (goSalesBtn) {
    goSalesBtn.onclick = () => {
      window.location.href = SALES_URL;
    };
  }

  document.getElementById("esm-run-one").onclick = onRunSingleNow;

  // default start date = tomorrow
  const startDateInput = document.getElementById("esm-start-date");
  if (startDateInput && !startDateInput.value) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    startDateInput.value = d.toISOString().slice(0, 10);
  }

  await renderSalesTable();
}

// NEW: helper to apply a saved sale into the form in section 2
function applySaleToForm(sale) {
  const percentInput = document.getElementById("esm-percent");
  if (percentInput) percentInput.value = sale.percent;

  const scopeSelect = document.getElementById("esm-scope");
  if (scopeSelect) scopeSelect.value = sale.scope;

  const scopeNameInput = document.getElementById("esm-scope-name");
  if (scopeNameInput) {
    scopeNameInput.value = sale.scope === "SECTION" ? sale.scopeName : "";
  }

  const daysInput = document.getElementById("esm-days");
  if (daysInput) daysInput.value = 10; // continue next 10 days

  const startDateInput = document.getElementById("esm-start-date");
  if (startDateInput) {
    // continue from the day AFTER this sale ends
    const lastEnd = new Date(sale.endDate + "T00:00:00");
    lastEnd.setDate(lastEnd.getDate() + 1);
    startDateInput.value = formatLocalYMD(lastEnd);
  }

  const runBtn = document.getElementById("esm-run-one");
  if (runBtn) {
    runBtn.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

async function renderSalesTable() {
  const wrapper = document.getElementById("esm-sales-table-wrapper");
  if (!wrapper) return;

  const sales = await loadSales();
  if (!sales.length) {
    wrapper.innerHTML = `<div class="esm-small">No sales recorded yet.</div>`;
    return;
  }

  // Keep only the latest sale per (scope + scopeName)
  const latestByScope = {};
  for (const s of sales) {
    const key = `${s.scope}:${s.scopeName || "ALL"}`;
    const existing = latestByScope[key];
    if (!existing) {
      latestByScope[key] = s;
    } else {
      const a = new Date(s.startDate);
      const b = new Date(existing.startDate);
      if (a >= b) {
        latestByScope[key] = s;
      }
    }
  }

  const latestList = Object.values(latestByScope).sort(
      (a, b) => new Date(b.startDate) - new Date(a.startDate)
  );

  // Compact table: 4 columns, extra info inside cells
  const rows = latestList
      .map(
          (s) => `
      <tr data-esm-id="${s.id}">
        <td>
          <div class="esm-sale-name">${s.name}</div>
          <div class="esm-sale-meta">${s.startDate} → ${s.endDate}</div>
        </td>
        <td>${s.percent}%</td>
        <td>
          ${s.scope}${s.scopeName ? ` (${s.scopeName})` : ""}
          <div class="esm-sale-status ${s.status}">
            ${s.status}
          </div>
        </td>
        <td style="text-align:center;">
          <button class="esm-remove-btn" data-esm-remove="${s.id}" title="Remove from list">✕</button>
        </td>
      </tr>
    `
      )
      .join("");

  wrapper.innerHTML = `
    <table class="esm-table">
      <thead>
        <tr>
          <th>Sale</th>
          <th>%</th>
          <th>Scope</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;


  // Make row click apply sale to form
  const rowEls = wrapper.querySelectorAll("tbody tr");
  rowEls.forEach((tr, idx) => {
    const sale = latestList[idx];
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => applySaleToForm(sale));
  });

  // Wire up Remove buttons (and stop row-click from firing)
  wrapper.querySelectorAll("button[data-esm-remove]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-esm-remove");
      await removeSaleById(id);
      await renderSalesTable();
    });
  });
}


// ---------- Run sale(s) now ----------

async function onRunSingleNow() {
  if (!isOnSalesPromotionsPage()) {
    alert(
        "To create sales automatically, open Shop Manager → Marketing → Sales & Discounts → Promotions first."
    );
    return;
  }

  const percent = Number(document.getElementById("esm-percent").value || "0");
  const scope = document.getElementById("esm-scope").value;
  const scopeNameRaw =
      document.getElementById("esm-scope-name").value.trim() || "ALL";
  const saleLength = Number(
      document.getElementById("esm-sale-length").value || "1"
  );
  const startDateStr = document.getElementById("esm-start-date").value;
  const numDays = Number(document.getElementById("esm-days").value || "1");

  if (!percent || percent <= 0) return alert("Enter discount percent");
  if (!startDateStr) return alert("Set start date");
  if (!numDays || numDays <= 0) return alert("Days must be at least 1");

  // 🔐 LICENSE CHECK: ask server if this many runs is allowed
  try {
    const info = await checkLicenseOnServer(numDays);
    //console.log("[DailySale] license OK", info);
  } catch (e) {
    console.error("[DailySale] license error", e);
    alert(
        e.message ||
        "License check failed. Please verify your key or contact support."
    );
    return; // stop here
  }

  const baseStart = new Date(startDateStr + "T00:00:00");
  const nameScope = scopeNameRaw.toUpperCase().replace(/[^A-Z0-9]/g, "");

  const allSales = await loadSales();

  for (let i = 0; i < numDays; i++) {
    const startDate = new Date(baseStart);
    startDate.setDate(startDate.getDate() + i);

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + saleLength - 1);

    const abbr = getMonthAbbr(startDate);
    const dayNum = String(startDate.getDate()).padStart(2, "0");
    const YearNum = String(startDate.getUTCFullYear()).slice(2);
    //console.log("YearNum:", YearNum);
    //console.log("YearNum:", YearNum);
    //const name = `SALE${abbr}${dayNum}P${percent}${nameScope}`;
    const name = `DS${YearNum}${abbr}${dayNum}P${percent}${nameScope}`;

    // Will generate sale names like <code>DS25DEC01P20ALL</code>, where <code>DS&lt;Year&gt;&lt;Month&gt;&lt;Day&gt;P&lt;Proc%&gt;&lt;Name&gt;</code>.

    const sale = {
      id: `multi-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      percent,
      scope,
      scopeName: nameScope,
      startDate: formatLocalYMD(startDate),
      endDate: formatLocalYMD(endDate),
      saleLengthDays: saleLength,
      status: "pending",
      created: false,
      cancelled: false,
    };

    allSales.push(sale);

    //console.log("[DailySale] Running sale:", sale);
    try {
      await runSingleSaleAutomation(sale);
    } catch (e) {
      console.error("Sale automation error", sale.name, e);
      alert(`Sale creation failed for ${sale.name}. Check console for details.`);
      // continue with next day, don't break
    }
  }

  await saveSales(allSales);
  await renderSalesTable();
  alert(`Done. Sales set for ${numDays} day(s).`);
}

// ---------- core automation ----------

async function runSingleSaleAutomation(sale) {
  console.log("[DailySale] running automation for", sale.name, sale);

  const createHref = "/your/shops/me/sales-discounts/step/createSale";

  // 1. Make sure we're on the "Set up a sale" page
  if (!location.pathname.includes("/sales-discounts/step/createSale")) {
    let createLink =
        document.querySelector(`a[href*="${createHref}"]`) ||
        findButtonByText(["Run a sale", "Set up", "Create sale"]);

    if (!createLink) {
      alert(
          "Could not find 'Run a sale / Set up a sale' link. Scroll to the card and try again."
      );
      throw new Error("create sale button not found");
    }

    createLink.click();
  }

  // 1) Wait until the basic controls exist (the percentage dropdown)
  await waitForSelector("#reward-percentage");
  //console.log("[DailySale] First step basic controls ready");

  //
  // STEP 1: Customize your sale
  //

  // discount type (left select) -> "Percentage off"
  const discountTypeSelect = document.querySelector("#what-discount");
  if (discountTypeSelect) {
    setSelectValue(discountTypeSelect, "percent");
  }

  // percentage type (right select) -> "Custom"
  const percentTypeSelect = document.querySelector("#reward-percentage");
  if (percentTypeSelect) {
    const customOpt = Array.from(percentTypeSelect.options).find((o) =>
        o.textContent.toLowerCase().includes("custom")
    );
    if (customOpt) {
      percentTypeSelect.value = customOpt.value;
      percentTypeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // Wait until the first step inputs exist
  await waitForSelector(
      'input[name="reward_type_percent_input"], input[aria-label="Percentage off"]'
  );
  //console.log("[ESM] First step form ready");

  // percentage value input
  const percentInput =
      document.querySelector('input[name="reward_type_percent_input"]') ||
      document.querySelector('input[aria-label="Percentage off"]');
  if (percentInput) {
    setInputValue(percentInput, String(sale.percent));
  }

  // date inputs: they are text inputs with data-datepicker-input="true"
  const dateInputs = document.querySelectorAll(
      'input[data-datepicker-input="true"]'
  );
  if (dateInputs.length >= 2) {
    const [startInput, endInput] = dateInputs;
    setInputValue(startInput, isoToUSDate(sale.startDate));
    setInputValue(endInput, isoToUSDate(sale.endDate));
  }

  // terms & conditions textarea (optional) - keep empty or set custom text
  const textarea =
      document.querySelector("textarea[name='description']") ||
      document.querySelector("textarea");
  if (textarea) {
    setInputValue(textarea, ``);
  }

  // sale name input
  const nameInput =
      document.querySelector("#name-your-coupon") ||
      document.querySelector('input[name="promo_name"]') ||
      document.querySelector("input[type='text'][maxlength]");
  if (nameInput) {
    setInputValue(nameInput, sale.name);
  }

  // Continue button
  let continueBtn = findButtonByText(["Continue"]);
  if (!continueBtn) {
    alert("Could not find 'Continue' button on first step.");
    throw new Error("continue button not found");
  }
  continueBtn.click();

  //
  // STEP 2: Which listings are included?
  //

  await sleep(800);
  await waitForSelector("h1, h2, legend"); // just ensure step changed
  //console.log("[ESM] Second step ready");

  // choose scope radio
  const labels = Array.from(document.querySelectorAll("label"));

  if (sale.scope === "ALL") {
    const allLabel = labels.find((l) =>
        l.textContent.trim().toLowerCase().includes("all listings")
    );
    if (allLabel) allLabel.click();
  } else {
    const selectLabel = labels.find((l) =>
        l.textContent.trim().toLowerCase().includes("select listings")
    );
    if (selectLabel) selectLabel.click();

    if (sale.scope === "SECTION" && sale.scopeName) {
      await sleep(1000);

      let sectionBtn = Array.from(
          document.querySelectorAll(
              'button[data-dropdown-button="true"], button'
          )
      ).find((b) =>
          b.innerText
              .trim()
              .toLowerCase()
              .includes("add listings by shop section")
      );

      if (!sectionBtn) {
        console.warn(
            "[DailySale] Section dropdown button not found; maybe DOM changed."
        );
      } else {
        sectionBtn.click();

        // wait for the dropdown menu to appear
        await waitForSelector(
            'div[data-dropdown-target="true"][role="menu"]'
        );
        await sleep(600);

        const items = Array.from(
            document.querySelectorAll('li[role="presentation"]')
        );

        const targetLi = items.find((el) =>
            el.textContent
                .trim()
                .toUpperCase()
                .startsWith(sale.scopeName.toUpperCase())
        );

        if (targetLi) {
          const clickable = targetLi.querySelector('[role="menuitem"]');
          if (clickable) {
            clickable.click();
            await sleep(600);
            //console.log("[DailySale] Selected section:", sale.scopeName);
          } else {
            console.warn(
                "[DailySale] No clickable menuitem inside target:",
                targetLi
            );
          }
        } else {
          console.warn(
              "[DailySale] Section not found:",
              sale.scopeName,
              items.map((i) => i.textContent.trim())
          );
        }
      }
    }
  }

  // "Review and confirm"
  await sleep(500);
  let reviewBtn = findButtonByText(["Review and confirm", "Review"]);
  if (!reviewBtn) {
    alert("Could not find 'Review and confirm' button.");
    throw new Error("review button not found");
  }
  reviewBtn.click();

  //
  // STEP 3: Final confirm
  //

  await sleep(1200);
  //console.log("[DailySale] Final confirm step");

  let finalBtn = Array.from(
      document.querySelectorAll(
          "button[type='button'], button[type='submit'], button"
      )
  ).find((b) => {
    const t = b.innerText.trim().toLowerCase();
    return (
        t.includes("create sale") ||
        t.includes("start sale") ||
        t.includes("confirm") ||
        t.includes("schedule")
    );
  });
  if (!finalBtn) {
    finalBtn = findButtonByText([
      "Create sale",
      "Start sale",
      "Confirm",
      "Schedule",
    ]);
  }
  if (finalBtn) {
    finalBtn.click();
  } else {
    console.warn(
        "[DailySale] Could not find final confirm button – maybe Etsy auto-created after review."
    );
  }

  // Wait for the success overlay and click "Done"
  await sleep(1500); // give Etsy a moment to create the overlay

  try {
    const successContent = document.querySelector(
        'div[data-test-id="success-overlay"]'
    );
    if (successContent) {
      const modal = successContent.closest(".wt-overlay__modal");
      if (modal) {
        const doneBtn = Array.from(modal.querySelectorAll("button")).find(
            (b) => (b.innerText || b.textContent || "").trim().toLowerCase() === "done"
        );

        if (doneBtn) {
          //console.log("[DailySale] Clicking Done button:", doneBtn);
          doneBtn.click();
          await sleep(800);
        } else {
          console.warn("[DailySale] Done button not found inside success modal");
        }
      }
    } else {
      console.warn("[DailySale] Success overlay not found (maybe Etsy auto-closed it)");
    }
  } catch (e) {
    console.warn("[DailySale] Error while trying to close success overlay", e);
  }

  // Mark as created
  await updateSaleStatus(sale.id, () => ({
    status: "running",
    created: true,
  }));
  await renderSalesTable();
}

// ---------- init ----------

let esmLastUrl = location.href;

async function initOrUpdatePanel() {
  try {
    if (!isOnShopManager()) {
      const existing = document.getElementById("esm-panel");
      if (existing) existing.remove();
      return;
    }
    await createPanel();
  } catch (e) {
    console.error("[DailySale] init/update error", e);
  }
}

// run once
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initOrUpdatePanel);
} else {
  initOrUpdatePanel();
}

// watch SPA-style URL changes
const observer = new MutationObserver(() => {
  if (location.href !== esmLastUrl) {
    esmLastUrl = location.href;
    initOrUpdatePanel();
  }
});

observer.observe(document.body, { childList: true, subtree: true });
