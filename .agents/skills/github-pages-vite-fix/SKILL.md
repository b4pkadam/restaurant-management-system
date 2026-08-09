---
name: github-pages-vite-fix
description: >-
  Diagnose, fix, and automate GitHub Pages deployment for React, Vite, and single-page apps (SPA)
  when the published GitHub Pages site shows a blank page, artifact errors, or deployment failures.
---

# GitHub Pages Blank Page & Workflow Fixer for Vite & React Projects

This skill provides step-by-step diagnostic and remediation workflows when a React / Vite single-page application (SPA) published to GitHub Pages displays a **blank white page**, artifact duplication errors (`Multiple artifacts named "github-pages" unexpectedly found`), or Node runner deprecation warnings.

---

## Root Causes of Blank Pages & Workflow Failures

1. **"Multiple artifacts named 'github-pages' were unexpectedly found" Error**:
   Combining `upload-pages-artifact` and `deploy-pages` in a single job causes duplicate artifact uploads when re-running or retrying workflow steps. GitHub Actions retains multiple `github-pages` artifacts under the same run ID, causing `deploy-pages@v4` to fail.
   **Fix**: Separate the workflow into two distinct jobs: `build` (which uploads the artifact) and `deploy` (which depends on `build` via `needs: build`).

2. **Incorrect Base Path in `vite.config.ts`**:
   By default, Vite assumes root hosting (`/`). GitHub Pages repositories are hosted under a subpath `https://<user>.github.io/<repo-name>/`. Setting `base: '/<repo-name>/'` (e.g. `base: '/restaurant-management-system/'`) ensures Vite generates exact asset URLs pointing to the repository path.

3. **Using `vite-plugin-singlefile` on Web Hosts**:
   `viteSingleFile()` inlines all JS/CSS into a single massive `index.html` file (~1.7 MB). Browsers often fail to parse or execute huge inline `<script type="module">` tags, causing a silent JavaScript failure and leaving `<div id="root"></div>` blank. Removing `viteSingleFile()` allows standard, fast Vite chunking (`dist/assets/index-xxx.js`).

4. **Deploying Raw Source Code instead of Built Bundle (`dist/`)**:
   If GitHub Pages is set to deploy directly from the `main` branch root, browsers receive uncompiled `<script type="module" src="/src/main.tsx"></script>`. Browsers cannot parse `.tsx` / JSX natively, leaving the page blank.

5. **Node 20 Deprecation Warning in GitHub Actions**:
   GitHub Actions runners have deprecated Node 20. Workflows should specify `node-version: 22` (or latest LTS).

---

## Standard 2-Job GitHub Actions Workflow (`.github/workflows/deploy.yml`)

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
  build:
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

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

---

## Verification & Deployment

1. Commit and push the changes:
   ```bash
   git add .github/workflows/deploy.yml
   git commit -m "Fix GitHub Actions artifact conflict by using 2-job build and deploy architecture"
   git push origin main
   ```
2. In GitHub repository settings → Pages → Source: ensure **GitHub Actions** is selected.
