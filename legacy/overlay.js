/* XUL overlay for historical Zotero clients. ES5 syntax only. */
var DOICitationLegacy = (function () {
  var busy = false, stopped = false, request = null, timer = null;
  function pane() { return window.ZoteroPane || window.ZoteroPane_Local; }
  function editable(item) {
    if (typeof item.isEditable === 'function') return item.isEditable();
    if (!item.libraryID) return true;
    return !!(Zotero.Libraries && Zotero.Libraries.isEditable && Zotero.Libraries.isEditable(item.libraryID));
  }
  function update() {
    if (busy || stopped || !pane()) return;
    var selected = pane().getSelectedItems(), items = [], cache = {};
    var index = 0, updated = 0, skipped = 0, failures = [];
    for (var i = 0; i < selected.length; i++) if (selected[i].isRegularItem()) items.push(selected[i]);
    busy = true;
    function next() {
      if (stopped) { busy = false; return; }
      if (index >= items.length) {
        busy = false;
        window.alert('Citation Count\n\nUpdated ' + updated + '; skipped ' + skipped + '; failed ' + failures.length + '.' + (failures.length ? '\n\n' + failures.slice(0, 10).join('\n') : ''));
        return;
      }
      var item = items[index++], doi;
      function schedule() { timer = window.setTimeout(next, 300); }
      function fail(error) { failures.push((doi || 'Item') + ': ' + error.message); schedule(); }
      try {
        doi = CitationHelpers.doi(item);
        if (!doi || !editable(item) || item.deleted) { skipped++; schedule(); return; }
      } catch (error) { fail(error); return; }
      function save(result) {
        if (stopped) return;
        try {
          if (item.deleted || !editable(item) || CitationHelpers.doi(item) !== doi) { skipped++; schedule(); return; }
          var oldExtra = item.getField('extra');
          item.setField('extra', CitationHelpers.merge(oldExtra, result, new Date().toUTCString()));
          var saved;
          try { saved = item.saveTx ? item.saveTx() : item.save(); }
          catch (error) { item.setField('extra', oldExtra); throw error; }
          if (saved && typeof saved.then === 'function') {
            saved.then(function () { updated++; schedule(); }, function (error) { item.setField('extra', oldExtra); fail(error); });
          } else { updated++; schedule(); }
        } catch (error) { fail(error); }
      }
      var key = '$' + doi.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(cache, key)) { save(cache[key]); return; }
      try {
        request = new window.XMLHttpRequest();
        request.open('GET', 'https://api.rua.dev/v1/publications?scraper=citationcount&doi=' + encodeURIComponent(doi), true);
        var done = false;
        var timeout = window.setTimeout(function () {
          if (done) return;
          done = true; request.abort(); fail(new Error('Request timed out'));
        }, 30000);
        function complete(error) {
          if (done) return;
          done = true; window.clearTimeout(timeout);
          if (stopped) return;
          if (error) { fail(error); return; }
          try {
            if (request.status < 200 || request.status >= 300) throw new Error('HTTP ' + request.status);
            var result;
            if (typeof JSON !== 'undefined' && JSON.parse) result = JSON.parse(request.responseText);
            else result = Components.classes['@mozilla.org/dom/json;1'].createInstance(Components.interfaces.nsIJSON).decode(request.responseText);
            CitationHelpers.count(result && result.citationCount);
            cache[key] = result; save(result);
          } catch (e) { fail(e); }
        }
        request.onload = function () { complete(); };
        request.onerror = function () { complete(new Error('Network request failed')); };
        request.send(null);
      } catch (error) { fail(error); }
    }
    next();
  }
  function attach() {
    if (stopped) return;
    var popup = document.getElementById('zotero-itemmenu');
    if (!popup || !pane() || typeof Zotero === 'undefined') { timer = window.setTimeout(attach, 1000); return; }
    if (document.getElementById('doi-citation-count-update')) return;
    var entry = document.createElement('menuitem');
    entry.id = 'doi-citation-count-update';
    entry.setAttribute('label', 'Update Citation Count (DOI)');
    entry.addEventListener('command', update, false);
    popup.addEventListener('popupshowing', function () { entry.disabled = busy; }, false);
    popup.appendChild(document.createElement('menuseparator')); popup.appendChild(entry);
  }
  window.addEventListener('load', attach, false);
  window.addEventListener('unload', function () {
    stopped = true; window.clearTimeout(timer); if (request) request.abort();
  }, false);
  return { update: update };
}());
