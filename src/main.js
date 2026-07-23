const KEYBOARD_FILTERS = [{ usagePage: 0xff60, usage: 0x61 }];

const RAW_HID_REPORT_ID = 0;
const RAW_HID_PACKET_SIZE = 32;
const MAG_RAWHID_COMMAND_ID = 0x4d;
const VIA_UNHANDLED = 0xff;
const MAG_CHANNEL = 0x00;
const MAG_CMD_GET_INFO = 0x01;
const MAG_CMD_READ_BLOCK = 0x02;
const MAG_CMD_WRITE_BLOCK = 0x03;
const MAG_CMD_SAVE_BLOCK = 0x04;
const MAG_CMD_READ_D_CUR = 0x06;
const MAG_CMD_READ_ADC_CUR = 0x0D;
const MAG_CMD_GET_STATE = 0x07;
const MAG_CMD_SET_STATE = 0x08;
const MAG_CMD_CAL_CONTROL = 0x09;
const MAG_CMD_GET_CAL_STATE = 0x0A;
const MAG_CMD_READ_CAL_VIEW = 0x0B;
const MAG_CMD_RUN_PCB_CAL = 0x0C;
const MAG_CMD_READ_REALTIME_KEY = 0x0E;
const BLOCK_HEADER = 0x00;
const BLOCK_DYN = 0x01;
const BLOCK_CCL = 0x02;
const BLOCK_CAL = 0x03;
const BLOCK_LAYOUT = 0x04;
const BLOCK_LAYOUT_STATE = 0x05;
const BLOCK_IDX_VALID = 0x06;
const BLOCK_LAYOUT_LABEL = 0x07;
const BLOCK_SENSI_OFFSET = 0x08;
const SENSI_OFFSET_STAGE_COUNT = 5;
const SENSI_OFFSET_BLOCK_SIZE = SENSI_OFFSET_STAGE_COUNT * 2;
const MAX_PAYLOAD_SIZE = 25;
const REALTIME_LOG_SAMPLE_LIMIT = 12000;
const REALTIME_LAYOUT_UPDATE_MS = 500;
const LAYOUT_OPTION_COMMON = 0;
const LAYOUT_LABEL_LEN = 16;
const LAYOUT_LABEL_ENTRY_SIZE = 2 + LAYOUT_LABEL_LEN * 2;
const ADMIN_PASSWORD = "qmagk-admin";
const RANGE_STORAGE_KEY = "qmagkInputRanges";
const DEFAULT_PARAM_RANGES = {
  actPt: { label: "Actuation Point", min: 100, max: 2000 },
  actTrg: { label: "Actuation Trigger", min: 20, max: 2000 },
  rstPt: { label: "Reset Point", min: 100, max: 2000 },
  rstTrg: { label: "Reset Trigger", min: 20, max: 2000 },
  stroke: { label: "Stroke", min: 100, max: 5000 },
  cclTh: { label: "Cancel Threshold", min: 0, max: 1000 },
  realtimeInterval: { label: "Realtime Interval", min: 10, max: 1000 },
};

const CAL_ORIGIN_NONE = 0;
const CAL_ORIGIN_HW = 1;
const CAL_ORIGIN_SW = 2;
const CAL_SW_EXIT_QUIET_MS = 1800;

const STATUS_TEXT = new Map([
  [0, "OK"],
  [1, "ERROR"],
  [2, "BAD_COMMAND"],
  [3, "BAD_BLOCK"],
  [4, "BAD_LENGTH"],
]);

let activeDevice = null;
let pendingResponse = null;
let connectInProgress = false;
let lastInfo = null;
let lastLayoutEntries = [];
let lastDynParams = [];
let lastCclParams = [];
let lastCalParams = [];
let lastSensiOffsets = [];
let lastLayoutState = null;
let lastLayoutLabels = new Map();
let layoutStateDirty = false;
let selectedLayoutEntry = null;
let selectedProfileEntry = null;
let selectedCalibrationEntry = null;
let selectedRealtimeEntryIdx = null;
let calibrationLiveMode = false;
let calibrationLiveOrigin = CAL_ORIGIN_NONE;
let calibrationLiveTimerId = null;
let calibrationRefreshInFlight = false;
let calibrationTransitionPending = false;
let calibrationTransitionTarget = null;
let pcbCalRunning = false;
let selectionAnchorIdx = null;
let cancelPickMode = "trigger";
let selectedCancelTargetIdx;
let realtimeTimerId = null;
let realtimePolling = false;
let realtimeDcurValues = [];
let realtimeAdcValues = [];
let realtimePlotSamples = [];
let realtimeLogStartTimeMs = null;
let realtimeLastLayoutReadMs = 0;
let realtimePlotDirty = false;
let layoutReadPromise = null;
let cancelReadPromise = null;
let paramRanges = loadParamRanges();
const dirtyDynIndices = new Set();
const dirtyCclIndices = new Set();
let sensiOffsetDirty = false;
const selectedKeyIndices = new Set();
const selectedCancelKeyIndices = new Set();

const connectButton = document.querySelector("#connectButton");
const pingButton = document.querySelector("#pingButton");
const getInfoButton = document.querySelector("#getInfoButton");
const readHeaderButton = document.querySelector("#readHeaderButton");
const readLayoutButton = document.querySelector("#readLayoutButton");
const renderLayoutButton = document.querySelector("#renderLayoutButton");
const renderProfileButton = document.querySelector("#renderProfileButton");
const saveParam1Button = document.querySelector("#saveParam1Button");
const renderCalibrationButton = document.querySelector("#renderCalibrationButton");
const enterCalibrationButton = document.querySelector("#enterCalibrationButton");
const exitCalibrationButton = document.querySelector("#exitCalibrationButton");
const runPcbCalButton = document.querySelector("#runPcbCalButton");
const tabButtons = [...document.querySelectorAll("[data-tab-target]")];
const tabPanels = [...document.querySelectorAll("[data-tab]")];
const clearLogButton = document.querySelector("#clearLogButton");
const packetInput = document.querySelector("#packetInput");
const logList = document.querySelector("#logList");
const deviceDetails = document.querySelector("#deviceDetails");
const connectionStatus = document.querySelector("#connectionStatus");
const firmwareInfo = document.querySelector("#firmwareInfo");
const blockDump = document.querySelector("#blockDump");
const keyboardCanvas = document.querySelector("#keyboardCanvas");
const keyDetail = document.querySelector("#keyDetail");
const cancelKeyboardCanvas = document.querySelector("#cancelKeyboardCanvas");
const cancelKeyDetail = document.querySelector("#cancelKeyDetail");
const calibrationKeyboardCanvas = document.querySelector("#calibrationKeyboardCanvas");
const calibrationKeyDetail = document.querySelector("#calibrationKeyDetail");
const profileKeyboardCanvas = document.querySelector("#profileKeyboardCanvas");
const layoutOptionsPanel = document.querySelector("#layoutOptionsPanel");
const sensiOffsetStateDisplay = document.querySelector("#sensiOffsetStateDisplay");
const sensiOffsetStageSelect = document.querySelector("#sensiOffsetStageSelect");
const applySensiOffsetStageButton = document.querySelector("#applySensiOffsetStageButton");
const cancelStateDisplay = document.querySelector("#cancelStateDisplay");
const enableCancelButton = document.querySelector("#enableCancelButton");
const disableCancelButton = document.querySelector("#disableCancelButton");
const selectAllKeysButton = document.querySelector("#selectAllKeysButton");
const clearSelectionButton = document.querySelector("#clearSelectionButton");
const applyBulkParamButton = document.querySelector("#applyBulkParamButton");
const saveCclButton = document.querySelector("#saveCclButton");
const bulkInputs = {
  actPt: document.querySelector("#bulkActPt"),
  actTrg: document.querySelector("#bulkActTrg"),
  rstPt: document.querySelector("#bulkRstPt"),
  rstTrg: document.querySelector("#bulkRstTrg"),
  stroke: document.querySelector("#bulkStroke"),
};
const sensiOffsetInputs = Array.from({ length: SENSI_OFFSET_STAGE_COUNT }, (_, index) => document.querySelector(`#sensiOffsetStage${index}`));
const curveCanvas = document.querySelector("#curveCanvas");
const curveNote = document.querySelector("#curveNote");
const hallSensitivityInput = document.querySelector("#hallSensitivityInput");
const realtimeFluxSensitivityField = document.querySelector("#realtimeFluxSensitivityField");
const realtimeHallSensitivityInput = document.querySelector("#realtimeHallSensitivityInput");
const exportCurveCsvButton = document.querySelector("#exportCurveCsvButton");
const realtimeKeyboardCanvas = document.querySelector("#realtimeKeyboardCanvas");
const realtimePlotCanvas = document.querySelector("#realtimePlotCanvas");
const realtimeStatus = document.querySelector("#realtimeStatus");
const realtimeLogKeyId = document.querySelector("#realtimeLogKeyId");
const realtimeIntervalInput = document.querySelector("#realtimeIntervalInput");
const realtimeMetricSelect = document.querySelector("#realtimeMetricSelect");
const startRealtimeButton = document.querySelector("#startRealtimeButton");
const stopRealtimeButton = document.querySelector("#stopRealtimeButton");
const realtimeExportCsvButton = document.querySelector("#realtimeExportCsvButton");
const connectScreen = document.querySelector("#connectScreen");
const adminPasswordInput = document.querySelector("#adminPasswordInput");
const adminUnlockButton = document.querySelector("#adminUnlockButton");
const adminLoginStatus = document.querySelector("#adminLoginStatus");
const adminContent = document.querySelector("#adminContent");
let adminUnlocked = false;

function isSoftwareCalibrationActive() {
  return calibrationLiveMode && calibrationLiveOrigin === CAL_ORIGIN_SW;
}

function isCalibrationUiLocked() {
  return calibrationTransitionPending || isSoftwareCalibrationActive();
}

function getRealtimeMetric() {
  return ["adc", "flux"].includes(realtimeMetricSelect?.value) ? realtimeMetricSelect.value : "depth";
}

function getRealtimeMetricUnit() {
  const metric = getRealtimeMetric();
  if (metric === "adc") return "raw";
  if (metric === "flux") return "Gs";
  return "um";
}

function getRealtimeMetricLabel() {
  const metric = getRealtimeMetric();
  if (metric === "adc") return "ADC raw";
  if (metric === "flux") return "Flux [Gs]";
  return "Depth [um]";
}

function getRealtimeMetricCode() {
  return getRealtimeMetric() === "depth" ? 0 : 1;
}

function getHallSensorSensitivity(input = hallSensitivityInput, fallback = 2.5) {
  const value = Number.parseFloat(input?.value);
  if (Number.isFinite(value) && value > 0) return Math.max(0.001, value);
  return fallback;
}

function calcFluxGauss(entryIdx, adcRaw) {
  const adcValue = Number(adcRaw);
  const refAdcVal = Number(lastCalParams[entryIdx]?.refAdcVal);
  const sensitivity = getHallSensorSensitivity(realtimeHallSensitivityInput, Number.NaN);
  if (!Number.isFinite(adcValue) || !Number.isFinite(refAdcVal) || !Number.isFinite(sensitivity)) return Number.NaN;
  return ((adcValue - refAdcVal) * 3300) / 4096 / sensitivity;
}

function formatRealtimeMetricValue(value) {
  if (!Number.isFinite(value)) return "-";
  return getRealtimeMetric() === "flux" ? value.toFixed(2) : formatParamValue(value);
}

function updateRealtimeFluxSensitivityVisibility() {
  const visible = getRealtimeMetric() === "flux";
  if (realtimeFluxSensitivityField) {
    realtimeFluxSensitivityField.hidden = !visible;
    realtimeFluxSensitivityField.classList.toggle("visible", visible);
    realtimeFluxSensitivityField.style.display = visible ? "grid" : "none";
  }
  if (realtimeHallSensitivityInput) {
    realtimeHallSensitivityInput.disabled = !visible || !activeDevice?.opened || Boolean(realtimeTimerId);
  }
}

function syncHallSensitivityInputs(sourceInput) {
  const value = sourceInput?.value ?? "";
  if (sourceInput !== hallSensitivityInput && hallSensitivityInput) {
    hallSensitivityInput.value = value;
  }
  if (sourceInput !== realtimeHallSensitivityInput && realtimeHallSensitivityInput) {
    realtimeHallSensitivityInput.value = value;
  }
}

function getRealtimeMetricValue(entryIdx, dcurValues, adcValues) {
  const metric = getRealtimeMetric();
  const adcValue = Number(adcValues?.[entryIdx]);
  if (metric === "adc") {
    return adcValue;
  }
  if (metric === "flux") {
    return calcFluxGauss(entryIdx, adcValue);
  }
  const stroke = Number(lastDynParams[entryIdx]?.stroke);
  const dcur = Number(dcurValues?.[entryIdx]);
  if (!Number.isFinite(stroke) || !Number.isFinite(dcur)) return Number.NaN;
  return stroke - dcur;
}

function niceCeil(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const fraction = value / base;
  if (fraction <= 1) return base;
  if (fraction <= 2) return 2 * base;
  if (fraction <= 5) return 5 * base;
  return 10 * base;
}

function niceTickStep(maxValue, targetTickCount = 5) {
  return niceCeil(maxValue / Math.max(1, targetTickCount));
}

function formatAxisLabel(value) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function setActiveTab(target) {
  if (isCalibrationUiLocked() && target !== "calibration") {
    log("キャリブレーション中は他のタブへ移動できません。", "warn");
    return;
  }
  tabButtons.forEach((button) => {
    const active = button.dataset.tabTarget === target;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle("tab-panel-hidden", panel.dataset.tab !== target);
  });
  document.querySelector(".workspace")?.classList.toggle("layout-mode", target === "layout" || target === "cancel" || target === "calibration" || target === "profile" || target === "realtime");
  if (target === "layout" && activeDevice?.opened && !lastLayoutEntries.length) {
    loadLayoutWithFeedback().catch((error) => log(error.message, "error"));
  }
  if (target === "cancel" && activeDevice?.opened && !lastCclParams.length) {
    ensureCancelLoaded().catch((error) => log(error.message, "error"));
  }
  if (target === "calibration" && activeDevice?.opened) {
    refreshCalibrationGui().catch((error) => log(error.message, "error"));
  }
  if (target !== "calibration") {
    stopCalibrationPolling();
  }
  if ((target === "layout" || target === "cancel") && activeDevice?.opened) {
    refreshRuntimeState().catch((error) => log(`Runtime state is not available: ${error.message}`, "warn"));
  }
  if (target === "profile" && activeDevice?.opened) {
    ensureLayoutLoaded()
      .then(() => {
        renderProfileLayout(lastLayoutEntries, lastLayoutState, selectedProfileEntry?.idx);
      })
      .catch((error) => log(error.message, "error"));
  }
  if (target === "realtime" && activeDevice?.opened) {
    ensureLayoutLoaded()
      .then(() => {
        if (!realtimeDcurValues.length && lastInfo?.matrixSize) {
          realtimeDcurValues = Array(lastInfo.matrixSize).fill(null);
          realtimeAdcValues = Array(lastInfo.matrixSize).fill(null);
        }
        renderRealtimeKeyboardLayout(lastLayoutEntries, lastLayoutState, realtimeDcurValues);
        renderRealtimePlot();
      })
      .catch((error) => log(error.message, "error"));
  }
}

function log(message, level = "info") {
  if (!logList) {
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](message);
    return;
  }
  const entry = document.createElement("li");
  entry.className = `log-entry ${level}`;
  entry.innerHTML = `<time>${new Date().toLocaleTimeString()}</time><span>${escapeHtml(message)}</span>`;
  logList.prepend(entry);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

function formatHex(value, width = 4) {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

function readU16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readU16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readI16LE(bytes, offset) {
  const value = readU16LE(bytes, offset);
  return value & 0x8000 ? value - 0x10000 : value;
}

function readFixedString(bytes, offset, length) {
  const end = offset + length;
  let actualEnd = offset;
  while (actualEnd < end && bytes[actualEnd] !== 0) actualEnd++;
  return new TextDecoder().decode(bytes.slice(offset, actualEnd));
}

function writeU16(bytes, offset, value) {
  bytes[offset] = (value >> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function writeU16LE(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
}

function clampU16(value) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return 0;
  return Math.max(0, Math.min(0xffff, number));
}

function loadParamRanges() {
  try {
    const saved = JSON.parse(localStorage.getItem(RANGE_STORAGE_KEY) || "{}");
    return Object.fromEntries(
      Object.entries(DEFAULT_PARAM_RANGES).map(([key, range]) => {
        const next = saved[key] || {};
        return [key, normalizeRange(next.min ?? range.min, next.max ?? range.max, range)];
      })
    );
  } catch {
    return structuredClone(DEFAULT_PARAM_RANGES);
  }
}

function normalizeRange(minValue, maxValue, fallback) {
  const min = clampU16(minValue);
  const max = clampU16(maxValue);
  if (min > max) return { ...fallback };
  return { ...fallback, min, max };
}

function confirmAction(message) {
  return window.confirm(message);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function saveParamRanges() {
  localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(paramRanges));
}

function clampByRange(key, value) {
  const range = paramRanges[key] || { min: 0, max: 0xffff };
  const number = clampU16(value);
  return Math.max(range.min, Math.min(range.max, number));
}

function applyParamRangesToInputs() {
  Object.entries(bulkInputs).forEach(([key, input]) => {
    const range = paramRanges[key];
    if (!input || !range) return;
    input.min = String(range.min);
    input.max = String(range.max);
  });
  const thInput = cancelKeyDetail?.querySelector("#bulkCclTh");
  if (thInput) {
    thInput.min = String(paramRanges.cclTh.min);
    thInput.max = String(paramRanges.cclTh.max);
  }
  if (realtimeIntervalInput && paramRanges.realtimeInterval) {
    realtimeIntervalInput.min = String(paramRanges.realtimeInterval.min);
    realtimeIntervalInput.max = String(paramRanges.realtimeInterval.max);
  }
}

function renderAdminRanges() {
  const adminRangeGrid = document.querySelector("#adminRangeGrid");
  if (!adminUnlocked || !adminRangeGrid) return;
  adminRangeGrid.replaceChildren();
  Object.entries(paramRanges).forEach(([key, range]) => {
    const row = document.createElement("label");
    row.innerHTML = `
      <span>${escapeHtml(range.label)}</span>
      <input data-range-key="${key}" data-range-bound="min" type="number" min="0" max="65535" step="1" value="${range.min}" />
      <input data-range-key="${key}" data-range-bound="max" type="number" min="0" max="65535" step="1" value="${range.max}" />
    `;
    adminRangeGrid.append(row);
  });
}

function applyAdminRanges() {
  const adminRangeGrid = document.querySelector("#adminRangeGrid");
  if (!adminUnlocked || !adminRangeGrid) return;
  const next = {};
  Object.keys(DEFAULT_PARAM_RANGES).forEach((key) => {
    const minInput = adminRangeGrid.querySelector(`[data-range-key="${key}"][data-range-bound="min"]`);
    const maxInput = adminRangeGrid.querySelector(`[data-range-key="${key}"][data-range-bound="max"]`);
    next[key] = normalizeRange(minInput?.value, maxInput?.value, DEFAULT_PARAM_RANGES[key]);
  });
  paramRanges = next;
  saveParamRanges();
  applyParamRangesToInputs();
  renderAdminRanges();
  log("Admin ranges updated.", "ok");
}

function unlockAdmin() {
  if (adminPasswordInput.value !== ADMIN_PASSWORD) {
    adminLoginStatus.textContent = "パスワードが違います。";
    log("Admin unlock failed.", "warn");
    return;
  }
  adminUnlocked = true;
  adminContent.classList.remove("tab-panel-hidden");
  adminLoginStatus.textContent = "Unlocked.";
  adminContent.innerHTML = `
    <section class="config-card admin-card">
      <h3>input range</h3>
      <div class="admin-range-grid" id="adminRangeGrid"></div>
      <div class="button-row">
        <button class="secondary-button" id="adminResetRangesButton" type="button">Reset default</button>
        <button class="primary-button" id="adminApplyRangesButton" type="button">Apply ranges</button>
      </div>
    </section>
    <section class="config-card admin-card">
      <h3>firmware coefficients</h3>
      <p class="empty">EP / WOB などのファームウェア係数編集は今後ここに追加します。</p>
    </section>
  `;
  renderAdminRanges();
  document.querySelector("#adminApplyRangesButton")?.addEventListener("click", applyAdminRanges);
  document.querySelector("#adminResetRangesButton")?.addEventListener("click", () => {
    paramRanges = structuredClone(DEFAULT_PARAM_RANGES);
    saveParamRanges();
    applyParamRangesToInputs();
    renderAdminRanges();
    log("Admin ranges reset.", "ok");
  });
}

function parseHexPacket(input) {
  const values = input
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((part) => Number.parseInt(part.replace(/^0x/i, ""), 16));

  if (values.some((value) => Number.isNaN(value) || value < 0 || value > 0xff)) {
    throw new Error("送信データは00からFFの16進数で入力してください。");
  }

  const packet = new Uint8Array(RAW_HID_PACKET_SIZE);
  packet.set(values.slice(0, RAW_HID_PACKET_SIZE));
  return packet;
}

function setActionButtonsEnabled(enabled) {
  if (pingButton) pingButton.disabled = !enabled;
  if (getInfoButton) getInfoButton.disabled = !enabled;
  if (readHeaderButton) readHeaderButton.disabled = !enabled;
  if (readLayoutButton) readLayoutButton.disabled = !enabled;
  if (renderLayoutButton) renderLayoutButton.disabled = !enabled;
  renderCalibrationButton.disabled = !enabled;
  enterCalibrationButton.disabled = !enabled;
  exitCalibrationButton.disabled = !enabled;
  renderProfileButton.disabled = !enabled;
  selectAllKeysButton.disabled = !enabled || !lastLayoutEntries.length;
  clearSelectionButton.disabled = !enabled || selectedKeyIndices.size === 0;
  applyBulkParamButton.disabled = !enabled || selectedKeyIndices.size === 0;
  startRealtimeButton.disabled = !enabled || Boolean(realtimeTimerId);
  stopRealtimeButton.disabled = !enabled || !realtimeTimerId;
  realtimeIntervalInput.disabled = !enabled || Boolean(realtimeTimerId);
  realtimeMetricSelect.disabled = !enabled || Boolean(realtimeTimerId);
  updateRealtimeFluxSensitivityVisibility();
  saveParam1Button.disabled = !enabled || (dirtyDynIndices.size === 0 && !sensiOffsetDirty);
  saveCclButton.disabled = !enabled || dirtyCclIndices.size === 0;
  renderSensiOffsetInputs();
  updateCalibrationActionButtons();
}

function updateCalibrationActionButtons() {
  const connected = Boolean(activeDevice?.opened);
  if (renderCalibrationButton) {
    renderCalibrationButton.disabled = !connected;
  }
  if (enterCalibrationButton) {
    enterCalibrationButton.disabled = !connected || calibrationLiveMode || calibrationTransitionPending;
  }
  if (exitCalibrationButton) {
    exitCalibrationButton.disabled = !connected || !isSoftwareCalibrationActive() || calibrationTransitionPending;
  }
  if (runPcbCalButton) {
    runPcbCalButton.disabled = !connected || calibrationLiveMode || calibrationTransitionPending || pcbCalRunning;
  }
}

function setConnected(device) {
  activeDevice = device;
  const isConnected = Boolean(device?.opened);

  document.body.classList.toggle("disconnected", !isConnected);
  connectScreen?.classList.toggle("tab-panel-hidden", isConnected);
  connectionStatus.classList.toggle("connected", isConnected);
  const deviceName = device?.productName || "接続デバイス";
  connectionStatus.innerHTML = `<span class="status-dot"></span><span>${isConnected ? deviceName : "未接続"}</span>`;
  connectButton.textContent = isConnected ? "Reconnect keyboard" : "Connect keyboard";
  setActionButtonsEnabled(isConnected);

  if (!device) {
    lastLayoutEntries = [];
    lastDynParams = [];
    lastCclParams = [];
    lastCalParams = [];
    lastSensiOffsets = [];
    lastLayoutState = null;
    layoutReadPromise = null;
    cancelReadPromise = null;
    dirtyCclIndices.clear();
    sensiOffsetDirty = false;
    selectedCancelKeyIndices.clear();
    selectedCalibrationEntry = null;
    calibrationLiveMode = false;
    calibrationLiveOrigin = CAL_ORIGIN_NONE;
    calibrationTransitionPending = false;
    calibrationTransitionTarget = null;
    pcbCalRunning = false;
    selectedRealtimeEntryIdx = null;
    resetRealtimePlotBuffer();
    renderSensiOffsetInputs();
    renderRuntimeState(null);
    deviceDetails.innerHTML = '<span class="empty">接続するとデバイス情報が表示されます。</span>';
    return;
  }

  selectedRealtimeEntryIdx = null;
  resetRealtimePlotBuffer();
  setActiveTab("layout");
  window.setTimeout(() => {
    loadLayoutWithFeedback().catch((error) => log(error.message, "error"));
  }, 0);

  const collections = device.collections
    .map((collection) => `${formatHex(collection.usagePage)}:${formatHex(collection.usage, 2)}`)
    .join(", ");

  deviceDetails.innerHTML = `
    <dl>
      <div><dt>製品名</dt><dd>${escapeHtml(device.productName || "Unknown HID device")}</dd></div>
      <div><dt>Vendor ID</dt><dd>${formatHex(device.vendorId)}</dd></div>
      <div><dt>Product ID</dt><dd>${formatHex(device.productId)}</dd></div>
      <div><dt>Collections</dt><dd>${escapeHtml(collections || "なし")}</dd></div>
    </dl>
  `;
}

function onInputReport(event) {
  const bytes = new Uint8Array(event.data.buffer);
  if (!pendingResponse || pendingResponse.logPackets) {
    log(`RX report ${event.reportId}: ${bytesToHex(bytes)}`, "rx");
  }

  if (pendingResponse && bytes[1] === MAG_CHANNEL) {
    pendingResponse.resolve(bytes);
    pendingResponse = null;
  }
}

async function openDevice(device) {
  if (connectInProgress) {
    throw new Error("接続処理中です。");
  }
  connectInProgress = true;
  if (activeDevice && activeDevice !== device && activeDevice.opened) {
    activeDevice.removeEventListener("inputreport", onInputReport);
    await activeDevice.close();
  }

  if (!device.opened) {
    await device.open();
  }

  activeDevice = device;
  device.removeEventListener("inputreport", onInputReport);
  device.addEventListener("inputreport", onInputReport);

  try {
    const info = await getFirmwareInfo();
    if (!info || info.protocolVersion !== 1 || !info.matrixSize || !info.layoutEntrySize) {
      throw new Error("QMAGK形式のファームウェアではありません。");
    }
    setConnected(device);
    log(`${device.productName || "HID device"} に接続しました。`, "ok");
  } catch (error) {
    device.removeEventListener("inputreport", onInputReport);
    try {
      await device.close();
    } catch {
      // ignore close errors
    }
    activeDevice = null;
    setConnected(null);
    throw error;
  } finally {
    connectInProgress = false;
  }
}

async function connectKeyboard() {
  if (!("hid" in navigator)) {
    log("このブラウザはWebHIDに対応していません。ChromeまたはEdgeで開いてください。", "error");
    return;
  }

  try {
    const [device] = await navigator.hid.requestDevice({ filters: KEYBOARD_FILTERS });
    if (!device) {
      deviceDetails.innerHTML = '<span class="empty">デバイスが選択されませんでした。Connect keyboard を押して再試行してください。</span>';
      log("デバイスが選択されませんでした。", "warn");
      return;
    }
    await openDevice(device);
  } catch (error) {
    deviceDetails.innerHTML = `<span class="empty">${escapeHtml(connectErrorMessage(error))}</span>`;
    log(error.message, "error");
  }
}

function connectErrorMessage(error) {
  if (!("hid" in navigator)) {
    return "このブラウザはWebHIDに対応していません。ChromeまたはEdgeで開いてください。";
  }
  if (String(error?.message || "").includes("QMAGK形式")) {
    return "このデバイスはQMAGK形式のファームウェアではありません。";
  }
  if (error?.name === "NotFoundError") {
    return "キーボードが選択されませんでした。USB接続とVial/Raw HID対応ファームウェアを確認して再試行してください。";
  }
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "ブラウザからHIDアクセスが許可されませんでした。許可ダイアログでキーボードを選択してください。";
  }
  if (error?.name === "NetworkError") {
    return "HIDデバイスを開けませんでした。Vialなど他の設定ソフトを閉じてから、USBを挿し直すかReconnectしてください。";
  }
  return `接続できませんでした: ${error?.message || error}`;
}

async function sendRawPacket(packet, timeoutMs = 1000, logPackets = true) {
  if (!activeDevice?.opened) {
    throw new Error("先にキーボードへ接続してください。");
  }
  if (pendingResponse) {
    throw new Error("前のRaw HID応答待ちです。");
  }

  const responsePromise = new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingResponse = null;
      reject(new Error("Raw HID response timeout. Vialなど他の設定ソフトが接続中の場合は閉じてから、USBを挿し直すかReconnectしてください。"));
    }, timeoutMs);

    pendingResponse = {
      logPackets,
      resolve: (bytes) => {
        window.clearTimeout(timeoutId);
        resolve(bytes);
      },
    };
  });

  await activeDevice.sendReport(RAW_HID_REPORT_ID, packet);
  if (logPackets) log(`TX report ${RAW_HID_REPORT_ID}: ${bytesToHex(packet)}`, "tx");
  return responsePromise;
}

function createPacket(magCommand) {
  const packet = new Uint8Array(RAW_HID_PACKET_SIZE);
  packet[0] = MAG_RAWHID_COMMAND_ID;
  packet[1] = MAG_CHANNEL;
  packet[2] = magCommand;
  return packet;
}

function checkStatus(response) {
  if (response[0] === VIA_UNHANDLED) {
    throw new Error("VIA returned unhandled (0xFF). Rebuild firmware with MAG Raw HID command ID 0x4D.");
  }
  const status = response[2];
  if (status !== 0) {
    if (status === 0xff) {
      throw new Error("Firmware status: 255. Vial / VIAなど他の設定ソフトが接続中の場合は閉じてから、USBを挿し直すかReconnectしてください。");
    }
    throw new Error(`Firmware status: ${STATUS_TEXT.get(status) || status}`);
  }
}
function parseInfo(response) {
  checkStatus(response);
  return {
    protocolVersion: response[3],
    rows: response[4],
    cols: response[5],
    matrixSize: response[6],
    dynParamSize: response[7],
    cclParamSize: response[8],
    calParamSize: response[9],
    layoutEntrySize: response[10],
    headerBlockSize: readU16(response, 11),
    dynBlockSize: readU16(response, 13),
    cclBlockSize: readU16(response, 15),
    calBlockSize: readU16(response, 17),
    layoutBlockSize: readU16(response, 19),
    dynCrc: readU16(response, 21),
    cclCrc: readU16(response, 23),
    calCrc: readU16(response, 25),
    layoutEntryCount: readU16(response, 27),
    layoutStateSize: response[29],
    idxValidSize: response[30],
    layoutOptionMax: response[31],
  };
}
function renderInfo(info) {
  firmwareInfo.innerHTML = `
    <div class="metric"><span>Protocol</span><strong>v${info.protocolVersion}</strong></div>
    <div class="metric"><span>Matrix</span><strong>${info.rows} x ${info.cols}</strong></div>
    <div class="metric"><span>Keys</span><strong>${info.matrixSize}</strong></div>
    <div class="metric"><span>Header</span><strong>${info.headerBlockSize} B</strong></div>
    <div class="metric"><span>Dyn</span><strong>${info.dynBlockSize} B</strong></div>
    <div class="metric"><span>CCL</span><strong>${info.cclBlockSize} B</strong></div>
    <div class="metric"><span>Cal</span><strong>${info.calBlockSize} B</strong></div>
    <div class="metric"><span>Layout</span><strong>${info.layoutBlockSize} B / ${info.layoutEntryCount} entries</strong></div>
    <div class="metric"><span>Layout entry</span><strong>${info.layoutEntrySize} B</strong></div>
    <div class="metric"><span>Layout state</span><strong>${info.layoutStateSize} B / max ${info.layoutOptionMax}</strong></div>
    <div class="metric"><span>Idx valid</span><strong>${info.idxValidSize} B</strong></div>
    <div class="metric"><span>CRC dyn/ccl/cal</span><strong>${formatHex(info.dynCrc)} / ${formatHex(info.cclCrc)} / ${formatHex(info.calCrc)}</strong></div>
  `;
}
async function getFirmwareInfo() {
  const response = await sendRawPacket(createPacket(MAG_CMD_GET_INFO));
  lastInfo = parseInfo(response);
  renderInfo(lastInfo);
  log("ファームウェア情報を取得しました。", "ok");
  return lastInfo;
}

async function readBlock(block, size, label) {
  const chunks = [];
  for (let offset = 0; offset < size; offset += MAX_PAYLOAD_SIZE) {
    const length = Math.min(MAX_PAYLOAD_SIZE, size - offset);
    const packet = createPacket(MAG_CMD_READ_BLOCK);
    packet[3] = block;
    writeU16(packet, 4, offset);
    packet[6] = length;
    const response = await sendRawPacket(packet);
    checkStatus(response);
    chunks.push(...response.slice(7, 7 + response[6]));
  }
  const bytes = new Uint8Array(chunks);
  if (blockDump) blockDump.textContent = `${label} (${bytes.length} bytes)\n${formatDump(bytes)}`;
  log(`${label} を読み出しました。`, "ok");
  return bytes;
}

async function readBlockBytes(block, size) {
  const chunks = [];
  for (let offset = 0; offset < size; offset += MAX_PAYLOAD_SIZE) {
    const length = Math.min(MAX_PAYLOAD_SIZE, size - offset);
    const packet = createPacket(MAG_CMD_READ_BLOCK);
    packet[3] = block;
    writeU16(packet, 4, offset);
    packet[6] = length;
    const response = await sendRawPacket(packet, 1000, false);
    checkStatus(response);
    chunks.push(...response.slice(7, 7 + response[6]));
  }
  return new Uint8Array(chunks);
}

function formatDump(bytes) {
  const lines = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.slice(offset, offset + 16);
    lines.push(`${offset.toString(16).toUpperCase().padStart(4, "0")}: ${bytesToHex(chunk)}`);
  }
  return lines.join("\n");
}

function formatLayoutEntries(bytes, entrySize) {
  if (entrySize < 6) return "";
  const lines = ["", "Entries", "no  idx   x   y   w option choice"];
  let no = 0;
  for (let offset = 0; offset + entrySize <= bytes.length; offset += entrySize) {
    const idx = bytes[offset];
    const x = bytes[offset + 1];
    const y = bytes[offset + 2];
    const w = bytes[offset + 3];
    const option = bytes[offset + 4];
    const choice = bytes[offset + 5];
    const optionText = option === LAYOUT_OPTION_COMMON ? "0" : String(option);
    const wText = w === 0 ? "ISO" : (w / 4).toFixed(2);
    lines.push(`${String(no).padStart(2)} ${String(idx).padStart(4)} ${String(x).padStart(3)} ${String(y).padStart(3)} ${String(wText).padStart(5)} ${String(optionText).padStart(6)} ${String(choice).padStart(6)}`);
    no += 1;
  }
  return lines.join("\n");
}

function parseLayoutEntries(bytes, entrySize) {
  if (entrySize < 6) return [];
  const entries = [];
  for (let offset = 0; offset + entrySize <= bytes.length; offset += entrySize) {
    entries.push({
      idx: bytes[offset],
      x: bytes[offset + 1],
      y: bytes[offset + 2],
      w: bytes[offset + 3],
      option: bytes[offset + 4],
      choice: bytes[offset + 5],
    });
  }
  return entries;
}

function parseDynParams(bytes, paramSize) {
  if (paramSize < 10) return [];
  const params = [];
  for (let offset = 0; offset + paramSize <= bytes.length; offset += paramSize) {
    params.push({
      actPt: readU16LE(bytes, offset),
      actTrg: readU16LE(bytes, offset + 2),
      rstPt: readU16LE(bytes, offset + 4),
      rstTrg: readU16LE(bytes, offset + 6),
      stroke: readU16LE(bytes, offset + 8),
    });
  }
  return params;
}

function parseCclParams(bytes, paramSize) {
  if (paramSize < 4) return [];
  const params = [];
  for (let offset = 0; offset + paramSize <= bytes.length; offset += paramSize) {
    params.push({
      tgtIdx: readU16LE(bytes, offset),
      tgtTh: readU16LE(bytes, offset + 2),
    });
  }
  return params;
}

function layoutLabelKey(option, choice) {
  return `${option}:${choice}`;
}

function getLayoutLabel(option, choice) {
  return lastLayoutLabels.get(layoutLabelKey(option, choice));
}

function parseLayoutLabels(bytes) {
  const labels = new Map();
  for (let offset = 0; offset + LAYOUT_LABEL_ENTRY_SIZE <= bytes.length; offset += LAYOUT_LABEL_ENTRY_SIZE) {
    const option = bytes[offset];
    const choice = bytes[offset + 1];
    labels.set(layoutLabelKey(option, choice), {
      option,
      choice,
      optionName: readFixedString(bytes, offset + 2, LAYOUT_LABEL_LEN),
      choiceName: readFixedString(bytes, offset + 2 + LAYOUT_LABEL_LEN, LAYOUT_LABEL_LEN),
    });
  }
  return labels;
}

function parseCalParams(bytes, paramSize) {
  if (paramSize < 6) return [];
  const params = [];
  for (let offset = 0; offset + paramSize <= bytes.length; offset += paramSize) {
    params.push({
      refAdcVal: readU16LE(bytes, offset),
      refPoint: readU16LE(bytes, offset + 2),
      magGain: readU16LE(bytes, offset + 4),
    });
  }
  return params;
}

function parseSensiOffsets(bytes) {
  return Array.from({ length: SENSI_OFFSET_STAGE_COUNT }, (_, index) => readU16LE(bytes, index * 2));
}

function encodeSensiOffsets(values) {
  const bytes = new Uint8Array(SENSI_OFFSET_BLOCK_SIZE);
  values.slice(0, SENSI_OFFSET_STAGE_COUNT).forEach((value, index) => {
    writeU16LE(bytes, index * 2, Math.max(0, Math.min(2000, Number(value) || 0)));
  });
  return bytes;
}

function parseLayoutState(bytes) {
  return {
    optionCount: bytes[0] || 0,
    choices: [...bytes.slice(1)],
    size: bytes.length,
  };
}

function encodeLayoutState(state) {
  const size = Math.max(state?.size || 0, 1 + (state?.choices?.length || 0));
  const bytes = new Uint8Array(size);
  bytes[0] = state?.optionCount || 0;
  for (let i = 0; i < Math.min(bytes.length - 1, state?.choices?.length || 0); i++) {
    bytes[i + 1] = state.choices[i] || 0;
  }
  return bytes;
}

function normalizeLayoutState(entries, state, info) {
  const requiredOptionCount = entries.reduce((maxOption, entry) => Math.max(maxOption, entry.option || 0), 0);
  const maxOptionCount = info?.layoutOptionMax || requiredOptionCount;
  const optionCount = Math.min(Math.max(state?.optionCount || 0, requiredOptionCount), maxOptionCount);
  const choices = Array.from({ length: Math.max(optionCount, state?.choices?.length || 0) }, (_, index) => state?.choices?.[index] || 0);
  let changed = !state || state.optionCount !== optionCount;
  for (let optionIndex = 0; optionIndex < optionCount; optionIndex++) {
    const option = optionIndex + 1;
    const validChoices = new Set(entries.filter((entry) => entry.option === option).map((entry) => entry.choice));
    if (validChoices.size && !validChoices.has(choices[optionIndex])) {
      choices[optionIndex] = Math.min(...validChoices);
      changed = true;
    }
  }
  return {
    optionCount,
    choices,
    size: Math.max(state?.size || 0, 1 + maxOptionCount),
    changed,
  };
}

function isLayoutEntryActive(entry, state) {
  if (entry.option === LAYOUT_OPTION_COMMON) return true;
  if (!state) return false;
  const optionIndex = entry.option - 1;
  return optionIndex >= 0 && optionIndex < state.optionCount && state.choices[optionIndex] === entry.choice;
}

function keySizeForEntry(entry) {
  if (entry.w === 0) {
    return { widthU: 1.5, heightU: 2, label: "ISO", leftOffsetU: -0.25 };
  }
  return { widthU: entry.w / 4, heightU: 1, label: `${(entry.w / 4).toFixed(2)}u`, leftOffsetU: 0 };
}

function entryBounds(entry) {
  const size = keySizeForEntry(entry);
  return {
    left: entry.x / 4 + size.leftOffsetU,
    top: entry.y / 4,
    right: entry.x / 4 + size.leftOffsetU + size.widthU,
    bottom: entry.y / 4 + size.heightU,
  };
}

function choiceBounds(entries, option, choice) {
  const optionEntries = entries.filter((entry) => entry.option === option && entry.choice === choice);
  if (!optionEntries.length) return null;
  return optionEntries.reduce((bounds, entry) => {
    const next = entryBounds(entry);
    return {
      left: Math.min(bounds.left, next.left),
      top: Math.min(bounds.top, next.top),
      right: Math.max(bounds.right, next.right),
      bottom: Math.max(bounds.bottom, next.bottom),
    };
  }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
}

function layoutPreviewOffsets(entries) {
  const offsets = new Map();
  const optionMap = new Map();
  entries.forEach((entry) => {
    if (entry.option === LAYOUT_OPTION_COMMON) return;
    if (!optionMap.has(entry.option)) optionMap.set(entry.option, new Set());
    optionMap.get(entry.option).add(entry.choice);
  });
  optionMap.forEach((choices, option) => {
    const sortedChoices = [...choices].sort((a, b) => a - b);
    const baseBounds = choiceBounds(entries, option, sortedChoices[0]);
    if (!baseBounds) return;
    sortedChoices.forEach((choice) => {
      const bounds = choiceBounds(entries, option, choice);
      if (!bounds) return;
      offsets.set(layoutLabelKey(option, choice), {
        x: baseBounds.left - bounds.left,
        y: baseBounds.top - bounds.top,
      });
    });
  });
  return offsets;
}

function previewEntry(entry, offsets = layoutPreviewOffsets(lastLayoutEntries)) {
  const offset = offsets.get(layoutLabelKey(entry.option, entry.choice)) || { x: 0, y: 0 };
  return {
    ...entry,
    x: Math.round((entry.x / 4 + offset.x) * 4),
    y: Math.round((entry.y / 4 + offset.y) * 4),
  };
}

function formatParamValue(value) {
  return value == null ? "--" : String(value);
}

function editableParamValues(param) {
  return [
    formatParamValue(param?.actPt),
    formatParamValue(param?.actTrg),
    formatParamValue(param?.rstPt),
    formatParamValue(param?.rstTrg),
    formatParamValue(param?.stroke),
  ];
}

function editableParamHtml(param) {
  const valueClasses = ["left-value", "right-value", "left-value", "right-value", "wide-value"];
  return editableParamValues(param)
    .map((value, index) => {
      if (index === 1 || index === 3) {
        return `<span class="comma-value">,</span><span class="${valueClasses[index]}">${value}</span>`;
      }
      return `<span class="${valueClasses[index]}">${value}</span>`;
    })
    .join("");
}

function refreshLayoutKeyParamValues(indices) {
  indices.forEach((idx) => {
    const content = keyboardCanvas.querySelector(`.keycap[data-idx="${idx}"] .layout-param-values`);
    if (content) content.innerHTML = editableParamHtml(lastDynParams[idx]);
  });
}


function setDirtyStatus() {
  const hasDynamicEdits = dirtyDynIndices.size > 0 || sensiOffsetDirty;
  saveParam1Button.disabled = !activeDevice?.opened || !hasDynamicEdits;
  saveCclButton.disabled = !activeDevice?.opened || dirtyCclIndices.size === 0;
  setActionButtonsEnabled(Boolean(activeDevice?.opened));
}

function setRealtimeStatus(message, active = false) {
  realtimeStatus.textContent = message;
  realtimeStatus.classList.toggle("dirty", active);
}

function getLayoutOptionDefs(entries, state) {
  if (!state?.optionCount) return [];
  const defs = [];
  for (let optionIndex = 0; optionIndex < state.optionCount; optionIndex++) {
    const option = optionIndex + 1;
    const choices = [...new Set(entries.filter((entry) => entry.option === option).map((entry) => entry.choice))].sort((a, b) => a - b);
    if (!choices.includes(state.choices[optionIndex])) choices.push(state.choices[optionIndex] || 0);
    defs.push({ optionIndex, option, choices: [...new Set(choices)].sort((a, b) => a - b) });
  }
  return defs;
}

function choiceLabel(option, choices, choice) {
  const label = getLayoutLabel(option, choice);
  if (label?.choiceName) return label.choiceName;
  if (choices.length === 2) return choice === Math.min(...choices) ? "オフ" : "オン";
  return `Choice ${choice}`;
}

function refreshLayoutViews(selectedIdx = selectedLayoutEntry?.idx) {
  const activeEntries = getActiveLayoutEntries();
  const activeIndices = new Set(activeEntries.map((entry) => entry.idx));
  [...selectedKeyIndices].forEach((idx) => {
    if (!activeIndices.has(idx)) selectedKeyIndices.delete(idx);
  });
  [...selectedCancelKeyIndices].forEach((idx) => {
    if (!activeIndices.has(idx)) selectedCancelKeyIndices.delete(idx);
  });
  if (!activeEntries.some((entry) => entry.idx === selectedIdx)) {
    const first = activeEntries[0] || null;
    selectedLayoutEntry = first;
    selectedProfileEntry = first;
    selectedKeyIndices.clear();
    if (first) {
      selectedKeyIndices.add(first.idx);
      selectionAnchorIdx = first.idx;
      selectedIdx = first.idx;
    } else {
      selectionAnchorIdx = null;
      selectedIdx = null;
    }
  }
  renderKeyboardLayout(lastLayoutEntries, lastDynParams, lastLayoutState, selectedIdx);
  if (lastCclParams.length) {
  renderCancelLayout(lastLayoutEntries, lastCclParams, lastLayoutState, selectedIdx);
  }
  renderProfileLayout(lastLayoutEntries, lastLayoutState, selectedProfileEntry?.idx);
  renderRealtimeKeyboardLayout(lastLayoutEntries, lastLayoutState, realtimeDcurValues);
  renderRealtimePlot();
  renderLayoutOptions();
}

function renderLayoutOptions() {
  if (!layoutOptionsPanel) return;
  const defs = getLayoutOptionDefs(lastLayoutEntries, lastLayoutState);
  if (!lastLayoutState) {
    layoutOptionsPanel.innerHTML = '<span class="empty">接続後にマルチレイアウト選択を表示します。</span>';
    return;
  }
  if (!defs.length) {
    layoutOptionsPanel.innerHTML = '<span class="empty">このレイアウトには選択式のマルチレイアウト項目がありません。</span>';
    return;
  }
  layoutOptionsPanel.replaceChildren();
  const fields = document.createElement("div");
  fields.className = "layout-option-fields";
  defs.forEach((def) => {
    const label = document.createElement("label");
    const text = document.createElement("span");
    const currentLabel = getLayoutLabel(def.option, lastLayoutState.choices[def.optionIndex]);
    const firstLabel = def.choices.map((choice) => getLayoutLabel(def.option, choice)).find((labelInfo) => labelInfo?.optionName);
    text.textContent = firstLabel?.optionName || currentLabel?.optionName || `Option ${def.option}`;
    const select = document.createElement("select");
    select.dataset.optionIndex = String(def.optionIndex);
    def.choices.forEach((choice) => {
      const option = document.createElement("option");
      option.value = String(choice);
      option.textContent = getLayoutLabel(def.option, choice)?.choiceName || choiceLabel(def.option, def.choices, choice);
      option.selected = lastLayoutState.choices[def.optionIndex] === choice;
      select.append(option);
    });
    select.addEventListener("change", () => {
      lastLayoutState.choices[def.optionIndex] = Number.parseInt(select.value, 10) || 0;
      layoutStateDirty = true;
      refreshLayoutViews();
      setDirtyStatus();
      saveLayoutStateChanges().catch((error) => log(error.message, "error"));
    });
    label.append(text, select);
    fields.append(label);
  });
  layoutOptionsPanel.append(fields);
}

function renderSensiOffsetInputs() {
  sensiOffsetInputs.forEach((input, index) => {
    if (!input) return;
    input.disabled = !activeDevice?.opened || lastSensiOffsets.length === 0;
    input.value = lastSensiOffsets[index] ?? "";
  });
}

function renderRuntimeState(state = null) {
  const connected = Boolean(activeDevice?.opened);
  if (sensiOffsetStateDisplay) {
    sensiOffsetStateDisplay.textContent = state
      ? `Stage ${state.sensiOffsetStage} / ${state.sensiOffsetValue} um`
      : "Stage --";
    sensiOffsetStateDisplay.classList.remove("disabled");
  }
  if (sensiOffsetStageSelect) {
    sensiOffsetStageSelect.disabled = !connected;
    if (state) sensiOffsetStageSelect.value = String(Math.min(Math.max(state.sensiOffsetStage, 0), SENSI_OFFSET_STAGE_COUNT - 1));
  }
  if (applySensiOffsetStageButton) {
    applySensiOffsetStageButton.disabled = !connected;
  }
  if (cancelStateDisplay) {
    const enabled = state?.cclEnabled;
    cancelStateDisplay.textContent = enabled == null ? "--" : enabled ? "有効化中" : "無効化中";
    cancelStateDisplay.classList.toggle("disabled", enabled !== true);
  }
  if (enableCancelButton) enableCancelButton.disabled = !connected;
  if (disableCancelButton) disableCancelButton.disabled = !connected;
}

async function refreshRuntimeState() {
  if (!activeDevice?.opened) {
    renderRuntimeState(null);
    return null;
  }
  const packet = createPacket(MAG_CMD_GET_STATE);
  const response = await sendRawPacket(packet);
  checkStatus(response);
  const state = {
    sensiOffsetStage: response[3],
    sensiOffsetValue: readU16(response, 4),
    cclEnabled: response[6] !== 0,
  };
  renderRuntimeState(state);
  return state;
}

async function setRuntimeState({ sensiOffsetStage = null, cclEnabled = null }) {
  if (!activeDevice?.opened) return null;
  const packet = createPacket(MAG_CMD_SET_STATE);
  let flags = 0;
  if (sensiOffsetStage != null) {
    flags |= 0x01;
    packet[4] = Math.min(Math.max(Number(sensiOffsetStage) || 0, 0), SENSI_OFFSET_STAGE_COUNT - 1);
  }
  if (cclEnabled != null) {
    flags |= 0x02;
    packet[5] = cclEnabled ? 1 : 0;
  }
  packet[3] = flags;
  const response = await sendRawPacket(packet);
  checkStatus(response);
  const state = {
    sensiOffsetStage: response[3],
    sensiOffsetValue: readU16(response, 4),
    cclEnabled: response[6] !== 0,
  };
  renderRuntimeState(state);
  return state;
}

async function readCalibrationModeState({ keepalive = true } = {}) {
  const packet = createPacket(MAG_CMD_GET_CAL_STATE);
  packet[3] = keepalive ? 1 : 0;
  const response = await sendRawPacket(packet, 1000, false);
  checkStatus(response);
  return {
    active: response[3] === 1,
    origin: response[4],
  };
}

async function waitForCalibrationMode(expectedActive, timeoutMs = 3000) {
  const expectedOrigin = expectedActive ? CAL_ORIGIN_SW : CAL_ORIGIN_NONE;
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const state = await readCalibrationModeState({ keepalive: expectedActive });
    const originMatches = expectedActive ? state.origin === expectedOrigin : state.origin === CAL_ORIGIN_NONE;
    if (state.active === expectedActive && originMatches) {
      return state;
    }
    await delay(100);
  }
  throw new Error(expectedActive ? "Enter CALに失敗しました。" : "Exit CALに失敗しました。");
}

async function requestCalibrationMode(action) {
  if (!activeDevice?.opened) return null;
  const packet = createPacket(MAG_CMD_CAL_CONTROL);
  packet[3] = action ? 1 : 0;
  const response = await sendRawPacket(packet, 3000);
  checkStatus(response);
  return {
    active: response[3] === 1,
  };
}

async function requestPcbCalibration() {
  if (!activeDevice?.opened) return null;
  const packet = createPacket(MAG_CMD_RUN_PCB_CAL);
  const response = await sendRawPacket(packet, 10000);
  checkStatus(response);
  return true;
}

async function readCalibrationLiveRange(startIdx, count) {
  const packet = createPacket(MAG_CMD_READ_CAL_VIEW);
  packet[3] = startIdx;
  packet[4] = count;
  const response = await sendRawPacket(packet, 1000, false);
  checkStatus(response);
  const live = [];
  for (let index = 0; index < response[4]; index++) {
    const offset = 7 + index * 6;
    live.push({
      idx: response[3] + index,
      yCur: readU16(response, offset),
      yMin: readU16(response, offset + 2),
      yMax: readU16(response, offset + 4),
    });
  }
  return live;
}

async function readCalibrationLiveData(activeEntries) {
  const liveMap = new Map();
  const sortedEntries = [...activeEntries].sort((left, right) => left.idx - right.idx);
  let index = 0;
  while (index < sortedEntries.length) {
    let rangeStart = sortedEntries[index].idx;
    let rangeLength = 1;
    while (
      index + rangeLength < sortedEntries.length &&
      sortedEntries[index + rangeLength].idx === rangeStart + rangeLength &&
      rangeLength < 4
    ) {
      rangeLength += 1;
    }
    const liveRows = await readCalibrationLiveRange(rangeStart, rangeLength);
    liveRows.forEach((row) => liveMap.set(row.idx, row));
    index += rangeLength;
  }
  return liveMap;
}

function stopCalibrationPolling() {
  if (calibrationLiveTimerId) {
    window.clearInterval(calibrationLiveTimerId);
    calibrationLiveTimerId = null;
  }
  calibrationRefreshInFlight = false;
  calibrationTransitionPending = false;
  calibrationTransitionTarget = null;
}

function startCalibrationPolling() {
  if (calibrationLiveTimerId) return;
  calibrationLiveTimerId = window.setInterval(() => {
    refreshCalibrationGui(true).catch((error) => log(error.message, "error"));
  }, 100);
}

async function refreshCalibrationGui(skipStaticRead = false) {
  if (calibrationRefreshInFlight) return null;
  calibrationRefreshInFlight = true;
  try {
    if (!lastInfo) await getFirmwareInfo();
    if (!lastLayoutEntries.length || !lastLayoutState) {
      await ensureLayoutLoaded();
    }
    if (!skipStaticRead || !lastCalParams.length) {
      const calBytes = await readBlockBytes(BLOCK_CAL, lastInfo.calBlockSize);
      lastCalParams = parseCalParams(calBytes, lastInfo.calParamSize);
    }
    const modeState = await readCalibrationModeState();
    calibrationLiveMode = modeState.active;
    calibrationLiveOrigin = modeState.origin;
    if (calibrationTransitionPending && modeState.active === calibrationTransitionTarget) {
      if (!modeState.active || modeState.origin === CAL_ORIGIN_SW) {
        calibrationTransitionPending = false;
        calibrationTransitionTarget = null;
      }
    }
    updateCalibrationActionButtons();
    const activeEntries = getPreviewLayoutEntries(lastLayoutEntries, lastLayoutState);
    const selected = activeEntries.find((entry) => entry.idx === selectedCalibrationEntry?.idx) || activeEntries[0];
    if (selected) selectedCalibrationEntry = selected;
    let liveMap = null;
    const shouldPoll = calibrationLiveMode || calibrationTransitionPending;
    if (shouldPoll) {
      startCalibrationPolling();
    } else {
      stopCalibrationPolling();
    }
    if (calibrationLiveMode && activeEntries.length) {
      liveMap = await readCalibrationLiveData(activeEntries);
    }
    renderCalibrationLayout(lastLayoutEntries, lastLayoutState, selectedCalibrationEntry?.idx, liveMap);
    if (!skipStaticRead) {
      log(`Calibration GUI rendered: ${lastCalParams.length} CAL records`, "ok");
    }
    return { modeState, liveMap };
  } finally {
    calibrationRefreshInFlight = false;
  }
}

function handleSensiOffsetInput(event) {
  const input = event.currentTarget;
  const index = sensiOffsetInputs.indexOf(input);
  if (index < 0) return;
  const value = Math.max(0, Math.min(2000, Number.parseInt(input.value || "0", 10) || 0));
  input.value = value;
  lastSensiOffsets[index] = value;
  sensiOffsetDirty = true;
  setDirtyStatus();
}

function encodeDynParams(params, paramSize) {
  const bytes = new Uint8Array(params.length * paramSize);
  params.forEach((param, index) => {
    const offset = index * paramSize;
    writeU16LE(bytes, offset, param.actPt);
    writeU16LE(bytes, offset + 2, param.actTrg);
    writeU16LE(bytes, offset + 4, param.rstPt);
    writeU16LE(bytes, offset + 6, param.rstTrg);
    writeU16LE(bytes, offset + 8, param.stroke);
  });
  return bytes;
}

function encodeCclParams(params, paramSize) {
  const bytes = new Uint8Array(params.length * paramSize);
  params.forEach((param, index) => {
    const offset = index * paramSize;
    writeU16LE(bytes, offset, normalizeCclTarget(param.tgtIdx, index));
    writeU16LE(bytes, offset + 2, param.tgtTh);
  });
  return bytes;
}

function formatCclTarget(value, triggerIdx = null) {
  return isValidCancelTarget(value, triggerIdx) ? String(value) : "None";
}

function formatCclTargetLabel(value, triggerIdx = null) {
  return isValidCancelTarget(value, triggerIdx) ? `Key ID ${value}` : "None";
}

function isValidCancelTarget(value, triggerIdx = null) {
  if (value == null || value === 255) return false;
  if (triggerIdx != null && value === triggerIdx) return false;
  return getActiveLayoutEntries().some((entry) => entry.idx === value);
}

function normalizeCclTarget(value, triggerIdx = null) {
  return isValidCancelTarget(value, triggerIdx) ? value : 255;
}

function cclParamHtml(entry, param) {
  return `
    <span class="cancel-idx">Key ID ${entry.idx}</span>
    <span>tgt: ${formatCclTarget(param?.tgtIdx, entry.idx)}</span>
    <span>th: ${formatParamValue(param?.tgtTh)}</span>
  `;
}

function refreshCancelKeyParamValues(indices) {
  indices.forEach((idx) => {
    const key = cancelKeyboardCanvas.querySelector(`.keycap[data-idx="${idx}"] .cancel-param-values`);
    const entry = getPreviewLayoutEntries(lastLayoutEntries, lastLayoutState).find((item) => item.idx === idx);
    if (key && entry) key.innerHTML = cclParamHtml(entry, lastCclParams[idx]);
  });
}

function getActiveLayoutEntries() {
  return lastLayoutEntries.filter((entry) => isLayoutEntryActive(entry, lastLayoutState));
}

function getPreviewLayoutEntries(entries, state) {
  const offsets = layoutPreviewOffsets(entries);
  return entries
    .filter((entry) => isLayoutEntryActive(entry, state))
    .map((entry) => previewEntry(entry, offsets));
}

function setSelectedKeys(indices, anchorIdx = null) {
  selectedKeyIndices.clear();
  indices.forEach((idx) => selectedKeyIndices.add(idx));
  if (anchorIdx != null) selectionAnchorIdx = anchorIdx;
  setDirtyStatus();
  renderKeyboardLayout(lastLayoutEntries, lastDynParams, lastLayoutState, selectedLayoutEntry?.idx);
  drawSelectedKeyCurve();
}

function selectKey(entry, event) {
  if (event?.ctrlKey || event?.metaKey) {
    if (selectedKeyIndices.has(entry.idx)) {
      selectedKeyIndices.delete(entry.idx);
    } else {
      selectedKeyIndices.add(entry.idx);
    }
  } else if (event?.shiftKey && selectionAnchorIdx != null) {
    const activeEntries = getPreviewLayoutEntries(lastLayoutEntries, lastLayoutState);
    const anchor = activeEntries.find((item) => item.idx === selectionAnchorIdx);
    if (anchor) {
      const minX = Math.min(anchor.x, entry.x);
      const maxX = Math.max(anchor.x, entry.x);
      const minY = Math.min(anchor.y, entry.y);
      const maxY = Math.max(anchor.y, entry.y);
      selectedKeyIndices.clear();
      activeEntries
        .filter((item) => item.x >= minX && item.x <= maxX && item.y >= minY && item.y <= maxY)
        .forEach((item) => selectedKeyIndices.add(item.idx));
    }
  } else {
    selectedKeyIndices.clear();
    selectedKeyIndices.add(entry.idx);
  }
  selectedLayoutEntry = entry;
  selectionAnchorIdx = entry.idx;
  setDirtyStatus();
  renderKeyboardLayout(lastLayoutEntries, lastDynParams, lastLayoutState, entry.idx);
  drawSelectedKeyCurve();
}

function selectAllVisibleKeys() {
  setSelectedKeys(getActiveLayoutEntries().map((entry) => entry.idx), selectedLayoutEntry?.idx);
}

function clearSelectedKeys() {
  selectedKeyIndices.clear();
  setDirtyStatus();
  renderKeyboardLayout(lastLayoutEntries, lastDynParams, lastLayoutState, selectedLayoutEntry?.idx);
  drawSelectedKeyCurve();
}

function applyBulkParams() {
  if (selectedKeyIndices.size === 0) return;
  const updates = Object.fromEntries(
    Object.entries(bulkInputs)
      .filter(([, input]) => input.value.trim() !== "")
      .map(([key, input]) => [key, clampByRange(key, input.value)])
  );
  if (Object.keys(updates).length === 0) {
    log("変更する値が入力されていません。", "warn");
    return;
  }
  selectedKeyIndices.forEach((idx) => {
    const param = lastDynParams[idx];
    if (!param) return;
    Object.assign(param, updates);
    dirtyDynIndices.add(idx);
  });
  setDirtyStatus();
  refreshLayoutKeyParamValues([...selectedKeyIndices]);
  if (selectedLayoutEntry) {
    renderKeyDetail(selectedLayoutEntry, lastDynParams[selectedLayoutEntry.idx]);
  }
  drawSelectedKeyCurve();
  log(`${selectedKeyIndices.size} key(s) updated locally.`, "ok");
}

function setSelectedCancelKeys(indices, anchorIdx = null) {
  selectedCancelKeyIndices.clear();
  indices.forEach((idx) => selectedCancelKeyIndices.add(idx));
  if (anchorIdx != null) selectedLayoutEntry = getActiveLayoutEntries().find((entry) => entry.idx === anchorIdx) || selectedLayoutEntry;
  setDirtyStatus();
  renderCancelLayout(lastLayoutEntries, lastCclParams, lastLayoutState, selectedLayoutEntry?.idx);
}

function selectCancelKey(entry, event) {
  if (cancelPickMode === "target") {
    const triggerIdx = selectedLayoutEntry?.idx;
    if (triggerIdx != null && entry.idx === triggerIdx) {
      log("TargetにTrigger自身は設定できません。", "warn");
      return;
    }
    selectedCancelTargetIdx = normalizeCclTarget(entry.idx, triggerIdx);
  } else {
    selectedCancelKeyIndices.clear();
    selectedCancelKeyIndices.add(entry.idx);
    selectedLayoutEntry = entry;
    const param = lastCclParams[entry.idx];
    selectedCancelTargetIdx = normalizeCclTarget(param?.tgtIdx, entry.idx);
  }
  setDirtyStatus();
  renderCancelLayout(lastLayoutEntries, lastCclParams, lastLayoutState, selectedLayoutEntry?.idx);
}

function selectAllVisibleCancelKeys() {
  setSelectedCancelKeys(getActiveLayoutEntries().map((entry) => entry.idx), selectedLayoutEntry?.idx);
}

function clearSelectedCancelKeys() {
  selectedCancelKeyIndices.clear();
  setDirtyStatus();
  renderCancelLayout(lastLayoutEntries, lastCclParams, lastLayoutState, selectedLayoutEntry?.idx);
}

function applyCclParams() {
  const triggerIdx = [...selectedCancelKeyIndices][0];
  if (triggerIdx == null) return;
  const thInput = cancelKeyDetail.querySelector("#bulkCclTh");
  selectedCancelKeyIndices.forEach((idx) => {
    const param = lastCclParams[idx];
    if (!param) return;
    Object.assign(param, {
      tgtIdx: normalizeCclTarget(selectedCancelTargetIdx, idx),
      tgtTh: thInput?.value.trim() === "" ? paramRanges.cclTh.min : clampByRange("cclTh", thInput.value),
    });
    dirtyCclIndices.add(idx);
  });
  setDirtyStatus();
  refreshCancelKeyParamValues([...selectedCancelKeyIndices]);
  cancelPickMode = "trigger";
  const selectedEntry = getActiveLayoutEntries().find((entry) => entry.idx === selectedLayoutEntry?.idx);
  if (selectedEntry) {
    renderCancelKeyDetail(selectedEntry, lastCclParams[selectedEntry.idx]);
  }
  log(`idx ${triggerIdx} CCL updated locally.`, "ok");
}

async function writeBlock(block, bytes, label) {
  for (let offset = 0; offset < bytes.length; offset += MAX_PAYLOAD_SIZE) {
    const length = Math.min(MAX_PAYLOAD_SIZE, bytes.length - offset);
    const packet = createPacket(MAG_CMD_WRITE_BLOCK);
    packet[3] = block;
    writeU16(packet, 4, offset);
    packet[6] = length;
    packet.set(bytes.slice(offset, offset + length), 7);
    const response = await sendRawPacket(packet);
    checkStatus(response);
  }
  log(`${label} written (${bytes.length} bytes)`, "ok");
}

async function saveBlock(block, label) {
  const packet = createPacket(MAG_CMD_SAVE_BLOCK);
  packet[3] = block;
  const response = await sendRawPacket(packet);
  checkStatus(response);
  log(`${label} saved to EEPROM`, "ok");
}

async function saveParam1Changes() {
  if (!lastInfo || lastDynParams.length === 0) {
    throw new Error("Read Layout GUI before saving param1.");
  }
  if (dirtyDynIndices.size === 0 && !sensiOffsetDirty) {
    log("No Dynamic edits to save.", "warn");
    return;
  }
  if (dirtyDynIndices.size > 0) {
    const bytes = encodeDynParams(lastDynParams, lastInfo.dynParamSize);
    await writeBlock(BLOCK_DYN, bytes, "DYN / param1");
    await saveBlock(BLOCK_DYN, "DYN / param1");
    dirtyDynIndices.clear();
  }
  if (sensiOffsetDirty) {
    if (lastSensiOffsets.length !== SENSI_OFFSET_STAGE_COUNT) {
      throw new Error("Sensi offset block is not available in this firmware.");
    }
    const bytes = encodeSensiOffsets(lastSensiOffsets);
    await writeBlock(BLOCK_SENSI_OFFSET, bytes, "Sensi offset");
    await saveBlock(BLOCK_SENSI_OFFSET, "Sensi offset");
    sensiOffsetDirty = false;
  }
  setDirtyStatus();
  renderSensiOffsetInputs();
  refreshRuntimeState().catch((error) => log(`Runtime state is not available: ${error.message}`, "warn"));
  renderKeyboardLayout(lastLayoutEntries, lastDynParams, lastLayoutState, selectedLayoutEntry?.idx);
}

async function saveCclChanges() {
  if (!lastInfo || lastCclParams.length === 0) {
    throw new Error("CancelタブでCCL paramを読み込んでから保存してください。");
  }
  if (dirtyCclIndices.size === 0) {
    log("No CCL edits to save.", "warn");
    return;
  }
  const bytes = encodeCclParams(lastCclParams, lastInfo.cclParamSize);
  await writeBlock(BLOCK_CCL, bytes, "CCL param");
  await saveBlock(BLOCK_CCL, "CCL param");
  dirtyCclIndices.clear();
  setDirtyStatus();
  renderCancelLayout(lastLayoutEntries, lastCclParams, lastLayoutState, selectedLayoutEntry?.idx);
}

async function saveLayoutStateChanges() {
  if (!lastInfo || !lastLayoutState) {
    throw new Error("Read Layout GUI before saving layout choices.");
  }
  if (!layoutStateDirty) {
    log("No layout choice edits to save.", "warn");
    return;
  }
  const bytes = encodeLayoutState(lastLayoutState);
  await writeBlock(BLOCK_LAYOUT_STATE, bytes, "Layout state");
  await saveBlock(BLOCK_LAYOUT_STATE, "Layout state");
  layoutStateDirty = false;
  renderLayoutOptions();
  setDirtyStatus();
}

async function ensureLayoutLoaded(force = false) {
  if (!activeDevice?.opened) {
    throw new Error("キーボードが接続されていません。Connect keyboard から接続してください。");
  }
  if (!force && lastLayoutEntries.length) return;
  if (layoutReadPromise) return layoutReadPromise;
  layoutReadPromise = readAndRenderLayoutGui()
    .catch((error) => {
      deviceDetails.innerHTML = `<span class="empty">接続は成功しましたが、設定を読み込めませんでした: ${escapeHtml(error.message)}</span>`;
      throw error;
    })
    .finally(() => {
      layoutReadPromise = null;
    });
  return layoutReadPromise;
}

async function loadLayoutWithFeedback(force = false) {
  if (keyboardCanvas && (!lastLayoutEntries.length || force)) {
    keyboardCanvas.innerHTML = '<span class="empty">Key layoutを読み込み中です...</span>';
  }
  try {
    await ensureLayoutLoaded(force);
  } catch (error) {
    if (keyboardCanvas) {
      keyboardCanvas.innerHTML = `<span class="empty">Key layoutを読み込めませんでした: ${escapeHtml(error.message)}</span>`;
    }
    throw error;
  }
}

async function ensureCancelLoaded(force = false) {
  if (!activeDevice?.opened) {
    throw new Error("キーボードが接続されていません。Connect keyboard から接続してください。");
  }
  if (!force && lastCclParams.length) return;
  if (cancelReadPromise) return cancelReadPromise;
  cancelReadPromise = readAndRenderCancelGui()
    .catch((error) => {
      deviceDetails.innerHTML = `<span class="empty">接続は成功しましたが、Cancel設定を読み込めませんでした: ${escapeHtml(error.message)}</span>`;
      throw error;
    })
    .finally(() => {
      cancelReadPromise = null;
    });
  return cancelReadPromise;
}

function renderKeyDetail(entry, param) {
  selectedLayoutEntry = entry;
  const dirty = dirtyDynIndices.has(entry.idx);
  keyDetail.innerHTML = `
    <div class="detail-title">idx ${entry.idx}${dirty ? " *edited" : ""}</div>
    <div class="detail-grid">
      <div><span>Actuation Point [um]</span><strong>${formatParamValue(param?.actPt)}</strong></div>
      <div><span>Actuation Trigger [um]</span><strong>${formatParamValue(param?.actTrg)}</strong></div>
      <div><span>Reset Point [um]</span><strong>${formatParamValue(param?.rstPt)}</strong></div>
      <div><span>Reset Trigger [um]</span><strong>${formatParamValue(param?.rstTrg)}</strong></div>
      <div><span>Stroke [um]</span><strong>${formatParamValue(param?.stroke)}</strong></div>
    </div>
  `;
}

function calibrationParamValues(param) {
  return [
    formatParamValue(param?.magGain),
    formatParamValue(param?.refPoint),
    formatParamValue(param?.refAdcVal),
  ];
}

function calibrationParamHtml(param) {
  return calibrationParamValues(param)
    .map((value) => `<span class="calibration-value">${value}</span>`)
    .join("");
}

function calibrationLiveValues(liveData) {
  return [
    formatParamValue(liveData?.yMax),
    formatParamValue(liveData?.yCur),
    formatParamValue(liveData?.yMin),
  ];
}

function calibrationLiveHtml(liveData) {
  const values = calibrationLiveValues(liveData);
  const ratio = liveData && Number.isFinite(liveData.yCur) && Number.isFinite(liveData.yMin) && Number.isFinite(liveData.yMax) && liveData.yMax > liveData.yMin
    ? Math.max(0, Math.min(1, (liveData.yCur - liveData.yMin) / (liveData.yMax - liveData.yMin)))
    : null;
  return values
    .map((value, index) => {
      const classes = ["calibration-value"];
      if (index === 1) {
        classes.push("calibration-live-current");
      }
      const style = index === 1 && ratio != null ? ` style="--cal-level:${ratio}"` : "";
      return `<span class="${classes.join(" ")}"${style}>${value}</span>`;
    })
    .join("");
}

function renderCalibrationKeyDetail(entry, param, liveData = null) {
  selectedCalibrationEntry = entry;
  const dirty = false;
  if (calibrationLiveMode && liveData) {
    calibrationKeyDetail.innerHTML = `
      <div class="detail-title">Key ID ${entry.idx}${dirty ? " *edited" : ""}</div>
      <div class="detail-grid calibration-detail-grid">
        <div><span>ymax</span><strong>${formatParamValue(liveData?.yMax)}</strong></div>
        <div><span>ycurrent</span><strong>${formatParamValue(liveData?.yCur)}</strong></div>
        <div><span>ymin</span><strong>${formatParamValue(liveData?.yMin)}</strong></div>
      </div>
    `;
    return;
  }
  calibrationKeyDetail.innerHTML = `
    <div class="detail-title">Key ID ${entry.idx}${dirty ? " *edited" : ""}</div>
    <div class="detail-grid calibration-detail-grid">
      <div><span>a</span><strong>${formatParamValue(param?.magGain)}</strong></div>
      <div><span>d0</span><strong>${formatParamValue(param?.refPoint)}</strong></div>
      <div><span>y0</span><strong>${formatParamValue(param?.refAdcVal)}</strong></div>
    </div>
  `;
}

function renderCancelKeyDetail(entry, param) {
  selectedLayoutEntry = entry;
  if (selectedCancelTargetIdx === undefined) {
    selectedCancelTargetIdx = normalizeCclTarget(param?.tgtIdx, entry.idx);
  } else {
    selectedCancelTargetIdx = normalizeCclTarget(selectedCancelTargetIdx, entry.idx);
  }
  cancelKeyDetail.innerHTML = `
    <div class="cancel-builder">
      <section class="cancel-builder-block trigger-block">
        <h4>Trigger</h4>
        <button class="secondary-button ${cancelPickMode === "trigger" ? "active-mode" : ""}" id="pickCancelTriggerButton" type="button">選択ボタン</button>
        <div class="cancel-selected-value">Key ID ${entry.idx}</div>
        <button class="secondary-button" id="deleteCancelTargetButton" type="button">Delete Target</button>
      </section>
      <div class="cancel-builder-arrow">→</div>
      <section class="cancel-builder-block target-block">
        <h4>Target</h4>
        <button class="secondary-button ${cancelPickMode === "target" ? "active-mode" : ""}" id="pickCancelTargetButton" type="button">選択ボタン</button>
        <div class="cancel-selected-value">${formatCclTargetLabel(selectedCancelTargetIdx, entry.idx)}</div>
      </section>
      <section class="cancel-builder-block threshold-block">
        <h4>Threshold [um]</h4>
        <input id="bulkCclTh" type="number" min="${paramRanges.cclTh.min}" max="${paramRanges.cclTh.max}" step="1" value="${param?.tgtTh ?? ""}" />
      </section>
      <button class="primary-button cancel-apply-button" id="applyCclLocalButton" type="button">Local apply</button>
      </div>
  `;
  cancelKeyDetail.querySelector("#pickCancelTriggerButton")?.addEventListener("click", () => {
    cancelPickMode = "trigger";
    renderCancelLayout(lastLayoutEntries, lastCclParams, lastLayoutState, selectedLayoutEntry?.idx);
  });
  cancelKeyDetail.querySelector("#deleteCancelTargetButton")?.addEventListener("click", () => {
    selectedCancelTargetIdx = 255;
    renderCancelLayout(lastLayoutEntries, lastCclParams, lastLayoutState, selectedLayoutEntry?.idx);
  });
  cancelKeyDetail.querySelector("#pickCancelTargetButton")?.addEventListener("click", () => {
    cancelPickMode = "target";
    renderCancelLayout(lastLayoutEntries, lastCclParams, lastLayoutState, selectedLayoutEntry?.idx);
  });
  cancelKeyDetail.querySelector("#applyCclLocalButton")?.addEventListener("click", applyCclParams);
}

function renderCalibrationLayout(entries, state, selectedIdx = null, liveMap = null) {
  const activeEntries = getPreviewLayoutEntries(entries, state);
  if (!activeEntries.length) {
    calibrationKeyboardCanvas.innerHTML = '<span class="empty">No active layout entries.</span>';
    return;
  }

  const unit = 82;
  const gap = 5;
  const margin = 14;
  let maxRight = 0;
  let maxBottom = 0;
  for (const entry of activeEntries) {
    const size = keySizeForEntry(entry);
    maxRight = Math.max(maxRight, (entry.x / 4 + size.leftOffsetU + size.widthU) * unit);
    maxBottom = Math.max(maxBottom, (entry.y / 4 + size.heightU) * unit);
  }

  calibrationKeyboardCanvas.replaceChildren();
  calibrationKeyboardCanvas.style.width = `${Math.ceil(maxRight + margin * 2)}px`;
  calibrationKeyboardCanvas.style.height = `${Math.ceil(maxBottom + margin * 2)}px`;

  for (const entry of activeEntries) {
    const param = lastCalParams[entry.idx];
    const liveData = liveMap?.get(entry.idx) || null;
    const rect = keyRectForEntry(entry, unit, gap, margin);
    const key = document.createElement("button");
    key.type = "button";
    key.dataset.idx = String(entry.idx);
    key.className = `keycap${entry.w === 0 ? " iso-enter" : ""}${entry.idx === selectedIdx ? " selected" : ""}`;
    key.style.left = `${rect.left}px`;
    key.style.top = `${rect.top}px`;
    key.style.width = `${rect.width}px`;
    key.style.height = `${rect.height}px`;
    key.style.setProperty("--key-value-size", `${unit - gap - 16}px`);
    const shape = entry.w === 0
      ? `<svg class="key-shape iso-shape" viewBox="0 0 150 200" preserveAspectRatio="none" aria-hidden="true"><path class="key-fill iso-fill" d="M8 1 H142 Q149 1 149 8 V192 Q149 199 142 199 H33 Q25 199 25 191 V97 H8 Q1 97 1 90 V8 Q1 1 8 1 Z" /></svg>`
      : `<svg class="key-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="key-fill" d="M8 1 H92 Q99 1 99 8 V92 Q99 99 92 99 H8 Q1 99 1 92 V8 Q1 1 8 1 Z" /></svg>`;
    key.innerHTML = `
      ${shape}
      <span class="key-content calibration-param-values">
        ${liveMap ? calibrationLiveHtml(liveData) : calibrationParamHtml(param)}
      </span>
    `;
    key.title = liveMap
      ? `Key ID ${entry.idx} / ymax ${formatParamValue(liveData?.yMax)} / ycurrent ${formatParamValue(liveData?.yCur)} / ymin ${formatParamValue(liveData?.yMin)}`
      : `Key ID ${entry.idx} / a ${formatParamValue(param?.magGain)} / d0 ${formatParamValue(param?.refPoint)} / y0 ${formatParamValue(param?.refAdcVal)}`;
    key.addEventListener("click", () => {
      selectedCalibrationEntry = entry;
      renderCalibrationLayout(entries, state, entry.idx, liveMap);
      renderCalibrationKeyDetail(entry, param, liveData);
    });
    calibrationKeyboardCanvas.append(key);
  }

  const selected = activeEntries.find((entry) => entry.idx === selectedIdx) || activeEntries[0];
  selectedCalibrationEntry = selected;
  renderCalibrationKeyDetail(selected, lastCalParams[selected.idx], liveMap?.get(selected.idx) || null);
}

function keyRectForEntry(entry, unit, gap, margin) {
  const size = keySizeForEntry(entry);
  return {
    left: margin + (entry.x / 4 + size.leftOffsetU) * unit,
    top: margin + (entry.y / 4) * unit,
    width: size.widthU * unit - gap,
    height: size.heightU * unit - gap,
  };
}

function rectsIntersect(a, b) {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

function setupDragSelection(activeEntries, unit, gap, margin) {
  let start = null;
  let selectionBox = null;

  keyboardCanvas.onmousedown = (event) => {
    if (event.button !== 0 || event.target.closest(".keycap")) return;
    const canvasRect = keyboardCanvas.getBoundingClientRect();
    start = {
      x: event.clientX - canvasRect.left,
      y: event.clientY - canvasRect.top,
    };
    selectionBox = document.createElement("div");
    selectionBox.className = "selection-box";
    keyboardCanvas.append(selectionBox);
    event.preventDefault();
  };

  keyboardCanvas.onmousemove = (event) => {
    if (!start || !selectionBox) return;
    const canvasRect = keyboardCanvas.getBoundingClientRect();
    const current = {
      x: event.clientX - canvasRect.left,
      y: event.clientY - canvasRect.top,
    };
    const rect = {
      left: Math.min(start.x, current.x),
      top: Math.min(start.y, current.y),
      width: Math.abs(start.x - current.x),
      height: Math.abs(start.y - current.y),
    };
    selectionBox.style.left = `${rect.left}px`;
    selectionBox.style.top = `${rect.top}px`;
    selectionBox.style.width = `${rect.width}px`;
    selectionBox.style.height = `${rect.height}px`;
  };

  keyboardCanvas.onmouseup = (event) => {
    if (!start || !selectionBox) return;
    const canvasRect = keyboardCanvas.getBoundingClientRect();
    const current = {
      x: event.clientX - canvasRect.left,
      y: event.clientY - canvasRect.top,
    };
    const selectRect = {
      left: Math.min(start.x, current.x),
      top: Math.min(start.y, current.y),
      width: Math.abs(start.x - current.x),
      height: Math.abs(start.y - current.y),
    };
    const selected = activeEntries
      .filter((entry) => rectsIntersect(selectRect, keyRectForEntry(entry, unit, gap, margin)))
      .map((entry) => entry.idx);
    selectionBox.remove();
    selectionBox = null;
    start = null;
    if (selected.length) setSelectedKeys(selected, selected[0]);
  };

  keyboardCanvas.onmouseleave = () => {
    if (selectionBox) selectionBox.remove();
    selectionBox = null;
    start = null;
  };
}

function getSelectedCurveData(step = 0.25) {
  const idx = selectedProfileEntry?.idx;
  const dyn = lastDynParams[idx];
  const cal = lastCalParams[idx];
  if (!dyn || !cal) {
    return null;
  }

  const stroke = Math.max(1, dyn.stroke || 1);
  const sensitivity = getHallSensorSensitivity();
  const gaussForPercent = (percent) => {
    const denominator = ((100 - percent) * stroke) / 100 + cal.refPoint;
    if (denominator <= 0) return NaN;
    return (cal.magGain * cal.magGain * 3300) / (sensitivity * 64 * denominator * denominator);
  };
  const samples = [];
  const minX = -10;
  const maxX = 110;
  const steps = Math.round((maxX - minX) / step);
  for (let i = 0; i <= steps; i++) {
    const percent = Number((minX + i * step).toFixed(3));
    samples.push({ percent, gauss: gaussForPercent(percent) });
  }
  return { idx, stroke, sensitivity, samples, gaussForPercent, minX, maxX };
}

function drawSelectedKeyCurve() {
  const ctx = curveCanvas.getContext("2d");
  const width = curveCanvas.width;
  const height = curveCanvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfb";
  ctx.fillRect(0, 0, width, height);

  const curveData = getSelectedCurveData();
  exportCurveCsvButton.disabled = !curveData;
  if (!curveData) {
    curveNote.textContent = "Curveでキーを選択してください。";
    return;
  }

  const pad = { left: 132, right: 38, top: 48, bottom: 116 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const { stroke, samples, gaussForPercent, minX, maxX } = curveData;
  const maxSampleY = Math.max(...samples.map((point) => point.gauss).filter(Number.isFinite), 1);
  const maxY = Math.max(100, Math.ceil(maxSampleY / 100) * 100);
  const xFor = (percent) => pad.left + ((percent - minX) / (maxX - minX)) * plotWidth;
  const yForGs = (gauss) => pad.top + (1 - Math.min(gauss, maxY) / maxY) * plotHeight;

  ctx.strokeStyle = "#d9dfdc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let percent = minX; percent <= maxX; percent += 10) {
    const x = xFor(percent);
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotHeight);
  }
  for (let value = 0; value <= maxY; value += 100) {
    const y = yForGs(value);
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotWidth, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "#087b70";
  ctx.lineWidth = 3;
  ctx.beginPath();
  [0, 100].forEach((percent) => {
    const x = xFor(percent);
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotHeight);
  });
  ctx.stroke();

  ctx.strokeStyle = "#087b70";
  ctx.lineWidth = 5;
  ctx.beginPath();
  let drawing = false;
  samples.forEach((point) => {
    if (!Number.isFinite(point.gauss)) {
      drawing = false;
      return;
    }
    const x = xFor(point.percent);
    const y = yForGs(point.gauss);
    if (!drawing) {
      ctx.moveTo(x, y);
      drawing = true;
    }
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#1d2424";
  ctx.font = "28px Cascadia Mono, Consolas, monospace";
  ctx.fillText("Pressed Depth [%]", pad.left + plotWidth / 2 - 126, height - 22);
  ctx.save();
  ctx.translate(34, pad.top + plotHeight / 2 + 190);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Magnetic Flux Density [Gs]", 0, 0);
  ctx.restore();
  ctx.font = "24px Cascadia Mono, Consolas, monospace";
  for (let percent = minX; percent <= maxX; percent += 10) {
    ctx.fillText(`${percent}`, xFor(percent) - 14, height - 70);
  }
  for (let value = 0; value <= maxY; value += 100) {
    const y = yForGs(value);
    ctx.fillText(`${value}`, 58, y + 8);
  }
  const bAt0 = gaussForPercent(0);
  const bAt100 = gaussForPercent(100);
  curveNote.innerHTML = [
    `stroke : ${stroke} [um]`,
    `B@0% : ${Number.isFinite(bAt0) ? bAt0.toFixed(3) : "--"} [Gs]`,
    `B@100% : ${Number.isFinite(bAt100) ? bAt100.toFixed(3) : "--"} [Gs]`,
  ].join("<br>");
}

function exportSelectedCurveCsv() {
  const curveData = getSelectedCurveData(0.1);
  if (!curveData) {
    log("Curve CSVを書き出すキーが選択されていません。", "warn");
    return;
  }
  const rows = [
    "pressed_depth_percent,magnetic_flux_density_gs",
    ...curveData.samples.map((point) => `${point.percent.toFixed(1)},${Number.isFinite(point.gauss) ? point.gauss.toFixed(6) : ""}`),
  ];
  const blob = new Blob([`${rows.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `qmagk_curve_key_${curveData.idx}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  log(`Curve CSV exported: Key ID ${curveData.idx}`, "ok");
}

function renderProfileKeyDetail(entry) {
  selectedProfileEntry = entry;
}

function renderProfileLayout(entries, state, selectedIdx = null) {
  const activeEntries = getPreviewLayoutEntries(entries, state);
  if (!activeEntries.length) {
    profileKeyboardCanvas.innerHTML = '<span class="empty">No active layout entries.</span>';
    return;
  }

  const baseUnit = 58;
  const minUnit = 28;
  const margin = 10;
  let maxRightU = 0;
  let maxBottomU = 0;
  for (const entry of activeEntries) {
    const size = keySizeForEntry(entry);
    maxRightU = Math.max(maxRightU, entry.x / 4 + size.leftOffsetU + size.widthU);
    maxBottomU = Math.max(maxBottomU, entry.y / 4 + size.heightU);
  }
  const availableWidth = Math.max(0, (profileKeyboardCanvas.parentElement?.clientWidth || 0) - margin * 2 - 28);
  const unit = availableWidth > 0 && maxRightU > 0
    ? Math.max(minUnit, Math.min(baseUnit, Math.floor(availableWidth / maxRightU)))
    : baseUnit;
  const gap = Math.max(2, Math.round((unit / baseUnit) * 3));
  const maxRight = maxRightU * unit;
  const maxBottom = maxBottomU * unit;

  profileKeyboardCanvas.replaceChildren();
  profileKeyboardCanvas.style.width = `${Math.ceil(maxRight + margin * 2)}px`;
  profileKeyboardCanvas.style.height = `${Math.ceil(maxBottom + margin * 2)}px`;

  for (const entry of activeEntries) {
    const size = keySizeForEntry(entry);
    const rect = keyRectForEntry(entry, unit, gap, margin);
    const key = document.createElement("button");
    key.type = "button";
    key.className = `keycap profile-key${entry.w === 0 ? " iso-enter" : ""}${entry.idx === selectedIdx ? " selected" : ""}`;
    key.style.left = `${rect.left}px`;
    key.style.top = `${rect.top}px`;
    key.style.width = `${rect.width}px`;
    key.style.height = `${rect.height}px`;
    const shape = entry.w === 0
      ? `<svg class="key-shape iso-shape" viewBox="0 0 150 200" preserveAspectRatio="none" aria-hidden="true"><path class="key-fill iso-fill" d="M8 1 H142 Q149 1 149 8 V192 Q149 199 142 199 H33 Q25 199 25 191 V97 H8 Q1 97 1 90 V8 Q1 1 8 1 Z" /></svg>`
      : `<svg class="key-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="key-fill" d="M8 1 H92 Q99 1 99 8 V92 Q99 99 92 99 H8 Q1 99 1 92 V8 Q1 1 8 1 Z" /></svg>`;
    key.innerHTML = `
      ${shape}
      <span class="key-content"></span>
    `;
    key.title = `Key ID ${entry.idx}`;
    key.addEventListener("click", () => {
      selectedProfileEntry = entry;
      renderProfileLayout(entries, state, entry.idx);
      renderProfileKeyDetail(entry);
      drawSelectedKeyCurve();
    });
    profileKeyboardCanvas.append(key);
  }

  const selected = activeEntries.find((entry) => entry.idx === selectedIdx) || activeEntries[0];
  selectedProfileEntry = selected;
  renderProfileKeyDetail(selected);
  drawSelectedKeyCurve();
}

function renderKeyboardLayout(entries, dynParams, state, selectedIdx = null) {
  const activeEntries = getPreviewLayoutEntries(entries, state);
  if (!activeEntries.length) {
    keyboardCanvas.innerHTML = '<span class="empty">No active layout entries.</span>';
    return;
  }

  const unit = 82;
  const gap = 5;
  const margin = 14;
  let maxRight = 0;
  let maxBottom = 0;
  for (const entry of activeEntries) {
    const size = keySizeForEntry(entry);
    maxRight = Math.max(maxRight, (entry.x / 4 + size.leftOffsetU + size.widthU) * unit);
    maxBottom = Math.max(maxBottom, (entry.y / 4 + size.heightU) * unit);
  }

  keyboardCanvas.replaceChildren();
  keyboardCanvas.style.width = `${Math.ceil(maxRight + margin * 2)}px`;
  keyboardCanvas.style.height = `${Math.ceil(maxBottom + margin * 2)}px`;

  for (const entry of activeEntries) {
    const param = dynParams[entry.idx];
    const paramValueHtml = editableParamHtml(param);
    const size = keySizeForEntry(entry);
    const key = document.createElement("button");
    key.type = "button";
    key.dataset.idx = String(entry.idx);
    const rect = keyRectForEntry(entry, unit, gap, margin);
    key.className = `keycap${entry.w === 0 ? " iso-enter" : ""}${dirtyDynIndices.has(entry.idx) ? " dirty" : ""}${selectedKeyIndices.has(entry.idx) ? " selected" : ""}${entry.idx === selectedIdx ? " focused" : ""}`;
    key.style.left = `${rect.left}px`;
    key.style.top = `${rect.top}px`;
    key.style.width = `${rect.width}px`;
    key.style.height = `${rect.height}px`;
    key.style.setProperty("--key-value-size", `${unit - gap - 16}px`);
    if (entry.w === 0) {
      key.innerHTML = `
        <svg class="key-shape iso-shape" viewBox="0 0 150 200" preserveAspectRatio="none" aria-hidden="true">
          <path class="key-fill iso-fill" d="M8 1 H142 Q149 1 149 8 V192 Q149 199 142 199 H33 Q25 199 25 191 V97 H8 Q1 97 1 90 V8 Q1 1 8 1 Z" />
        </svg>
        <span class="key-content layout-param-values iso-content">
          ${paramValueHtml}
        </span>
      `;
    } else {
      key.innerHTML = `
        <svg class="key-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path class="key-fill" d="M8 1 H92 Q99 1 99 8 V92 Q99 99 92 99 H8 Q1 99 1 92 V8 Q1 1 8 1 Z" />
        </svg>
        <span class="key-content layout-param-values">
          ${paramValueHtml}
        </span>
      `;
    }
    key.title = `idx ${entry.idx} / act_pt ${formatParamValue(param?.actPt)} / rst_pt ${formatParamValue(param?.rstPt)} / stroke ${formatParamValue(param?.stroke)}`;
    key.addEventListener("click", (event) => selectKey(entry, event));
    keyboardCanvas.append(key);
  }

  const selected = activeEntries.find((entry) => entry.idx === selectedIdx) || activeEntries[0];
  renderKeyDetail(selected, dynParams[selected.idx]);
  drawSelectedKeyCurve();
  setupDragSelection(activeEntries, unit, gap, margin);
}

function renderCancelLayout(entries, cclParams, state, selectedIdx = null) {
  const activeEntries = getPreviewLayoutEntries(entries, state);
  if (!activeEntries.length) {
    cancelKeyboardCanvas.innerHTML = '<span class="empty">No active layout entries.</span>';
    return;
  }

  const unit = 82;
  const gap = 5;
  const margin = 14;
  let maxRight = 0;
  let maxBottom = 0;
  for (const entry of activeEntries) {
    const size = keySizeForEntry(entry);
    maxRight = Math.max(maxRight, (entry.x / 4 + size.leftOffsetU + size.widthU) * unit);
    maxBottom = Math.max(maxBottom, (entry.y / 4 + size.heightU) * unit);
  }

  cancelKeyboardCanvas.replaceChildren();
  cancelKeyboardCanvas.style.width = `${Math.ceil(maxRight + margin * 2)}px`;
  cancelKeyboardCanvas.style.height = `${Math.ceil(maxBottom + margin * 2)}px`;

  for (const entry of activeEntries) {
    const param = cclParams[entry.idx];
    const rect = keyRectForEntry(entry, unit, gap, margin);
    const key = document.createElement("button");
    key.type = "button";
    key.dataset.idx = String(entry.idx);
    key.className = `keycap${entry.w === 0 ? " iso-enter" : ""}${dirtyCclIndices.has(entry.idx) ? " dirty" : ""}${selectedCancelKeyIndices.has(entry.idx) ? " selected" : ""}${entry.idx === selectedIdx ? " focused" : ""}`;
    key.style.left = `${rect.left}px`;
    key.style.top = `${rect.top}px`;
    key.style.width = `${rect.width}px`;
    key.style.height = `${rect.height}px`;
    key.style.setProperty("--key-value-size", `${unit - gap - 16}px`);
    const shape = entry.w === 0
      ? `<svg class="key-shape iso-shape" viewBox="0 0 150 200" preserveAspectRatio="none" aria-hidden="true"><path class="key-fill iso-fill" d="M8 1 H142 Q149 1 149 8 V192 Q149 199 142 199 H33 Q25 199 25 191 V97 H8 Q1 97 1 90 V8 Q1 1 8 1 Z" /></svg>`
      : `<svg class="key-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="key-fill" d="M8 1 H92 Q99 1 99 8 V92 Q99 99 92 99 H8 Q1 99 1 92 V8 Q1 1 8 1 Z" /></svg>`;
    key.innerHTML = `
      ${shape}
      <span class="key-content cancel-param-values">
        ${cclParamHtml(entry, param)}
      </span>
    `;
    key.title = `idx ${entry.idx} / tgt ${formatCclTarget(param?.tgtIdx, entry.idx)} / th ${formatParamValue(param?.tgtTh)}`;
    key.addEventListener("click", (event) => selectCancelKey(entry, event));
    cancelKeyboardCanvas.append(key);
  }

  const selected = activeEntries.find((entry) => entry.idx === selectedIdx) || activeEntries[0];
  if (selected && selectedCancelKeyIndices.size === 0) selectedCancelKeyIndices.add(selected.idx);
  renderCancelKeyDetail(selected, cclParams[selected.idx]);
  setDirtyStatus();
}

function renderRealtimeKeyboardLayout(entries, state, dcurValues) {
  const activeEntries = getPreviewLayoutEntries(entries, state);
  if (!activeEntries.length) {
    realtimeKeyboardCanvas.innerHTML = '<span class="empty">No active layout entries.</span>';
    realtimeLogKeyId.textContent = "-";
    return;
  }

  const unit = 58;
  const gap = 3;
  const margin = 10;
  let maxRight = 0;
  let maxBottom = 0;
  for (const entry of activeEntries) {
    const size = keySizeForEntry(entry);
    maxRight = Math.max(maxRight, (entry.x / 4 + size.leftOffsetU + size.widthU) * unit);
    maxBottom = Math.max(maxBottom, (entry.y / 4 + size.heightU) * unit);
  }

  realtimeKeyboardCanvas.replaceChildren();
  realtimeKeyboardCanvas.style.width = `${Math.ceil(maxRight + margin * 2)}px`;
  realtimeKeyboardCanvas.style.height = `${Math.ceil(maxBottom + margin * 2)}px`;

  const selected = activeEntries.find((entry) => entry.idx === selectedRealtimeEntryIdx) || activeEntries[0];
  selectedRealtimeEntryIdx = selected?.idx ?? null;
  realtimeLogKeyId.textContent = selectedRealtimeEntryIdx == null ? "-" : String(selectedRealtimeEntryIdx);

  for (const entry of activeEntries) {
    const size = keySizeForEntry(entry);
    const displayValue = getRealtimeMetricValue(entry.idx, dcurValues, realtimeAdcValues);
    const rect = keyRectForEntry(entry, unit, gap, margin);
    const key = document.createElement("div");
    key.className = `keycap realtime-key${entry.w === 0 ? " iso-enter" : ""}${entry.idx === selectedRealtimeEntryIdx ? " selected" : ""}`;
    key.style.left = `${rect.left}px`;
    key.style.top = `${rect.top}px`;
    key.style.width = `${rect.width}px`;
    key.style.height = `${rect.height}px`;
    key.style.setProperty("--key-value-size", `${unit - gap - 16}px`);
    const shape = entry.w === 0
      ? `<svg class="key-shape iso-shape" viewBox="0 0 150 200" preserveAspectRatio="none" aria-hidden="true"><path class="key-fill iso-fill" d="M8 1 H142 Q149 1 149 8 V192 Q149 199 142 199 H33 Q25 199 25 191 V97 H8 Q1 97 1 90 V8 Q1 1 8 1 Z" /></svg>`
      : `<svg class="key-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="key-fill" d="M8 1 H92 Q99 1 99 8 V92 Q99 99 92 99 H8 Q1 99 1 92 V8 Q1 1 8 1 Z" /></svg>`;
    key.innerHTML = `
      ${shape}
      <span class="key-content realtime-param-values">
        <span class="depth-value">${formatRealtimeMetricValue(displayValue)}</span>
        <span class="key-sub">${getRealtimeMetricUnit()}</span>
      </span>
    `;
    key.addEventListener("click", () => {
      selectedRealtimeEntryIdx = entry.idx;
      realtimePlotSamples = [];
      realtimeLogStartTimeMs = null;
      realtimePlotDirty = true;
      renderRealtimeKeyboardLayout(entries, state, dcurValues);
      renderRealtimePlot();
    });
    realtimeKeyboardCanvas.append(key);
  }
}

function resetRealtimePlotBuffer() {
  realtimePlotSamples = [];
  realtimeLogStartTimeMs = null;
  realtimeLastLayoutReadMs = 0;
}

function trimRealtimePlotSamples() {
  const removeCount = realtimePlotSamples.length - REALTIME_LOG_SAMPLE_LIMIT;
  if (removeCount > 0) {
    realtimePlotSamples.splice(0, removeCount);
  }
}

function recordRealtimePlotSample(sample, sampleTimeMs) {
  if (!sample) return;
  const metricKey = ["adc", "flux"].includes(sample.metric) ? sample.metric : "depth";
  const value = Number(sample.value);
  if (!Number.isFinite(value)) return;
  if (realtimeLogStartTimeMs == null) realtimeLogStartTimeMs = sampleTimeMs;
  realtimePlotSamples.push({
    elapsed: (sampleTimeMs - realtimeLogStartTimeMs) / 1000,
    [metricKey]: value,
  });
  trimRealtimePlotSamples();
}

function renderRealtimePlot() {
  const ctx = realtimePlotCanvas.getContext("2d");
  const width = realtimePlotCanvas.width;
  const height = realtimePlotCanvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfb";
  ctx.fillRect(0, 0, width, height);

  const hasSelection = selectedRealtimeEntryIdx != null;
  const hasSamples = realtimePlotSamples.length > 0;
  realtimeExportCsvButton.disabled = !hasSelection || !hasSamples;
  if (!hasSelection) {
    ctx.fillStyle = "#77817e";
    ctx.font = "28px Cascadia Mono, Consolas, monospace";
    ctx.fillText("Select key to log.", 60, 80);
    return;
  }
  if (!hasSamples) {
    ctx.fillStyle = "#77817e";
    ctx.font = "28px Cascadia Mono, Consolas, monospace";
    ctx.fillText("Press Start to log.", 60, 80);
    return;
  }

  const pad = { left: 122, right: 34, top: 40, bottom: 92 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const metricKey = getRealtimeMetric();
  const metricLabel = getRealtimeMetricLabel();
  const latestElapsed = realtimePlotSamples[realtimePlotSamples.length - 1].elapsed;
  const xWindowSeconds = 2;
  const xAxisMax = Math.max(xWindowSeconds, latestElapsed);
  const xAxisMin = Math.max(0, xAxisMax - xWindowSeconds);
  const visibleSamples = realtimePlotSamples.filter((point) => point.elapsed >= xAxisMin && point.elapsed <= xAxisMax);
  const metricValues = visibleSamples
    .map((point) => Number(point[metricKey]))
    .filter((value) => Number.isFinite(value));
  const maxMetricValue = metricValues.length ? Math.max(...metricValues) : 1;
  const minMetricValue = metricValues.length ? Math.min(...metricValues) : 0;
  const yRange = Math.max(1, maxMetricValue - minMetricValue);
  const yTickStep = niceTickStep(yRange, 5);
  const yAxisMin = Math.floor(minMetricValue / yTickStep) * yTickStep;
  const yAxisMax = Math.max(yAxisMin + yTickStep, Math.ceil(maxMetricValue / yTickStep) * yTickStep);
  const xTickStep = niceTickStep(xWindowSeconds, 4);
  const firstXTick = Math.ceil(xAxisMin / xTickStep) * xTickStep;
  const firstYTick = Math.ceil(yAxisMin / yTickStep) * yTickStep;
  const xFor = (elapsed) => pad.left + ((elapsed - xAxisMin) / xWindowSeconds) * plotWidth;
  const yFor = (value) => pad.top + (1 - (Math.min(Math.max(value, yAxisMin), yAxisMax) - yAxisMin) / (yAxisMax - yAxisMin)) * plotHeight;

  ctx.strokeStyle = "#d9dfdc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let time = firstXTick; time <= xAxisMax + 1e-6; time += xTickStep) {
    const x = xFor(time);
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotHeight);
  }
  for (let value = firstYTick; value <= yAxisMax + 1e-6; value += yTickStep) {
    const y = yFor(value);
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotWidth, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "#087b70";
  ctx.lineWidth = 5;
  ctx.beginPath();
  let plotStarted = false;
  visibleSamples.forEach((point) => {
    const x = xFor(point.elapsed);
    const value = Number(point[metricKey]);
    if (!Number.isFinite(value)) return;
    const y = yFor(value);
    if (!plotStarted) {
      ctx.moveTo(x, y);
      plotStarted = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.fillStyle = "#1d2424";
  ctx.font = "28px Cascadia Mono, Consolas, monospace";
  ctx.fillText("Elapsed Time [s]", pad.left + plotWidth / 2 - 128, height - 20);
  ctx.save();
  ctx.translate(30, pad.top + plotHeight / 2 + 140);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(metricLabel, 0, 0);
  ctx.restore();
  ctx.font = "24px Cascadia Mono, Consolas, monospace";
  for (let time = firstXTick; time <= xAxisMax + 1e-6; time += xTickStep) {
    const label = formatAxisLabel(time);
    ctx.fillText(label, xFor(time) - 14, height - 58);
  }
  for (let value = firstYTick; value <= yAxisMax + 1e-6; value += yTickStep) {
    const y = yFor(value);
    const label = formatAxisLabel(value);
    ctx.fillText(label, 56, y + 8);
  }
}

function exportRealtimeCsv() {
  if (selectedRealtimeEntryIdx == null || !realtimePlotSamples.length) {
    log("Depth Monitor CSVを書き出すキーが選択されていません。", "warn");
    return;
  }
  const metricKey = getRealtimeMetric();
  const metricHeader = metricKey === "adc" ? "adc_raw" : metricKey === "flux" ? "flux_gs" : "depth_um";
  const rows = [
    `elapsed_seconds,${metricHeader}`,
    ...realtimePlotSamples.map((point) => {
      const value = Number(point[metricKey]);
      return `${point.elapsed.toFixed(3)},${Number.isFinite(value) ? value : ""}`;
    }),
  ];
  const blob = new Blob([`${rows.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `qmagk_${metricKey}_key_${selectedRealtimeEntryIdx}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  log(`Depth Monitor CSV exported: Key ID ${selectedRealtimeEntryIdx}, ${realtimePlotSamples.length} samples`, "ok");
}

function normalizeRealtimeIntervalInput() {
  const intervalRange = paramRanges.realtimeInterval || { min: 10, max: 1000 };
  const parsed = Number.parseInt(realtimeIntervalInput.value, 10);
  const next = Math.max(intervalRange.min, Math.min(intervalRange.max, Number.isNaN(parsed) ? intervalRange.min : parsed));
  realtimeIntervalInput.value = String(next);
}

async function readDcurRange(startIdx, count) {
  const packet = createPacket(MAG_CMD_READ_D_CUR);
  packet[3] = startIdx;
  packet[4] = count;
  const response = await sendRawPacket(packet, 500, false);
  checkStatus(response);
  const values = [];
  for (let i = 0; i < response[4]; i++) {
    values.push(readI16LE(response, 7 + i * 2));
  }
  return { start: response[3], values };
}

async function readAdcCurRange(startIdx, count) {
  const packet = createPacket(MAG_CMD_READ_ADC_CUR);
  packet[3] = startIdx;
  packet[4] = count;
  const response = await sendRawPacket(packet, 500, false);
  checkStatus(response);
  const values = [];
  for (let i = 0; i < response[4]; i++) {
    values.push(readU16(response, 7 + i * 2));
  }
  return { start: response[3], values };
}

async function readRealtimeKey(idx) {
  const packet = createPacket(MAG_CMD_READ_REALTIME_KEY);
  packet[3] = idx;
  packet[4] = getRealtimeMetricCode();
  const response = await sendRawPacket(packet, 500, false);
  checkStatus(response);
  const requestMetric = getRealtimeMetric();
  const responseMetric = requestMetric === "flux" && response[4] === 1 ? "flux" : response[4] === 1 ? "adc" : "depth";
  const rawValue = response[4] === 1 ? readU16(response, 7) : readI16LE(response, 7);
  const stroke = Number(lastDynParams[response[3]]?.stroke);
  const value = responseMetric === "adc"
    ? rawValue
    : responseMetric === "flux"
      ? calcFluxGauss(response[3], rawValue)
      : Number.isFinite(stroke) ? Math.max(0, stroke - rawValue) : Number.NaN;
  return {
    idx: response[3],
    metric: responseMetric,
    value,
    rawValue,
  };
}

async function readAllDcur() {
  if (!lastInfo) await getFirmwareInfo();
  const values = Array(lastInfo.matrixSize).fill(null);
  const maxCount = Math.floor(MAX_PAYLOAD_SIZE / 2);
  for (let start = 0; start < lastInfo.matrixSize; start += maxCount) {
    const count = Math.min(maxCount, lastInfo.matrixSize - start);
    const chunk = await readDcurRange(start, count);
    chunk.values.forEach((value, offset) => {
      values[chunk.start + offset] = value;
    });
  }
  return values;
}

async function readAllAdcCur() {
  if (!lastInfo) await getFirmwareInfo();
  const values = Array(lastInfo.matrixSize).fill(null);
  const maxCount = Math.floor(MAX_PAYLOAD_SIZE / 2);
  for (let start = 0; start < lastInfo.matrixSize; start += maxCount) {
    const count = Math.min(maxCount, lastInfo.matrixSize - start);
    const chunk = await readAdcCurRange(start, count);
    chunk.values.forEach((value, offset) => {
      values[chunk.start + offset] = value;
    });
  }
  return values;
}

async function pollRealtimeOnce() {
  if (realtimePolling) return;
  realtimePolling = true;
  try {
    const now = performance.now();
    let sampled = false;
    if (selectedRealtimeEntryIdx != null) {
      const sample = await readRealtimeKey(selectedRealtimeEntryIdx);
      const sampleTime = performance.now();
      if (sample.metric === "adc") {
        realtimeAdcValues[sample.idx] = sample.value;
      } else if (sample.metric === "flux") {
        realtimeAdcValues[sample.idx] = sample.rawValue;
      } else {
        realtimeDcurValues[sample.idx] = sample.rawValue;
      }
      recordRealtimePlotSample(sample, sampleTime);
      sampled = true;
    }
    if (!sampled || now - realtimeLastLayoutReadMs >= REALTIME_LAYOUT_UPDATE_MS) {
      if (getRealtimeMetric() === "adc" || getRealtimeMetric() === "flux") {
        realtimeAdcValues = await readAllAdcCur();
      } else {
        realtimeDcurValues = await readAllDcur();
      }
      realtimeLastLayoutReadMs = performance.now();
      renderRealtimeKeyboardLayout(lastLayoutEntries, lastLayoutState, realtimeDcurValues);
    }
    renderRealtimePlot();
  } catch (error) {
    stopRealtimeMode();
    setRealtimeStatus(error.message);
    log(error.message, "error");
  } finally {
    realtimePolling = false;
  }
}

async function startRealtimeMode() {
  if (!lastLayoutEntries.length || !lastLayoutState || !lastDynParams.length || !lastCalParams.length) {
    await readAndRenderLayoutGui();
  }
  normalizeRealtimeIntervalInput();
  const interval = Number.parseInt(realtimeIntervalInput.value, 10) || 100;
  stopRealtimeMode();
  resetRealtimePlotBuffer();
  setRealtimeStatus("");
  await pollRealtimeOnce();
  realtimeTimerId = window.setInterval(pollRealtimeOnce, interval);
  setActionButtonsEnabled(Boolean(activeDevice?.opened));
}

function stopRealtimeMode() {
  if (realtimeTimerId) {
    window.clearInterval(realtimeTimerId);
    realtimeTimerId = null;
  }
  realtimePolling = false;
  setRealtimeStatus("");
  setActionButtonsEnabled(Boolean(activeDevice?.opened));
}

async function readAndRenderLayoutGui() {
  if (!lastInfo) await getFirmwareInfo();
  const layoutBytes = await readBlock(BLOCK_LAYOUT, lastInfo.layoutBlockSize, "Layout");
  const dynBytes = await readBlock(BLOCK_DYN, lastInfo.dynBlockSize, "DYN / param1");
  const calBytes = await readBlock(BLOCK_CAL, lastInfo.calBlockSize, "CAL");
  const stateBytes = await readBlock(BLOCK_LAYOUT_STATE, lastInfo.layoutStateSize, "Layout state");
  let sensiOffsetBytes = null;
  try {
    sensiOffsetBytes = await readBlock(BLOCK_SENSI_OFFSET, SENSI_OFFSET_BLOCK_SIZE, "Sensi offset");
  } catch (error) {
    log(`Sensi offset block is not available: ${error.message}`, "warn");
  }
  lastLayoutEntries = parseLayoutEntries(layoutBytes, lastInfo.layoutEntrySize);
  const labelEntryCount = new Set(lastLayoutEntries.filter((entry) => entry.option !== LAYOUT_OPTION_COMMON).map((entry) => layoutLabelKey(entry.option, entry.choice))).size;
  lastLayoutLabels = new Map();
  lastDynParams = parseDynParams(dynBytes, lastInfo.dynParamSize);
  lastCalParams = parseCalParams(calBytes, lastInfo.calParamSize);
  lastSensiOffsets = sensiOffsetBytes ? parseSensiOffsets(sensiOffsetBytes) : [];
  lastLayoutState = normalizeLayoutState(lastLayoutEntries, parseLayoutState(stateBytes), lastInfo);
  layoutStateDirty = lastLayoutState.changed;
  sensiOffsetDirty = false;
  dirtyDynIndices.clear();
  selectedKeyIndices.clear();
  const firstActiveEntry = lastLayoutEntries.find((entry) => isLayoutEntryActive(entry, lastLayoutState));
  if (firstActiveEntry) {
    selectedKeyIndices.add(firstActiveEntry.idx);
    selectedLayoutEntry = firstActiveEntry;
    selectedProfileEntry = firstActiveEntry;
    selectedCalibrationEntry = firstActiveEntry;
    selectionAnchorIdx = firstActiveEntry.idx;
  }
  setDirtyStatus();
  renderSensiOffsetInputs();
  refreshRuntimeState().catch((error) => log(`Runtime state is not available: ${error.message}`, "warn"));
  refreshLayoutViews(selectedLayoutEntry?.idx);
  log(`Layout GUI rendered: ${lastLayoutEntries.length} entries, ${lastDynParams.length} param1 records`, "ok");
  loadLayoutLabelsOptional(labelEntryCount);
}

async function loadLayoutLabelsOptional(labelEntryCount) {
  if (!labelEntryCount || !activeDevice?.opened) return;
  try {
    const labelBytes = await readBlock(BLOCK_LAYOUT_LABEL, labelEntryCount * LAYOUT_LABEL_ENTRY_SIZE, "Layout labels");
    lastLayoutLabels = parseLayoutLabels(labelBytes);
    renderLayoutOptions();
  } catch (error) {
    lastLayoutLabels = new Map();
    renderLayoutOptions();
    log(`Layout labels are not available: ${error.message}`, "warn");
  }
}

async function readAndRenderCancelGui() {
  if (!lastInfo) await getFirmwareInfo();
  if (!lastLayoutEntries.length || !lastLayoutState) {
    await ensureLayoutLoaded();
  }
  const cclBytes = await readBlock(BLOCK_CCL, lastInfo.cclBlockSize, "CCL param");
  lastCclParams = parseCclParams(cclBytes, lastInfo.cclParamSize);
  lastCclParams.forEach((param, idx) => {
    param.tgtIdx = normalizeCclTarget(param.tgtIdx, idx);
  });
  dirtyCclIndices.clear();
  selectedCancelKeyIndices.clear();
  const firstActiveEntry = lastLayoutEntries.find((entry) => isLayoutEntryActive(entry, lastLayoutState));
  if (firstActiveEntry) {
    selectedCancelKeyIndices.add(firstActiveEntry.idx);
    selectedLayoutEntry = firstActiveEntry;
  }
  setDirtyStatus();
  renderCancelLayout(lastLayoutEntries, lastCclParams, lastLayoutState, selectedLayoutEntry?.idx);
  refreshRuntimeState().catch((error) => log(`Runtime state is not available: ${error.message}`, "warn"));
  log(`Cancel GUI rendered: ${lastCclParams.length} CCL records`, "ok");
}

async function readAndRenderCalibrationGui() {
  await refreshCalibrationGui(false);
}

async function readHeaderBlock() {
  if (!lastInfo) await getFirmwareInfo();
  await readBlock(BLOCK_HEADER, lastInfo.headerBlockSize, "Header");
}

async function readLayoutBlock() {
  if (!lastInfo) await getFirmwareInfo();
  const bytes = await readBlock(BLOCK_LAYOUT, lastInfo.layoutBlockSize, "Layout");
  if (blockDump) blockDump.textContent += formatLayoutEntries(bytes, lastInfo.layoutEntrySize);
}

async function sendPing() {
  try {
    if (!packetInput) return;
    const packet = parseHexPacket(packetInput.value);
    const response = await sendRawPacket(packet);
    if (blockDump) blockDump.textContent = `Response\n${formatDump(response)}`;
    if (response[0] === VIA_UNHANDLED) {
      log("VIA returned unhandled (0xFF). Firmware is not routing MAG Raw HID command ID 0x4D yet.", "warn");
    }
  } catch (error) {
    log(error.message, "error");
  }
}

if ("hid" in navigator) {
  navigator.hid.addEventListener("disconnect", (event) => {
    if (event.device === activeDevice) {
      stopRealtimeMode();
      stopCalibrationPolling();
      log(`${event.device.productName || "HID device"} が切断されました。`, "warn");
      setConnected(null);
    }
  });
} else {
  log("WebHID未対応ブラウザです。ChromeまたはEdgeを使用してください。", "error");
}

window.addEventListener("beforeunload", (event) => {
  if (isCalibrationUiLocked()) {
    event.preventDefault();
    event.returnValue = "キャリブレーション中です。本当に実行しますか？";
  }
});

tabButtons.forEach((button) => button.addEventListener("click", () => setActiveTab(button.dataset.tabTarget)));
connectButton.addEventListener("click", connectKeyboard);
pingButton?.addEventListener("click", sendPing);
getInfoButton?.addEventListener("click", () => getFirmwareInfo().catch((error) => log(error.message, "error")));
readHeaderButton?.addEventListener("click", () => readHeaderBlock().catch((error) => log(error.message, "error")));
readLayoutButton?.addEventListener("click", () => readLayoutBlock().catch((error) => log(error.message, "error")));
renderLayoutButton?.addEventListener("click", () => loadLayoutWithFeedback(true).catch((error) => log(error.message, "error")));
renderProfileButton.addEventListener("click", () => readAndRenderLayoutGui().catch((error) => log(error.message, "error")));
renderCalibrationButton.addEventListener("click", () => readAndRenderCalibrationGui().catch((error) => log(error.message, "error")));
enterCalibrationButton.addEventListener("click", () => {
  if (!confirmAction("Enter CALしますか？")) return;
  calibrationTransitionPending = true;
  calibrationTransitionTarget = true;
  updateCalibrationActionButtons();
  requestCalibrationMode(true)
    .then(() => waitForCalibrationMode(true))
    .then(() => refreshCalibrationGui(false))
    .catch((error) => {
      calibrationTransitionPending = false;
      calibrationTransitionTarget = null;
      updateCalibrationActionButtons();
      log(error.message, "error");
    });
});
exitCalibrationButton.addEventListener("click", () => {
  if (!confirmAction("Exit CALしますか？")) return;
  stopCalibrationPolling();
  calibrationTransitionPending = true;
  calibrationTransitionTarget = false;
  updateCalibrationActionButtons();
  delay(CAL_SW_EXIT_QUIET_MS)
    .then(() => requestCalibrationMode(false))
    .then(() => waitForCalibrationMode(false))
    .then(() => delay(150))
    .then(() => refreshCalibrationGui(false))
    .catch((error) => {
      calibrationTransitionPending = false;
      calibrationTransitionTarget = null;
      updateCalibrationActionButtons();
      log(error.message, "error");
    });
});
runPcbCalButton.addEventListener("click", () => {
  if (!confirmAction("PCBキャリブレーションを実行しますか？\n実行する場合はスイッチをPCBから取り外してください。")) return;
  pcbCalRunning = true;
  updateCalibrationActionButtons();
  requestPcbCalibration()
    .then(() => refreshCalibrationGui(false))
    .catch((error) => log(error.message, "error"))
    .finally(() => {
      pcbCalRunning = false;
      updateCalibrationActionButtons();
    });
});
saveParam1Button.addEventListener("click", () => saveParam1Changes().catch((error) => log(error.message, "error")));
selectAllKeysButton.addEventListener("click", selectAllVisibleKeys);
clearSelectionButton.addEventListener("click", clearSelectedKeys);
applyBulkParamButton.addEventListener("click", applyBulkParams);
sensiOffsetInputs.forEach((input) => input?.addEventListener("change", handleSensiOffsetInput));
applySensiOffsetStageButton?.addEventListener("click", () => {
  setRuntimeState({ sensiOffsetStage: sensiOffsetStageSelect?.value }).catch((error) => log(error.message, "error"));
});
saveCclButton.addEventListener("click", () => saveCclChanges().catch((error) => log(error.message, "error")));
enableCancelButton?.addEventListener("click", () => {
  setRuntimeState({ cclEnabled: true }).catch((error) => log(error.message, "error"));
});
disableCancelButton?.addEventListener("click", () => {
  setRuntimeState({ cclEnabled: false }).catch((error) => log(error.message, "error"));
});
hallSensitivityInput.addEventListener("input", () => {
  syncHallSensitivityInputs(hallSensitivityInput);
  drawSelectedKeyCurve();
  if (getRealtimeMetric() === "flux") {
    resetRealtimePlotBuffer();
    renderRealtimeKeyboardLayout(lastLayoutEntries, lastLayoutState, realtimeDcurValues);
    renderRealtimePlot();
  }
});
exportCurveCsvButton.addEventListener("click", exportSelectedCurveCsv);
realtimeExportCsvButton.addEventListener("click", exportRealtimeCsv);
realtimeIntervalInput.addEventListener("blur", normalizeRealtimeIntervalInput);
realtimeIntervalInput.addEventListener("change", normalizeRealtimeIntervalInput);
window.addEventListener("resize", () => {
  const calibrationPanel = document.querySelector('[data-tab="calibration"]');
  if (!calibrationPanel?.classList.contains("tab-panel-hidden") && lastLayoutEntries.length) {
    if (calibrationLiveMode) {
      refreshCalibrationGui(true).catch((error) => log(error.message, "error"));
    } else {
  renderCalibrationLayout(lastLayoutEntries, lastLayoutState, selectedCalibrationEntry?.idx);
  }
  }
  const profilePanel = document.querySelector('[data-tab="profile"]');
  if (!profilePanel?.classList.contains("tab-panel-hidden") && lastLayoutEntries.length) {
    renderProfileLayout(lastLayoutEntries, lastLayoutState, selectedProfileEntry?.idx);
  }
  const realtimePanel = document.querySelector('[data-tab="realtime"]');
  if (!realtimePanel?.classList.contains("tab-panel-hidden")) {
    renderRealtimeKeyboardLayout(lastLayoutEntries, lastLayoutState, realtimeDcurValues);
    renderRealtimePlot();
  }
});
startRealtimeButton.addEventListener("click", () => startRealtimeMode().catch((error) => log(error.message, "error")));
stopRealtimeButton.addEventListener("click", stopRealtimeMode);
clearLogButton?.addEventListener("click", () => logList?.replaceChildren());
adminUnlockButton.addEventListener("click", unlockAdmin);
adminPasswordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") unlockAdmin();
});
realtimeMetricSelect.addEventListener("change", () => {
  updateRealtimeFluxSensitivityVisibility();
  resetRealtimePlotBuffer();
  renderRealtimeKeyboardLayout(lastLayoutEntries, lastLayoutState, realtimeDcurValues);
  renderRealtimePlot();
});
realtimeHallSensitivityInput?.addEventListener("input", () => {
  syncHallSensitivityInputs(realtimeHallSensitivityInput);
  if (getRealtimeMetric() === "flux") {
    resetRealtimePlotBuffer();
    renderRealtimeKeyboardLayout(lastLayoutEntries, lastLayoutState, realtimeDcurValues);
    renderRealtimePlot();
  }
});

applyParamRangesToInputs();
updateRealtimeFluxSensitivityVisibility();
