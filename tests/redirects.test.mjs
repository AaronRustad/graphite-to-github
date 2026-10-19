import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { launchFirefox } from "./firefox.mjs";

const source = "https://app.graphite.com/github/pr/sutrolabs/giza/30614";
const destination = "https://github.com/sutrolabs/giza/pull/30614";
const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url)));
const archive = fileURLToPath(new URL(`../dist/graphite-to-github-${manifest.version}.xpi`, import.meta.url));

test("packaged extension redirects real Firefox navigations", { timeout: 90_000 }, async (t) => {
  const { bidi, close, version } = await launchFirefox();
  t.after(close);
  t.diagnostic(`Firefox ${version}; isolated temporary profile; testing built XPI`);

  const installed = await bidi.send("webExtension.install", {
    extensionData: { type: "archivePath", path: archive },
  });
  assert.equal(installed.extension, manifest.browser_specific_settings.gecko.id);

  const { contexts } = await bidi.send("browsingContext.getTree", {});
  const context = contexts[0].context;
  const requests = [];
  const responseErrors = [];
  let html = "<!doctype html><title>Redirect test</title><p>Local test response</p>";

  // Supply pages locally after Firefox applies its extension rules. No Graphite
  // or GitHub account, private repository access, or external page fetch is used.
  await bidi.send("session.subscribe", { events: ["network.beforeRequestSent"] });
  bidi.on("network.beforeRequestSent", (event) => {
    if (!event.isBlocked) return;
    requests.push(event.request.url);
    bidi.send("network.provideResponse", {
      request: event.request.request,
      statusCode: 200,
      headers: [{ name: "content-type", value: { type: "string", value: "text/html; charset=utf-8" } }],
      body: { type: "string", value: html },
    }).catch((error) => responseErrors.push(error));
  });
  await bidi.send("network.addIntercept", {
    phases: ["beforeRequestSent"],
    contexts: [context],
  });

  async function navigate(url) {
    requests.length = 0;
    await bidi.send("browsingContext.navigate", { context, url, wait: "complete" });
    const tree = await bidi.send("browsingContext.getTree", { root: context });
    assert.deepEqual(responseErrors, []);
    return tree.contexts[0];
  }

  const redirects = [
    ["the exact reported PR", source, destination],
    ["a different owner and repository", "https://app.graphite.com/github/pr/mozilla/gecko-dev/123", "https://github.com/mozilla/gecko-dev/pull/123"],
    ["a trailing slash", `${source}/`, destination],
    ["a PR title slug", `${source}/fix-custom-fields`, destination],
    ["Graphite query parameters", `${source}?utm_source=slack&view=activity`, destination],
    ["a slug and query parameters", `${source}/fix-custom-fields?view=files`, destination],
    ["repository punctuation and case", "https://app.graphite.com/github/pr/Some-Team/repo.name_v2/42", "https://github.com/Some-Team/repo.name_v2/pull/42"],
  ];

  for (const [name, url, expected] of redirects) {
    await t.test(name, async () => {
      const page = await navigate(url);
      assert.equal(page.url, expected);
      assert.equal(page.context, context, "The existing tab must be reused.");
      assert.ok(requests.includes(expected), "Firefox must request the GitHub destination.");
      assert.ok(!requests.some((request) => new URL(request).hostname === "app.graphite.com"), "The Graphite page must not load.");
    });
  }

  for (const url of [
    "https://app.graphite.com/",
    "https://app.graphite.com/inbox",
    "https://app.graphite.com/settings",
    "https://app.graphite.com/github/pr/sutrolabs/giza",
    "https://app.graphite.com/github/pr/sutrolabs/giza/not-a-number",
    "https://app.graphite.com/github/pr/sutrolabs/giza/30614extra",
    "https://app.graphite.com/github/pr/sutrolabs/giza/0",
    "https://app.graphite.com/github/pr/sutrolabs/giza/030614",
    "https://app.graphite.com.evil.example/github/pr/sutrolabs/giza/30614",
    "https://example.com/github/pr/sutrolabs/giza/30614",
    destination,
  ]) {
    await t.test(`leaves ${url} unchanged`, async () => {
      assert.equal((await navigate(url)).url, url);
    });
  }

  await t.test("a clicked link opens GitHub in the same tab", async () => {
    html = `<!doctype html><a id="pr" href="${source}">View PR</a>`;
    await navigate("https://example.com/link-test");
    html = "<!doctype html><title>GitHub destination</title>";
    await bidi.send("script.evaluate", {
      expression: 'document.getElementById("pr").click()',
      target: { context },
      awaitPromise: false,
    });
    await waitFor(async () => {
      const tree = await bidi.send("browsingContext.getTree", {});
      assert.equal(tree.contexts.length, contexts.length, "No extra tab should be opened.");
      assert.equal(tree.contexts.find((page) => page.context === context).url, destination);
    });
  });

  await t.test("embedded PR URLs are not redirected", async () => {
    html = `<!doctype html><iframe src="${source}"></iframe>`;
    // Return a plain response inside the frame to avoid recursive iframes.
    const resetHtml = (event) => {
      if (event.request.url === source) html = "<!doctype html><title>Embedded Graphite</title>";
    };
    bidi.prependListener("network.beforeRequestSent", resetHtml);
    try {
      const page = await navigate("https://example.com/iframe-test");
      assert.equal(page.url, "https://example.com/iframe-test");
      assert.equal(page.children[0].url, source);
    } finally {
      bidi.off("network.beforeRequestSent", resetHtml);
    }
  });

  await t.test("removing the extension stops the redirect", async () => {
    await bidi.send("webExtension.uninstall", { extension: installed.extension });
    assert.equal((await navigate(source)).url, source);
  });
});

async function waitFor(assertion) {
  const deadline = Date.now() + 5_000;
  while (true) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
