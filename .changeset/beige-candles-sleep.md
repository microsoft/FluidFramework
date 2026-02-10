---
"fluid-framework": minor
"@fluidframework/presence": minor
"__section": deprecation
---
getPresence is being relocated to fluid-framework package away from @fluidframework/presence

To prepare, make changes following this pattern:
```diff
-import { getPresence } from "@fluidframework/presence/beta";
+import { getPresence } from "fluid-framework/beta";
```

See [issue #26397](https://github.com/microsoft/FluidFramework/issues/26397) for more details.
