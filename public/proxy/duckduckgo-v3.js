/* global BareMux, __uv$config */
(function () {
  "use strict";

  const locked = document.getElementById("locked");
  const browser = document.getElementById("browser");
  const form = document.getElementById("address-form");
  const address = document.getElementById("address");
  const frame = document.getElementById("view");
  const start = document.getElementById("start");
  const status = document.getElementById("status");
  const home = document.getElementById("home");
  const workerPath = "/proxy/sw-ddg-v3.js";
  let authorized = false;
  let connection;

  function duckSearch(query) {
    return `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`;
  }

  function destination(value) {
    const input = value.trim();
    if (!input) return "";
    const target = /^https?:\/\//i.test(input)
      ? input
      : /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(input)
        ? `https://${input}`
        : duckSearch(input);

    try {
      const url = new URL(target);
      if (
        /(^|\.)google\.[a-z.]+$/i.test(url.hostname) &&
        url.pathname.replace(/\/+$/, "") === "/search"
      ) {
        return duckSearch(url.searchParams.get("q") || input);
      }
    } catch (_) {}
    return target;
  }

  function waitForActivation(worker) {
    if (!worker || worker.state === "activated") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("The private browser update timed out.")), 12000);
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated") {
          clearTimeout(timeout);
          resolve();
        } else if (worker.state === "redundant") {
          clearTimeout(timeout);
          reject(new Error("The private browser update could not activate."));
        }
      });
    });
  }

  async function prepare() {
    if (!navigator.serviceWorker) throw new Error("This browser does not support service workers.");
    const registration = await navigator.serviceWorker.register(workerPath, {
      scope: "/proxy/",
      updateViaCache: "none",
    });
    await registration.update();
    const worker = registration.installing || registration.waiting || registration.active;
    if (registration.waiting) registration.waiting.postMessage({ type: "skip-waiting" });
    await waitForActivation(worker);
    await navigator.serviceWorker.ready;

    connection ||= new BareMux.BareMuxConnection("/proxy/baremux/worker.js");
    if ((await connection.getTransport()) !== "/proxy/epoxy/index.mjs") {
      await connection.setTransport("/proxy/epoxy/index.mjs", [
        { wisp: "wss://wisp.mercurywork.shop/" },
      ]);
    }
  }

  async function open(value) {
    const url = destination(value);
    if (!url || !authorized) return;
    status.textContent = "Opening secure connection...";
    try {
      await prepare();
      start.hidden = true;
      frame.hidden = false;
      frame.src = __uv$config.prefix + __uv$config.encodeUrl(url);
      address.value = url;
      status.textContent = "";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "The private browser could not start.";
    }
  }

  addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== parent) return;
    if (event.data?.type !== "astral-browser-auth") return;
    authorized = event.data.allowed === true;
    if (!authorized) {
      locked.querySelector("h1").textContent = "Astral membership required.";
      return;
    }
    locked.hidden = true;
    browser.hidden = false;
    void open("https://duckduckgo.com/");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void open(address.value);
  });
  home.addEventListener("click", () => void open("https://duckduckgo.com/"));

  if (window === parent) locked.querySelector("h1").textContent = "Open this browser from Astral Memes.";
  parent.postMessage({ type: "astral-browser-ready" }, location.origin);
})();
