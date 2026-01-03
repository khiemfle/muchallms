# Muchallms Extension

Muchallms is a Chromium extension that manages multiple LLM web UIs (ChatGPT, Claude, Gemini, Grok, Perplexity) in a coordinated grid with a single controller window for broadcasting prompts.

It does not require any API keys. It works with your existing free accounts on the supported LLM chat sites.

Demo: https://www.youtube.com/watch?v=ZUj9dPOTYFs

## Features

- Detect and organize LLM popup windows into a grid
- Controller window to broadcast prompts to open LLMs
- Conversation history with per-LLM links (stored locally)
- Runs entirely in your browser (no backend)

## Install (development)

1. Open `chrome://extensions` (or the extensions page in Arc/Brave).
2. Enable Developer mode.
3. Click "Load unpacked" and select `muchallms/extension`.
4. Click the extension icon to open the controller.

## Usage

- New chat: use the edit icon in the header.
- Send prompt: click the broadcast icon or press `Ctrl/Cmd+Enter`.
- History: open the menu in the header to review past conversations.

## Development

- Extension source: `src/`
  - `background.js`: window management + messaging
  - `content.js`: DOM adapters for providers
  - `control.html/.css/.js`: controller UI

## Privacy

All data stays in your local browser storage. No analytics or external servers.

## License

MIT. See `LICENSE`.
