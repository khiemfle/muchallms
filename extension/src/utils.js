function isStyleHidden(element) {
  let el = element;
  while (el) {
    if (el.nodeType === 1) { // ELEMENT_NODE
      try {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") {
          return true;
        }
      } catch (e) {}
    }
    const parent = el.parentNode;
    if (parent) {
      el = parent;
    } else if (el.host) {
      el = el.host;
    } else {
      break;
    }
  }
  return false;
}

function isVisible(element) {
  if (!element) return false;
  if (!element.isConnected) return false;
  
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return true;
  }
  
  return !isStyleHidden(element);
}

function querySelectorAllShadow(selector, root = document) {
  const elements = [];
  
  try {
    const matches = root.querySelectorAll(selector);
    for (const match of matches) {
      if (!elements.includes(match)) {
        elements.push(match);
      }
    }
  } catch (e) {}
  
  try {
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        const shadowMatches = querySelectorAllShadow(selector, el.shadowRoot);
        for (const match of shadowMatches) {
          if (!elements.includes(match)) {
            elements.push(match);
          }
        }
      }
    }
  } catch (e) {}
  
  return elements;
}

function findInput(adapter) {
  const selectors = adapter?.inputSelectors || ["textarea", "div[contenteditable='true']"];
  for (const selector of selectors) {
    const candidates = querySelectorAllShadow(selector);
    const element = candidates.find((node) => !node.disabled && isVisible(node));
    if (element && !element.isContentEditable && element.tagName.toLowerCase() !== "textarea" && element.tagName.toLowerCase() !== "input") {
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
    const candidates = querySelectorAllShadow(selector);
    const element = candidates.find((node) => !node.disabled && isVisible(node));
    if (element) return element;
  }
  
  const genericCandidates = querySelectorAllShadow("button, [role='button'], input[type='submit'], input[type='button']");
  const sendWords = ["send", "submit", "post", "comment", "reply", "ask", "go", "chat"];
  
  for (const node of genericCandidates) {
    if (node.disabled || !isVisible(node)) continue;
    
    const text = (node.textContent || "").toLowerCase().trim();
    const ariaLabel = (node.getAttribute("aria-label") || "").toLowerCase();
    const title = (node.getAttribute("title") || "").toLowerCase();
    const value = (node.getAttribute("value") || "").toLowerCase();
    
    const matchesWord = sendWords.some(word => 
      text.includes(word) || ariaLabel.includes(word) || title.includes(word) || value.includes(word)
    );
    
    if (matchesWord) {
      return node;
    }
  }
  
  return null;
}

function selectEditableContents(element) {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function dispatchInputEvent(element, value) {
  if (!element) return;

  if (typeof InputEvent === "function") {
    try {
      const inputEvent = new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: value,
        inputType: "insertText"
      });
      element.dispatchEvent(inputEvent);
      return;
    } catch (error) {}
  }

  element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

function setNativeValue(element, value) {
  try {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  } catch (e) {
    element.value = value;
  }
}

function setInputValue(element, value) {
  if (!element) return;

  if (element.tagName.toLowerCase() === "textarea" || element.tagName.toLowerCase() === "input") {
    element.focus();
    setNativeValue(element, value);
    dispatchInputEvent(element, value);

    const rootNode = element.getRootNode();
    if (rootNode && rootNode.host) {
      try {
        setNativeValue(rootNode.host, value);
        rootNode.host.setAttribute("value", value);
        dispatchInputEvent(rootNode.host, value);
      } catch (e) {}
    }
    return;
  }

  if (element.isContentEditable) {
    element.focus();
    let usedExecCommand = false;
    try {
      if (element.classList.contains("ProseMirror")) {
        element.innerHTML = `<p>${value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
      } else {
        selectEditableContents(element);
        usedExecCommand = document.execCommand("insertText", false, value);
      }
    } catch (error) {
      element.textContent = value;
    }

    if (usedExecCommand) {
      setTimeout(() => {
        const expected = normalizeText(value);
        const current = normalizeText(readInputValue(element));
        const matched = expected ? current.includes(expected) : current.length === 0;
        if (!matched) {
          element.textContent = value;
          dispatchInputEvent(element, value);
        }
      }, 0);
    } else {
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
    composed: true,
    key: "Enter",
    code: "Enter",
    keyCode: 13
  };
  element.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  element.dispatchEvent(new KeyboardEvent("keyup", eventInit));

  let form = element.closest("form");
  if (!form) {
    const rootNode = element.getRootNode();
    if (rootNode && rootNode.host) {
      form = rootNode.host.closest("form");
    }
  }
  if (form) {
    form.requestSubmit?.();
  }
}

module.exports = {
  isStyleHidden,
  isVisible,
  isVisible,
  querySelectorAllShadow,
  findInput,
  findSendButton,
  selectEditableContents,
  dispatchInputEvent,
  setNativeValue,
  setInputValue,
  readInputValue,
  normalizeText,
  waitForInputMatch,
  triggerSend
};
