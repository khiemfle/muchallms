(function initProviderRegistry(global) {
  if (global.ProviderRegistry && global.providerRegistry) {
    if (typeof module !== "undefined" && module.exports) {
      module.exports = {
        DEFAULT_PROVIDERS: global.DEFAULT_PROVIDERS,
        GENERIC_INPUT_SELECTORS: global.GENERIC_INPUT_SELECTORS,
        GENERIC_SEND_SELECTORS: global.GENERIC_SEND_SELECTORS,
        ProviderRegistry: global.ProviderRegistry,
        providerRegistry: global.providerRegistry
      };
    }
    return;
  }

  /**
   * Provider Registry for Muchallms
   * Centralizes all LLM provider configurations and lookup logic.
   *
   * This file is intentionally written as an idempotent classic script with an
   * optional CommonJS export. Chrome MV3 can inject content scripts more than
   * once into the same isolated world; the wrapper prevents top-level lexical
   * redeclaration errors while Jest can still load it through require().
   */

  const GENERIC_INPUT_SELECTORS = [
    "textarea",
    "div[contenteditable='true'][role='textbox']",
    "div[contenteditable='true']",
    "input[type='text']"
  ];

  const GENERIC_SEND_SELECTORS = [
    "button[type='submit']",
    "button[id*='submit' i]",
    "button[id*='send' i]",
    "button[aria-label*='submit' i]",
    "button[aria-label*='send' i]",
    "button[class*='submit' i]",
    "button[class*='send' i]",
    "#submit-button",
    "#send-button"
  ];

  const DEFAULT_PROVIDERS = {
    chatgpt: {
      id: "chatgpt",
      name: "ChatGPT",
      matches: [/chatgpt\.com/, /chat\.openai\.com/],
      url: "https://chatgpt.com/",
      inputSelectors: [
        "#prompt-textarea",
        "div.ProseMirror#prompt-textarea",
        "div[contenteditable='true'][role='textbox']",
        "textarea[name='prompt-textarea']",
        "textarea"
      ],
      sendSelectors: [
        "button[data-testid='send-button']",
        "button[aria-label*='Send']",
        "button[class*='composer-submit-button']",
        "button[type='submit']"
      ]
    },
    claude: {
      id: "claude",
      name: "Claude",
      matches: [/claude\.ai/],
      url: "https://claude.ai/",
      inputSelectors: [
        "div[data-testid='chat-input']",
        "div[contenteditable='true'][role='textbox']",
        "div[contenteditable='true']",
        "textarea"
      ],
      sendSelectors: [
        "button[aria-label='Send message']",
        "button[aria-label*='Send']",
        "button[aria-label*='Submit']",
        "button[class*='Button_claude']",
        "button[type='submit']"
      ]
    },
    gemini: {
      id: "gemini",
      name: "Gemini",
      matches: [/gemini\.google\.com/],
      url: "https://gemini.google.com/app",
      inputSelectors: [
        "textarea",
        "div[contenteditable='true'][role='textbox']",
        "div[contenteditable='true']"
      ],
      sendSelectors: [
        "button[aria-label*='Send']",
        "button[type='submit']"
      ]
    },
    grok: {
      id: "grok",
      name: "Grok",
      matches: [/grok\.com/, /x\.com\/i\/grok/],
      url: "https://grok.com/",
      inputSelectors: [
        "form .ProseMirror[contenteditable='true']",
        "div[contenteditable='true'].tiptap.ProseMirror",
        "textarea",
        "div[contenteditable='true'][role='textbox']",
        "div[contenteditable='true']"
      ],
      sendSelectors: [
        "button[aria-label='Submit']",
        "button[aria-label='Submit']",
        "button[aria-label*='Send']",
        "button[type='submit']"
      ]
    },
    perplexity: {
      id: "perplexity",
      name: "Perplexity",
      matches: [/perplexity\.ai/],
      url: "https://www.perplexity.ai/",
      inputSelectors: [
        "#ask-input",
        "span[data-lexical-text='true']",
        "div[data-lexical-editor='true'][role='textbox']",
        "textarea",
        "div[contenteditable='true'][role='textbox']",
        "div[contenteditable='true']"
      ],
      sendSelectors: [
        "button[aria-label='Submit']",
        "button[aria-label*='Send']",
        "button[aria-label*='Submit']",
        "button[type='submit']"
      ]
    }
  };

  class ProviderRegistry {
    constructor(providers = DEFAULT_PROVIDERS) {
      this.providers = new Map(Object.entries(providers));
    }

    register(id, config) {
      const existing = this.providers.get(id) || {};
      this.providers.set(id, { ...existing, ...config, id });
    }

    get(id, customProviders = []) {
      return this.getAll(customProviders).find((provider) => provider.id === id) || null;
    }

    getAll(customProviders = []) {
      return Array.from(this.providers.values()).concat(ProviderRegistry.toProviderConfigs(customProviders));
    }

    findForUrl(url, customProviders = []) {
      if (!url) return null;
      return this.getAll(customProviders).find((p) => p.matches && p.matches.some((m) => m.test(url))) || null;
    }

    static createMatchesFromUrl(url) {
      try {
        const urlObj = new URL(url);
        const host = urlObj.hostname.toLowerCase();
        const escapedHost = ProviderRegistry.escapeRegExp(host);
        const parts = host.split('.');
        const mainDomain = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
        const escapedMainDomain = ProviderRegistry.escapeRegExp(mainDomain);
        return [new RegExp(escapedHost), new RegExp(`(^|\\.)${escapedMainDomain}\\..*`)];
      } catch (e) {
        return [/.*/];
      }
    }

    static escapeRegExp(value) {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    static toProviderConfigs(customProviders = []) {
      if (!Array.isArray(customProviders)) return [];
      return customProviders
        .filter((provider) => provider && provider.id && provider.url)
        .map((provider) => ({
          id: provider.id,
          name: provider.name || provider.id,
          matches: ProviderRegistry.createMatchesFromUrl(provider.url),
          url: provider.url,
          inputSelectors: provider.inputSelectors || GENERIC_INPUT_SELECTORS,
          sendSelectors: provider.sendSelectors || GENERIC_SEND_SELECTORS
        }));
    }

    static mergeCustomProviders(customProviders = []) {
      return new ProviderRegistry().getAll(customProviders);
    }

    static mergeProviderIds(currentProviderIds = [], providerIdsToAdd = [], knownProviderIds = []) {
      const additions = Array.isArray(providerIdsToAdd) ? providerIdsToAdd : [providerIdsToAdd];
      const known = Array.isArray(knownProviderIds) && knownProviderIds.length
        ? new Set(knownProviderIds)
        : null;
      const merged = [];
      const appendValid = (providerId) => {
        if (!providerId || (known && !known.has(providerId)) || merged.includes(providerId)) return;
        merged.push(providerId);
      };

      (Array.isArray(currentProviderIds) ? currentProviderIds : []).forEach(appendValid);
      additions.forEach(appendValid);
      return merged;
    }
  }

  const providerRegistry = new ProviderRegistry();
  global.ProviderRegistry = ProviderRegistry;
  global.providerRegistry = providerRegistry;
  global.DEFAULT_PROVIDERS = DEFAULT_PROVIDERS;
  global.GENERIC_INPUT_SELECTORS = GENERIC_INPUT_SELECTORS;
  global.GENERIC_SEND_SELECTORS = GENERIC_SEND_SELECTORS;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      DEFAULT_PROVIDERS,
      GENERIC_INPUT_SELECTORS,
      GENERIC_SEND_SELECTORS,
      ProviderRegistry,
      providerRegistry
    };
  }
})(globalThis);
