# Build instructions for Mozilla reviewers

## Submitted version

Graphite to GitHub 1.0.0 is a Firefox Manifest V3 extension. The installed
extension consists of three source files copied without modification:

- `extension/manifest.json`
- `extension/rules/redirects.json`
- `extension/icons/redirect.svg`

Firefox evaluates the static redirect rule. There is no runtime JavaScript,
generated code, transpilation, minification, bundling, template processing,
remote code, or third-party code inside the extension. `web-ext build` only
packages the files under `extension/` into a ZIP-compatible XPI.

## Build environment

The original package was built on macOS with Node.js **22.20.0**, npm **10.9.3**,
and Mozilla **web-ext 10.8.0**. There are no platform-specific build steps;
Linux, including Ubuntu 24.04, is also supported. Node.js 22 or newer is
required. Firefox is required only for the optional browser tests, not for
building the extension.

Install Node.js and its bundled npm using the instructions at
<https://nodejs.org/en/download>. All other build dependencies are declared in
`package.json` and pinned by `package-lock.json`. They are available from the
public npm registry; no private registry, token, account, or proprietary tool
is needed to build the extension.

## Reproduce the submitted extension

Extract the source ZIP, change into its root directory, and run:

```sh
npm ci
npm run build
```

The resulting unsigned extension is:

```text
dist/graphite-to-github-1.0.0.xpi
```

The `build` script in `package.json` executes all packaging steps using the
locally installed, pinned `web-ext` executable. It packages `extension/` only.
Development tools, tests, documentation, and this source archive are not
included in the installed extension.

Compare the three extracted files in the rebuilt XPI with the same files in
the uploaded XPI. Their contents are identical to the source files above.
ZIP timestamps and Mozilla's signature files can differ; compare extracted
file contents rather than the checksum of the entire archive.

## Optional validation

```sh
npm run lint
npm test
```

`npm test` requires Firefox and the built XPI. On macOS, the tests find Firefox
in `/Applications/Firefox.app`. On Linux, they look for `firefox` on PATH. Set
`FIREFOX_BINARY` to the executable path if needed. Tests launch an isolated,
temporary Firefox profile and supply local test responses through WebDriver
BiDi; no Graphite or GitHub login is required. The original package passed
all 22 test assertions in Firefox 158.0 and Mozilla's linter without warnings.

## Source archive

To recreate the source archive, run `npm run source` (requires the `zip`
utility). It uses an explicit file list and writes
`dist/graphite-to-github-1.0.0-source.zip`. This step is not needed to build
the extension.
