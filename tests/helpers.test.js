const { test } = require("node:test");
const assert = require("node:assert/strict");
const helpers = require("../lib.js");
const item = (doi, extra = "") => ({ getField: name => name === "DOI" ? doi : extra });

test("updated date supports ISO and legacy UTC dates and blanks missing or invalid values", () => {
  assert.equal(helpers.updatedDate("Citation Count Updated: 2026-10-24T00:00:00.000Z"), "2026-10-24");
  assert.equal(helpers.updatedDate("Citation Count Updated: Sat, 24 Oct 2026 00:00:00 GMT"), "2026-10-24");
  assert.equal(helpers.updatedDate("Citation Count Updated: 2026-10-24T23:30:00-05:00"), "2026-10-25");
  assert.equal(helpers.updatedDate("Citation Count Updated: invalid"), "");
  assert.equal(helpers.updatedDate(""), "");
});

test("normalizes DOI URLs and falls back to Extra", () => {
  assert.equal(helpers.doi(item("https://doi.org/10.3964/j.issn.1000-0593")), "10.3964/j.issn.1000-0593");
  assert.equal(helpers.doi(item("", "DOI: 10.1234/example")), "10.1234/example");
  assert.equal(helpers.doi(item("invalid")), null);
});
test("accepts zero and rejects missing or invalid API counts", () => {
  assert.equal(helpers.count("0"), 0);
  assert.equal(helpers.count("24"), 24);
  for (const value of [null, undefined, "", "-1", 1.2, {}, true]) {
    assert.throws(() => helpers.count(value));
  }
});
test("updates managed fields without discarding unrelated metadata", () => {
  const extra = "DOI: 10.1234/example\nMy Note: preserved\nCitation Count: 2\nCitation Count: 3\nInfluential Citation Count: 1";
  const result = helpers.merge(extra, { citationCount: "24", influentialCitationCount: "0" }, "2026-10-24");
  assert.ok(result.includes("My Note: preserved"));
  assert.ok(result.includes("DOI: 10.1234/example"));
  assert.equal(helpers.read(result), "24");
  assert.equal(result.match(/^Citation Count:/gm).length, 1);
  assert.ok(result.includes("Influential Citation Count: 0"));
  assert.equal(helpers.merge(result, { citationCount: "24", influentialCitationCount: "0" }, "2026-10-24"), result);
});

test("unwraps the current publication envelope and validates optional counts", () => {
  for (const count of [0, "0", 24, "24"]) {
    const data = { citationCount: count, influentialCitationCount: "0" };
    assert.equal(helpers.publication({ data }), data);
  }
  for (const body of [null, [], {}, { citationCount: "24" }, { data: null },
    { data: [] }, { data: {} }, { data: { citationCount: null } },
    { data: { citationCount: "24", influentialCitationCount: "invalid" } }]) {
    assert.throws(() => helpers.publication(body));
  }
  assert.throws(() => helpers.publication({ error: {
    code: "upstream_error", message: "The publication provider request failed."
  } }), /upstream_error: The publication provider request failed/);
  assert.throws(() => helpers.publication({ data: null }), /No publication found/);
});
