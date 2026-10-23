var Zotero;
var Services = globalThis.Services || ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs").Services;
var helperScope = {};
var columnKeys = [];
var active = false;
var busy = false;
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
    label: "Updated Date",
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
    if (active) Services.prompt.alert(win, "Citation Count", error.message);
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

async function updateSelected(win) {
  if (busy || !active) return;
  busy = true;
  const helpers = helperScope.CitationHelpers;
  const items = [...win.ZoteroPane.getSelectedItems()].filter(item => item.isRegularItem());
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
          const result = response.response;
          helpers.count(result?.citationCount);
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
        Zotero.logError(error);
        failures.push(`${doi}: ${error.message}`);
      }
    }
    if (active) {
      const summary = `Updated ${updated}; skipped ${skipped}; failed ${failures.length}.`;
      Services.prompt.alert(win, "Citation Count", summary + (failures.length ? "\n\n" + failures.slice(0, 10).join("\n") : ""));
    }
  } finally {
    progress.close();
    busy = false;
  }
}

async function shutdown(data, reason) {
  active = false;
  for (const win of [...windowCleanups.keys()]) removeFromWindow(win);
  if (columnKeys.length) {
    if (Zotero.ItemTreeManager.unregisterColumn) {
      for (const key of columnKeys) await Zotero.ItemTreeManager.unregisterColumn(key);
    } else await Zotero.ItemTreeManager.unregisterColumns(columnKeys);
    columnKeys = [];
  }
}
