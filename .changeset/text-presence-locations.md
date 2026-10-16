---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Capture and resolve presence positions in plain and formatted text

The alpha `TreeLocationResolver.captureGap` method and `kind: "sequence"` capture inputs accept `PlainText.Tree` and schemas produced by `FormattedText.createSchema`, including subclasses, as well as array nodes.
Resolution returns the receiving client's public text node, the current gap index, and the effective affinity.
Use `kind: "node"` to select an entire text node instead.
Text gap resolution returns `kind: "text"`; array gap resolution returns `kind: "sequence"`.

```typescript
const selection = view.locations.captureGap(view.root.text, 2, { affinity: "after" });
// Send selection through the application's presence transport.
const result = otherView.locations.resolve(selection);
```

Single and array overloads support text locations.
Each capture is independently serializable, and arrays can combine text, node, and sequence captures from different revisions.

Indices use the same coordinates as text editing methods: gaps from zero through `characterCount()`, inclusive.
Plain text normally counts Unicode code points.
Formatted text counts independently editable atoms, including embedded objects.
There is no implicit UTF-16 or grapheme conversion, and no position inside an atom.

Text locations follow moved characters to their current text owner, even if the original text node is deleted.
If the destination is an ordinary array without a supported text owner, resolution returns a `kind: "sequence"` location.
Captures made from array nodes remain array-oriented.
Applications that exhaustively handle resolved location kinds must also handle `"text"`.
This change does not add text move methods.
Existing capture restrictions and opaque, JSON-serializable presence data are unchanged.
