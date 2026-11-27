---
"@fluid-tools/build-cli": minor
"__section": fix
---

Fixed `flub modify fluid-imports` to select the most stable package entry point that actually exports each imported API.

The modifier now checks public, beta, legacy, alpha, and internal entry points independently instead of inferring API membership from `/internal`.
