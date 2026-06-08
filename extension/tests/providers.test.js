const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { ProviderRegistry } = require('../src/providers');

const providerSource = fs.readFileSync(path.join(__dirname, '../src/providers.js'), 'utf8');

describe('ProviderRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  test('should return default providers on initialization', () => {
    const providers = registry.getAll();
    expect(providers.length).toBeGreaterThan(0);
    expect(providers.some(p => p.id === 'chatgpt')).toBe(true);
    expect(providers.some(p => p.id === 'claude')).toBe(true);
  });

  test('should get provider by ID', () => {
    const provider = registry.get('chatgpt');
    expect(provider).toBeDefined();
    expect(provider.name).toBe('ChatGPT');
  });

  test('should return null for invalid provider ID', () => {
    expect(registry.get('invalid-id')).toBeNull();
  });

  test('should register a new provider', () => {
    const newProvider = {
      id: 'test-provider',
      name: 'Test Provider',
      matches: [/test\.ai/],
      url: 'https://test.ai'
    };
    registry.register('test-provider', newProvider);
    expect(registry.get('test-provider')).toEqual(newProvider);
  });

  test('should update existing provider', () => {
    registry.register('chatgpt', { name: 'ChatGPT Updated' });
    const provider = registry.get('chatgpt');
    expect(provider.name).toBe('ChatGPT Updated');
    expect(provider.id).toBe('chatgpt'); // Should preserve ID
  });

  test('should find provider for URL', () => {
    expect(registry.findForUrl('https://chatgpt.com/c/123')).toEqual(registry.get('chatgpt'));
    expect(registry.findForUrl('https://claude.ai/chat/abc')).toEqual(registry.get('claude'));
    expect(registry.findForUrl('https://google.com')).toBeNull();
  });

  test('should find custom provider for URL when custom providers are supplied', () => {
    const customProviders = [{ id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com/' }];

    expect(registry.findForUrl('https://chat.deepseek.com/a/chat/s/123', customProviders)).toMatchObject({
      id: 'deepseek',
      name: 'DeepSeek',
      url: 'https://chat.deepseek.com/'
    });
  });

  test('should include generic input and send selectors for custom providers', () => {
    const [provider] = ProviderRegistry.toProviderConfigs([
      { id: 'phind', name: 'Phind', url: 'https://www.phind.com/search' }
    ]);

    expect(provider.inputSelectors).toEqual(expect.arrayContaining([
      'textarea',
      "div[contenteditable='true']",
      "input[type='text']"
    ]));
    expect(provider.sendSelectors).toEqual(expect.arrayContaining([
      "button[type='submit']",
      "button[aria-label*='send' i]"
    ]));
  });

  test('should create matches from URL correctly', () => {
    const matches = ProviderRegistry.createMatchesFromUrl('https://myprovider.ai/chat');
    const testUrl = 'https://myprovider.ai/chat';
    const fallbackUrl = 'https://sub.myprovider.ai/chat';
    
    expect(matches.some(m => m.test(testUrl))).toBe(true);
    expect(matches.some(m => m.test(fallbackUrl))).toBe(true);
  });

  test('should handle invalid URLs in createMatchesFromUrl', () => {
    const matches = ProviderRegistry.createMatchesFromUrl('invalid-url');
    expect(matches[0].toString()).toBe('/.*/');
  });

  test('loads in a browser-like extension context without CommonJS module globals', () => {
    const context = { globalThis: {} };
    context.globalThis = context;

    expect(() => vm.runInNewContext(providerSource, context)).not.toThrow();
    expect(context.ProviderRegistry).toBeDefined();
    expect(context.providerRegistry.findForUrl('https://chatgpt.com/')).toMatchObject({ id: 'chatgpt' });
  });

  test('can be injected repeatedly into the same extension context', () => {
    const context = { globalThis: {} };
    context.globalThis = context;

    expect(() => {
      vm.runInNewContext(providerSource, context);
      vm.runInNewContext(providerSource, context);
    }).not.toThrow();
    expect(context.providerRegistry.findForUrl('https://claude.ai/new')).toMatchObject({ id: 'claude' });
  });
});
