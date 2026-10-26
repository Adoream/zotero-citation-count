# Changelog

## 0.1.2

- Adapt modern and legacy clients to the api.rua.dev data/error response envelopes.
- Reject missing publications and invalid counts while preserving existing metadata.

## 0.1.1

- Automatically queue newly added publications for citation-count updates on Zotero 7–10.
- Replace modal alerts with notices that close automatically in both packages.
- Rename the modern date column to Citation Count updated date.

## 0.1.0

First public release.

- Fetch citation counts by DOI using api.rua.dev.
- Show Citation Count and Updated Date columns on Zotero 7-10.
- Preserve unrelated Extra metadata and existing statistics on API failures.
- Provide an experimental legacy XUL package for historical clients.
- Use a GitHub-hosted HTTPS update feed for modern clients.
- Build and publish XPI packages, update metadata, and SHA-256 checksums through GitHub Actions.
