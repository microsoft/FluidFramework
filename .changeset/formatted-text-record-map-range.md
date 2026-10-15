---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Support record and map formatting in formatted text ranges

`FormattedText.Members.formatRange` now supports record and map format nodes in addition to object format nodes.
Updates preserve entries not included in the update.
Set an entry to `undefined` to remove it.
Map formats accept either an object containing entries or a readonly map.

```typescript
text.formatRange(0, 5, { bold: true });
text.formatRange(0, 5, { bold: undefined });
// For map formats:
text.formatRange(0, 5, new Map([["bold", true]]));
```
