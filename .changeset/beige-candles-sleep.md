---
"fluid-framework": minor
"@fluidframework/presence": minor
"__section": deprecation
---
`getPresence` from `@fluidframework/presence` is deprecated and will be removed in a future release.

Now `getPresence` is available for import from the `fluid-framework` package.

To prepare, make changes following this pattern:
```diff
-import { getPresence } from "@fluidframework/presence/beta";
+import { getPresence } from "fluid-framework";
```

See [issue #26397](https://github.com/microsoft/FluidFramework/issues/26397) for more details.
