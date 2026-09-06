// Uses the installed QA runtime, without adding a project dependency.
const { chromium } = require(process.env.PROPERTY_PLAYWRIGHT);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.NAV_BASE_URL || 'http://127.0.0.1:4331';
const released = process.env.NAV_EXPECT_PROPERTIES !== 'false';
const out = process.env.NAV_QA_DIR;
if (!out) throw Error('Set NAV_QA_DIR');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  const results = [];
  try {
    for (const width of [320, 390, 768, 1024, 1279, 1280, 1440, 1920]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(base + (released ? '/properties' : '/'));
      await page.evaluate(() => document.fonts.ready);
      const desktop = page.locator('nav[aria-label="Main"]');
      const mobile = page.locator('nav[aria-label="Mobile"]');
      const toggle = page.locator('#mobile-menu-btn');
      for (const nav of [desktop, mobile]) {
        const link = nav.locator('a[href="/properties"]');
        assert.equal(await link.count(), released ? 1 : 0, 'shared release gate');
        if (released) assert.equal(await link.getAttribute('aria-current'), 'page');
      }
      assert.equal(await desktop.isVisible(), width >= 1280);
      assert.equal(await toggle.isVisible(), width < 1280);
      if (width < 1280) {
        await toggle.click();
        assert.equal(await mobile.isVisible(), true);
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        if (released) assert.equal(await mobile.locator('a[href="/properties"]').isVisible(), true);
      } else {
        const geometry = await desktop.locator('a').evaluateAll(links => links.map(link => {
          const rect = link.getBoundingClientRect();
          return { left: rect.left, right: rect.right, height: rect.height };
        }));
        const brand = await page.locator('body > header a[aria-label]').boundingBox();
        assert.ok(geometry[0].left >= brand.x + brand.width + 4, 'brand/nav separation');
        for (let i = 0; i < geometry.length; i++) {
          assert.ok(geometry[i].height < 45, 'desktop labels stay on one line');
          assert.ok(geometry[i].right <= width, 'link stays inside viewport');
          if (i) assert.ok(geometry[i].left >= geometry[i - 1].right, 'links do not overlap');
        }
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.locator('body > header').screenshot({ path: path.join(out, `nav-${width}.png`) });
      if (width < 1280) {
        await page.keyboard.press('Escape');
        assert.equal(await mobile.isVisible(), false);
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        if (released) {
          await toggle.click();
          await mobile.locator('a[href="/properties"]').click();
          assert.equal(new URL(page.url()).pathname, '/properties');
          assert.equal(await mobile.isVisible(), false);
        }
        await toggle.click();
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.waitForFunction(() => document.querySelector('#mobile-menu-btn').getAttribute('aria-expanded') === 'false');
      }
      results.push({ width, released, passed: true });
      await page.close();
    }
    fs.writeFileSync(path.join(out, 'nav-results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
