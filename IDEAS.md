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

## Architecture and Security Series

All tutorials link to code examples in https://github.com/warrendeleon/rn-warrendeleon

### 12. Feature-first project structure in React Native
- **Target:** June 15
- **Angle:** Why type-first (screens/, hooks/, services/) breaks down at scale. How 12 self-contained features with co-located stores, tests, and screens keep things maintainable.
- **Files to reference:** `src/features/`, feature-level `store/`, `__tests__/`, `screens/`

### 13. Building a Supabase REST client without the SDK
- **Target:** June 22
- **Angle:** Why I went with Axios over the official Supabase SDK. Typed interceptors, request/response handling, and full control over the HTTP layer.
- **Files to reference:** `src/httpClients/SupabaseAuthClient.ts`

### 14. Token refresh race condition prevention in React Native
- **Target:** June 29
- **Angle:** Multiple 401s fire at once. Without a subscriber queue, you get multiple refresh attempts and broken sessions. The Axios interceptor pattern that prevents it.
- **Files to reference:** `src/httpClients/SupabaseAuthClient.ts` (response interceptor, subscriber queue)

### 15. Deep linking with Supabase auth callbacks in React Native
- **Target:** July 6
- **Angle:** Hash fragment parsing for password reset, signup verification, email change, and magic links. Each callback type routes differently.
- **Files to reference:** `src/navigation/linking.ts`, `src/features/Auth/`

### 16. Form validation with a common password blacklist
- **Target:** July 13
- **Angle:** Yup custom rules that check against 10,000 common passwords from SecLists, validate Unicode normalization to prevent mixed-script attacks, and enforce strong password rules.
- **Files to reference:** `src/features/Auth/validation/customRules.ts`

### 17. ErrorBoundary with production vs dev fallback in React Native
- **Target:** July 20
- **Angle:** Different UX in dev (show the error) vs production (hide it). "Try Again" and "Go Home" recovery paths.
- **Files to reference:** `src/shared/components/ErrorBoundary/`

### 18. PII masking in production logs
- **Target:** July 27
- **Angle:** Your logger auto-masks tokens, emails, passwords, and phone numbers. Production-safe logging that doesn't leak user data.
- **Files to reference:** `src/utils/logger.ts`

### 19. Profile picture uploads with exponential backoff in React Native
- **Target:** August 3
- **Angle:** Upload flow with retry logic, old picture cleanup, file naming conventions, and custom error classes.
- **Files to reference:** `src/httpClients/SupabaseStorageClient.ts`

### 20. Semantic haptic feedback that respects accessibility
- **Target:** August 10
- **Angle:** useHapticFeedback hook with success/error/warning/selection patterns. Respects useReducedMotion so users who opt out don't get vibrations.
- **Files to reference:** `src/shared/hooks/useHapticFeedback.ts`, `src/shared/hooks/useReducedMotion.ts`

### 21. Storybook in React Native
- **Target:** August 17
- **Angle:** On-device component development with a dev menu toggle. Stories co-located with components.
- **Files to reference:** `.rnstorybook/`, `*.stories.tsx` files

## Web and DX Series

### 22. Building a multilingual blog with Astro
- **Target:** August 24
- **Angle:** 4 locales (EN/ES/CA/TL) with shared components, thin route files, same-slug language switching, and DEV-aware content scheduling (future posts visible on localhost, hidden in production).
- **Files to reference:** `src/components/blog/`, `src/pages/blog/`, `src/pages/es/blog/`, `src/utils/blogHelpers.ts`, `src/i18n/`

### 23. CSS-only blurred hero image fill
- **Target:** August 31
- **Angle:** Image capped at 1080px, blurred version fills the full viewport behind it. No JS, no image processing, works with any aspect ratio. The same technique YouTube uses for vertical videos.
- **Files to reference:** `src/components/blog/BlogPost.astro` (hero image CSS)

## Backlog

_Add ideas here as they come up. One heading per idea, with a few bullet points on the angle._
