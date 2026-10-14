---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Track application-defined ranges through formatted text edits

The alpha API `FormattedText.createSchemaWithRanges` accepts the same arguments as `FormattedText.createSchema`, followed by a schema for range data.
It adds `ranges` snapshots and methods to add, read, reposition, and remove range handles.
Existing text editing methods update range endpoints automatically, and formatting does not change them.

```typescript
import {
	FormattedText,
	SchemaFactoryBeta,
	TreeViewConfiguration,
	createIndependentTreeAlpha,
} from "@fluidframework/tree/alpha";

const sf = new SchemaFactoryBeta("com.example.annotatedText");
class Format extends sf.object("Format", { bold: sf.boolean }) {}
class Comment extends sf.object("Comment", { message: sf.string }) {}
class Text extends FormattedText.createSchemaWithRanges(
	sf,
	Format,
	[],
	{ bold: false },
	Comment,
) {}

const view = createIndependentTreeAlpha({ minVersionForCollab: "2.80.0" }).viewWith(
	new TreeViewConfiguration({ schema: Text }),
);
view.initialize(Text.fromString("Hello world"));
const text = view.root;
const comment = text.addExtrinsicRange(6, 11, { message: "Review this word" });

text.insertAt(0, "Say: ");
const { start, end } = text.getExtrinsicRange(comment); // { start: 11, end: 16 }
text.formatRange(start, end, { bold: true });
text.getString(start, end); // "world"
```

Range positions count text atoms, not UTF-16 code units.
Insertion at the start of a range is excluded, insertion at its end is included, and empty ranges remain empty.
Ranges stay with their text rather than follow moved atoms.

To upgrade existing formatted text, keep the same factory scope, formatting schema, and atom schemas, then open a view using the range-enabled schema and call `view.upgradeSchema()`.
The upgrade adds optional range storage without rewriting text or formatting.
Reading ranges does not create data; the first structural text edit or range edit initializes storage transactionally.
Old views become incompatible after the upgrade because their writers cannot maintain ranges.
The original factory is unchanged.

Configure SharedTree with `minVersionForCollab` of at least `2.80.0`.
Structural text edits and range edits use document-wide `noChange` constraints, including on revert, so concurrent changes can reject the entire edit.
Content events are not buffered.
Reentrant structural edits on the same text are not supported.
The known array-anchor event-ordering limitation also applies to endpoint reads inside change-event listeners.
