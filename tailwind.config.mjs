import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // The five legacy brand keys (charcoal, cream, emerald, gold, slate) were
        // removed after the redesign: grepping src/ found zero uses of any of them.
        // Keeping them was an active footgun — `emerald` and `slate` under
        // theme.extend REPLACE Tailwind's default scales of the same name, so a
        // future `emerald-500` or `slate-600` would have silently rendered as
        // nothing. With them gone, those names fall back to Tailwind's defaults.
        // Their values all survive below as semantic tokens.

        // ——— Semantic tokens. All new work uses these and only these. ———
        surface: '#17140f',
        panel: '#221d16',
        control: '#2c261d',
        edge: '#3a3227',
        'edge-control': '#6b6152',
        ink: '#f5efe2',
        'ink-muted': '#c0b6a3',
        'ink-dim': '#9c9384',
        action: '#5f7f34',
        'action-hover': '#496226',
        'action-ink': '#9ec46a',
        accent: '#c8873f',
        'accent-soft': '#e0a86a',
        discord: '#5865f2',
      },
      fontSize: {
        d1:    ['3.5rem',    { lineHeight: '1.05', letterSpacing: '-0.02em' }], // 56
        d2:    ['2.75rem',   { lineHeight: '1.08', letterSpacing: '-0.02em' }], // 44
        d3:    ['2.25rem',   { lineHeight: '1.15', letterSpacing: '-0.02em' }], // 36
        h2:    ['1.75rem',   { lineHeight: '1.25', letterSpacing: '-0.01em' }], // 28
        h3:    ['1.375rem',  { lineHeight: '1.35' }],                           // 22
        body:  ['1.0625rem', { lineHeight: '1.65' }],                           // 17
        small: ['0.875rem',  { lineHeight: '1.6' }],                            // 14
        micro: ['0.75rem',   { lineHeight: '1.4', letterSpacing: '0.08em' }],   // 12
      },
      fontFamily: {
        heading: ['Cinzel', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [typography],
};
