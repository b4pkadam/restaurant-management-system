---
name: github-pages-vite-fix
description: >-
  Diagnose, fix, and automate GitHub Pages deployment for React, Vite, and single-page apps (SPA)
  when the published GitHub Pages site shows a blank page or fails to load assets.
---

# GitHub Pages Blank Page Fixer for Vite & React Projects

This skill provides step-by-step diagnostic and remediation workflows when a React / Vite single-page application (SPA) published to GitHub Pages displays a **blank white page**, Node deprecation warnings, or asset loading errors.

---

## Root Causes of Blank Pages on GitHub Pages

1. **Incorrect Base Path or Missing `base` in `vite.config.ts`**:
   By default, Vite assumes root hosting (`/`). GitHub Pages repositories are hosted under a subpath `https://<user>.github.io/<repo-name>/`. Setting `base: '/<repo-name>/'` (e.g. `base: '/restaurant-management-system/'`) ensures Vite generates exact asset URLs pointing to the repository path.

2. **Using `vite-plugin-singlefile` on Web Hosts**:
   `viteSingleFile()` inlines all JS/CSS into a single massive `index.html` file (~1.7 MB). Browsers often fail to parse or execute huge inline `<script type="module">` tags, causing a silent JavaScript failure and leaving `<div id="root"></div>` blank. Removing `viteSingleFile()` allows standard, fast Vite chunking (`dist/assets/index-xxx.js`).

3. **Deploying Raw Source Code instead of Built Bundle (`dist/`)**:
   If GitHub Pages is set to deploy directly from the `main` branch root, browsers receive uncompiled `<script type="module" src="/src/main.tsx"></script>`. Browsers cannot parse `.tsx` / JSX natively, leaving the page blank.

4. **Node 20 Deprecation Warning in GitHub Actions**:
   GitHub Actions runners have deprecated Node 20. Workflows should specify `node-version: 22` (or latest LTS).

---

## Remediation Workflow

### Step 1: Configure `vite.config.ts`

Set the exact base path matching your repository name (e.g. `base: "/restaurant-management-system/"`) and use standard Vite asset plugins (remove `viteSingleFile()`):

```typescript
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  base: "/restaurant-management-system/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

### Step 2: Update GitHub Actions Workflow (`.github/workflows/deploy.yml`)

Use `node-version: 22` to avoid runner deprecation warnings and automate production builds:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: ['main']
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build project
        run: npm run build

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### Step 3: Verify & Deploy

1. Run `npm run build` locally to verify clean compilation:
   - Check `dist/index.html` to confirm asset links point to `/restaurant-management-system/assets/index-xxx.js`.
2. Push changes:
   ```bash
   git add .
   git commit -m "Fix GitHub Pages blank page asset paths and update Node runner version"
   git push origin main
   ```
