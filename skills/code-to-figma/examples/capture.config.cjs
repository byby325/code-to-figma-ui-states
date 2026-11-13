// Use this setup when the project has built-in mocks (MSW, a mock server): node al-capture.cjs capture.config.cjs
module.exports = {
  project: '/path/to/repo', // Playwright is looked up from here
  url: 'http://localhost:53000',
  viewport: { width: 1280, height: 800 },
  out: './capture',
  preset: 'my-ds', // file name in figma-library-binding/presets/; omit it if there is no design system
  hide: ['.dev-tool', '.mock-toolbar'], // UI that only exists in mock mode
  // shotOnly: true, // screenshots only, at 2x: for state boards that show browser screenshots (figma-state-board Route C)
  ready: async page => { await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}); },
  cards: {
    L01: { url: '/home' },
    L02: { url: '/home', fullPage: true },
    M01: { url: '/home', viewport: { width: 360, height: 800 } },
    P01: { url: '/home/deals', run: async page => { await page.getByRole('tab', { name: 'Featured' }).click(); } },
  },
};
