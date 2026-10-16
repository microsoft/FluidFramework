---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Track annotations across array and formatted text edits

The new alpha APIs `ArrayWithExtrinsicRanges` and `FormattedText.createSchemaWithRanges` let you associate application-defined data, such as review comments, with ranges that update as you edit content.
Both expose a live `RangeCollection` through a `ranges` property.
Configure SharedTree with `minVersionForCollab` of at least `2.80.0`.

#### Formatted text

`FormattedText.createSchemaWithRanges` accepts the same arguments as `FormattedText.createSchema`, followed by a schema for range data.
Existing text editing methods update range endpoints automatically, and formatting does not change them.
Positions count text atoms, not UTF-16 code units.

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
const comment = text.ranges.trackNewRange(
	"comment",
	{ start: 6, end: 11 },
	{ message: "Review this word" },
);
text.insertAt(0, "Say: ");
const { start, end } = comment; // { start: 11, end: 16 }
text.formatRange(start, end, { bold: true });
text.getString(start, end); // "world"
```

To upgrade existing formatted text, keep the same factory scope, formatting schema, and atom schemas, then open a view using the range-enabled schema and call `view.upgradeSchema()`.
The upgrade adds optional range storage without rewriting text or formatting.
Reading ranges does not create data; the first structural text edit or range edit initializes storage transactionally.
Old views become incompatible after the upgrade because their writers cannot maintain ranges.
The original `FormattedText.createSchema` factory is unchanged.

#### Arrays

Use `ArrayWithExtrinsicRanges.createSchema` to create a scoped schema and read its content as a `ReadonlyArrayNode`.
Edit content with `transactOnContent`, which supplies the mutable array API and maintains ranges across insertions, removals, and moves.

```typescript
import {
	ArrayWithExtrinsicRanges,
	SchemaFactoryBeta,
	TreeViewConfiguration,
	createIndependentTreeAlpha,
} from "@fluidframework/tree/alpha";

const sf = new SchemaFactoryBeta("com.example.review");
class Comment extends sf.object("Comment", { message: sf.string }) {}
class Document extends ArrayWithExtrinsicRanges.createSchema(sf, Comment, sf.string) {}

const view = createIndependentTreeAlpha({ minVersionForCollab: "2.80.0" }).viewWith(
	new TreeViewConfiguration({ schema: Document }),
);
view.initialize(Document.create(["Plan", "Build", "Ship"]));
const document = view.root;
const comment = document.ranges.trackNewRange(
	"comment",
	{ start: 1, end: 3 },
	{ message: "Check these steps" },
);
document.transactOnContent((content) => content.insertAt(0, "Design"));
const { start, end } = comment; // { start: 2, end: 4 }
document.content.slice(start, end); // ["Build", "Ship"]
```

The callback must be synchronous, and you must not retain the mutable array for later edits.
Callbacks on the same manager cannot be nested.
For moves between managed arrays, nest both managers' callbacks so both sets of ranges are maintained.
Stored endpoints are synchronized before `transactOnContent` returns.

#### Shared range behavior

Use `RangeCollection` to create, look up, reposition, and remove ranges, and enumerate keys.
Range handles expose live, read-only `start` and `end` properties and editable application-defined data.
Copy endpoints to retain a snapshot.
Handles remain bound to their original range; reading endpoints after removal or replacement throws a `UsageError`.

Ranges use half-open intervals `[start, end)`.
Insertion at the start is excluded, insertion at the end is included, and empty ranges stay empty.
Removing all covered content collapses a range without deleting its data.
Ranges remain with their array or text rather than following moved content.

#### Early implementation limitations

All writers must use these APIs instead of modifying the underlying stored fields.
Structural edits and range edits use document-wide `noChange` transaction constraints, so concurrent changes anywhere in the document can reject the entire edit.
Observe commit outcomes if your application needs to report or retry rejected edits.
Undo also requires the document to be unchanged since the edit; selective undo across intervening edits can be rejected.

Content events are not buffered.
Range handles use temporary anchors to resolve positions while editing.
A known anchor event-ordering bug can cause change-event listeners registered before the editing scope to read stale positions, including for formatted text.
Reads after an edit returns within an array callback are current.
Reentrant structural edits on the same text are not supported.
