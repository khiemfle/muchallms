const PROVIDERS = [
  { id: "chatgpt", name: "ChatGPT" },
  { id: "claude", name: "Claude" },
  { id: "gemini", name: "Gemini" },
  { id: "grok", name: "Grok" },
  { id: "perplexity", name: "Perplexity" }
];

const PROVIDER_HOME_URLS = {
  chatgpt: "https://chatgpt.com/",
  claude: "https://claude.ai/",
  gemini: "https://gemini.google.com/app",
  grok: "https://grok.com/",
  perplexity: "https://www.perplexity.ai/"
};

const STORAGE_KEYS = [
  "providerPrefs",
  "lastPrompt",
  "conversations",
  "activeConversationId",
  "settings"
];

const statusList = document.getElementById("status-list");
const openChatsList = document.getElementById("open-chats");
const togglesContainer = document.getElementById("provider-toggles");
const promptField = document.getElementById("prompt");
const sendButton = document.getElementById("broadcast-send");
const headerConversation = document.getElementById("header-conversation");
const panelContent = document.querySelector(".panel__content");
const conversationSection = document.getElementById("conversation-section");
const emptyStateSection = document.getElementById("empty-state-section");
const openLlmsButton = document.getElementById("open-llms-button");
const messagesContainer = document.getElementById("messages-container");
const llmStatusContainer = document.getElementById("llm-status-container");
const llmStatusList = document.getElementById("llm-status-list");
const openMissingLlmsButton = document.getElementById("open-missing-llms-button");
const conversationsList = document.getElementById("conversations");
const conversationUpdated = document.getElementById("conversation-updated");
const conversationMessages = document.getElementById("conversation-messages");
const settingsModal = document.getElementById("settings-modal");
const settingsBackdrop = document.getElementById("settings-backdrop");
const openSettingsButton = document.getElementById("open-settings");
const closeSettingsButton = document.getElementById("close-settings");
const settingsCancelButton = document.getElementById("settings-cancel");
const settingsSaveButton = document.getElementById("settings-save");
const historyLimitInput = document.getElementById("history-limit");
const defaultProvidersContainer = document.getElementById("default-providers");
const privacyModal = document.getElementById("privacy-modal");
const privacyBackdrop = document.getElementById("privacy-backdrop");
const openPrivacyButton = document.getElementById("open-privacy");
const closePrivacyButton = document.getElementById("close-privacy");
const faqModal = document.getElementById("faq-modal");
const faqBackdrop = document.getElementById("faq-backdrop");
const openFaqButton = document.getElementById("open-faq");
const closeFaqButton = document.getElementById("close-faq");
const historyModal = document.getElementById("history-modal");
const historyBackdrop = document.getElementById("history-backdrop");
const openHistoryButton = document.getElementById("open-history");
const closeHistoryButton = document.getElementById("close-history");
const historySearchInput = document.getElementById("history-search-input");
const historySearchMode = document.getElementById("history-search-mode");
const historySearchHelp = document.getElementById("history-search-help");
const historySearchStatus = document.getElementById("history-search-status");
const llmMenu = document.getElementById("llm-menu");
const llmCountLabel = document.getElementById("llm-count-label");
const llmMenuStatusList = document.getElementById("llm-menu-status-list");
const llmDropdownButton = document.querySelector(".llm-dropdown-button");
const openLlmsMenuButton = document.getElementById("open-llms-menu-button");
const closeAllMenuButton = document.getElementById("close-all-menu-button");

const DEFAULT_SETTINGS = {
  historyLimit: 50,
  defaultProviders: PROVIDERS.map((provider) => provider.id),
  theme: "system",
  providerUrls: {}
};

let debugEnabled = false;

chrome.storage.local.get(["debug"], (data) => {
  debugEnabled = Boolean(data?.debug);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.debug) return;
  debugEnabled = Boolean(changes.debug.newValue);
});

function logDebug(...args) {
  if (!debugEnabled) return;
  console.log("[Muchallms]", ...args);
}

let cachedConversations = [];
let activeConversationId = null;
let lastRecordedPrompt = "";
let lastRecordedAt = 0;
let settings = { ...DEFAULT_SETTINGS };
let llmStatusPollingInterval = null;
let lastOpenTabsSignature = "";
let historySearchState = { query: "", mode: "contains", regexError: "" };

const VALID_THEMES = ["system", "light", "dark"];

function normalizeSettings(value) {
  if (!value || typeof value !== "object") return { ...DEFAULT_SETTINGS };
  const historyLimit = Number(value.historyLimit);
  const defaultProviders = Array.isArray(value.defaultProviders)
    ? value.defaultProviders.filter((id) => PROVIDERS.some((provider) => provider.id === id))
    : DEFAULT_SETTINGS.defaultProviders;
  const theme = VALID_THEMES.includes(value.theme) ? value.theme : DEFAULT_SETTINGS.theme;
  const providerUrls = {};
  if (value.providerUrls && typeof value.providerUrls === "object") {
    PROVIDERS.forEach((provider) => {
      const url = value.providerUrls[provider.id];
      if (typeof url === "string" && url.trim()) {
        providerUrls[provider.id] = url.trim();
      }
    });
  }
  return {
    historyLimit: Number.isFinite(historyLimit) && historyLimit > 0 ? historyLimit : DEFAULT_SETTINGS.historyLimit,
    defaultProviders: defaultProviders.length ? defaultProviders : DEFAULT_SETTINGS.defaultProviders,
    theme,
    providerUrls
  };
}

function escapeAttr(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getProviderInitUrl(providerId) {
  const custom = settings.providerUrls?.[providerId];
  return (custom && custom.trim()) ? custom.trim() : (PROVIDER_HOME_URLS[providerId] || "");
}

function getProviderInitUrls(providerIds) {
  const urls = {};
  (providerIds || []).forEach((id) => {
    urls[id] = getProviderInitUrl(id);
  });
  return urls;
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove("theme-light", "theme-dark");
  if (theme === "light") {
    root.classList.add("theme-light");
  } else if (theme === "dark") {
    root.classList.add("theme-dark");
  }
  // "system" means no class, so the CSS media query handles it
}

function buildProviderPrefs(defaultProviders) {
  const prefs = {};
  PROVIDERS.forEach((provider) => {
    prefs[provider.id] = defaultProviders.includes(provider.id);
  });
  return prefs;
}

function renderStatus(providerStatus) {
  if (!statusList) return;
  statusList.innerHTML = "";
  PROVIDERS.forEach((provider) => {
    const isOn = Boolean(providerStatus[provider.id]);
    const item = document.createElement("li");
    item.className = `status__item ${isOn ? "status__item--on" : ""}`;
    item.innerHTML = `
      <span class="status__label">
        <span class="status__dot"></span>
        ${provider.name}
      </span>
      <span class="status__state">${isOn ? "detected" : "missing"}</span>
    `;
    statusList.appendChild(item);
  });
}

function renderOpenChats(tabs) {
  openChatsList.innerHTML = "";
  if (!tabs || tabs.length === 0) {
    const item = document.createElement("li");
    item.className = "status__item";
    item.innerHTML = "<span class=\"status__label\">No chats detected</span>";
    openChatsList.appendChild(item);
    return;
  }

  tabs.forEach((tab) => {
    const item = document.createElement("li");
    item.className = "status__item status__item--on";
    item.innerHTML = `
      <span class="status__label">
        <span class="status__dot"></span>
        ${tab.providerName}
      </span>
      <span class="status__actions">
        <span class="status__state">${tab.title}</span>
        <details class="menu">
          <summary class="menu__button" aria-label="Chat actions">...</summary>
          <div class="menu__panel">
            <button class="menu__item" data-action="open" data-tab-id="${tab.tabId}" type="button">
              Open
            </button>
            <button class="menu__item" data-action="close" data-tab-id="${tab.tabId}" type="button">
              Close
            </button>
          </div>
        </details>
      </span>
    `;
    openChatsList.appendChild(item);
  });
}

function getSelectedProviders() {
  const disabled = getActiveConversationDisabledProviders();
  return settings.defaultProviders.filter((id) => !disabled.includes(id));
}

function getSelectedProvidersWithFallback() {
  const selected = getSelectedProviders();
  if (selected.length) return selected;
  return settings.defaultProviders.slice();
}

function getOrderedProviders(providerIds) {
  const unique = Array.from(new Set((providerIds || []).filter(Boolean)));
  const ordered = PROVIDERS.map((provider) => provider.id).filter((id) => unique.includes(id));
  unique.forEach((id) => {
    if (!ordered.includes(id)) {
      ordered.push(id);
    }
  });
  return ordered;
}

async function refreshStatus() {
  const [statusResponse, tabsResponse] = await Promise.all([
    chrome.runtime.sendMessage({ type: "get_status" }),
    chrome.runtime.sendMessage({ type: "list_tabs" })
  ]);
  if (statusResponse && statusResponse.ok) {
    renderStatus(statusResponse.status.providerStatus || {});
  }
  if (tabsResponse && tabsResponse.ok) {
    renderOpenChats(tabsResponse.tabs || []);
  }
  // Update empty state based on open tabs
  const openTabs = (tabsResponse && tabsResponse.ok && tabsResponse.tabs) ? tabsResponse.tabs : [];
  const hasOpenTabs = openTabs.length > 0;
  if (emptyStateSection && !activeConversationId) {
    if (hasOpenTabs) {
      emptyStateSection.classList.add("is-hidden");
    } else {
      emptyStateSection.classList.remove("is-hidden");
    }
  }
  // Update send button state and LLM menu based on open LLMs
  updateSendButtonState(openTabs);
  renderLlmMenuDropdown(openTabs);
}

let refreshTimer = null;

function queueRefresh(delayMs = 300) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refreshStatus();
    refreshConversations();
  }, delayMs);
}

function getOpenTabsSignature(tabs) {
  if (!tabs || !tabs.length) return "";
  return tabs
    .map(tab => `${tab.providerId}:${tab.tabId}:${tab.windowState || "normal"}:${tab.windowFocused ? 1 : 0}`)
    .sort()
    .join("|");
}

function updateSendButtonState(openTabs) {
  if (!sendButton) return;
  const disabled = getActiveConversationDisabledProviders();
  const enabledProviders = (settings.defaultProviders || PROVIDERS.map(p => p.id))
    .filter((id) => !disabled.includes(id));
  const frontProviderIds = (openTabs || [])
    .filter(tab => tab.windowState !== "minimized")
    .map(tab => tab.providerId)
    .filter(Boolean);
  const hasAnyConfiguredLlmFront = enabledProviders.some(id => frontProviderIds.includes(id));
  sendButton.disabled = !hasAnyConfiguredLlmFront;
  sendButton.title = hasAnyConfiguredLlmFront
    ? "Send to all (Ctrl/Cmd+Enter)"
    : "Bring LLMs to front to send messages";
}

function renderLlmMenuDropdown(openTabs) {
  const defaultProviders = settings.defaultProviders || PROVIDERS.map(p => p.id);
  const chatDisabled = getActiveConversationDisabledProviders();
  const frontProviderIds = (openTabs || [])
    .filter(tab => tab.windowState !== "minimized")
    .map(tab => tab.providerId)
    .filter(Boolean);

  const openCount = defaultProviders
    .filter(id => !chatDisabled.includes(id))
    .filter(id => frontProviderIds.includes(id)).length;

  if (llmCountLabel) {
    llmCountLabel.textContent = `${openCount} LLMs`;
  }

  if (llmDropdownButton) {
    if (openCount > 0) {
      llmDropdownButton.classList.add("has-open-llms");
    } else {
      llmDropdownButton.classList.remove("has-open-llms");
    }
  }

  if (llmMenuStatusList) {
    llmMenuStatusList.innerHTML = "";
    const activeConv = getActiveConversation();
    const manualUrls = activeConv?.manualUrlsByProvider || {};

    defaultProviders.forEach((providerId) => {
      const provider = PROVIDERS.find(p => p.id === providerId);
      if (!provider) return;

      const isDisabledForChat = chatDisabled.includes(providerId);
      const providerTabs = (openTabs || []).filter(tab => tab.providerId === providerId);
      const isOpen = providerTabs.length > 0;
      const isFront = providerTabs.some(tab => tab.windowState !== "minimized");
      const hasManualUrl = Boolean(manualUrls[providerId]);
      const item = document.createElement("li");
      if (isDisabledForChat) {
        item.className = "llm-menu-item llm-menu-item--disabled";
      } else if (isOpen) {
        item.className = `llm-menu-item ${isFront ? "llm-menu-item--open" : "llm-menu-item--idle"}`;
      } else {
        item.className = "llm-menu-item llm-menu-item--closed";
      }
      const stateLabel = isDisabledForChat ? "off" : (isOpen ? (isFront ? "open" : "N/A") : "closed");
      const liveUrl = (providerTabs[0] || {}).url || "";
      const pending = pendingUrlChanges[providerId] || null;
      const chatControls = activeConversationId ? `
        <span class="llm-menu-item-chips">
          <button class="llm-menu-chip ${isDisabledForChat ? "llm-menu-chip--off" : ""}"
                  data-action="toggle-chat-provider" data-provider-id="${providerId}"
                  title="${isDisabledForChat ? "Enable for this chat" : "Disable for this chat"}">
            ${isDisabledForChat ? "off" : "on"}
          </button>
          <button class="llm-menu-chip ${hasManualUrl ? "llm-menu-chip--set" : ""}"
                  data-action="edit-chat-url-menu" data-provider-id="${providerId}"
                  data-provider-name="${escapeAttr(provider.name)}"
                  data-current-url="${escapeAttr(manualUrls[providerId] || liveUrl)}"
                  data-default-url="${escapeAttr(PROVIDER_HOME_URLS[providerId] || "")}"
                  title="${hasManualUrl ? "Edit URL" : "Set URL"}">
            URL${hasManualUrl ? " ✓" : ""}
          </button>
        </span>
      ` : "";
      const pendingBlock = pending ? `
        <div class="llm-menu-url-changed">
          <p class="llm-menu-url-changed__title">URL changed</p>
          <div class="llm-menu-url-changed__row">
            <span class="llm-menu-url-changed__key">Stored</span>
            <span class="llm-menu-url-changed__val" title="${escapeAttr(pending.storedUrl)}">${truncateText(pending.storedUrl, 32)}</span>
          </div>
          <div class="llm-menu-url-changed__row">
            <span class="llm-menu-url-changed__key">New</span>
            <span class="llm-menu-url-changed__val llm-menu-url-changed__val--new" title="${escapeAttr(pending.newUrl)}">${truncateText(pending.newUrl, 32)}</span>
          </div>
          <div class="llm-menu-url-changed__actions">
            <button class="llm-menu-chip llm-menu-chip--set" data-action="accept-url-change" data-provider-id="${providerId}">Update</button>
            <button class="llm-menu-chip" data-action="dismiss-url-change" data-provider-id="${providerId}">Keep stored</button>
          </div>
        </div>
      ` : "";
      const displayUrl = liveUrl || manualUrls[providerId] || "";
      const urlSubtitle = displayUrl
        ? `<span class="llm-menu-item-url${pending ? " llm-menu-item-url--changed" : ""}" title="${escapeAttr(displayUrl)}">${truncateText(displayUrl, 35)}</span>`
        : "";
      item.innerHTML = `
        <span class="llm-menu-item-label">
          <span class="llm-menu-dot"></span>
          <span class="llm-menu-item-name">
            ${provider.name}
            ${urlSubtitle}
          </span>
        </span>
        <span class="llm-menu-item-right">
          <span class="llm-menu-item-state">${stateLabel}</span>
          ${chatControls}
        </span>
        ${pendingBlock}
      `;
      if (pending) item.classList.add("llm-menu-item--url-changed");
      llmMenuStatusList.appendChild(item);
    });
  }
}

async function pollLlmStatus() {
  try {
    const tabsResponse = await chrome.runtime.sendMessage({ type: "list_tabs" });
    const openTabs = (tabsResponse && tabsResponse.ok && tabsResponse.tabs) ? tabsResponse.tabs : [];
    const currentSignature = getOpenTabsSignature(openTabs);
    
    // Always update send button state and LLM menu
    detectPendingUrlChanges(openTabs);
    updateSendButtonState(openTabs);
    renderLlmMenuDropdown(openTabs);
    if (llmStatusContainer && !llmStatusContainer.classList.contains("is-hidden")) {
      renderLlmStatusInDetail(openTabs);
      const actionButton = llmStatusContainer.querySelector(".llm-status-action");
      if (actionButton) {
        const defaultProviders = settings.defaultProviders || PROVIDERS.map(p => p.id);
        const frontProviderIds = openTabs
          .filter(tab => tab.windowState !== "minimized")
          .map(tab => tab.providerId)
          .filter(Boolean);
        const allLlmsOpen = defaultProviders.every(id => frontProviderIds.includes(id));
        if (allLlmsOpen) {
          actionButton.classList.add("is-hidden");
        } else {
          actionButton.classList.remove("is-hidden");
        }
      }
    }
    
    // Only refresh if the open tabs have changed
    if (currentSignature !== lastOpenTabsSignature) {
      lastOpenTabsSignature = currentSignature;
      await refreshStatus();
      await refreshConversations();
    }
  } catch (error) {
    // Silently ignore errors during polling
  }
}

function startLlmStatusPolling() {
  if (llmStatusPollingInterval) return;
  llmStatusPollingInterval = setInterval(pollLlmStatus, 1000);
}

function stopLlmStatusPolling() {
  if (llmStatusPollingInterval) {
    clearInterval(llmStatusPollingInterval);
    llmStatusPollingInterval = null;
  }
}

function savePrefs() {
  chrome.storage.local.set({
    lastPrompt: promptField.value
  });
}

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function truncateText(text, maxLength) {
  const trimmed = (text || "").trim();
  if (!trimmed) return "Untitled";
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...`;
}

function getProviderName(providerId) {
  const provider = PROVIDERS.find((entry) => entry.id === providerId);
  return provider ? provider.name : providerId;
}

function getHostLabel(url) {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch (error) {
    return url;
  }
}

function normalizeConversation(conversation) {
  const safe = conversation || {};
  return {
    id: safe.id,
    rootPrompt: safe.rootPrompt || "",
    createdAt: safe.createdAt || 0,
    lastUpdated: safe.lastUpdated || safe.createdAt || 0,
    linksByProvider: safe.linksByProvider || {},
    manualUrlsByProvider: safe.manualUrlsByProvider || {},
    disabledProviders: Array.isArray(safe.disabledProviders) ? safe.disabledProviders : [],
    urlHistory: Array.isArray(safe.urlHistory) ? safe.urlHistory : [],
    messages: Array.isArray(safe.messages) ? safe.messages : []
  };
}

function normalizeConversations(conversations) {
  if (!Array.isArray(conversations)) return [];
  return conversations
    .map(normalizeConversation)
    .filter((conversation) => conversation.id);
}

function sortConversations(conversations) {
  return [...conversations].sort((a, b) => {
    const aTime = a.lastUpdated || a.createdAt || 0;
    const bTime = b.lastUpdated || b.createdAt || 0;
    return bTime - aTime;
  });
}

function getConversationSearchTexts(conversation) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const texts = messages
    .map((message) => (message && message.prompt ? message.prompt : ""))
    .filter(Boolean);
  if (!texts.length && conversation?.rootPrompt) {
    texts.push(conversation.rootPrompt);
  }
  return texts;
}

function buildSearchRegex(query) {
  const trimmed = (query || "").trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^\/(.+)\/([gimsuy]*)$/);
  let pattern = trimmed;
  let flags = "i";
  let hasExplicitDelimiter = false;
  if (match) {
    pattern = match[1];
    flags = match[2] || "";
    hasExplicitDelimiter = true;
  }
  const normalizedFlags = hasExplicitDelimiter ? flags : (flags || "i");
  return new RegExp(pattern, normalizedFlags);
}

function updateHistorySearchLabels(total, matched) {
  if (historySearchHelp) {
    historySearchHelp.classList.remove("form__helper--error");
    if (historySearchState.regexError) {
      historySearchHelp.textContent = `Invalid regex: ${historySearchState.regexError}`;
      historySearchHelp.classList.add("form__helper--error");
    } else if (historySearchState.mode === "regex" && historySearchState.query) {
      historySearchHelp.textContent = "Regex uses JavaScript syntax. Wrap with /pattern/flags to set flags.";
    } else {
      historySearchHelp.textContent = "";
    }
  }
  if (historySearchStatus) {
    if (historySearchState.query) {
      historySearchStatus.textContent = `Showing ${matched} of ${total}`;
    } else {
      historySearchStatus.textContent = total ? `Showing ${total}` : "";
    }
  }
}

function applyHistorySearch() {
  const total = cachedConversations.length;
  if (!conversationsList) return;
  if (!historySearchInput || !historySearchMode) {
    renderConversationList(cachedConversations, activeConversationId);
    return;
  }

  historySearchState.query = (historySearchInput.value || "").trim();
  historySearchState.mode = historySearchMode.value === "regex" ? "regex" : "contains";
  historySearchState.regexError = "";

  let filtered = cachedConversations;
  if (historySearchState.query) {
    if (historySearchState.mode === "regex") {
      let regex = null;
      try {
        regex = buildSearchRegex(historySearchState.query);
      } catch (error) {
        historySearchState.regexError = error?.message || "Invalid pattern";
        updateHistorySearchLabels(total, 0);
        renderConversationList([], activeConversationId, "No conversations match your search.");
        return;
      }
      filtered = cachedConversations.filter((conversation) => {
        const texts = getConversationSearchTexts(conversation);
        return texts.some((text) => {
          if (!regex) return false;
          if (regex.global || regex.sticky) regex.lastIndex = 0;
          return regex.test(text);
        });
      });
    } else {
      const needle = historySearchState.query.toLowerCase();
      filtered = cachedConversations.filter((conversation) => {
        const texts = getConversationSearchTexts(conversation);
        return texts.some((text) => text.toLowerCase().includes(needle));
      });
    }
  }

  updateHistorySearchLabels(total, filtered.length);
  const emptyMessage = historySearchState.query
    ? "No conversations match your search."
    : "No conversations yet";
  renderConversationList(filtered, activeConversationId, emptyMessage);
}

function renderConversationList(conversations, activeId, emptyMessage = "No conversations yet") {
  conversationsList.innerHTML = "";
  if (!conversations.length) {
    const item = document.createElement("li");
    item.className = "status__item";
    item.innerHTML = `<span class="status__label">${emptyMessage}</span>`;
    conversationsList.appendChild(item);
    return;
  }

  conversations.forEach((conversation) => {
    const isActive = conversation.id === activeId;
    const item = document.createElement("li");
    item.className = `status__item status__item--expandable ${isActive ? "status__item--on" : ""}`;
    const title = truncateText(conversation.rootPrompt, 42);
    const timestamp = formatTimestamp(conversation.lastUpdated || conversation.createdAt);
    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    const previewMessages = messages.slice(-3);
    const previewItems = previewMessages
      .map((message) => {
        const timestamp = formatTimestamp(message.createdAt);
        const text = truncateText(message.prompt, 120);
        return `<li><span class="conversation__preview-time">${timestamp}</span> ${text}</li>`;
      })
      .join("");
    const linkEntries = [];
    Object.entries(conversation.linksByProvider || {}).forEach(([providerId, links]) => {
      if (!links) return;
      const list = Array.isArray(links) ? links : [links];
      list.forEach((url) => {
        if (!url) return;
        linkEntries.push({ providerId, url });
      });
    });
    const linkItems = linkEntries
      .map(({ providerId, url }) => {
        const name = getProviderName(providerId);
        const host = getHostLabel(url);
        return `<li><span class="conversation__preview-time">${name}</span> <a class="conversation__link" href="${url}" target="_blank" rel="noreferrer">${host}</a></li>`;
      })
      .join("");
    item.innerHTML = `
      <span class="status__label">
        <span class="status__dot"></span>
        ${title}
      </span>
      <span class="status__actions">
        <span class="status__state">${timestamp}</span>
        <details class="menu">
          <summary class="menu__button" aria-label="Conversation actions">...</summary>
          <div class="menu__panel">
            <button class="menu__item" data-action="open" data-conversation-id="${conversation.id}" type="button">
              Open chat
            </button>
            <button class="menu__item menu__item--danger" data-action="delete" data-conversation-id="${conversation.id}" type="button">
              Delete
            </button>
          </div>
        </details>
      </span>
      <div class="conversation__preview" data-conversation-id="${conversation.id}">
        <p class="conversation__preview-title">Original question</p>
        <p class="conversation__preview-text">${conversation.rootPrompt || "Untitled"}</p>
        <p class="conversation__preview-title">Last 3 messages</p>
        <ul class="conversation__preview-list">
          ${previewItems || "<li>No messages yet</li>"}
        </ul>
        <p class="conversation__preview-title">LLM links</p>
        <ul class="conversation__preview-list">
          ${linkItems || "<li>No links saved</li>"}
        </ul>
      </div>
    `;
    conversationsList.appendChild(item);
  });
}

function confirmPromptDiscard() {
  const currentPrompt = promptField.value.trim();
  if (!currentPrompt) return true;
  return window.confirm("You have a draft prompt. Continue and discard it?");
}

function renderEmptyConversationList(target, message) {
  target.innerHTML = "";
  const item = document.createElement("li");
  item.className = "conversation__item";
  item.textContent = message;
  target.appendChild(item);
}

function renderLlmStatusInDetail(openTabs) {
  if (!llmStatusList) return;
  llmStatusList.innerHTML = "";

  const defaultProviders = settings.defaultProviders || PROVIDERS.map(p => p.id);
  const activeConv = getActiveConversation();
  const chatDisabled = activeConv?.disabledProviders || [];
  const manualUrls = activeConv?.manualUrlsByProvider || {};
  const hasActiveConv = Boolean(activeConversationId);

  defaultProviders.forEach((providerId) => {
    const provider = PROVIDERS.find(p => p.id === providerId);
    if (!provider) return;

    const providerTabs = openTabs.filter(tab => tab.providerId === providerId);
    const isOpen = providerTabs.length > 0;
    const frontTab = providerTabs.find(tab => tab.windowState !== "minimized");
    const isFront = Boolean(frontTab);
    const isDisabled = chatDisabled.includes(providerId);
    const manualUrl = manualUrls[providerId] || "";

    let statusClass = "status__item--closed";
    if (isDisabled) {
      statusClass = "status__item--chat-disabled";
    } else if (isOpen && isFront) {
      statusClass = "status__item--on";
    } else if (isOpen) {
      statusClass = "status__item--idle";
    }

    const stateLabel = isDisabled ? "off"
      : isOpen && isFront ? (frontTab?.title || "open")
      : isOpen ? "N/A"
      : "not open";

    const actionsHtml = hasActiveConv ? `
      <details class="menu" data-provider-id="${providerId}">
        <summary class="menu__button" aria-label="${provider.name} actions">...</summary>
        <div class="menu__panel">
          <button class="menu__item" data-action="toggle-chat-provider" data-provider-id="${providerId}">
            ${isDisabled ? "Enable for this chat" : "Disable for this chat"}
          </button>
          <button class="menu__item" data-action="edit-chat-url" data-provider-id="${providerId}">
            ${manualUrl ? "Edit URL" : "Set URL"}
          </button>
        </div>
      </details>
    ` : "";

    const liveUrl = (frontTab || providerTabs[0] || {}).url || "";
    const displayUrl = liveUrl || manualUrl;
    const urlHint = displayUrl
      ? `<span class="status__url" title="${displayUrl}">${truncateText(displayUrl, 40)}</span>`
      : "";
    const defaultUrl = PROVIDER_HOME_URLS[providerId] || "";

    const item = document.createElement("li");
    item.className = `status__item ${statusClass}`;
    item.dataset.providerId = providerId;
    item.innerHTML = `
      <span class="status__label">
        <span class="status__dot"></span>
        <span class="status__label-name">
          ${provider.name}
          ${urlHint}
        </span>
      </span>
      <span class="status__actions">
        <span class="status__state">${stateLabel}</span>
        ${actionsHtml}
      </span>
      <div class="provider-url-form is-hidden" data-provider-id="${providerId}">
        <p class="provider-url-form__label">Override URL for this chat</p>
        <input class="form__input" type="url" placeholder="" value="${manualUrl || liveUrl}" data-url-input data-provider-id="${providerId}" />
        <div class="provider-url-form__actions">
          <button class="accent" data-action="save-chat-url" data-provider-id="${providerId}">Save</button>
          <button class="outline" data-action="cancel-chat-url" data-provider-id="${providerId}">Cancel</button>
          ${manualUrl ? `<button class="ghost" data-action="clear-chat-url" data-provider-id="${providerId}">Reset</button>` : ""}
        </div>
      </div>
    `;
    llmStatusList.appendChild(item);
  });
}

function renderConversationDetail(conversation, openTabs = []) {
  const frontTabs = openTabs.filter(tab => tab.windowState !== "minimized");
  const frontProviderIds = frontTabs.map(tab => tab.providerId).filter(Boolean);
  const hasOpenTabs = frontTabs.length > 0;
  const defaultProviders = settings.defaultProviders || PROVIDERS.map(p => p.id);
  const allLlmsOpen = defaultProviders.every(id => frontProviderIds.includes(id));

  if (!conversation) {
    if (headerConversation) {
      headerConversation.textContent = "";
      headerConversation.title = "";
    }
    if (conversationUpdated) {
      conversationUpdated.textContent = "";
    }
    
    // If there are open tabs, show conversation section with LLM status
    // Otherwise show empty state
    if (hasOpenTabs) {
      if (conversationSection) {
        conversationSection.classList.remove("is-hidden");
      }
      if (panelContent) {
        panelContent.classList.remove("is-empty");
      }
      if (emptyStateSection) {
        emptyStateSection.classList.add("is-hidden");
      }
      // Hide messages, show LLM status
      if (messagesContainer) {
        messagesContainer.classList.add("is-hidden");
      }
      if (llmStatusContainer) {
        llmStatusContainer.classList.remove("is-hidden");
        renderLlmStatusInDetail(openTabs);
        // Show/hide the Open LLMs button based on whether all LLMs are open
        const actionButton = llmStatusContainer.querySelector(".llm-status-action");
        if (actionButton) {
          if (allLlmsOpen) {
            actionButton.classList.add("is-hidden");
          } else {
            actionButton.classList.remove("is-hidden");
          }
        }
      }
    } else {
      // No open tabs - show empty state
      if (conversationSection) {
        conversationSection.classList.add("is-hidden");
      }
      if (panelContent) {
        panelContent.classList.add("is-empty");
      }
      if (messagesContainer) {
        messagesContainer.classList.add("is-hidden");
      }
      if (llmStatusContainer) {
        llmStatusContainer.classList.add("is-hidden");
      }
      if (emptyStateSection) {
        emptyStateSection.classList.remove("is-hidden");
      }
    }
    return;
  }

  if (headerConversation) {
    const firstMessage = conversation.messages?.[0]?.prompt || "";
    const headerText = conversation.rootPrompt || firstMessage || "New conversation";
    headerConversation.textContent = truncateText(headerText, 80);
    headerConversation.title = headerText;
  }
  if (conversationSection) {
    conversationSection.classList.remove("is-hidden");
  }
  if (panelContent) {
    panelContent.classList.remove("is-empty");
  }
  // Hide empty state when there's a conversation
  if (emptyStateSection) {
    emptyStateSection.classList.add("is-hidden");
  }
  if (conversationUpdated) {
    conversationUpdated.textContent = `Updated ${formatTimestamp(
      conversation.lastUpdated || conversation.createdAt
    )}`;
  }

  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const urlHistory = Array.isArray(conversation.urlHistory) ? conversation.urlHistory : [];

  if (!messages.length) {
    // No messages yet - show LLM status instead
    if (messagesContainer) {
      messagesContainer.classList.add("is-hidden");
    }
    if (llmStatusContainer) {
      llmStatusContainer.classList.remove("is-hidden");
      renderLlmStatusInDetail(openTabs);
      // Show/hide the Open LLMs button based on whether all LLMs are open
      const actionButton = llmStatusContainer.querySelector(".llm-status-action");
      if (actionButton) {
        if (allLlmsOpen) {
          actionButton.classList.add("is-hidden");
        } else {
          actionButton.classList.remove("is-hidden");
        }
      }
    }
  } else {
    // Has messages - show messages, hide LLM status
    if (messagesContainer) {
      messagesContainer.classList.remove("is-hidden");
    }
    if (llmStatusContainer) {
      llmStatusContainer.classList.add("is-hidden");
    }
    conversationMessages.innerHTML = "";

    // Build timeline: messages + URL history entries, sorted by timestamp
    const timelineItems = [
      ...messages.map((m) => ({ kind: "message", data: m, ts: m.createdAt || 0 })),
      ...urlHistory.map((h) => ({ kind: "url-change", data: h, ts: h.recordedAt || 0 }))
    ].sort((a, b) => a.ts - b.ts);

    let msgIndex = 0;
    timelineItems.forEach((entry) => {
      if (entry.kind === "message") {
        const message = entry.data;
        msgIndex += 1;
        const item = document.createElement("li");
        item.className = "conversation__item";
        const label = document.createElement("span");
        label.className = "conversation__item-label";
        const count = document.createElement("strong");
        count.textContent = `#${msgIndex}`;
        label.appendChild(count);
        label.append(` ${truncateText(message.prompt, 80)}`);

        const actions = document.createElement("span");
        actions.className = "conversation__item-actions";

        const copyButton = document.createElement("button");
        copyButton.className = "copy-button";
        copyButton.type = "button";
        copyButton.title = "Copy message";
        copyButton.innerHTML = `<svg class="copy-icon" viewBox="0 0 448 512" aria-hidden="true"><path d="M384 336H192c-8.8 0-16-7.2-16-16V64c0-8.8 7.2-16 16-16l140.1 0L400 115.9V320c0 8.8-7.2 16-16 16zM192 384H384c35.3 0 64-28.7 64-64V115.9c0-12.7-5.1-24.9-14.1-33.9L366.1 14.1c-9-9-21.2-14.1-33.9-14.1H192c-35.3 0-64 28.7-64 64V320c0 35.3 28.7 64 64 64zM64 128c-35.3 0-64 28.7-64 64V448c0 35.3 28.7 64 64 64H256c35.3 0 64-28.7 64-64V416H272v32c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192c0-8.8 7.2-16 16-16h32V128H64z"/></svg>`;
        copyButton.dataset.prompt = message.prompt;
        copyButton.addEventListener("click", (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(message.prompt).then(() => {
            copyButton.classList.add("copied");
            copyButton.innerHTML = `<svg class="copy-icon" viewBox="0 0 448 512" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>`;
            setTimeout(() => {
              copyButton.classList.remove("copied");
              copyButton.innerHTML = `<svg class="copy-icon" viewBox="0 0 448 512" aria-hidden="true"><path d="M384 336H192c-8.8 0-16-7.2-16-16V64c0-8.8 7.2-16 16-16l140.1 0L400 115.9V320c0 8.8-7.2 16-16 16zM192 384H384c35.3 0 64-28.7 64-64V115.9c0-12.7-5.1-24.9-14.1-33.9L366.1 14.1c-9-9-21.2-14.1-33.9-14.1H192c-35.3 0-64 28.7-64 64V320c0 35.3 28.7 64 64 64zM64 128c-35.3 0-64 28.7-64 64V448c0 35.3 28.7 64 64 64H256c35.3 0 64-28.7 64-64V416H272v32c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192c0-8.8 7.2-16 16-16h32V128H64z"/></svg>`;
            }, 1500);
          });
        });
        actions.appendChild(copyButton);

        const meta = document.createElement("span");
        meta.className = "conversation__meta";
        meta.textContent = formatTimestamp(message.createdAt);
        actions.appendChild(meta);

        item.appendChild(label);
        item.appendChild(actions);
        conversationMessages.appendChild(item);
      } else {
        // URL change history entry
        const h = entry.data;
        const providerName = getProviderName(h.providerId);
        const item = document.createElement("li");
        item.className = "conversation__item conversation__item--url-change";
        item.innerHTML = `
          <span class="conversation__url-change-icon">↗</span>
          <span class="conversation__url-change-body">
            <span class="conversation__url-change-provider">${providerName}</span>
            <a class="conversation__link conversation__url-change-url" href="${escapeAttr(h.url)}" title="${escapeAttr(h.url)}" target="_blank">${truncateText(h.url, 50)}</a>
          </span>
          <span class="conversation__meta">${formatTimestamp(h.recordedAt)}</span>
        `;
        conversationMessages.appendChild(item);
      }
    });
    // Scroll to the last message at the bottom of conversation-detail
    setTimeout(() => {
      const conversationDetail = document.getElementById("conversation-detail");
      if (conversationDetail) {
        const lastItem = conversationMessages.lastElementChild;
        if (lastItem) {
          // Scroll window so the last message is visible above the fixed prompt dock
          lastItem.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }, 100);
  }
}

async function refreshConversations() {
  const [stored, tabsResponse] = await Promise.all([
    chrome.storage.local.get(["conversations", "activeConversationId"]),
    chrome.runtime.sendMessage({ type: "list_tabs" })
  ]);
  const conversations = normalizeConversations(stored.conversations || []);
  activeConversationId = stored.activeConversationId || null;
  cachedConversations = sortConversations(conversations);
  applyHistorySearch();
  const active =
    cachedConversations.find((conversation) => conversation.id === activeConversationId) || null;
  const openTabs = (tabsResponse && tabsResponse.ok && tabsResponse.tabs) ? tabsResponse.tabs : [];
  renderConversationDetail(active, openTabs);
}

function getActiveConversation() {
  if (!activeConversationId) return null;
  return cachedConversations.find((conversation) => conversation.id === activeConversationId) || null;
}

function getActiveConversationDisabledProviders() {
  const conv = getActiveConversation();
  return conv?.disabledProviders || [];
}

async function updateActiveConversation(updater) {
  if (!activeConversationId) return;
  const stored = await chrome.storage.local.get(["conversations"]);
  const conversations = normalizeConversations(stored.conversations || []);
  const nextConversations = conversations.map((conv) => {
    if (conv.id !== activeConversationId) return conv;
    return { ...conv, ...updater(conv), lastUpdated: Date.now() };
  });
  await chrome.storage.local.set({ conversations: nextConversations });
  await refreshConversations();
}

async function saveConversationManualUrl(providerId, url) {
  await updateActiveConversation((conv) => ({
    manualUrlsByProvider: { ...(conv.manualUrlsByProvider || {}), [providerId]: url.trim() || null }
  }));
}

async function toggleConversationProviderDisabled(providerId, disabled) {
  await updateActiveConversation((conv) => {
    const current = conv.disabledProviders || [];
    const next = disabled
      ? Array.from(new Set([...current, providerId]))
      : current.filter((id) => id !== providerId);
    return { disabledProviders: next };
  });
}

// In-memory map of detected URL changes not yet acted on by the user
let pendingUrlChanges = {};

function getActiveUrlForProvider(conversation, providerId) {
  if (!conversation) return null;
  const manual = conversation.manualUrlsByProvider?.[providerId];
  if (manual) return manual;
  const links = normalizeLinks(conversation.linksByProvider?.[providerId] || []);
  const nonHome = links.filter((url) => !isHomeUrl(providerId, url));
  return nonHome[0] || null;
}

function detectPendingUrlChanges(openTabs) {
  const conv = getActiveConversation();
  if (!conv) {
    pendingUrlChanges = {};
    return;
  }
  const defaultProviders = settings.defaultProviders || PROVIDERS.map((p) => p.id);
  defaultProviders.forEach((providerId) => {
    const storedUrl = getActiveUrlForProvider(conv, providerId);
    if (!storedUrl) {
      delete pendingUrlChanges[providerId];
      return;
    }
    const tab = openTabs.find((t) => t.providerId === providerId);
    const liveUrl = tab?.url || "";
    if (!liveUrl || isHomeUrl(providerId, liveUrl)) {
      delete pendingUrlChanges[providerId];
      return;
    }
    if (liveUrl === storedUrl) {
      delete pendingUrlChanges[providerId];
      return;
    }
    if (!pendingUrlChanges[providerId] || pendingUrlChanges[providerId].newUrl !== liveUrl) {
      pendingUrlChanges[providerId] = { storedUrl, newUrl: liveUrl };
    }
  });
}

async function acceptUrlChange(providerId) {
  const pending = pendingUrlChanges[providerId];
  if (!pending) return;
  const { newUrl } = pending;
  await updateActiveConversation((conv) => ({
    manualUrlsByProvider: { ...(conv.manualUrlsByProvider || {}), [providerId]: newUrl },
    urlHistory: [
      ...(conv.urlHistory || []),
      { providerId, url: newUrl, recordedAt: Date.now() }
    ]
  }));
  delete pendingUrlChanges[providerId];
}

function dismissUrlChange(providerId) {
  delete pendingUrlChanges[providerId];
}

function getConversationProviderIds(conversation, providerIds) {
  const requested = Array.isArray(providerIds) && providerIds.length
    ? providerIds
    : settings.defaultProviders.slice();
  const linked = conversation?.linksByProvider ? Object.keys(conversation.linksByProvider) : [];
  const disabled = conversation?.disabledProviders || [];
  return getOrderedProviders(requested.concat(linked)).filter((id) => !disabled.includes(id));
}

function isConversationOpenForProviders(openTabs, conversation, providerIds) {
  if (!conversation || !conversation.linksByProvider) return false;
  const linksByProvider = conversation.linksByProvider || {};
  const providerList = getOrderedProviders(providerIds);
  const missingProviders = [];

  const isOpenForAll = providerList.every((providerId) => {
    const links = normalizeLinks(linksByProvider[providerId]).filter((url) => !isHomeUrl(providerId, url));
    if (!links.length) {
      missingProviders.push({ providerId, reason: "no-links" });
      return false;
    }
    const matched = openTabs.some((tab) => {
      if (tab.providerId !== providerId) return false;
      return links.some((link) => urlsMatch(tab.url, link));
    });
    if (!matched) {
      missingProviders.push({ providerId, reason: "no-open-match" });
    }
    return matched;
  });

  if (missingProviders.length) {
    logDebug("Conversation not open for all providers", { missingProviders });
  }

  return isOpenForAll;
}

async function openConversationWindows(conversation, providerIds) {
  const tabsResponse = await chrome.runtime.sendMessage({ type: "list_tabs" });
  const openTabs = (tabsResponse && tabsResponse.ok && tabsResponse.tabs) ? tabsResponse.tabs : [];

  if (!conversation && openTabs.length) {
    logDebug("Open LLMs: no active conversation, focusing existing windows");
    await chrome.runtime.sendMessage({ type: "focus_all" });
    queueRefresh(400);
    return;
  }

  const providerList = getConversationProviderIds(conversation, providerIds);
  const urls = collectConversationUrlsWithFallback(conversation, providerList);
  if (!urls.length) {
    logDebug("Open LLMs: no stored URLs, focusing existing windows if any");
    if (openTabs.length) {
      await chrome.runtime.sendMessage({ type: "focus_all" });
      queueRefresh(400);
    }
    return;
  }

  if (conversation) {
    if (providerList.length && isConversationOpenForProviders(openTabs, conversation, providerList)) {
      logDebug("Open LLMs: conversation already open, focusing existing windows");
      await chrome.runtime.sendMessage({ type: "focus_all" });
      queueRefresh(400);
      return;
    }
  }

  logDebug("Open LLMs: opening conversation grid", {
    conversationId: conversation?.id || null,
    providerList,
    urls
  });
  chrome.windows.getCurrent((win) => {
    chrome.runtime.sendMessage({
      type: "open_conversation",
      urls,
      controlWindowId: win?.id || null
    });
  });
  queueRefresh(800);
}

async function fetchLinksByProvider() {
  const response = await chrome.runtime.sendMessage({ type: "list_tabs" });
  if (!response || !response.ok) return {};
  const links = {};
  (response.tabs || []).forEach((tab) => {
    if (!tab.providerId || !tab.url) return;
    if (!links[tab.providerId]) {
      links[tab.providerId] = [];
    }
    if (!links[tab.providerId].includes(tab.url)) {
      links[tab.providerId].push(tab.url);
    }
  });
  return links;
}

function normalizeBaseUrl(url) {
  if (!url) return "";
  return url.trim().replace(/\/+$/, "");
}

function normalizeLinks(links) {
  if (!links) return [];
  const list = Array.isArray(links) ? links : [links];
  return list.map((url) => (typeof url === "string" ? url.trim() : "")).filter(Boolean);
}

function normalizeUrlForMatch(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return normalizeBaseUrl(`${parsed.origin}${parsed.pathname}`);
  } catch (error) {
    return normalizeBaseUrl(url);
  }
}

function urlsMatch(a, b) {
  const left = normalizeUrlForMatch(a);
  const right = normalizeUrlForMatch(b);
  return Boolean(left && right && left === right);
}

function isHomeUrl(providerId, url) {
  const base = normalizeBaseUrl(PROVIDER_HOME_URLS[providerId]);
  const candidate = normalizeBaseUrl(url);
  if (!base || !candidate) return false;
  return base === candidate;
}

function hasLinkData(linksByProvider) {
  if (!linksByProvider) return false;
  return Object.values(linksByProvider).some((links) => {
    if (!links) return false;
    return Array.isArray(links) ? links.length > 0 : Boolean(links);
  });
}

function hasConversationSpecificLinks(linksByProvider) {
  if (!linksByProvider) return false;
  const entries = Object.entries(linksByProvider).filter(([, links]) => normalizeLinks(links).length > 0);
  if (!entries.length) return false;
  return entries.every(([providerId, links]) => {
    const list = normalizeLinks(links);
    return list.some((url) => !isHomeUrl(providerId, url));
  });
}

async function updateConversationLinks(conversationId) {
  if (!conversationId) return;
  const linksByProvider = await fetchLinksByProvider();
  if (!hasLinkData(linksByProvider)) return;

  const stored = await chrome.storage.local.get(["conversations"]);
  const conversations = normalizeConversations(stored.conversations || []);
  let updated = false;

  const nextConversations = conversations.map((conversation) => {
    if (conversation.id !== conversationId) return conversation;
    updated = true;
    const mergedLinks = { ...(conversation.linksByProvider || {}) };
    Object.entries(linksByProvider).forEach(([providerId, links]) => {
      const list = normalizeLinks(links);
      const nonHomeLinks = list.filter((url) => !isHomeUrl(providerId, url));
      const existingList = normalizeLinks(mergedLinks[providerId]);
      const existingNonHome = existingList.filter((url) => !isHomeUrl(providerId, url));
      if (nonHomeLinks.length > 0) {
        mergedLinks[providerId] = nonHomeLinks;
        return;
      }
      if (existingNonHome.length > 0) {
        return;
      }
      if (list.length > 0 || !mergedLinks[providerId]) {
        mergedLinks[providerId] = list;
      }
    });
    return {
      ...conversation,
      linksByProvider: mergedLinks,
      lastUpdated: Date.now()
    };
  });

  if (!updated) return;
  await chrome.storage.local.set({ conversations: nextConversations });
  await refreshConversations();

  const updatedConversation =
    nextConversations.find((conversation) => conversation.id === conversationId) || null;
  return hasConversationSpecificLinks(updatedConversation?.linksByProvider);
}

function scheduleConversationLinkCapture(conversationId, attempt = 0) {
  if (!conversationId) return;
  const maxAttempts = 6;
  const delayMs = 2500;
  setTimeout(() => {
    updateConversationLinks(conversationId).then((hasSpecificLinks) => {
      if (hasSpecificLinks) return;
      if (attempt + 1 < maxAttempts) {
        scheduleConversationLinkCapture(conversationId, attempt + 1);
      }
    });
  }, delayMs);
}

function createConversation(prompt, linksByProvider) {
  const now = Date.now();
  const id = `conv_${now}_${Math.random().toString(16).slice(2, 6)}`;
  return {
    id,
    rootPrompt: prompt,
    createdAt: now,
    lastUpdated: now,
    linksByProvider: linksByProvider || {},
    messages: [
      {
        id: `msg_${now}_${Math.random().toString(16).slice(2, 6)}`,
        prompt,
        createdAt: now
      }
    ]
  };
}

function appendMessage(conversation, prompt) {
  const now = Date.now();
  const next = normalizeConversation(conversation);
  next.messages = next.messages.concat({
    id: `msg_${now}_${Math.random().toString(16).slice(2, 6)}`,
    prompt,
    createdAt: now
  });
  next.lastUpdated = now;
  if (!next.rootPrompt) {
    next.rootPrompt = prompt;
  }
  return next;
}

async function recordConversationPrompt(prompt) {
  if (!prompt || !prompt.trim()) return;
  const stored = await chrome.storage.local.get(["conversations", "activeConversationId"]);
  const conversations = normalizeConversations(stored.conversations || []);
  const activeId = stored.activeConversationId || null;
  const existing = conversations.find((conversation) => conversation.id === activeId) || null;

  let nextConversations = conversations;
  let nextActiveId = activeId;

  if (!existing) {
    const linksByProvider = await fetchLinksByProvider();
    const conversation = createConversation(prompt, linksByProvider);
    nextConversations = [conversation].concat(conversations);
    nextActiveId = conversation.id;
    scheduleConversationLinkCapture(conversation.id);
  } else {
    nextConversations = conversations.map((conversation) => {
      if (conversation.id !== activeId) return conversation;
      return appendMessage(conversation, prompt);
    });
    if (!hasLinkData(existing.linksByProvider)) {
      scheduleConversationLinkCapture(activeId);
    }
  }

  if (settings.historyLimit && nextConversations.length > settings.historyLimit) {
    nextConversations = nextConversations.slice(0, settings.historyLimit);
  }
  await chrome.storage.local.set({
    conversations: nextConversations,
    activeConversationId: nextActiveId
  });
  await refreshConversations();
}

function shouldRecordPrompt(mode, prompt) {
  if (!prompt || !prompt.trim()) return false;
  const trimmed = prompt.trim();
  const now = Date.now();
  if (mode === "submit") {
    if (trimmed === lastRecordedPrompt && now - lastRecordedAt < 5000) {
      return false;
    }
  }
  lastRecordedPrompt = trimmed;
  lastRecordedAt = now;
  return true;
}

async function handleBroadcast(mode) {
  if (sendButton) {
    sendButton.disabled = true;
    sendButton.textContent = "…";
    sendButton.title = "Sending...";
  }
  const promptValue = promptField.value;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "broadcast",
      prompt: promptValue,
      providers: getSelectedProviders(),
      mode
    });
    const result = response?.result;
    if (result && result.total > 0 && result.okCount === 0) {
      logDebug("Broadcast returned zero successes, retrying once", result);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await chrome.runtime.sendMessage({
        type: "broadcast",
        prompt: promptValue,
        providers: getSelectedProviders(),
        mode
      });
    }
    if (shouldRecordPrompt(mode, promptValue)) {
      await recordConversationPrompt(promptValue);
    }
    if (activeConversationId) {
      scheduleConversationLinkCapture(activeConversationId);
    }
    promptField.value = "";
    savePrefs();
    queueRefresh(400);
  } finally {
    if (sendButton) {
      sendButton.innerHTML =
        '<svg class="send-icon" viewBox="0 0 640 512" aria-hidden="true"><path d="M320 32c-35.3 0-64 28.7-64 64 0 25.5 15 47.4 36.6 57.6l-96.7 289H144c-17.7 0-32 14.3-32 32v6c0 17.7 14.3 32 32 32h112c17.7 0 32-14.3 32-32v-6c0-17.7-14.3-32-32-32h-14.6l78.6-235.8 78.6 235.8H384c-17.7 0-32 14.3-32 32v6c0 17.7 14.3 32 32 32h112c17.7 0 32-14.3 32-32v-6c0-17.7-14.3-32-32-32h-51.9l-96.7-289C369 143.4 384 121.5 384 96c0-35.3-28.7-64-64-64zM96 96c0-88.4 71.6-160 160-160v64c-53 0-96 43-96 96 0 36.5 20.4 68.2 50.4 84.1l-25.6 76.8C130.7 230.6 96 167.7 96 96zm448 0c0 71.7-34.7 134.6-88.8 160.9l-25.6-76.8C459.6 164.2 480 132.5 480 96c0-53-43-96-96-96V-64c88.4 0 160 71.6 160 160z"/></svg>';
      sendButton.title = "Send to all (Ctrl/Cmd+Enter)";
      // Re-check LLM status to determine if button should be enabled
      chrome.runtime.sendMessage({ type: "list_tabs" }).then((tabsResponse) => {
        const openTabs = (tabsResponse && tabsResponse.ok && tabsResponse.tabs) ? tabsResponse.tabs : [];
        updateSendButtonState(openTabs);
      });
    }
  }
}

async function startNewConversation() {
  await chrome.storage.local.set({ activeConversationId: null });
  await refreshConversations();
}

function collectConversationUrls(conversation) {
  if (!conversation || !conversation.linksByProvider) return [];
  const urls = [];
  Object.values(conversation.linksByProvider).forEach((links) => {
    const list = Array.isArray(links) ? links : [links];
    list.forEach((url) => {
      if (typeof url !== "string") return;
      const trimmed = url.trim();
      if (trimmed && !urls.includes(trimmed)) {
        urls.push(trimmed);
      }
    });
  });
  return urls;
}

function collectConversationUrlsWithFallback(conversation, providerIds) {
  const linksByProvider = conversation?.linksByProvider || {};
  const manualUrlsByProvider = conversation?.manualUrlsByProvider || {};
  const explicitProviders = Array.isArray(providerIds) && providerIds.length ? providerIds : null;
  const selectedProviders = explicitProviders
    ? explicitProviders
    : PROVIDERS.map((provider) => provider.id);
  const fallbackProviders = explicitProviders
    ? explicitProviders
    : settings.defaultProviders.slice();
  const orderedProviders = getOrderedProviders(selectedProviders);
  const urls = [];

  orderedProviders.forEach((providerId) => {
    // Manual URL takes priority over auto-detected links
    const manualUrl = manualUrlsByProvider[providerId];
    if (typeof manualUrl === "string" && manualUrl.trim()) {
      const url = manualUrl.trim();
      if (!urls.includes(url)) urls.push(url);
      return;
    }

    const links = linksByProvider[providerId];
    const list = Array.isArray(links) ? links : links ? [links] : [];
    const normalized = list
      .map((url) => (typeof url === "string" ? url.trim() : ""))
      .filter(Boolean);
    const nonHome = normalized.filter((url) => !isHomeUrl(providerId, url));
    const preferred = nonHome.length ? nonHome : normalized;

    if (preferred.length) {
      preferred.forEach((url) => {
        if (!urls.includes(url)) {
          urls.push(url);
        }
      });
      return;
    }

    if (fallbackProviders.includes(providerId)) {
      const fallbackUrl = getProviderInitUrl(providerId);
      if (fallbackUrl && !urls.includes(fallbackUrl)) {
        urls.push(fallbackUrl);
      }
    }
  });

  return urls;
}

async function exportData() {
  const data = await chrome.storage.local.get(null);
  delete data.managedWindowIds;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `muchallms-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || typeof data !== "object") {
        alert("Invalid export file.");
        return;
      }

      const confirmImport = confirm(
        "This will overwrite your current settings and merge/overwrite conversations. Continue?"
      );
      if (!confirmImport) return;

      await chrome.storage.local.set(data);
      alert("Import successful! Reloading...");
      location.reload();
    } catch (err) {
      console.error(err);
      alert("Error parsing import file: " + err.message);
    }
  };
  reader.readAsText(file);
}

async function init() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS);
  settings = normalizeSettings(stored.settings);
  
  // Apply theme immediately
  applyTheme(settings.theme);
  
  if (togglesContainer) {
    togglesContainer.innerHTML = "";
  }
  if (stored.lastPrompt) {
    promptField.value = stored.lastPrompt;
  }

  if (historyLimitInput) historyLimitInput.value = settings.historyLimit;
  
  // Set theme selector value
  const themeSelector = document.getElementById("theme-selector");
  if (themeSelector) {
    const themeRadio = themeSelector.querySelector(`input[value="${settings.theme}"]`);
    if (themeRadio) themeRadio.checked = true;
  }
  
  // Hook up Export/Import buttons
  const exportDataButton = document.getElementById("export-data");
  const importDataTrigger = document.getElementById("import-data-trigger");
  const importFileInput = document.getElementById("import-file");

  if (exportDataButton) {
    exportDataButton.addEventListener("click", exportData);
  }
  if (importDataTrigger) {
    importDataTrigger.addEventListener("click", () => {
      importFileInput?.click();
    });
  }
  if (importFileInput) {
    importFileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        importData(e.target.files[0]);
        e.target.value = "";
      }
    });
  }
  
  if (defaultProvidersContainer) {
    defaultProvidersContainer.innerHTML = "";
    const defaultPrefs = buildProviderPrefs(settings.defaultProviders);
    PROVIDERS.forEach((provider) => {
      const wrapper = document.createElement("label");
      wrapper.className = "toggle";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = defaultPrefs[provider.id] !== false;
      input.dataset.providerId = provider.id;

      const text = document.createElement("span");
      text.textContent = provider.name;

      wrapper.appendChild(text);
      wrapper.appendChild(input);
      defaultProvidersContainer.appendChild(wrapper);
    });
  }

  const providerInitUrlsContainer = document.getElementById("provider-init-urls");
  if (providerInitUrlsContainer) {
    providerInitUrlsContainer.innerHTML = "";
    PROVIDERS.forEach((provider) => {
      const defaultUrl = PROVIDER_HOME_URLS[provider.id] || "";
      const currentUrl = settings.providerUrls?.[provider.id] || "";

      const row = document.createElement("div");
      row.className = "provider-url-row";

      const label = document.createElement("label");
      label.className = "provider-url-row__label";
      label.textContent = provider.name;

      const inputWrapper = document.createElement("div");
      inputWrapper.className = "provider-url-row__input-wrap";

      const input = document.createElement("input");
      input.type = "url";
      input.className = "form__input";
      input.placeholder = defaultUrl;
      input.value = currentUrl;
      input.dataset.providerId = provider.id;
      input.title = currentUrl ? `Current: ${currentUrl}` : `Default: ${defaultUrl}`;

      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "provider-url-row__reset";
      resetBtn.textContent = "Reset";
      resetBtn.title = `Reset to default: ${defaultUrl}`;
      resetBtn.addEventListener("click", () => {
        input.value = "";
        input.title = `Default: ${defaultUrl}`;
      });

      inputWrapper.appendChild(input);
      inputWrapper.appendChild(resetBtn);
      row.appendChild(label);
      row.appendChild(inputWrapper);
      providerInitUrlsContainer.appendChild(row);
    });
  }

  const openSettings = () => {
    settingsModal?.classList.remove("is-hidden");
    const menu = document.getElementById("header-menu");
    if (menu) menu.open = false;
  };
  const closeSettings = () => {
    settingsModal?.classList.add("is-hidden");
  };
  const openHistory = () => {
    historyModal?.classList.remove("is-hidden");
    const menu = document.getElementById("header-menu");
    if (menu) menu.open = false;
    applyHistorySearch();
    historySearchInput?.focus();
  };
  const closeHistory = () => {
    historyModal?.classList.add("is-hidden");
  };
  const openPrivacy = () => {
    privacyModal?.classList.remove("is-hidden");
    const menu = document.getElementById("header-menu");
    if (menu) menu.open = false;
  };
  const closePrivacy = () => {
    privacyModal?.classList.add("is-hidden");
  };
  const openFaq = () => {
    faqModal?.classList.remove("is-hidden");
    const menu = document.getElementById("header-menu");
    if (menu) menu.open = false;
  };
  const closeFaq = () => {
    faqModal?.classList.add("is-hidden");
  };

  if (openSettingsButton) {
    openSettingsButton.addEventListener("click", openSettings);
  }
  if (closeSettingsButton) {
    closeSettingsButton.addEventListener("click", closeSettings);
  }
  if (settingsCancelButton) {
    settingsCancelButton.addEventListener("click", closeSettings);
  }
  if (settingsBackdrop) {
    settingsBackdrop.addEventListener("click", closeSettings);
  }
  if (openHistoryButton) {
    openHistoryButton.addEventListener("click", openHistory);
  }
  if (closeHistoryButton) {
    closeHistoryButton.addEventListener("click", closeHistory);
  }
  if (historySearchInput) {
    historySearchInput.addEventListener("input", applyHistorySearch);
  }
  if (historySearchMode) {
    historySearchMode.addEventListener("change", applyHistorySearch);
  }
  if (historyBackdrop) {
    historyBackdrop.addEventListener("click", closeHistory);
  }
  if (openPrivacyButton) {
    openPrivacyButton.addEventListener("click", openPrivacy);
  }
  if (closePrivacyButton) {
    closePrivacyButton.addEventListener("click", closePrivacy);
  }
  if (privacyBackdrop) {
    privacyBackdrop.addEventListener("click", closePrivacy);
  }
  if (openFaqButton) {
    openFaqButton.addEventListener("click", openFaq);
  }
  if (closeFaqButton) {
    closeFaqButton.addEventListener("click", closeFaq);
  }
  if (faqBackdrop) {
    faqBackdrop.addEventListener("click", closeFaq);
  }
  if (settingsSaveButton) {
    settingsSaveButton.addEventListener("click", async () => {
      const historyLimit = Number(historyLimitInput?.value || DEFAULT_SETTINGS.historyLimit);
      const defaults = [];
      defaultProvidersContainer?.querySelectorAll("input[data-provider-id]").forEach((input) => {
        if (input.checked) defaults.push(input.dataset.providerId);
      });

      const providerUrls = {};
      providerInitUrlsContainer?.querySelectorAll("input[data-provider-id]").forEach((input) => {
        const url = input.value.trim();
        if (url) providerUrls[input.dataset.providerId] = url;
      });

      // Get selected theme
      const themeSelector = document.getElementById("theme-selector");
      const selectedTheme = themeSelector?.querySelector("input:checked")?.value || "system";

      settings = normalizeSettings({
        historyLimit,
        defaultProviders: defaults,
        theme: selectedTheme,
        providerUrls
      });
      
      // Apply theme immediately
      applyTheme(settings.theme);
      
      await chrome.storage.local.set({ settings });
      await refreshConversations();
      closeSettings();
    });
  }

  await refreshStatus();
  await refreshConversations();

  // Start polling for LLM status changes
  startLlmStatusPolling();

  // Handle visibility changes - pause polling when hidden, resume when visible
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopLlmStatusPolling();
    } else {
      startLlmStatusPolling();
      // Immediately check for changes when becoming visible
      pollLlmStatus();
    }
  });

  document.getElementById("refresh-status").addEventListener("click", refreshStatus);

  if (llmStatusList) {
    llmStatusList.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const actionBtn = target.closest("[data-action]");
      if (!actionBtn) return;
      const action = actionBtn.dataset.action;
      const providerId = actionBtn.dataset.providerId;
      if (!providerId) return;

      if (action === "toggle-chat-provider") {
        const conv = getActiveConversation();
        const isDisabled = (conv?.disabledProviders || []).includes(providerId);
        await toggleConversationProviderDisabled(providerId, !isDisabled);
        const menu = actionBtn.closest("details.menu");
        if (menu) menu.open = false;
        return;
      }

      if (action === "edit-chat-url") {
        const li = actionBtn.closest("li.status__item");
        const form = li?.querySelector(`.provider-url-form[data-provider-id="${providerId}"]`);
        if (!form) return;
        li.classList.add("status__item--expanded");
        form.classList.remove("is-hidden");
        form.querySelector("input[data-url-input]")?.focus();
        const menu = actionBtn.closest("details.menu");
        if (menu) menu.open = false;
        return;
      }

      if (action === "save-chat-url") {
        const li = actionBtn.closest("li.status__item");
        const form = li?.querySelector(`.provider-url-form[data-provider-id="${providerId}"]`);
        const input = form?.querySelector("input[data-url-input]");
        const url = input?.value || "";
        await saveConversationManualUrl(providerId, url);
        li?.classList.remove("status__item--expanded");
        form?.classList.add("is-hidden");
        return;
      }

      if (action === "cancel-chat-url") {
        const li = actionBtn.closest("li.status__item");
        const form = li?.querySelector(`.provider-url-form[data-provider-id="${providerId}"]`);
        li?.classList.remove("status__item--expanded");
        form?.classList.add("is-hidden");
        return;
      }

      if (action === "clear-chat-url") {
        await saveConversationManualUrl(providerId, "");
        return;
      }
    });

    llmStatusList.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      const target = event.target;
      if (!(target instanceof Element) || !target.matches("input[data-url-input]")) return;
      const providerId = target.dataset.providerId;
      if (!providerId) return;
      const li = target.closest("li.status__item");
      const form = target.closest(".provider-url-form");
      await saveConversationManualUrl(providerId, target.value);
      li?.classList.remove("status__item--expanded");
      form?.classList.add("is-hidden");
    });
  }

  // LLM menu per-provider controls (disable + URL)
  const llmMenuUrlForm = document.getElementById("llm-menu-url-form");
  const llmMenuUrlInput = document.getElementById("llm-menu-url-input");
  const llmMenuUrlProviderName = document.getElementById("llm-menu-url-provider-name");
  let llmMenuUrlCurrentProviderId = null;

  const llmMenuUrlDefault = document.getElementById("llm-menu-url-default");

  function openLlmMenuUrlForm(providerId, providerName, currentUrl, defaultUrl) {
    llmMenuUrlCurrentProviderId = providerId;
    if (llmMenuUrlProviderName) llmMenuUrlProviderName.textContent = providerName;
    if (llmMenuUrlInput) {
      llmMenuUrlInput.value = currentUrl || "";
      llmMenuUrlInput.placeholder = "";
    }
    if (llmMenuUrlDefault) {
      llmMenuUrlDefault.textContent = "";
    }
    llmMenuUrlForm?.classList.remove("is-hidden");
    llmMenuUrlInput?.focus();
  }

  function closeLlmMenuUrlForm() {
    llmMenuUrlCurrentProviderId = null;
    llmMenuUrlForm?.classList.add("is-hidden");
  }

  if (llmMenuStatusList) {
    llmMenuStatusList.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const actionBtn = target.closest("[data-action]");
      if (!actionBtn) return;
      const action = actionBtn.dataset.action;
      const providerId = actionBtn.dataset.providerId;
      if (!providerId) return;
      event.stopPropagation();

      if (action === "toggle-chat-provider") {
        const conv = getActiveConversation();
        const isDisabled = (conv?.disabledProviders || []).includes(providerId);
        await toggleConversationProviderDisabled(providerId, !isDisabled);
        return;
      }

      if (action === "accept-url-change") {
        await acceptUrlChange(providerId);
        return;
      }

      if (action === "dismiss-url-change") {
        dismissUrlChange(providerId);
        const tabsResponse = await chrome.runtime.sendMessage({ type: "list_tabs" }).catch(() => null);
        const openTabs = (tabsResponse && tabsResponse.ok && tabsResponse.tabs) ? tabsResponse.tabs : [];
        renderLlmMenuDropdown(openTabs);
        return;
      }

      if (action === "edit-chat-url-menu") {
        openLlmMenuUrlForm(
          providerId,
          actionBtn.dataset.providerName || providerId,
          actionBtn.dataset.currentUrl || "",
          actionBtn.dataset.defaultUrl || ""
        );
        return;
      }
    });
  }

  document.getElementById("llm-menu-url-save")?.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!llmMenuUrlCurrentProviderId) return;
    await saveConversationManualUrl(llmMenuUrlCurrentProviderId, llmMenuUrlInput?.value || "");
    closeLlmMenuUrlForm();
  });

  document.getElementById("llm-menu-url-cancel")?.addEventListener("click", (event) => {
    event.stopPropagation();
    closeLlmMenuUrlForm();
  });

  document.getElementById("llm-menu-url-clear")?.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!llmMenuUrlCurrentProviderId) return;
    await saveConversationManualUrl(llmMenuUrlCurrentProviderId, "");
    closeLlmMenuUrlForm();
  });

  llmMenuUrlInput?.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.stopPropagation();
      if (!llmMenuUrlCurrentProviderId) return;
      await saveConversationManualUrl(llmMenuUrlCurrentProviderId, llmMenuUrlInput.value);
      closeLlmMenuUrlForm();
    } else if (event.key === "Escape") {
      closeLlmMenuUrlForm();
    }
  });

  openChatsList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.dataset.action;
    const tabId = Number(target.dataset.tabId);
    if (!action || Number.isNaN(tabId)) return;
    if (action === "close") {
      chrome.runtime.sendMessage({ type: "close_tab", tabId }).then(() => refreshStatus());
    }
    if (action === "open") {
      chrome.runtime.sendMessage({ type: "focus_tab", tabId }).then(() => refreshStatus());
    }
    const menu = target.closest("details.menu");
    if (menu) menu.open = false;
  });

  document.getElementById("new-chat").addEventListener("click", () => {
    startNewConversation();
    const providers = getSelectedProviders();
    chrome.windows.getCurrent((win) => {
      chrome.runtime.sendMessage({
        type: "new_chat",
        providers,
        providerUrls: getProviderInitUrls(providers),
        controlWindowId: win?.id || null
      });
    });
    queueRefresh(800);
    const menu = document.getElementById("header-menu");
    if (menu) menu.open = false;
  });

  if (openLlmsButton) {
    openLlmsButton.addEventListener("click", () => {
      openConversationWindows(getActiveConversation(), getSelectedProvidersWithFallback());
    });
  }

  if (openMissingLlmsButton) {
    openMissingLlmsButton.addEventListener("click", () => {
      openConversationWindows(getActiveConversation(), getSelectedProvidersWithFallback());
    });
  }

  if (openLlmsMenuButton) {
    openLlmsMenuButton.addEventListener("click", () => {
      openConversationWindows(getActiveConversation(), getSelectedProvidersWithFallback());
      if (llmMenu) llmMenu.open = false;
    });
  }

  if (closeAllMenuButton) {
    closeAllMenuButton.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "close_all" });
      queueRefresh(600);
      if (llmMenu) llmMenu.open = false;
    });
  }

  document.getElementById("broadcast-send").addEventListener("click", () => {
    if (sendButton && sendButton.disabled) return;
    handleBroadcast("submit");
  });

  promptField.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
    if (sendButton && sendButton.disabled) return;
    event.preventDefault();
    handleBroadcast("submit");
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    document.querySelectorAll("details.menu[open]").forEach((menu) => {
      if (!menu.contains(target)) {
        menu.open = false;
      }
    });
  });

  conversationsList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest("details.menu")) {
      const row = target.closest(".status__item");
      if (row && row.querySelector(".conversation__preview")) {
        row.classList.toggle("status__item--expanded");
      }
    }
    const actionButton = target.closest("button[data-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.action;
    const conversationId = actionButton.dataset.conversationId;
    if (!action || !conversationId) return;

    if (action === "delete") {
      const confirmed = window.confirm("Delete this conversation? This cannot be undone.");
      if (!confirmed) return;
      chrome.storage.local.get(["conversations", "activeConversationId"]).then((stored) => {
        const conversations = normalizeConversations(stored.conversations || []);
        const nextConversations = conversations.filter((c) => c.id !== conversationId);
        const nextActiveId =
          stored.activeConversationId === conversationId
            ? nextConversations[0]?.id || null
            : stored.activeConversationId;
        chrome.storage.local
          .set({ conversations: nextConversations, activeConversationId: nextActiveId })
          .then(refreshConversations);
      });
    } else {
      if (!confirmPromptDiscard()) return;
      if (promptField.value.trim()) {
        promptField.value = "";
        savePrefs();
      }

      chrome.storage.local.set({ activeConversationId: conversationId }).then(async () => {
        await refreshConversations();
        if (action === "open") {
          const active =
            cachedConversations.find((conversation) => conversation.id === conversationId) || null;
          openConversationWindows(active);
        }
      });
    }

    const menu = actionButton.closest("details.menu");
    if (menu) menu.open = false;
  });

  promptField.addEventListener("change", savePrefs);
}

init();
