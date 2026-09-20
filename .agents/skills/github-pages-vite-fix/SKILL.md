---
name: github-pages-vite-fix
description: >-
  Diagnose, fix, and automate GitHub Pages deployment for React, Vite, and single-page apps (SPA)
  when the published GitHub Pages site shows a blank page, artifact errors, or deployment failures.
---

# GitHub Pages Blank Page & Workflow Fixer for Vite & React Projects

This skill provides step-by-step diagnostic and remediation workflows when a React / Vite single-page application (SPA) published to GitHub Pages displays a **blank white page**, top-level circular dependency errors, artifact duplication errors (`Multiple artifacts named "github-pages" unexpectedly found`), or Node runner deprecation warnings.

---

## Root Causes of Blank Pages & Workflow Failures

1. **Top-Level Circular Module Dependencies in Minified Bundles**:
   If `db.ts` statically imports `realtimeSync.ts` at top level AND `realtimeSync.ts` statically imports `db.ts` at top level, Rollup/Vite's minified production bundle evaluates one of the exported symbols as `undefined` during module initialization. Calling methods on `undefined` throws an uncaught `TypeError` before `createRoot().render()` executes, leaving the screen completely blank.
   **Fix**: Replace static top-level circular imports with dynamic `await import('./module')` inside methods or event handlers.

2. **"Multiple artifacts named 'github-pages' were unexpectedly found" Error**:
   Combining `upload-pages-artifact` and `deploy-pages` with split jobs or outdated action versions causes duplicate artifact uploads.
   **Fix**: Use `actions/configure-pages@v5` and standard single-job deployment syntax in `.github/workflows/deploy.yml`.

3. **Incorrect Base Path in `vite.config.ts`**:
   By default, Vite assumes root hosting (`/`). GitHub Pages repositories are hosted under a subpath `https://<user>.github.io/<repo-name>/`. Setting `base: './'` ensures Vite generates relative asset links (`./assets/index-xxx.js`) that work seamlessly across all subpath routes.

4. **Using `vite-plugin-singlefile` on Web Hosts**:
   `viteSingleFile()` inlines all JS/CSS into a single massive `index.html` file (~1.7 MB). Browsers often fail to parse or execute huge inline `<script type="module">` tags. Removing `viteSingleFile()` allows standard, fast Vite chunking (`dist/assets/index-xxx.js`).

---

## Verification & Deployment

1. Run `npm run build` locally to verify zero build or circular import warnings.
2. Commit and push changes:
   ```bash
   git add .
   git commit -m "Fix top-level circular module dependency and update deployment workflow"
   git push origin main
   ```
