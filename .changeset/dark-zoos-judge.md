---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Plain and formatted text nodes support moving character ranges

The `PlainText.Members` API now exposes `moveRangeToIndex`, matching the equivalent `TreeArrayNode` operation.
Because `FormattedText.Members` extends `PlainText.Members`, both plain and formatted text nodes can now reorder ranges of text without removing and reinserting characters.
