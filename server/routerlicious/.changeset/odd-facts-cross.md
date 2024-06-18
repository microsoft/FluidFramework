---
"@fluidframework/server-routerlicious-base": "minor"
---

server-routerlicious-base: Remove Riddler HTTP request for performance

The `getOrderer` workflow no longer calls `getTenant` when `globalDb` is enabled. This saves two HTTP calls to Riddler
and will improve performance.

You can find more details in [pull request #20773](https://github.com/microsoft/FluidFramework/pull/20773).
