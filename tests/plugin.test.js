const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const helpers = require("../lib.js");

for (const failure of [null, { data: null }, { data: { citationCount: "bad" } },
  { error: { code: "upstream_error", message: "Provider failed" } }]) {
test(`batch update preserves failures: ${JSON.stringify(failure)}`, async () => {
  function makeItem(doi, extra = "My Note: kept") {
    return {
      extra, saves: 0,
      isRegularItem: () => true, isEditable: () => true,
      getField(name) { return name === "DOI" ? doi : this.extra; },
      setField(name, value) { this.extra = value; },
      async saveTx() { this.saves++; }
    };
  }
  const items = [makeItem("10.1234/a"), makeItem("10.1234/a"), makeItem("10.1234/b", "Citation Count: 9"), makeItem("")];
  let calls = 0, alert, observer, unregistered;
  const removed = [], columns = [];
  const zotero = {
    Notifier: {
      registerObserver(value) { observer = value; return "observer"; },
      unregisterObserver(id) { unregistered = id; }
    },
    Items: { getAsync: async ids => ids.map(id => items[id]) },
    initializationPromise: Promise.resolve(), getMainWindows: () => [], logError() {},
    ItemTreeManager: {
      registerColumn: option => { columns.push(option); return option.dataKey; },
      unregisterColumn: key => { removed.push(key); }
    },
    HTTP: { async request(method, url) {
      calls++;
      assert.equal(method, "GET");
      assert.ok(url.startsWith("https://api.rua.dev/v1/publications?scraper=citationcount&doi="));
      if (url.endsWith("%2Fb")) {
        if (failure?.error) {
          const error = new Error("HTTP 502");
          error.xmlhttp = { response: failure };
          throw error;
        }
        if (failure) return { response: failure };
        throw new Error("timeout");
      }
      return { response: { data: { citationCount: "0", influentialCitationCount: "0" } } };
    } },
    Promise: { delay: async () => {} },
    ProgressWindow: function () { this.changeHeadline = this.show = this.close = () => {};
      this.addDescription = message => { alert = message; };
      this.startCloseTimer = delay => assert.equal(delay, 5000); }
  };
  const services = {
    wm: { getMostRecentWindow: () => ({ Zotero: zotero }) },
    scriptloader: { loadSubScript(uri, scope) { scope.CitationHelpers = helpers; } },
    prompt: { alert(win, title, message) { alert = message; } }
  };
  const scope = vm.createContext({ Services: services });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../bootstrap.js"), "utf8"), scope);
  await scope.startup({ id: "test", rootURI: "file:///test/" });
  assert.deepEqual(columns.map(column => column.label), ["Citation Count", "Citation Count updated date"]);
  assert.equal(columns[1].dataProvider(items[0]), "");
  await scope.updateSelected({ ZoteroPane: { getSelectedItems: () => items } });
  assert.equal(calls, 2);
  assert.equal(items[0].saves, 1);
  assert.equal(items[1].saves, 1);
  assert.equal(helpers.read(items[0].extra), "0");
  assert.equal(columns[0].dataProvider(items[0]), "0");
  assert.match(columns[1].dataProvider(items[0]), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(columns[1].dataProvider({ isRegularItem: () => false }), "");
  assert.equal(items[2].extra, "Citation Count: 9");
  assert.equal(items[2].saves, 0);
  assert.ok(alert.includes("Updated 2; skipped 1; failed 1"));
  if (failure?.error) assert.match(alert, /upstream_error: Provider failed/);
  // New items are queued once and modify notifications from saving are ignored.
  observer.notify("modify", "item", [0]);
  assert.equal(scope.automaticTask, null);
  observer.notify("add", "item", [0, 0, 3]);
  await scope.automaticTask;
  assert.equal(items[0].saves, 2);
  assert.equal(items[3].saves, 0);
  assert.equal(calls, 3);
  // Additions arriving during a manual update stay queued until it completes.
  const manual = scope.updateSelected({ ZoteroPane: { getSelectedItems: () => [items[0]] } });
  observer.notify("add", "item", [1]);
  await manual;
  while (scope.automaticTask) await scope.automaticTask;
  assert.equal(items[1].saves, 2);
  await scope.shutdown({});
  assert.equal(unregistered, "observer");
  observer.notify("add", "item", [0]);
  assert.equal(scope.pendingItems.size, 0);
  assert.deepEqual(removed, ["citationCount", "citationCountUpdatedDate"]);
});

}
