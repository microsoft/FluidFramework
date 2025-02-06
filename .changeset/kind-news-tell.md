---
"@fluidframework/odsp-driver": minor
---
---
"section": other
---

Removed dependency on node-fetch

The dependency on `node-fetch` has been removed in favour of native-fetch, which is available in all major browsers. Since v18 of Node, it doesn't require any extra flags when invoking the `node` executable. This should reduce Fluid's bundle size.

No impact is expected from this change, with the single exception of consumers running Fluid in a Node environement. with `--no-experimental-fetch`, which is not supported going forward.
