# Project Guidelines & Agent Rules

## Mandatory Session Workflow Rule: Test, Version, Compile, and Git Push

For EVERY session, before completing tasks, the following sequential workflow MUST be strictly followed:

### 1. Test Recently Implemented Features
- Systematically test and verify all newly implemented features or fixes for the current session.
- Guarantee that no application data is saved in browser storage (`localStorage` / `sessionStorage` / `indexedDB`) to maintain multi-user isolation and real-time cloud integrity.
- Verify module reactivity, edge cases, and ensure no regressions were introduced.

### 2. Update Version
- Increment the semantic version number in `package.json` (`"version": "X.Y.Z"`).
- Update `APP_VERSION` and `BUILD_TIMESTAMP` in `src/utils/version.ts` to match the new version and current date/time.

### 3. Compile and Verify Build
- Execute `npm run build` to verify TypeScript compilation and the Vite bundle.
- Ensure the build exits with status code 0 and has zero bundling or syntax errors.

### 4. Push Code to Git
- Stage all modified files (`git add .`).
- Create a conventional commit referencing the version: `git commit -m "<type>(v<version>): <summary>"`.
- Push changes to the remote branch (`git push origin main`).

## Strict Scope Discipline: Targeted Changes Only
- Only change, update, or implement the exact features and fixes explicitly requested by the user.
- Any features or code other than the requested changes MUST NOT be touched, modified, or affected. Always preserve existing functionality and behavior without unnecessary refactoring.

