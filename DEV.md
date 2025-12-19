# Guidance for FluidFramework maintainers and contributors

## Dependencies

This document tracks dependencies that cannot be upgraded to their latest major versions due to technical limitations.

### Pinned

The following dependencies are pinned to older major versions because newer versions are incompatible with the current codebase.

#### ESM-only dependencies (Cannot upgrade while shipping CJS)

1. **uuid** - Pinned to `^11.x`
   - Latest: `^13.x`
   - Issue: Version 12+ removed CommonJS support entirely
   - Impact: FluidFramework packages ship dual ESM/CJS builds. When consumers `require()` our packages, the CJS output would fail to `require('uuid')` since uuid v12+ is ESM-only.
   - Used in: Many packages across the repo (telemetry-utils, container-loader, odsp-driver, etc.)
