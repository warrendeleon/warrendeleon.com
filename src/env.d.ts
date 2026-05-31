/// <reference types="astro/client" />

// Analytics event helper. Defined as a global in BaseLayout's `is:inline` script
// (fires Google Analytics + Umami); declared here so the module-scoped client
// scripts that call it typecheck against it.
declare function t(event: string, data?: Record<string, unknown>): void;
