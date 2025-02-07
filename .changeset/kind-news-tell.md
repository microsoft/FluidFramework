---
"@fluidframework/odsp-driver": minor
---
---
"section": other
---

odsp-driver no longer depends on node-fetch

The `@fluidframework/odsp-driver` package had a dependency on [node-fetch](https://www.npmjs.com/package/node-fetch) to provide consistent behavior of the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) across Node.js and browsers.
Since v18 of Node.js, the Node-native Fetch API implementation no longer requires extra flags to be enabled, so the Fetch API is effectively now natively available on all browsers and Node.js.
This dependency removal should reduce Fluid Framework's contribution to application bundle sizes.

We expect this change to have no impact for Fluid Framework consumers. However, if you are running Fluid in a Node.js environment with the `--no-experimental-fetch` flag, this is no longer supported.
