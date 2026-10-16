---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Capture and resolve presence positions in plain and formatted text

The alpha `TreeLocationResolver.captureGap` method and `kind: "sequence"` capture inputs now accept `PlainText.Tree` and schemas produced by `FormattedText.createSchema`, including subclasses, as well as array nodes.

```typescript
const selection = view.locations.captureGap(view.root.text, 2, { affinity: "after" });
// selection can be resolved on another client, typically after being sent as a signal using presence APIs.
const result = otherView.locations.resolve(selection);
```

Text-based gap locations treat the string as a sequence of characters and have semantics analogous to those documented for sequences.
Their resolved indices are character indices within the string (see the documentation on `PlainText.Members` for the distinction between character indices and UTF-16 code-unit indices).
