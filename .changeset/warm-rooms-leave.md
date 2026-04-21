---
"@fluidframework/container-runtime": minor
"__section": breaking
---

Container runtime instantiation now requires `navigator` to be defined in the runtime environment

The internal `getDeviceSpec()` function, which is called during container runtime instantiation to report hardware telemetry, no longer guards against `navigator` being `null` or `undefined`. This means loading a container runtime requires either a browser environment or Node 22+, both of which provide a built-in `navigator` global. Environments that do not provide `navigator` (e.g., older versions of Node.js) will encounter a runtime error when instantiating the container runtime.

This requirement aligns with the recent migration of the repo to Node 22 per our standing Node upgrade policy. Node 20 reaches end-of-life on April 30, 2026.
