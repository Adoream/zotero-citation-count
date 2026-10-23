const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));

test('manifest supplies Zotero 10 required fields and the repository HTTPS update feed', () => {
  const settings = manifest.applications.zotero;
  for (const key of ['id', 'update_url', 'strict_max_version']) assert.ok(settings[key], `${key} must be provided`);
  assert.equal(settings.strict_max_version, '10.*');
  const url = new URL(settings.update_url);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'github.com');
  assert.equal(url.pathname, '/Adoream/zotero-citation-count/releases/latest/download/updates.json');
});
