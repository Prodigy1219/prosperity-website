import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';

export default defineConfig({
  // Canonical origin — drives <link rel="canonical"> and Open Graph URLs.
  // Must match the domain search engines should index. The sitemap is a static
  // file in public/sitemap.xml (kept in step with src/pages/).
  site: 'https://www.prosperitysmp.com',
  integrations: [tailwind(), mdx()],
  output: 'static',
});
