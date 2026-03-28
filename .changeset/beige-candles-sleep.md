---
"fluid-framework": minor
"@fluidframework/presence": minor
"__section": deprecation
---
getPresence is being relocated from @fluidframework/presence to the fluid-framework package

To prepare, make changes following this pattern:
```diff
-import { getPresence } from "@fluidframework/presence/beta";
+import { getPresence } from "fluid-framework/beta";
```

See [issue #26397](https://github.com/microsoft/FluidFramework/issues/26397) for more details.
