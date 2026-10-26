var Zotero;
var Services = globalThis.Services || ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs").Services;
var helperScope = {};
var columnKeys = [];
var active = false;
var busy = false;
var observerID = null;
var pendingItems = new Set();
var automaticTask = null;
var windowCleanups = new Map();

function install() {}
function uninstall() {}

async function startup(data, reason) {
  Zotero = Services.wm.getMostRecentWindow("navigator:browser")?.Zotero;
  if (!Zotero) {
    Zotero = ChromeUtils.importESModule("chrome://zotero/content/zotero.mjs").Zotero;
  }
  await Zotero.initializationPromise;
  Services.scriptloader.loadSubScript(data.rootURI + "lib.js", helperScope);
  active = true;
  const options = [{
    dataKey: "citationCount",
    label: "Citation Count",
    pluginID: data.id,
    dataProvider: item => item.isRegularItem() ? helperScope.CitationHelpers.read(item.getField("extra")) : "",
    zoteroPersist: ["width", "hidden", "sortDirection"]
  }, {
    dataKey: "citationCountUpdatedDate",
    label: "Citation Count updated date",
    pluginID: data.id,
    dataProvider: item => item.isRegularItem() ? helperScope.CitationHelpers.updatedDate(item.getField("extra")) : "",
    zoteroPersist: ["width", "hidden", "sortDirection"]
  }];
  if (Zotero.ItemTreeManager.registerColumn) {
    for (const option of options) {
      const key = await Zotero.ItemTreeManager.registerColumn(option);
      if (key) columnKeys.push(key);
    }
  } else {
    columnKeys = (await Zotero.ItemTreeManager.registerColumns(options)).filter(Boolean);
  }
  observerID = Zotero.Notifier.registerObserver({
    notify(event, type, ids) {
      if (!active || event !== "add" || type !== "item") return;
      for (const id of ids) pendingItems.add(id);
      scheduleAutomaticUpdate();
    }
  }, ["item"], "doi-citation-count");
  for (const win of Zotero.getMainWindows()) addToWindow(win);
}

function onMainWindowLoad({ window }) {
  if (active) addToWindow(window);
}

function onMainWindowUnload({ window }) {
  removeFromWindow(window);
}

function addToWindow(win) {
  if (windowCleanups.has(win)) return;
  const doc = win.document;
  const popup = doc.getElementById("zotero-itemmenu");
  if (!popup) return;
  const separator = doc.createXULElement("menuseparator");
  const entry = doc.createXULElement("menuitem");
  entry.id = "doi-citation-count-update";
  entry.setAttribute("label", "Update Citation Count (DOI)");
  const command = () => updateSelected(win).catch(error => {
    Zotero.logError(error);
    if (active) showNotice(error.message);
  });
  const showing = () => {
    entry.disabled = busy || !(win.ZoteroPane.getSelectedItems() || []).some(item => item.isRegularItem());
  };
  entry.addEventListener("command", command);
  popup.addEventListener("popupshowing", showing);
  popup.append(separator, entry);
  windowCleanups.set(win, () => {
    popup.removeEventListener("popupshowing", showing);
    entry.removeEventListener("command", command);
    separator.remove();
    entry.remove();
  });
}

function removeFromWindow(win) {
  windowCleanups.get(win)?.();
  windowCleanups.delete(win);
}

function showNotice(message) {
  const notice = new Zotero.ProgressWindow({ closeOnClick: true });
  notice.changeHeadline("Citation Count");
  // ProgressWindow descriptions accept markup; escape external error messages.
  notice.addDescription(message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  notice.show();
  notice.startCloseTimer(5000);
}

function scheduleAutomaticUpdate() {
  if (!active || automaticTask || !pendingItems.size) return;
  // Do not return this promise to Notifier: saves must occur outside its transaction.
  automaticTask = (async () => {
    await Zotero.Promise.delay(1000);
    if (!active || busy) return;
    const ids = [...pendingItems];
    pendingItems.clear();
    const items = await Zotero.Items.getAsync(ids);
    if (active && busy) {
      for (const id of ids) pendingItems.add(id);
      return;
    }
    if (active) await updateItems(items.filter(Boolean));
  })().catch(error => {
    Zotero.logError(error);
    if (active) showNotice(error.message);
  }).finally(() => {
    automaticTask = null;
    if (!busy) scheduleAutomaticUpdate();
  });
}

async function updateSelected(win) {
  return updateItems([...win.ZoteroPane.getSelectedItems()]);
}

async function updateItems(selected) {
  if (busy || !active) return;
  busy = true;
  const helpers = helperScope.CitationHelpers;
  const items = selected.filter(item => item.isRegularItem() && !item.deleted);
  if (!items.length) { busy = false; return; }
  const cache = new Map();
  let updated = 0, skipped = 0;
  const failures = [];
  const progress = new Zotero.ProgressWindow({ closeOnClick: true });
  progress.changeHeadline("Fetching citation counts...");
  progress.show();
  try {
    for (const item of items) {
      if (!active) break;
      const doi = helpers.doi(item);
      if (!doi || !item.isEditable()) { skipped++; continue; }
      try {
        const key = doi.toLowerCase();
        if (!cache.has(key)) {
          const response = await Zotero.HTTP.request("GET", "https://api.rua.dev/v1/publications?scraper=citationcount&doi=" + encodeURIComponent(doi), {
            responseType: "json", timeout: 30000
          });
          const result = helpers.publication(response.response);
          cache.set(key, result);
          // Keep requests sequential and leave a short interval for the public API.
          await Zotero.Promise.delay(300);
        }
        if (!active) break;
        // Recheck DOI and permissions after the network request.
        if (item.deleted || !item.isEditable() || helpers.doi(item) !== doi) { skipped++; continue; }
        const extra = helpers.merge(item.getField("extra"), cache.get(key), new Date().toISOString());
        item.setField("extra", extra);
        await item.saveTx();
        updated++;
      } catch (error) {
        // Zotero throws on non-2xx responses; preserve the API's structured error.
        if (error.xmlhttp) {
          try {
            helpers.publication(error.xmlhttp.response);
          } catch (apiError) {
            if (error.xmlhttp.response?.error) error = apiError;
          }
        }
        Zotero.logError(error);
        failures.push(`${doi}: ${error.message}`);
      }
    }
    if (active) {
      const summary = `Updated ${updated}; skipped ${skipped}; failed ${failures.length}.`;
      showNotice(summary + (failures.length ? "\n\n" + failures.slice(0, 10).join("\n") : ""));
    }
  } finally {
    progress.close();
    busy = false;
    scheduleAutomaticUpdate();
  }
}

async function shutdown(data, reason) {
  active = false;
  if (observerID !== null) Zotero.Notifier.unregisterObserver(observerID);
  observerID = null;
  pendingItems.clear();
  for (const win of [...windowCleanups.keys()]) removeFromWindow(win);
  if (columnKeys.length) {
    if (Zotero.ItemTreeManager.unregisterColumn) {
      for (const key of columnKeys) await Zotero.ItemTreeManager.unregisterColumn(key);
    } else await Zotero.ItemTreeManager.unregisterColumns(columnKeys);
    columnKeys = [];
  }
}
