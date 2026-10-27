# DOI Citation Count

Citation counts in your Zotero library, looked up by DOI.

DOI Citation Count fetches citation statistics through api.rua.dev and saves them in each item's **Extra** field. On modern Zotero clients, you can also display citation counts and update dates directly in the item list. No API key is required.

[Download the latest release](https://github.com/Adoream/zotero-citation-count/releases/latest) · [Changelog](CHANGELOG.md) · [Report an issue](https://github.com/Adoream/zotero-citation-count/issues)

## Features

- **Update selected items:** fetch citation counts for one or more publications from the context menu.
- **Update new items automatically:** on Zotero 7–10, newly added publications are queued for lookup, including items added through Connector, import, or synchronization while the plugin is running.
- **See counts at a glance:** add **Citation Count** and **Citation Count updated date** columns on Zotero 7–10.
- **Keep metadata with your library:** statistics are stored in Extra, synchronize with Zotero, and remain readable offline or after uninstalling the plugin.
- **Preserve existing data:** unrelated Extra fields are retained; failed lookups leave the saved count and update date unchanged.

The plugin interface and messages are in English.

## Installation

1. Download the `.xpi` package for your Zotero version from [GitHub Releases](https://github.com/Adoream/zotero-citation-count/releases/latest):

   | Zotero version | Package |
   | --- | --- |
   | Zotero 7–10 desktop | `doi-citation-count-<version>.xpi` |
   | Zotero 5–6 desktop | `doi-citation-count-<version>-legacy.xpi` |

2. In Zotero, open **Tools → Plugins** (or **Add-ons**).
3. Click the gear icon, choose **Install Add-on From File**, and select the downloaded `.xpi` file.
4. Restart Zotero if you installed the legacy package.

The modern package declares compatibility with Zotero 7–10. Automated tests cover plugin behavior and packaging; installation and UI behavior still require validation on actual clients. The legacy package is experimental and also needs client testing.

### Other clients

The legacy package additionally targets Zotero 3–4 Standalone and historical Zotero for Firefox installations. These configurations are unverified, and old runtimes may lack JSON support or the TLS support needed to reach the API. For historical Firefox installations, install the legacy package through Firefox's Add-ons manager.

Zotero mobile, the web library, and the browser Connector cannot run this desktop plugin. They can access saved Extra metadata through normal library synchronization.

## Usage

1. Select one or more publications with a DOI.
2. Right-click and choose **Update Citation Count (DOI)**.
3. On Zotero 7–10, right-click the item-list column header and enable **Citation Count** and **Citation Count updated date**. On older clients, read the results in **Extra**.

The plugin uses the item's **DOI** field first, then falls back to a `DOI: ...` line in Extra. DOI URLs such as `https://doi.org/10.1234/example` are accepted. Attachments, notes, invalid DOIs, and read-only items are skipped.

New publications are updated automatically on Zotero 7–10 after a short delay. Existing items are not refreshed at startup. If you add or change a DOI later, use the context-menu command to update the count. Legacy clients require manual updates.

Requests run sequentially, and items with the same DOI reuse a successful response within a batch. Completion and error notices close automatically after five seconds.

### Saved metadata

A successful lookup writes fields like these to Extra:

```text
Citation Count: 24
Citation Count Source: api.rua.dev (Semantic Scholar)
Citation Count Updated: 2026-10-24T00:00:00.000Z
Influential Citation Count: 0
```

The influential citation count is included when the API provides it. The date column displays the last successful update as `YYYY-MM-DD` in UTC; missing or invalid dates appear blank. Legacy clients save the update date in UTC date format.

## Data source and privacy

Citation statistics come from api.rua.dev's Semantic Scholar lookup. Coverage and counts may differ from other citation services. A missing publication, invalid response, or failed request leaves existing statistics unchanged.

During manual and automatic lookups, the plugin sends the DOI to api.rua.dev. It does not upload titles, notes, or attachments. Automatic lookups are enabled for newly added items on modern clients while the plugin is running.

## Updates

The modern package checks for updates using the HTTPS update feed hosted in GitHub Releases. Keep automatic add-on updates enabled in Zotero, or use **Check for Updates** in the Plugins/Add-ons manager's gear menu.

Legacy packages must be updated manually by downloading and installing a newer `.xpi`, then restarting Zotero.

If you previously installed a `0.3.x` development build, manually install the current public release once. Zotero does not automatically downgrade version numbers.

## Development

You need Node.js and Python 3. CI uses Node.js 22 and Python 3.12. No third-party dependencies are required.

### Test and build

Run these commands from the repository root:

```sh
node --check bootstrap.js
node --check lib.js
node --check legacy/overlay.js
node --test tests/*.test.js
python3 scripts/build.py
python3 -m unittest discover -s tests -p 'test_*.py'
```

The build writes the following files to `dist/`:

| File | Purpose |
| --- | --- |
| `doi-citation-count-<version>.xpi` | Modern Zotero package |
| `doi-citation-count-<version>-legacy.xpi` | Legacy Zotero package |
| `updates.json` | Modern package's automatic update feed |
| `SHA256SUMS` | SHA-256 checksums for both packages |

### Project structure

```text
bootstrap.js       Modern plugin lifecycle, columns, and update queue
lib.js             Shared DOI, API response, and metadata helpers
manifest.json      Modern extension manifest
legacy/            Legacy XUL extension and manifest
scripts/build.py   Package builder and update-feed generator
tests/             JavaScript and Python tests
```

Shared helpers and legacy runtime code use ES5 syntax for historical clients. Use separate profiles when testing old Zotero versions; never open a current library database with an old client.

API requests use `GET https://api.rua.dev/v1/publications?scraper=citationcount&doi=<encoded-doi>`. The plugin reads statistics from the response's `data` object and handles structured `error` responses. See `lib.js` and the helper tests for response validation.

### Publishing a release

1. Set the same version in `manifest.json` and `legacy/install.rdf`.
2. Update [CHANGELOG.md](CHANGELOG.md) and run the checks above.
3. Commit and push the changes to `master`.
4. Create and push a matching version tag, replacing `X.Y.Z` with the new version:

   ```sh
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

[GitHub Actions](.github/workflows/release.yml) tests and builds pushes to `master` and pull requests targeting `master`. A matching version tag publishes both packages, the update feed, and checksums to GitHub Releases. The tagged commit must be on `master`. Branch builds upload a build artifact without publishing a release.

The release job uses GitHub's built-in token with `contents: write`; no additional repository secret is required.

## Contributing

Bug reports, compatibility reports, and pull requests are welcome. When reporting a problem, include your Zotero version, operating system, plugin version, steps to reproduce, and any error message. Include an example DOI when relevant.

For code changes, run the development checks above and describe any manual client testing in your pull request.
