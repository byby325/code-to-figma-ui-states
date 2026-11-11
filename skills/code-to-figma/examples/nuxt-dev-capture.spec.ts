// For a Nuxt project whose e2e runs a production build: start the mock upstream, then spawn a dev server that points to it.
// For an ESM project, put a package.json with { "type": "module" } in the working directory, and load Playwright from .../@playwright/test/index.mjs.
// Nitro's cachedEventHandler stores results in .nuxt/cache. After the mock port changes the old results are still there, and data blocks may disappear; when done, clear the cache this run created.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { test } from '/path/to/repo/node_modules/@playwright/test/index.mjs';
import { MockUpstream } from '/path/to/repo/e2e/fixtures/mockUpstream';
import { UPSTREAM_PATHS } from '/path/to/repo/e2e/fixtures/routeTable';
import { waitForHydration } from '/path/to/repo/e2e/pages/hydration';

const { capture } = createRequire(import.meta.url)('/path/to/code-to-figma/scripts/al-capture.cjs');
const opts = { out: '/path/to/work/capture', fullPage: true };
let upstream: MockUpstream, dev: ReturnType<typeof spawn>;

test.beforeAll(async () => {
  test.setTimeout(180000);
  upstream = new MockUpstream();
  const url = await upstream.start();
  dev = spawn('node_modules/.bin/nuxt', ['dev', '--port', '40214', '--host', '127.0.0.1'], {
    cwd: '/path/to/repo',
    env: { ...process.env, NUXT_POLLUX_URL: url + UPSTREAM_PATHS.pollux }, // list every upstream the e2e uses
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('nuxt dev startup timed out')), 170000);
    let log = '';
    const onData = (c: Buffer) => {
      log += String(c);
      if (/Nitro server built|Local:/.test(log)) { clearTimeout(timer); setTimeout(resolve, 8000); }
    };
    dev.stdout!.on('data', onData);
    dev.stderr!.on('data', onData);
    dev.on('exit', code => { clearTimeout(timer); reject(new Error(`nuxt dev exited, code ${code}\n${log.slice(-800)}`)); });
  });
});
test.afterAll(async () => { dev?.kill(); await upstream?.stop(); });

test('L01', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/category');
  await waitForHydration(page);
  console.log(JSON.stringify(await capture(page, 'L01', opts)));
});
