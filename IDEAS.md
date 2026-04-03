# Blog Post Ideas

## Next up

### My first 30 days as an Engineering Manager at a new company
- **Target:** Late April / early May
- **Angle:** "I changed the hiring process on day one. But for everything else, I'm being deliberate about understanding before acting."
- **Sections to explore:**
  - What I do in first one-to-ones
  - How I learn a codebase I didn't write
  - Building trust with a team that didn't hire me
  - What I observe vs what I change
  - Relationship with peer EM
  - Early mistakes and misjudgements
  - How the squad feels about the React Native migration
- **Notes:**
  - Gather material through weeks 2-5
  - Write when there's enough honest content

## React Native Tutorial Series

All tutorials link to code examples in https://github.com/warrendeleon/rn-warrendeleon

### Setting up MSW v2 in React Native
- **Target:** April 27
- **Angle:** Most MSW guides are outdated or web-only. This is a production-grade setup with 11 handler sets.
- **Key content:** Installation, handler structure (success/error/401/403/429/timeout/offline), integration with Jest + RNTL, custom render wrapper
- **Files to reference:** `src/test-utils/msw/handlers.ts`, `src/test-utils/renderWithProviders.tsx`

### Detox + Cucumber BDD for React Native E2E testing
- **Target:** May 4
- **Angle:** Most teams don't know Gherkin feature files work with Detox. Step-by-step guide.
- **Files to reference:** `e2e/*.feature`, `e2e/*.cucumber.tsx`, `.detoxrc.js`, `CheckmarkFormatter.js`

### Metro runtime mocking for deterministic E2E tests
- **Target:** May 11
- **Angle:** How to mock your entire API layer at bundle time using environment variables and JSON fixtures. No network interception, no flaky tests. The mocking strategy behind the Detox + Cucumber setup.
- **Key content:** E2E_MOCK env var, Metro bundler config, fixture structure per locale, switching between real and mock API at build time
- **Files to reference:** Metro config, fixture files in `src/test-utils/fixtures/api/`, conditional API client setup

### Tiered secure storage in React Native
- **Angle:** Three storage tiers: Keychain for tokens, encrypted storage for PII, AsyncStorage for preferences. Why each tier exists and when to use it.
- **Files to reference:** `src/utils/storage/SecureStore.ts`, `src/utils/storage/EncryptedStore.ts`

### Runtime API response validation with Zod in React Native
- **Angle:** Catch backend contract changes before they crash your app. Practical Zod patterns for React Native.
- **Files to reference:** `src/utils/validation/validateResponse.ts`, `src/schemas/`

### Accessibility testing in React Native
- **Angle:** Practical, not theoretical. Touch target validation (44pt iOS / 48dp Android), screen reader testing, high contrast checks.
- **Files to reference:** `src/test-utils/accessibility.ts`, `*.accessibility.rntl.tsx` test files

### i18n with automated parity tests
- **Angle:** 5 languages with a test that verifies every locale has identical keys. The testing side of i18n nobody writes about.
- **Files to reference:** `src/i18n/`, `src/i18n/__tests__/localesParity.rntl.ts`, `src/types/i18next.d.ts`

## Backlog

_Add ideas here as they come up. One heading per idea, with a few bullet points on the angle._
