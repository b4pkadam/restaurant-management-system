---
name: github-pages-vite-fix
description: >-
  Diagnose, fix, and automate GitHub Pages deployment for React, Vite, and single-page apps (SPA)
  when the published GitHub Pages site shows a blank page or fails to load assets.
---

# GitHub Pages Blank Page Fixer for Vite & React Projects

This skill provides step-by-step diagnostic and remediation workflows when a React / Vite single-page application (SPA) published to GitHub Pages displays a **blank white page** or asset loading errors (404 Not Found).

---

## Root Causes of Blank Pages on GitHub Pages

1. **Missing `base: './'` in `vite.config.ts`**:
   By default, Vite assumes root hosting (`/`). GitHub Pages repositories are hosted under a subpath `https://<user>.github.io/<repo-name>/`. Without relative base paths, asset URLs look for `https://<user>.github.io/assets/...` which returns 404.

2. **Deploying Raw Source Code instead of Built Production Bundle (`dist/`)**:
   If GitHub Pages is set to deploy directly from the `main` branch root, browsers receive uncompiled `<script type="module" src="/src/main.tsx"></script>`. Browsers cannot parse `.tsx` / JSX natively, causing script execution to fail completely and leaving `<div id="root"></div>` empty.

3. **Incorrect GitHub Pages Source Setting**:
   The GitHub Pages source in GitHub Repository Settings must be configured to **"GitHub Actions"** (for automatic workflow builds) or point to the built branch (e.g. `gh-pages`).

---

## Remediation Workflow

### Step 1: Fix Relative Base Path in `vite.config.ts`

Ensure `base: './'` is set in `vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  // ... rest of config
});
```

### Step 2: Add GitHub Actions Automated Deployment Workflow

Create `.github/workflows/deploy.yml` to automatically build `dist/` and deploy to GitHub Pages on every push to `main`:

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
          node-version: 20
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

### Step 3: Add `gh-pages` Helper Scripts to `package.json`

In `package.json`, add deployment scripts and `gh-pages` dev dependency:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "predeploy": "npm run build",
    "deploy": "gh-pages -d dist"
  },
  "devDependencies": {
    "gh-pages": "^6.3.0"
  }
}
```

Run `npm install` to install `gh-pages`.

### Step 4: Configure GitHub Repository Settings

1. Go to your GitHub repository on github.com.
2. Click **Settings** -> **Pages**.
3. Under **Build and deployment** -> **Source**:
   - Choose **GitHub Actions** (recommended if using `.github/workflows/deploy.yml`).
   - *Or* if using `npm run deploy`, choose **Deploy from a branch** and select branch `gh-pages` / `root`.

---

## Verification

1. Run `npm run build` locally to ensure zero build errors.
2. Commit and push the changes to GitHub (`git add . && git commit -m "Fix GitHub Pages deployment" && git push`).
3. Monitor the GitHub Actions tab in the repository to confirm successful deployment.
