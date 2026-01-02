const PROVIDERS = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    matches: [/chatgpt\.com/, /chat\.openai\.com/],
    url: "https://chatgpt.com/"
  },
  {
    id: "claude",
    name: "Claude",
    matches: [/claude\.ai/],
    url: "https://claude.ai/"
  },
  {
    id: "gemini",
    name: "Gemini",
    matches: [/gemini\.google\.com/],
    url: "https://gemini.google.com/app"
  },
  {
    id: "grok",
    name: "Grok",
    matches: [/grok\.com/, /x\.com\/i\/grok/],
    url: "https://grok.com/"
  },
  {
    id: "perplexity",
    name: "Perplexity",
    matches: [/perplexity\.ai/],
    url: "https://www.perplexity.ai/"
  }
];

function getProviderForUrl(url) {
  if (!url) return null;
  return (
    PROVIDERS.find((provider) => provider.matches.some((match) => match.test(url))) || null
  );
}

function isControlUrl(url) {
  if (!url) return false;
  return url.startsWith(chrome.runtime.getURL("src/control.html"));
}

function findControlWindow(windows) {
  return (
    windows.find((win) => (win.tabs || []).some((tab) => isControlUrl(tab.url || ""))) || null
  );
}

function updateWindow(windowId, bounds) {
  return new Promise((resolve) => {
    chrome.windows.update(windowId, bounds, () => resolve());
  });
}

function getWindowInfo(windowId) {
  return new Promise((resolve) => {
    chrome.windows.get(windowId, (win) => resolve(win || null));
  });
}

async function exitFullscreenIfNeeded(windowId) {
  if (!windowId) return;
  const win = await getWindowInfo(windowId);
  if (win && (win.state === "fullscreen" || win.state === "maximized")) {
    await updateWindow(windowId, { state: "normal" });
  }
}

async function ensureControlWindow(bounds) {
  const windows = await getAllWindows();
  const existing = findControlWindow(windows);
  if (existing) {
    // Always ensure the control window is in normal state (not fullscreen/maximized)
    if (existing.state === "fullscreen" || existing.state === "maximized") {
      await updateWindow(existing.id, { state: "normal" });
    }
    await updateWindow(existing.id, { focused: true, ...(bounds || {}) });
    await addManagedWindowId(existing.id);
    return existing;
  }

  return createManagedWindow({
    url: chrome.runtime.getURL("src/control.html"),
    type: "popup",
    ...(bounds || {})
  });
}

function getAllWindows() {
  return new Promise((resolve) => {
    chrome.windows.getAll({ populate: true }, (windows) => resolve(windows));
  });
}

function getManagedWindowIds() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["managedWindowIds"], (data) => {
      const ids = Array.isArray(data.managedWindowIds) ? data.managedWindowIds : [];
      resolve(ids);
    });
  });
}

function setManagedWindowIds(ids) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ managedWindowIds: ids }, () => resolve());
  });
}

async function addManagedWindowId(windowId) {
  const ids = await getManagedWindowIds();
  if (!ids.includes(windowId)) {
    ids.push(windowId);
    await setManagedWindowIds(ids);
  }
}

async function removeManagedWindowId(windowId) {
  const ids = await getManagedWindowIds();
  const next = ids.filter((id) => id !== windowId);
  if (next.length !== ids.length) {
    await setManagedWindowIds(next);
  }
}

function getPrimaryWorkArea() {
  return new Promise((resolve) => {
    chrome.system.display.getInfo((displays) => {
      const primary = displays.find((d) => d.isPrimary) || displays[0];
      resolve(primary.workArea);
    });
  });
}

function getWorkAreaForWindow(windowId) {
  if (!windowId) return getPrimaryWorkArea();

  return new Promise((resolve) => {
    chrome.windows.get(windowId, (win) => {
      if (!win) {
        getPrimaryWorkArea().then(resolve);
        return;
      }

      const centerX = (win.left || 0) + (win.width || 0) / 2;
      const centerY = (win.top || 0) + (win.height || 0) / 2;

      chrome.system.display.getInfo((displays) => {
        const display =
          displays.find((d) => {
            const bounds = d.bounds;
            return (
              centerX >= bounds.left &&
              centerX < bounds.left + bounds.width &&
              centerY >= bounds.top &&
              centerY < bounds.top + bounds.height
            );
          }) ||
          displays.find((d) => d.isPrimary) ||
          displays[0];
        resolve(display.workArea);
      });
    });
  });
}

async function detectLLMWindows() {
  const windows = await getAllWindows();
  const providerStatus = {};
  PROVIDERS.forEach((provider) => {
    providerStatus[provider.id] = false;
  });

  const llmWindows = windows
    .map((win) => {
      if (win.type !== "popup") return null;
      const providers = new Set();
      (win.tabs || []).forEach((tab) => {
        const provider = getProviderForUrl(tab.url || "");
        if (provider) {
          providers.add(provider.id);
          providerStatus[provider.id] = true;
        }
      });
      return providers.size > 0
        ? { id: win.id, providers: Array.from(providers) }
        : null;
    })
    .filter(Boolean);

  return { llmWindows, providerStatus };
}

function createManagedWindow(options) {
  return new Promise((resolve) => {
    chrome.windows.create(options, (win) => {
      if (win?.id) {
        addManagedWindowId(win.id);
      }
      resolve(win);
    });
  });
}

async function closeAllRelatedWindows() {
  const windows = await getAllWindows();
  const managedIds = new Set(await getManagedWindowIds());

  windows.forEach((win) => {
    if (!managedIds.has(win.id)) return;
    const hasControlTab = (win.tabs || []).some((tab) => isControlUrl(tab.url || ""));
    const hasProviderTab = (win.tabs || []).some((tab) => getProviderForUrl(tab.url || ""));

    if (hasControlTab || hasProviderTab) {
      chrome.windows.remove(win.id);
    }
  });
}

async function closeProviderWindows(options = {}) {
  const windows = await getAllWindows();
  const managedIds = new Set(await getManagedWindowIds());
  const includeUnmanaged = Boolean(options.includeUnmanaged);
  const removals = [];

  windows.forEach((win) => {
    if (win.type !== "popup") return;
    // Only close managed windows, or unmanaged popup windows if includeUnmanaged is true
    const isManaged = managedIds.has(win.id);
    if (!isManaged) {
      // For unmanaged windows, only close if includeUnmanaged is true AND it's a popup window
      if (!includeUnmanaged || win.type !== "popup") return;
    }

    const hasControlTab = (win.tabs || []).some((tab) => isControlUrl(tab.url || ""));
    const hasProviderTab = (win.tabs || []).some((tab) => getProviderForUrl(tab.url || ""));

    if (hasProviderTab && !hasControlTab) {
      removals.push(
        new Promise((resolve) => {
          chrome.windows.remove(win.id, () => resolve());
        })
      );
    }
  });

  await Promise.all(removals);
}

async function focusManagedWindows() {
  const windows = await getAllWindows();
  const managedIds = new Set(await getManagedWindowIds());
  const targets = windows.filter(
    (win) =>
      managedIds.has(win.id) &&
      win.type === "popup" &&
      (win.tabs || []).some((tab) => isControlUrl(tab.url || "") || getProviderForUrl(tab.url || ""))
  );

  for (const win of targets) {
    await new Promise((resolve) => {
      chrome.windows.update(win.id, { focused: true }, () => resolve());
    });
  }
}

async function relayoutManagedWindows() {
  const windows = await getAllWindows();
  const managedIds = new Set(await getManagedWindowIds());
  const managedPopups = windows.filter(
    (win) =>
      managedIds.has(win.id) &&
      win.type === "popup" &&
      (win.tabs || []).some((tab) => isControlUrl(tab.url || "") || getProviderForUrl(tab.url || ""))
  );

  if (!managedPopups.length) return;

  const controlWindow =
    managedPopups.find((win) => (win.tabs || []).some((tab) => isControlUrl(tab.url || ""))) || null;
  const providerWindows = managedPopups
    .filter((win) => win.id !== controlWindow?.id)
    .sort((a, b) => a.id - b.id);

  const totalWindows = providerWindows.length + 1;
  if (totalWindows <= 0) return;

  const workArea = await getWorkAreaForWindow(controlWindow?.id || null);
  const { columns, rows } = getGridDimensions(totalWindows);
  if (columns <= 0 || rows <= 0) return;

  const specs = [{ type: "control", window: controlWindow }].concat(
    providerWindows.map((win) => ({ type: "provider", window: win }))
  );

  const width = Math.floor(workArea.width / columns);
  const height = Math.floor(workArea.height / rows);

  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index];
    if (!spec.window) continue;
    const col = index % columns;
    const row = Math.floor(index / columns);
    if (row >= rows) break;

    const left = workArea.left + col * width;
    const top = workArea.top + row * height;

    await updateWindow(spec.window.id, { left, top, width, height, focused: true });
  }
}

async function listProviderTabs() {
  const windows = await getAllWindows();
  const tabs = [];

  windows.forEach((win) => {
    if (win.type !== "popup") return;
    (win.tabs || []).forEach((tab) => {
      const url = tab.url || "";
      const provider = getProviderForUrl(url);
      if (!provider) return;
      tabs.push({
        windowId: win.id,
        tabId: tab.id,
        providerId: provider.id,
        providerName: provider.name,
        title: tab.title || provider.name,
        url
      });
    });
  });

  const getTabLocation = async (tabId, attempts = 3, delayMs = 500) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const locationUrl = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: "get_location" }, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(response?.url || null);
        });
      });
      if (locationUrl) return locationUrl;
      if (attempt + 1 < attempts) {
        await delay(delayMs);
      }
    }
    return null;
  };

  const withLocations = await Promise.all(
    tabs.map(async (tab) => {
      const locationUrl = await getTabLocation(tab.tabId);
      if (locationUrl) {
        return { ...tab, url: locationUrl };
      }
      return tab;
    })
  );

  return withLocations;
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false });
        return;
      }
      resolve(response || { ok: false });
    });
  });
}

async function sendMessageToTabs(tabIds, message) {
  const results = await Promise.all(
    tabIds.map(async (tabId) => {
      const response = await sendMessageToTab(tabId, message);
      return { tabId, ok: Boolean(response && response.ok) };
    })
  );
  const okCount = results.filter((result) => result.ok).length;
  return { okCount, total: tabIds.length, results };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGridDimensions(count) {
  if (count <= 0) return { columns: 0, rows: 0 };
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  return { columns, rows };
}

async function openAutoGrid({ providerIds, controlWindowId }) {
  const providers = PROVIDERS.filter((provider) => providerIds.includes(provider.id));
  const totalWindows = providers.length + 1;
  if (totalWindows <= 0) return;

  let resolvedControlWindowId = controlWindowId;
  if (!resolvedControlWindowId) {
    const windows = await getAllWindows();
    const existingControl = findControlWindow(windows);
    if (existingControl) {
      resolvedControlWindowId = existingControl.id;
    }
  }

  const workArea = await getWorkAreaForWindow(resolvedControlWindowId);
  const { columns, rows } = getGridDimensions(totalWindows);
  if (columns <= 0 || rows <= 0) return;

  const specs = [
    {
      type: "control",
      windowId: resolvedControlWindowId,
      url: chrome.runtime.getURL("src/control.html")
    }
  ].concat(providers.map((provider) => ({ type: "provider", url: provider.url })));

  const width = Math.floor(workArea.width / columns);
  const height = Math.floor(workArea.height / rows);

  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index];
    const col = index % columns;
    const row = Math.floor(index / columns);
    if (row >= rows) break;

    const left = workArea.left + col * width;
    const top = workArea.top + row * height;

    if (spec.type === "control") {
      if (spec.windowId) {
        // Exit fullscreen/maximized before repositioning
        await exitFullscreenIfNeeded(spec.windowId);
        await updateWindow(spec.windowId, { left, top, width, height, focused: true });
        await addManagedWindowId(spec.windowId);
      } else {
        const win = await createManagedWindow({
          url: spec.url,
          type: "popup",
          left,
          top,
          width,
          height
        });
        spec.windowId = win?.id || null;
      }
      continue;
    }

    await createManagedWindow({
      url: spec.url,
      type: "popup",
      left,
      top,
      width,
      height
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}

async function openPopupWindows(layout) {
  const workArea = await getPrimaryWorkArea();
  const controlUrl = chrome.runtime.getURL("src/control.html");
  const providerList = PROVIDERS.slice();
  const windowSpecs = [{ type: "control", url: controlUrl }].concat(
    providerList.map((provider) => ({ type: "provider", url: provider.url }))
  );

  if (layout.type === "grid") {
    const { columns, rows } = layout;
    const width = Math.floor(workArea.width / columns);
    const height = Math.floor(workArea.height / rows);

    for (let index = 0; index < windowSpecs.length; index += 1) {
      const spec = windowSpecs[index];
      const col = index % columns;
      const row = Math.floor(index / columns);
      if (row >= rows) break;

      const left = workArea.left + col * width;
      const top = workArea.top + row * height;

      await createManagedWindow({
        url: spec.url,
        type: "popup",
        left,
        top,
        width,
        height
      });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    return;
  }

  if (layout.type === "main-plus") {
    const mainWidth = Math.floor(workArea.width * 0.62);
    const sideWidth = workArea.width - mainWidth;
    const sideCount = Math.max(1, layout.sideCount);
    const sideHeight = Math.floor(workArea.height / sideCount);

    const mainWindow = windowSpecs[0];
    if (mainWindow) {
      await createManagedWindow({
        url: mainWindow.url,
        type: "popup",
        left: workArea.left,
        top: workArea.top,
        width: mainWidth,
        height: workArea.height
      });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    for (let index = 0; index < Math.min(sideCount, windowSpecs.length - 1); index += 1) {
      const spec = windowSpecs[index + 1];
      await createManagedWindow({
        url: spec.url,
        type: "popup",
        left: workArea.left + mainWidth,
        top: workArea.top + index * sideHeight,
        width: sideWidth,
        height: sideHeight
      });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
}

function normalizeUrls(urls) {
  if (!Array.isArray(urls)) return [];
  const unique = [];
  urls.forEach((url) => {
    if (typeof url !== "string") return;
    const trimmed = url.trim();
    if (!trimmed) return;
    if (isControlUrl(trimmed)) return;
    if (!unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  });
  return unique;
}

async function openConversationGrid({ urls, controlWindowId }) {
  const safeUrls = normalizeUrls(urls);
  const totalWindows = safeUrls.length + 1;
  if (totalWindows <= 1) return;

  let resolvedControlWindowId = controlWindowId;
  if (!resolvedControlWindowId) {
    const windows = await getAllWindows();
    const existingControl = findControlWindow(windows);
    if (existingControl) {
      resolvedControlWindowId = existingControl.id;
    }
  }

  const workArea = await getWorkAreaForWindow(resolvedControlWindowId);
  const { columns, rows } = getGridDimensions(totalWindows);
  if (columns <= 0 || rows <= 0) return;

  const specs = [
    {
      type: "control",
      windowId: resolvedControlWindowId,
      url: chrome.runtime.getURL("src/control.html")
    }
  ].concat(safeUrls.map((url) => ({ type: "provider", url })));

  const width = Math.floor(workArea.width / columns);
  const height = Math.floor(workArea.height / rows);

  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index];
    const col = index % columns;
    const row = Math.floor(index / columns);
    if (row >= rows) break;

    const left = workArea.left + col * width;
    const top = workArea.top + row * height;

    if (spec.type === "control") {
      if (spec.windowId) {
        // Exit fullscreen/maximized before repositioning
        await exitFullscreenIfNeeded(spec.windowId);
        await updateWindow(spec.windowId, { left, top, width, height, focused: true });
        await addManagedWindowId(spec.windowId);
      } else {
        const win = await createManagedWindow({
          url: spec.url,
          type: "popup",
          left,
          top,
          width,
          height
        });
        spec.windowId = win?.id || null;
      }
      continue;
    }

    await createManagedWindow({
      url: spec.url,
      type: "popup",
      left,
      top,
      width,
      height
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}

async function broadcastPrompt({ prompt, providerIds, mode }) {
  const windows = await getAllWindows();
  const targets = [];

  windows.forEach((win) => {
    (win.tabs || []).forEach((tab) => {
      const provider = getProviderForUrl(tab.url || "");
      if (!provider) return;
      if (!providerIds.includes(provider.id)) return;
      targets.push(tab.id);
    });
  });

  if (targets.length === 0) {
    return { ok: true, total: 0, okCount: 0 };
  }

  if (mode === "submit") {
    await sendMessageToTabs(targets, {
      type: "broadcast",
      prompt,
      mode: "paste"
    });
    await delay(600);
    const submitResult = await sendMessageToTabs(targets, {
      type: "broadcast",
      prompt,
      mode: "submit"
    });
    return {
      ok: submitResult.okCount > 0,
      total: targets.length,
      okCount: submitResult.okCount
    };
  }

  const result = await sendMessageToTabs(targets, {
    type: "broadcast",
    prompt,
    mode
  });
  return {
    ok: result.okCount > 0,
    total: result.total,
    okCount: result.okCount
  };
}

chrome.action.onClicked.addListener(() => {
  ensureControlWindow({ width: 420, height: 600 });
});

chrome.windows.onRemoved.addListener((windowId) => {
  removeManagedWindowId(windowId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "get_status") {
      const status = await detectLLMWindows();
      sendResponse({
        ok: true,
        status
      });
      return;
    }

    if (message.type === "new_chat") {
      await closeProviderWindows({ includeUnmanaged: true });
      await openAutoGrid({
        providerIds: message.providers || [],
        controlWindowId: message.controlWindowId || null
      });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "broadcast") {
      const result = await broadcastPrompt({
        prompt: message.prompt || "",
        providerIds: message.providers || [],
        mode: message.mode || "paste"
      });
      sendResponse({ ok: true, result });
      return;
    }

    if (message.type === "open_conversation") {
      await closeProviderWindows({ includeUnmanaged: true });
      await openConversationGrid({
        urls: message.urls || [],
        controlWindowId: message.controlWindowId || null
      });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "close_all") {
      await closeProviderWindows();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "focus_all") {
      await relayoutManagedWindows();
      await focusManagedWindows();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "list_tabs") {
      const tabs = await listProviderTabs();
      sendResponse({ ok: true, tabs });
      return;
    }

    if (message.type === "close_tab") {
      if (typeof message.tabId === "number") {
        chrome.tabs.get(message.tabId, async (tab) => {
          if (!tab || typeof tab.windowId !== "number") {
            sendResponse({ ok: false, error: "Tab not found" });
            return;
          }
          const managedIds = new Set(await getManagedWindowIds());
          if (!managedIds.has(tab.windowId)) {
            sendResponse({ ok: false, error: "Tab not managed" });
            return;
          }
          chrome.tabs.remove(message.tabId, () => {
            sendResponse({ ok: true });
          });
        });
        return;
      }
      sendResponse({ ok: false, error: "Missing tabId" });
      return;
    }

    if (message.type === "focus_tab") {
      if (typeof message.tabId === "number") {
        chrome.tabs.get(message.tabId, async (tab) => {
          if (!tab || typeof tab.windowId !== "number") {
            sendResponse({ ok: false, error: "Tab not found" });
            return;
          }
          const managedIds = new Set(await getManagedWindowIds());
          if (!managedIds.has(tab.windowId)) {
            sendResponse({ ok: false, error: "Tab not managed" });
            return;
          }
          chrome.windows.update(tab.windowId, { focused: true }, () => {
            chrome.tabs.update(message.tabId, { active: true }, () => {
              sendResponse({ ok: true });
            });
          });
        });
        return;
      }
      sendResponse({ ok: false, error: "Missing tabId" });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message" });
  })();

  return true;
});
