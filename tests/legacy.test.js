const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const helpers = require('../lib.js');

for (const asynchronous of [false, true]) {
  test(`legacy updates through ${asynchronous ? 'saveTx' : 'save'} and deduplicates requests`, async () => {
    let calls = 0, saves = 0, message;
    const makeItem = () => ({
      extra: 'Note: retained', isRegularItem: () => true, isEditable: () => true,
      getField(name) { return name === 'DOI' ? '10.1234/example' : this.extra; },
      setField(name, value) { this.extra = value; },
      [asynchronous ? 'saveTx' : 'save']() { saves++; return asynchronous ? Promise.resolve(1) : 1; }
    });
    const items = [makeItem(), makeItem()];
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    const win = {
      ZoteroPane: { getSelectedItems: () => items }, addEventListener() {},
      setTimeout: (fn, delay) => setTimeout(fn, delay === 300 ? 0 : delay), clearTimeout,
      alert(text) { message = text; finish(); },
      XMLHttpRequest: function () {
        this.open = (method, url) => { assert.ok(url.includes('doi=10.1234%2Fexample')); };
        this.abort = () => {};
        this.send = () => { calls++; this.status = 200; this.responseText = '{"citationCount":"0"}'; this.onload(); };
      }
    };
    const scope = vm.createContext({ window: win, Zotero: {}, CitationHelpers: helpers });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../legacy/overlay.js'), 'utf8'), scope);
    scope.DOICitationLegacy.update();
    await finished;
    assert.equal(calls, 1);
    assert.equal(saves, 2);
    assert.equal(helpers.read(items[0].extra), '0');
    assert.ok(items[0].extra.includes('Note: retained'));
    assert.ok(message.includes('Updated 2; skipped 0; failed 0.'));
  });
}
