"use strict";

const { items, yokai, bosses, flags, trophies, devices } = window.qrCatalog;
const groups = { yokai, item: items, boss: bosses, trophy: trophies, flag: flags };
const folders = { yokai: "yokai", item: "item", boss: "boss_dex", trophy: "trophy", flag: "flags" };
let device = "old3ds";

const collator = new Intl.Collator("ja", { numeric: true });
const pageSize = 30;
const $ = (selector) => document.querySelector(selector);
const tabs = [...document.querySelectorAll("[data-tab]")];
const deviceButtons = [...document.querySelectorAll("[data-device]")];
const queryInput = $("#query");
const clearSearch = $("#clear-search");
const categorySelect = $("#categories");
const filters = $("#filters");
const entryList = $("#entries");
const entryTemplate = $("#entry-template");
const pager = $("#pager");
const resultHeading = $("#result-heading");
const dialog = $("#qr-dialog");
const qrDisplay = $("#qr-display");
const variants = $("#variants");
const saveImage = $("#save-image");
const scan = $("#scan");
const scanCode = $("#scan-code");
let currentEntry = null;
let currentGroup = null;
let currentIndex = 0;
let state = readLocation();

function normalize(text) {
  return text.normalize("NFKC").toLowerCase()
    .replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60))
    .replace(/[・.\s]/g, "")
    .trim();
}

function numberLabel(number) {
  return String(number).padStart(3, "0");
}

function imageUrl(group, filename) {
  return `qr/${device}/${folders[group]}/${encodeURIComponent(filename)}`;
}

function entryMeta(entry, group) {
  if (group === "item") return entry.qty99 ? "99個" : `×${entry.qty ?? 1}`;
  if (group === "flag") return entry.category ?? "フラグ";
  if (group === "trophy") {
    if (entry.rank === "まとめて") return "まとめて解除";
    return `#${String(entry.number).padStart(2, "0")} · ${entry.rank} · ${entry.points}pt`;
  }
  if (entry.number == null) return group === "boss" ? "図鑑" : "番号不明";
  return group === "boss" ? `No. ${numberLabel(entry.number)} · 図鑑登録` : `No. ${numberLabel(entry.number)}`;
}

for (const item of items) {
  item.search = normalize(`${item.name} ${item.id ?? ""} ${item.qty99 ? "99" : ""}`);
}
for (const entry of [...yokai, ...bosses]) {
  entry.search = normalize(`${entry.name} ${entry.number ?? ""} ${entry.id ?? ""}`);
}
for (const entry of flags) {
  entry.search = normalize(`${entry.name} ${entry.bit ?? ""} ${entry.hash ?? ""} ${entry.category ?? ""} フラグ`);
}
for (const entry of trophies) {
  entry.search = normalize(`${entry.name} ${entry.number ?? ""} ${entry.rank ?? ""} トロフィー`);
}
items.sort((a, b) => collator.compare(a.name, b.name));
yokai.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || collator.compare(a.name, b.name));
bosses.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || collator.compare(a.name, b.name));
flags.sort((a, b) => collator.compare(a.name, b.name));

function readLocation() {
  const params = new URLSearchParams(location.hash.slice(1));
  const rawTab = params.get("tab");
  const tab = Object.hasOwn(groups, rawTab) ? rawTab : "yokai";
  device = params.get("dev") === "new3ds" ? "new3ds" : "old3ds";
  const rawPage = Number(params.get("page"));
  return {
    tab,
    category: params.get("category") ?? "all",
    query: params.get("q") ?? "",
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

function writeLocation(method) {
  const params = new URLSearchParams();
  if (state.tab !== "yokai") params.set("tab", state.tab);
  if (device !== "old3ds") params.set("dev", device);
  if (state.category && state.category !== "all") params.set("category", state.category);
  if (state.query) params.set("q", state.query);
  if (state.page > 1) params.set("page", String(state.page));
  const hash = params.size ? `#${params}` : "";
  if (hash === location.hash) return;
  const url = new URL(location.href);
  url.hash = hash;
  history[method === "push" ? "pushState" : "replaceState"](null, "", url);
}

function setState(next, method = "replace") {
  state = { ...state, ...next };
  render();
  writeLocation(method);
}

function matches(entry, terms, group) {
  return terms.every((term) => {
    if (group !== "item" && group !== "flag" && /^(?:no)?\d{1,3}$/.test(term)) {
      return Number(term.replace(/^no/, "")) === entry.number;
    }
    return entry.search.includes(term);
  });
}

function makeEntry(entry, group) {
  const row = entryTemplate.content.firstElementChild.cloneNode(true);
  const button = row.querySelector("button");
  row.querySelector(".entry-meta").textContent = entryMeta(entry, group);
  row.querySelector(".entry-name").textContent = entry.name;
  if (entry.images.length) {
    button.addEventListener("click", () => openQr(entry, group));
  } else {
    button.disabled = true;
    row.querySelector(".entry-action").textContent = "準備中";
  }
  return row;
}

function categoriesFor(tab) {
  const keys = [...new Set(groups[tab].map((entry) => entry.category).filter(Boolean))];
  return keys.sort(collator.compare);
}

function render() {
  const { tab, query } = state;
  const terms = normalize(query).replace(/\bno\s+(?=\d)/g, "no").split(/\s+/).filter(Boolean);
  const categoryKeys = categoriesFor(tab);
  const hasFilter = categoryKeys.length > 1 && (tab === "item" || tab === "yokai" || tab === "trophy" || tab === "flag");
  if (!hasFilter) state.category = "all";
  else if (state.category !== "all" && !categoryKeys.includes(state.category)) state.category = "all";
  const filtered = groups[tab].filter((entry) =>
    (!hasFilter || state.category === "all" || entry.category === state.category) &&
    matches(entry, terms, tab));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  state.page = Math.min(state.page, pageCount);
  const start = (state.page - 1) * pageSize;

  $("#section-title").textContent = { yokai: "妖怪", item: "アイテム", boss: "ボス図鑑", trophy: "トロフィー", flag: "フラグ" }[tab];
  filters.hidden = !hasFilter;
  if (hasFilter) {
    const options = [["all", "すべて"], ...categoryKeys.map((key) => [key, key])];
    const current = state.category;
    categorySelect.replaceChildren(...options.map(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }));
    categorySelect.value = current;
  }
  queryInput.placeholder = { yokai: "妖怪名・番号で検索", item: "アイテム名で検索",
    boss: "ボス名・図鑑番号で検索", trophy: "トロフィー名で検索", flag: "フラグ名で検索" }[tab];
  queryInput.setAttribute("aria-label", queryInput.placeholder);
  if (queryInput.value !== query) queryInput.value = query;
  clearSearch.hidden = query.length === 0;
  for (const link of tabs) {
    if (link.dataset.tab === tab) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  for (const button of deviceButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.device === device));
  }

  resultHeading.textContent = {
    yokai: "大辞典順", item: "名前順（99個のものは99個）",
    boss: "図鑑番号順", trophy: "トロフィー順（まとめて解除あり）",
    flag: "イベント・ミッションのフラグ",
  }[tab];
  $("#result-count").textContent = `${filtered.length.toLocaleString("ja-JP")}件`;
  entryList.replaceChildren(...filtered.slice(start, start + pageSize).map((entry) => makeEntry(entry, tab)));
  entryList.hidden = filtered.length === 0;
  $("#empty").hidden = filtered.length > 0;
  pager.hidden = pageCount < 2;
  $("#prev-page").disabled = state.page === 1;
  $("#next-page").disabled = state.page >= pageCount;
  $("#page-status").textContent = `${state.page} / ${pageCount}`;
}

function openQr(entry, group) {
  currentEntry = entry;
  currentGroup = group;
  $("#dialog-title").textContent = entry.name;
  $("#dialog-meta").textContent = entryMeta(entry, group);
  variants.replaceChildren();
  variants.hidden = entry.images.length < 2;

  function showImage(index) {
    currentIndex = index;
    const filename = entry.images[index];
    const url = imageUrl(group, filename);
    const image = new Image(1280, 1280);
    image.alt = `${entry.name}のQRコード`;
    image.src = url;
    qrDisplay.replaceChildren(image);
    saveImage.href = url;
    saveImage.download = filename;
    for (const [position, button] of [...variants.children].entries()) {
      button.setAttribute("aria-pressed", String(position === index));
    }
  }

  if (!variants.hidden) {
    for (const index of entry.images.keys()) {
      const button = document.createElement("button");
      button.className = "secondary-button variant";
      button.type = "button";
      button.textContent = `QR ${index + 1}`;
      button.addEventListener("click", () => showImage(index));
      variants.append(button);
    }
  }
  showImage(0);
  dialog.showModal();
}

// QR画像から1モジュール=1pxの白黒画像を作り、整数倍で拡大する。
function moduleGrid(image) {
  const size = image.naturalWidth;
  if (!size) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, size, size).data;
  let left = size, top = size, right = -1;
  for (let y = 0; y < size; y += 1) {
    const row = y * size * 4;
    for (let x = 0; x < size; x += 1) {
      if (pixels[row + x * 4] > 127) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
    }
  }
  if (right < 0) return null;
  const moduleSize = 8;
  const modules = Math.round((right - left + 1) / moduleSize);
  if (modules < 21 || (modules - 17) % 4 !== 0) return null;
  const border = 4;
  const total = modules + border * 2;
  const origin = left - border * moduleSize;
  if (origin < 0 || top - border * moduleSize < 0) return null;
  const grid = document.createElement("canvas");
  grid.width = grid.height = total;
  const gridContext = grid.getContext("2d", { willReadFrequently: true });
  gridContext.imageSmoothingEnabled = false;
  gridContext.drawImage(image, origin, top - border * moduleSize,
                        total * moduleSize, total * moduleSize, 0, 0, total, total);
  return { grid, total };
}

function scanCanvas(image) {
  const found = moduleGrid(image);
  if (!found) return null;
  const ratio = window.devicePixelRatio || 1;
  const room = Math.min(window.innerWidth, window.innerHeight) * 0.94;
  const scale = Math.max(1, Math.floor((room * ratio) / found.total));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = found.total * scale;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(found.grid, 0, 0, canvas.width, canvas.height);
  canvas.style.width = canvas.style.height = `${canvas.width / ratio}px`;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "QRコード");
  return canvas;
}

function enterScan() {
  if (!currentEntry) return;
  const url = imageUrl(currentGroup, currentEntry.images[currentIndex]);
  const source = qrDisplay.querySelector("img");
  const canvas = source && source.complete ? scanCanvas(source) : null;
  if (canvas) {
    scanCode.replaceChildren(canvas);
    scanCode.style.backgroundImage = "";
  } else {
    scanCode.replaceChildren();
    scanCode.style.backgroundImage = `url("${url}")`;
  }
  dialog.close();
  scan.hidden = false;
  const hint = document.querySelector("#scan-hint");
  hint.style.animation = "none";
  void hint.offsetWidth;
  hint.style.animation = "";
  document.body.classList.add("scanning");
  const root = document.documentElement;
  if (root.requestFullscreen && !document.fullscreenElement) {
    root.requestFullscreen().catch(() => {});
  }
}

function exitScan() {
  if (scan.hidden) return;
  scanCode.replaceChildren();
  scan.hidden = true;
  scanCode.style.backgroundImage = "";
  document.body.classList.remove("scanning");
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  if (!currentEntry) return;
  const index = currentIndex;
  openQr(currentEntry, currentGroup);
  if (index > 0 && variants.children[index]) variants.children[index].click();
}

function changePage(offset) {
  setState({ page: state.page + offset }, "push");
  resultHeading.focus();
  resultHeading.scrollIntoView({ block: "start" });
}

for (const link of tabs) {
  link.addEventListener("click", (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (link.dataset.tab !== state.tab) {
      setState({ tab: link.dataset.tab, category: "all", query: "", page: 1 }, "push");
    }
  });
}
for (const button of deviceButtons) {
  button.addEventListener("click", () => {
    if (button.dataset.device === device) return;
    device = button.dataset.device;
    render();
    writeLocation("push");
    if (dialog.open && currentEntry) openQr(currentEntry, currentGroup);
  });
}
$("#search").addEventListener("submit", (event) => event.preventDefault());
categorySelect.addEventListener("change", () => setState({ category: categorySelect.value, page: 1 }, "push"));
queryInput.addEventListener("input", (event) => {
  if (!event.isComposing) setState({ query: queryInput.value, page: 1 });
});
queryInput.addEventListener("compositionend", () => setState({ query: queryInput.value, page: 1 }));
clearSearch.addEventListener("click", () => {
  setState({ query: "", page: 1 });
  queryInput.focus();
});
$("#reset").addEventListener("click", () => {
  setState({ query: "", category: "all", page: 1 }, "push");
  queryInput.focus();
});
$("#prev-page").addEventListener("click", () => changePage(-1));
$("#next-page").addEventListener("click", () => changePage(1));
$("#close-dialog").addEventListener("click", () => dialog.close());
$("#easy-mode").addEventListener("click", enterScan);
scan.addEventListener("click", exitScan);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !scan.hidden) exitScan();
});
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && !scan.hidden) exitScan();
});
$("#show-prereq").addEventListener("click", () => {
  dialog.close();
  $("#prereq").open = true;
  $("#prereq").scrollIntoView({ block: "start" });
});
$("#show-trouble").addEventListener("click", () => {
  dialog.close();
  $("#trouble").open = true;
  $("#trouble").scrollIntoView({ block: "start" });
});
dialog.addEventListener("close", () => {
  if (!dialog.open) qrDisplay.replaceChildren();
});
dialog.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});
window.addEventListener("hashchange", () => {
  if (dialog.open) dialog.close();
  state = readLocation();
  render();
});

render();
