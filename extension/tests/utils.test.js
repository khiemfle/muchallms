const { isVisible, findInput, findSendButton } = require('../src/utils');
const { ProviderRegistry } = require('../src/providers');

describe('Content Script Utils', () => {
  let adapter;
  let mockElement;

  beforeEach(() => {
    adapter = {
      inputSelectors: ['#test-input'],
      sendSelectors: ['#test-send']
    };
    
    document.body.innerHTML = `
      <div id="test-input" contenteditable="true"></div>
      <button id="test-send">Send</button>
    `;
    
    mockElement = document.getElementById('test-input');
    // Mock getBoundingClientRect to simulate visibility
    mockElement.getBoundingClientRect = () => ({
      width: 100,
      height: 40,
      top: 0,
      left: 0,
      bottom: 40,
      right: 100
    });
    
    // Mock isConnected for JSDOM
    Object.defineProperty(mockElement, 'isConnected', { value: true, configurable: true });
  });

  test('findInput should find the correct input element', () => {
    const input = findInput(adapter);
    expect(input).toBe(mockElement);
  });

  test('findInput should return null if no input matches', () => {
    const badAdapter = { inputSelectors: ['.none'] };
    expect(findInput(badAdapter)).toBeNull();
  });

  test('findSendButton should find the correct send button', () => {
    const button = findSendButton(adapter);
    expect(button).toBe(document.getElementById('test-send'));
  });

  test('findSendButton should return null if no send button matches', () => {
    const badAdapter = { sendSelectors: ['.none'] };
    document.body.innerHTML = '<div id="none"></div>';
    expect(findSendButton(badAdapter)).toBeNull();
  });

  test('isVisible should return true for visible elements', () => {
    expect(isVisible(mockElement)).toBe(true);
  });

  test('isVisible should return false for elements with display: none', () => {
    mockElement.style.display = 'none';
    mockElement.getBoundingClientRect = () => ({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0
    });
    window.getComputedStyle = jest.fn().mockReturnValue({ display: 'none' });
    expect(isVisible(mockElement)).toBe(false);
  });
});
