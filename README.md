# DOI Citation Count

Fetch publication citation counts by DOI from `https://api.rua.dev/v1/publications?scraper=citationcount&doi=...`. No API key is required. All plugin UI, messages, and documentation are in English.

## Version coverage

| Client | Package | Features and validation status |
| --- | --- | --- |
| Zotero 7-10 desktop | `dist/doi-citation-count-0.1.0.xpi` | Context menu, Extra metadata, and Citation Count / Updated Date columns. Automated tests pass; actual installation and UI need manual validation. |
| Zotero 5/6 desktop | `dist/doi-citation-count-0.1.0-legacy.xpi` | Restart-required XUL extension; context menu and Extra metadata. Needs validation on actual clients. |
| Zotero 3/4 Standalone | Legacy package | Experimental compatibility with synchronous saving fallback. Not verified on actual clients. |
| Zotero 1-4 for Firefox | Legacy package, installed in Firefox | Experimental XUL overlay. Very old runtimes can lack JSON support or current TLS support; not verified on actual clients. |
| Mobile, web library, browser Connector | No installable package | These products cannot run desktop XPI plugins. Saved Extra metadata is available through normal library synchronization. |

Different packages are necessary because Zotero 7+ uses manifest.json and older clients use install.rdf and XUL overlays. Version declarations are implementation targets, not proof that every historical point release works. Future major versions require validation before increasing the modern manifest's version range. Universal verified compatibility is not currently established.

## Installation and use

1. Choose the package for your client from the table above.
2. Open **Tools → Plugins** (or **Add-ons**), click the gear icon, and select **Install Add-on From File**. For historical Firefox installations, use Firefox's Add-ons manager.
3. Install the XPI. Restart after installing or removing the legacy package.
4. Select one or more publications and choose **Update Citation Count (DOI)** from the item context menu.
5. On Zotero 7-10, right-click the item-list header and enable **Citation Count** and **Updated Date**. On older clients, view the item's **Extra** field.

The DOI field is preferred, with fallback to `DOI: ...` in Extra. DOI URLs are accepted. Attachments, notes, invalid DOIs, and read-only items are skipped. Requests run sequentially, and duplicate DOIs share responses within a batch. Failed API requests preserve saved counts.

Results are stored in Extra while retaining unrelated metadata:

```text
Citation Count: 24
Citation Count Source: api.rua.dev (Semantic Scholar)
Citation Count Updated: 2026-10-24T00:00:00.000Z
Influential Citation Count: 0
```

Only DOIs are sent to api.rua.dev when you manually request an update. Titles, notes, and attachments are not uploaded. Saved statistics synchronize with Zotero and remain readable offline. Disabling or uninstalling the extension retains the metadata. Counts reflect the API's Semantic Scholar coverage and may differ from other services. Legacy clients store the update timestamp in UTC date format.

The **Updated Date** column shows the last successful citation-count update as `YYYY-MM-DD` in UTC. It reads `Citation Count Updated` from Extra, including timestamps saved by the legacy package. Missing or invalid dates display a blank cell. Failed requests retain the previous count and date. Zotero 9/10 are included in the manifest range; their actual UI compatibility still requires testing on those clients.

## Development

```sh
node --test tests/*.test.js
python3 scripts/build.py
```

No npm dependencies are required. Legacy runtime code and shared helpers use ES5 syntax. Use separate profiles when testing historical Zotero clients; never open a current library database with an old client.

The example DOI `10.3964/j.issn.1000-0593` returned `citationCount: "24"` and `influentialCitationCount: "0"` during development. These values can change over time.

## Releases and automatic updates

Download packages from [GitHub Releases](https://github.com/Adoream/zotero-citation-count/releases/latest). The modern package uses the HTTPS `updates.json` asset in the latest release for Zotero updates. Each release contains modern and legacy XPI packages, the modern update feed, and `SHA256SUMS`. Legacy packages must be upgraded manually.

In Zotero's Add-ons/Plugins manager, keep automatic add-on updates enabled (the default). You can also use **Check for Updates** in the gear menu. The update feed becomes available after the first GitHub Release is published. If you installed a local 0.3.x development package, install public version 0.1.0 manually once: Zotero does not automatically downgrade version numbers. Subsequent public versions such as 0.1.1 can update normally.

GitHub Actions builds and tests changes pushed to `master` and pull requests. It publishes a release only when a matching version tag is pushed. No personal access token or additional repository secret is required; the release job uses GitHub's built-in token with `contents: write`.

To publish the next version:

1. Change the version in `manifest.json` and `legacy/install.rdf`, and update `CHANGELOG.md`.
2. Run the tests and build checks below.
3. Commit and push to `master`, then create and push the matching tag:

```sh
git tag v0.1.0
git push origin master
git push origin v0.1.0
```

For later releases, replace `v0.1.0` with the new version. The workflow checks that the tag matches the manifest and points to a commit on `master`. Pushing `master` alone produces a downloadable build artifact, without publishing a release.

```sh
node --test tests/*.test.js
python3 scripts/build.py
python3 -m unittest discover -s tests -p 'test_*.py'
```

Zotero 10 requires an HTTPS update URL. The manifest was compared with [Google Scholar Citation Count](https://github.com/justinribeiro/zotero-google-scholar-citation-count/blob/master/src/manifest.json) and checked against the installed Zotero 10.0.6 loader's required-field and update-security rules. Full installation and UI testing remain necessary.
