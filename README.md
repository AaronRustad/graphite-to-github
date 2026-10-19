# Graphite to GitHub

A Firefox extension that automatically redirects Graphite pull request URLs to the matching GitHub pull request **in the same tab**.

```text
https://app.graphite.com/github/pr/sutrolabs/giza/30614
                             ↓
https://github.com/sutrolabs/giza/pull/30614
```

Works for any owner and repository, including links with a trailing slash, PR title slug, or query parameters. Graphite-specific path suffixes and query parameters are discarded. GitHub still requires your usual access to private repositories.

## Install

Requires Firefox 142 or newer.

1. Download the **signed `.xpi`** from the [latest GitHub release](https://github.com/AaronRustad/graphite-to-github/releases/latest).
2. In Firefox, open `about:addons`, click the gear menu, and choose **Install Add-on From File…**.
3. Select the downloaded XPI and approve the Graphite-site permission.
4. Open a Graphite PR URL. The tab goes directly to GitHub.

This installation survives Firefox restarts. Updates are currently installed manually from a newer signed release.

## Temporary installation for development

Requires Firefox 142 or newer.

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**.
3. Select `extension/manifest.json` in this project, or the built `dist/graphite-to-github-1.0.0.xpi`.
4. Open a Graphite PR URL. The tab goes directly to GitHub.

Temporary add-ons are removed when Firefox closes. Use the signed release above to keep the extension across restarts.

To visit Graphite PR pages again, disable the extension in `about:addons` (or remove the temporary add-on in `about:debugging`).

## Sign a release

Firefox requires a Mozilla-signed XPI for a permanent installation. **Unlisted / self-distributed** signing keeps the extension out of Mozilla's public add-on catalog.

1. Sign in to the [Mozilla Add-ons Developer Hub](https://addons.mozilla.org/developers/addon/submit/distribution). If this is your first add-on, review the developer agreement.
2. Select **On your own** as the distribution method.
3. Upload `dist/graphite-to-github-1.0.0.xpi`.
4. The XPI contains the complete, unmodified source: two JSON files and an SVG icon. There is no bundled or minified code, so a separate source package is normally unnecessary. To supply one, run `npm run source` and upload `dist/graphite-to-github-1.0.0-source.zip`. It includes the complete project and [reviewer build instructions](BUILDING.md).
5. Finish the submission and download the **signed** XPI when Mozilla approves it. Save it under `dist/signed/` to distinguish it from the unsigned build.
6. Remove the temporary copy from `about:debugging#/runtime/this-firefox` if it is loaded.
7. Open `about:addons` → gear menu → **Install Add-on From File…**, choose the signed XPI, and approve the requested Graphite-site access.
8. Open a Graphite PR link, then verify it redirects again after your next Firefox restart.

The unsigned build and signed download have the same extension ID. Keep that ID when releasing updates, and increase `extension/manifest.json`'s version before submitting another version to Mozilla. Updates to an unlisted extension are installed from a newly signed XPI unless a separate update service is configured.

### Optional command-line signing

The same unlisted signing flow is available with `npm run sign`. It reads `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` from your shell environment; obtain them from [Mozilla's API credentials page](https://addons.mozilla.org/developers/addon/api/key/). Keep credentials out of the project and chat. Signed downloads are written to `dist/signed/`. Browser submission does not require generating API credentials.

See [Mozilla's signing and distribution guide](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/) and the [`web-ext sign` reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-sign).

## Develop and build

Requires Node.js 22 or newer and Firefox. Dependencies are development tools only; the installed extension has no dependencies or runtime JavaScript.

```sh
npm ci
npm run check
```

`check` runs Mozilla's extension linter, builds the XPI, and tests that package in Firefox. The unsigned package is written to `dist/graphite-to-github-1.0.0.xpi`.

```sh
npm start       # Launch an isolated Firefox development profile with the extension
npm test        # Test the built XPI in headless Firefox (run build first)
npm run lint   # Validate the manifest and rules with Mozilla's web-ext
npm run build  # Package only extension/ into an XPI
npm run sign   # Request unlisted Mozilla signing (requires API credentials)
npm run source # Package the project and reviewer instructions for source submission
```

Tests automatically find Firefox on macOS and on PATH. Set `FIREFOX_BINARY` to its executable path if needed. They use Firefox's built-in WebDriver BiDi support, so no browser driver or existing Firefox profile is needed.

## Behavior and permissions

- Matches `https://app.graphite.com/github/pr/<owner>/<repo>/<number>`, with optional suffixes.
- Redirects a full-page navigation before Graphite loads. Opening a link from another app, pasting it in the address bar, and clicking a regular link all work.
- Uses the tab the link is opened in; it does not create another tab. If another app or a modifier-click opens a new tab, the redirect takes place in that tab.
- Leaves Graphite's inbox, dashboards, settings, other sites, and embedded resources alone.
- In-app Graphite navigation that changes the URL without a page request is outside the scope of the network rule. Reloading that PR URL redirects it.
- Requests only `declarativeNetRequestWithHostAccess` and access to `https://app.graphite.com/*`. Firefox may describe this as access to data on that site; the extension contains only a static redirect rule and an icon. It has no content scripts, background scripts, storage, analytics, or access to GitHub page contents.

Firefox applies the rule itself using the [declarativeNetRequest API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest). The URL is transformed locally. No Graphite API token or account is required, and no browsing data is collected or transmitted by the extension.

## Project layout

```text
extension/manifest.json         Firefox metadata and narrowly scoped permissions
extension/rules/redirects.json  The redirect rule
extension/icons/redirect.svg   Extension icon
tests/                         Real Firefox browser tests
dist/                          Generated unsigned XPI (ignored by git)
```
