const ADAPTERS = [
  {
    id: "chatgpt",
    hostMatch: /chatgpt\.com/,
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
  {
    id: "claude",
    hostMatch: /claude\.ai/,
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
  {
    id: "gemini",
    hostMatch: /gemini\.google\.com/,
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
  {
    id: "grok",
    hostMatch: /grok\.com/,
    inputSelectors: [
      "form .ProseMirror[contenteditable='true']",
      "div[contenteditable='true'].tiptap.ProseMirror",
      "textarea",
      "div[contenteditable='true'][role='textbox']",
      "div[contenteditable='true']"
    ],
    sendSelectors: [
      "form button[aria-label='Submit']",
      "button[aria-label='Submit']",
      "button[aria-label*='Send']",
      "button[type='submit']"
    ]
  },
  {
    id: "perplexity",
    hostMatch: /perplexity\.ai/,
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
];

function getAdapter() {
  return ADAPTERS.find((adapter) => adapter.hostMatch.test(window.location.host));
}

function isVisible(element) {
  return element && element.offsetParent !== null;
}

function findInput(adapter) {
  const selectors = adapter?.inputSelectors || ["textarea", "div[contenteditable='true']"];
  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll(selector));
    const element = candidates.find((node) => !node.disabled && isVisible(node));
    if (element && !element.isContentEditable) {
      const editableParent = element.closest("[contenteditable='true']");
      if (editableParent) return editableParent;
    }
    if (element) return element;
  }
  return null;
}

function findSendButton(adapter) {
  const selectors = adapter?.sendSelectors || [];
  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll(selector));
    const element = candidates.find((node) => !node.disabled && isVisible(node));
    if (element) return element;
  }
  return null;
}

function dispatchInputEvent(element, value) {
  if (!element) return;

  if (typeof InputEvent === "function") {
    try {
      const inputEvent = new InputEvent("input", {
        bubbles: true,
        data: value,
        inputType: "insertText"
      });
      element.dispatchEvent(inputEvent);
      return;
    } catch (error) {
      // Some browsers block InputEvent in content scripts.
    }
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function setInputValue(element, value) {
  if (!element) return;

  if (element.tagName.toLowerCase() === "textarea" || element.tagName.toLowerCase() === "input") {
    element.focus();
    element.value = value;
    dispatchInputEvent(element, value);
    return;
  }

  if (element.isContentEditable) {
    element.focus();
    let usedExecCommand = false;
    try {
      if (element.classList.contains("ProseMirror")) {
        element.innerHTML = `<p>${value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
      } else {
        document.execCommand("selectAll", false, null);
        usedExecCommand = document.execCommand("insertText", false, value);
      }
    } catch (error) {
      element.textContent = value;
    }

    if (!usedExecCommand) {
      dispatchInputEvent(element, value);
    }

    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter" }));
  }
}

function readInputValue(element) {
  if (!element) return "";
  if (element.tagName.toLowerCase() === "textarea" || element.tagName.toLowerCase() === "input") {
    return element.value || "";
  }
  if (element.isContentEditable) {
    return element.textContent || "";
  }
  return "";
}

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function waitForInputMatch(input, expected, attempts = 12, delayMs = 50) {
  return new Promise((resolve) => {
    let tries = 0;
    const tick = () => {
      const current = normalizeText(readInputValue(input));
      if (!expected || current.includes(expected)) {
        resolve(true);
        return;
      }
      tries += 1;
      if (tries >= attempts) {
        resolve(false);
        return;
      }
      setTimeout(tick, delayMs);
    };
    tick();
  });
}

function triggerSend(adapter, element) {
  if (!element) return;
  const sendButton = findSendButton(adapter);
  if (sendButton) {
    sendButton.click();
    return;
  }

  const eventInit = {
    bubbles: true,
    cancelable: true,
    key: "Enter",
    code: "Enter",
    keyCode: 13
  };
  element.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  element.dispatchEvent(new KeyboardEvent("keyup", eventInit));

  const form = element.closest("form");
  if (form) {
    form.requestSubmit?.();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "get_location") {
    sendResponse({ ok: true, url: window.location.href });
    return;
  }

  if (message.type !== "broadcast") return;

  const adapter = getAdapter();
  const input = findInput(adapter);

  if (!input) {
    sendResponse({ ok: false, error: "Input not found" });
    return;
  }

  const mode = message.mode || "paste";
  const prompt = message.prompt || "";
  const expected = normalizeText(prompt);

  if (mode === "paste") {
    setInputValue(input, prompt);
    waitForInputMatch(input, expected).then((matched) => {
      sendResponse(matched ? { ok: true } : { ok: false, error: "Input mismatch" });
    });
    return true;
  }

  if (mode === "submit" || mode === "send") {
    triggerSend(adapter, input);
    sendResponse({ ok: true });
    return;
  }
});
