# New Prosperity — Website

Public website for the New Prosperity Minecraft economy server.

Built with Astro + Tailwind CSS. Deployed to Vercel.

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:4321

## Build

```bash
npm run build
npm run preview
```

## Vercel Deployment

1. Push this repo to GitHub
2. Go to vercel.com → Import Project
3. Select this repository
4. Framework preset: **Astro**
5. Root directory: `/` (this repo root)
6. Build command: `npm run build`
7. Output directory: `dist`
8. Deploy

Production deploys from `main`. Pull requests get preview URLs automatically.

## Content Placeholders

Fill these in before launch:

- `src/data/serverInfo.ts` — Server IP, Discord invite
- `public/logo.png` — Replace with final logo
- `/changelog` — Add real update entries as beta progresses

## Pages

| Page | Path |
|---|---|
| Home | `/` |
| Getting Started | `/getting-started` |
| Rules | `/rules` |
| Economy | `/economy` |
| Skill Trees | `/skill-trees` |
| Changelog | `/changelog` |
