---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add a format validator for environments that disallow dynamic code generation

The new alpha `FormatValidatorInterpreted` validates persisted SharedTree data using TypeBox's JSON schema interpreter.
Unlike `FormatValidatorBasic`, it does not generate JavaScript functions at runtime, so it works with Content Security Policies that omit `unsafe-eval`.
Interpreted validation is slower than compiled validation, so applications without this restriction should continue to use `FormatValidatorBasic`.
SharedTree sandbox protocol validation now uses the interpreted validator so it also works in these restricted environments.

```typescript
import {
	FormatValidatorInterpreted,
	configuredSharedTreeAlpha,
} from "@fluidframework/tree/alpha";

const SharedTree = configuredSharedTreeAlpha({
	jsonValidator: FormatValidatorInterpreted,
});
```
