# DataForge Studio frontend

Next.js 16.4.3 App Router, React 19.3, strict TypeScript, Tailwind CSS, Lucide, and locally built Monaco editors.

See the [project README](../README.md) for complete installation, security boundaries, backend startup, verification and demo instructions. Required frontend port: **3001**. Required API: **http://localhost:8001**.

From this directory:

```bash
npm ci
cp -n .env.example .env.local
npm run dev
```

`npm ci` builds local editor assets with a patched sanitizer. `npm run postinstall` regenerates those assets and the synthetic sample download. Both dev and build use Next's supported Webpack mode with Tailwind PostCSS.

```bash
npm run lint
npm run typecheck
npm run build
npm run start
```

Use `../scripts/e2e.sh` from a shell for the isolated browser workflow; do not run acceptance tests against your personal storage. It requires Chrome and free ports 8001 and 3001.
