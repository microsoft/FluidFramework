---
"@fluidframework/odsp-client": patch
---

Limit @fluidframework/odsp-client base imports to public APIs.

Change enforces that use of @beta or @alpha APIs from @fluidframefork/osdp-client must use "@fluidframework/osdp-client/beta" or "/alpha", relatively, at build time. To recover from import breaks picking up this change, either add "/beta" or "/alpha" to import path or run "flub modify fluid-imports" (see [updating code using non-public Fluid APIs (wiki)](https://github.com/microsoft/FluidFramework/wiki/Updating-code-using-legacy-Fluid-APIs)).
