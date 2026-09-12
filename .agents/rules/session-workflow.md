# Mandatory Session Verification, Versioning, and Git Push Workflow

## Scope
This rule applies to all coding sessions, feature additions, fixes, and modifications in this repository.

## Pre-Compile and Pre-Push Sequence
For EVERY session, the agent and developer MUST strictly execute the following sequential workflow:

### 1. Test Recently Implemented Features
Before triggering any compilation, version bumping, or git commit:
- Systematically test and verify all newly implemented or modified features.
- Validate that zero application business data is stored in browser storage (`localStorage` / `sessionStorage` / `indexedDB`) to ensure multi-user isolation.
- Verify user authentication, cloud sync (Firebase Firestore), role permissions, and edge cases.
- Confirm that no regressions are introduced into existing features.

### 2. Update Version
Before compiling:
- Increment the semantic version number appropriately (patch for fixes/minor changes, minor for new features).
- Update the `"version"` field in `package.json` (e.g., `"version": "1.7.4"`).
- Update `APP_VERSION` and `BUILD_TIMESTAMP` in `src/utils/version.ts` with the new version and current date/time.

### 3. Compile and Verify Production Build
- Run the build command:
  ```bash
  npm run build
  ```
- Verify that TypeScript compilation and the Vite bundle pass with exit code 0.
- Ensure there are zero build errors, circular dependency warnings, or broken imports.

### 4. Commit and Push Code to Git
- Stage all modified files:
  ```bash
  git add .
  ```
- Commit using conventional commit format referencing the new version:
  ```bash
  git commit -m "<type>(v<version>): <concise summary of changes>"
  ```
- Push the commit to the remote repository:
  ```bash
  git push origin main
  ```
