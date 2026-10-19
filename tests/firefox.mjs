import { spawn, spawnSync } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function firefoxBinary() {
  if (process.env.FIREFOX_BINARY) return process.env.FIREFOX_BINARY;
  const macOS = "/Applications/Firefox.app/Contents/MacOS/firefox";
  if (process.platform === "darwin" && existsSync(macOS)) return macOS;
  const command = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(command, ["firefox"], { encoding: "utf8" });
  if (result.status === 0) return result.stdout.trim().split(/\r?\n/)[0];
  throw new Error("Firefox was not found. Set FIREFOX_BINARY to its executable path.");
}

class BiDi extends EventEmitter {
  #socket;
  #nextId = 0;
  #pending = new Map();

  constructor(socket) {
    super();
    this.#socket = socket;
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "event") {
        this.emit(message.method, message.params);
        return;
      }
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.#pending.delete(message.id);
      if (message.type === "error") {
        pending.reject(new Error(`${message.error}: ${message.message}`));
      } else {
        pending.resolve(message.result);
      }
    });
    socket.addEventListener("close", () => {
      for (const { reject, timer } of this.#pending.values()) {
        clearTimeout(timer);
        reject(new Error("Firefox closed its WebDriver connection."));
      }
      this.#pending.clear();
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.#nextId;
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Firefox timed out running ${method}.`));
      }, 15_000);
      this.#pending.set(id, { resolve, reject, timer });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.#socket.close();
  }
}

export async function launchFirefox() {
  const profile = await mkdtemp(join(tmpdir(), "graphite-to-github-test-"));
  let child;
  let bidi;
  const close = async () => {
    bidi?.close();
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      const forceKill = setTimeout(() => child.kill("SIGKILL"), 5_000);
      try {
        await exited;
      } finally {
        clearTimeout(forceKill);
      }
    }
    await rm(profile, { recursive: true, force: true });
  };

  try {
    await writeFile(join(profile, "user.js"), [
      'user_pref("browser.shell.checkDefaultBrowser", false);',
      'user_pref("browser.aboutwelcome.enabled", false);',
      'user_pref("browser.startup.homepage", "about:blank");',
      'user_pref("browser.newtabpage.enabled", false);',
      'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    ].join("\n"));

    child = spawn(firefoxBinary(), [
      "--headless", "--no-remote", "--profile", profile,
      "--remote-debugging-port", "0", "about:blank",
    ], { stdio: ["ignore", "pipe", "pipe"] });

    const endpoint = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error(`Firefox did not start:\n${output}`)), 15_000);
      const readOutput = (chunk) => {
        output += chunk;
        const match = output.match(/WebDriver BiDi listening on (ws:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timer);
          resolve(`${match[1]}/session`);
        }
      };
      child.stdout.on("data", readOutput);
      child.stderr.on("data", readOutput);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code, signal) => {
        clearTimeout(timer);
        reject(new Error(`Firefox exited (${code ?? signal}):\n${output}`));
      });
    });

    const socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Firefox WebSocket did not connect.")), 10_000);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Could not connect to Firefox.")); }, { once: true });
    });
    bidi = new BiDi(socket);
    const session = await bidi.send("session.new", { capabilities: {} });
    return { bidi, close, version: session.capabilities.browserVersion };
  } catch (error) {
    await close();
    throw error;
  }
}
