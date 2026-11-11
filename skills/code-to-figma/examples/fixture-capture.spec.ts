// Use this setup when the project's mocks are Playwright fixtures (page.route interception). Keep the spec and config in the working directory, not in the project repo.
// Run: cd /path/to/repo && node_modules/.bin/playwright test --config /path/to/work/pw.config.ts
//
// pw.config.ts essentials: testDir points to the working directory, baseURL points to the dev server (production bundles have no component info),
// use.channel = 'chrome', launchOptions.args = ['--disable-web-security'], and a longer expect.timeout (the first load in dev mode is slower).
import { test, expect } from '/path/to/repo/e2e/fixtures/mockBackend';
import { someScenario } from '/path/to/repo/e2e/fixtures/scenarios/something';
import { openSomething, somethingPanel } from '/path/to/repo/e2e/pages/something';

const { capture } = require('/path/to/code-to-figma/scripts/al-capture.cjs');
const opts = { out: '/path/to/work/capture', hide: ['.fakeHeader'] };

test('C01', async ({ page, mockBackend }) => {
  mockBackend.use(someScenario);
  await openSomething(page);
  await expect(somethingPanel(page)).toBeVisible();
  console.log(JSON.stringify(await capture(page, 'C01', opts)));
});
