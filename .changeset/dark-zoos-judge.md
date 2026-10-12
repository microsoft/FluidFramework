---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Plain and formatted text nodes support moving character ranges

The `PlainText.Members` API now exposes `moveRangeToIndex`, matching the equivalent `TreeArrayNode` operation.
Because `FormattedText.Members` extends `PlainText.Members`, both plain and formatted text nodes can now reorder ranges of text without removing and reinserting characters.

The destination gap is a position between characters before the move, not an index in the resulting text.
For example, moving `"ab"` between `"d"` and `"e"` uses destination gap `4`:

```typescript
import { PlainText } from "@fluidframework/tree/alpha";

const text = PlainText.Tree.fromString("abcdef");
text.moveRangeToIndex(4, 0, 2);
console.log(text.fullString()); // "cdabef"
```
