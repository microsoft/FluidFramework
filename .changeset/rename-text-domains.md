---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Rename the TextAsTree domain to PlainText

The experimental (`@alpha`) text domain namespace exported from `@fluidframework/tree` has been renamed: `TextAsTree` is now `PlainText`.
This is a breaking rename.

Consumers should update their imports and usages accordingly. For example:

```typescript
// Before
import { TextAsTree } from "@fluidframework/tree/alpha";
const node = TextAsTree.Tree.fromString("hello");

// After
import { PlainText } from "@fluidframework/tree/alpha";
const node = PlainText.Tree.fromString("hello");
```

The persisted schema identifiers for this domain are unchanged, so existing documents remain compatible.
