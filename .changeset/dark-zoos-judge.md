---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Plain and formatted text nodes support moving character ranges

The [PlainText.Members](https://fluidframework.com/docs/api/tree/plaintext-namespace/members-interface) API now exposes `moveRangeToIndex`, matching the existing [TreeArrayNode.moveRangeToIndex](https://fluidframework.com/docs/api/tree/treearraynode-interface#moverangetoindex-methodsignature) operation.
Both plain text and [formatted text](https://fluidframework.com/docs/api/tree/formattedtext-namespace/members-interface) nodes can now reorder ranges of text without removing and reinserting characters.

```typescript
import { PlainText } from "@fluidframework/tree/alpha";

const text = PlainText.Tree.fromString("abcdef");
text.moveRangeToIndex(4, 0, 2);
console.log(text.fullString()); // "cdabef"
```
