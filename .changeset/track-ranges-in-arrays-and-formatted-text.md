---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Track annotations across array and formatted text edits

You can now track ranges with application-defined data, such as review comments, through edits to arrays and [`FormattedText`](https://fluidframework.com/docs/api/tree/formattedtext-namespace).
The new alpha APIs `ExtrinsicLocations.createArraySchema` and `FormattedText.createSchemaWithRanges` provide this capability.
Both expose a live `ExtrinsicLocations.RangeCollection` through a `ranges` property.
Configure SharedTree with `minVersionForCollab` of at least `2.80.0`.

#### Formatted text

`FormattedText.createSchemaWithRanges` accepts the same arguments as [`FormattedText.createSchema`](https://fluidframework.com/docs/api/tree/formattedtext-namespace#createschema-function), followed by a schema for range data.
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
const { start, end } = comment; // start.index === 11, end.index === 16
text.formatRange(start.index, end.index, { bold: true });
text.getString(start.index, end.index); // "world"
comment.data = { message: "Updated review comment" };
```

To upgrade existing formatted text, keep the same factory scope, formatting schema, and atom schemas, then open a view using the range-enabled schema and call [`view.upgradeSchema()`](https://fluidframework.com/docs/api/tree/treeview-interface#upgradeschema-methodsignature).
The upgrade adds optional range storage without rewriting text or formatting.
Reading ranges does not create data; the first structural text edit or range edit initializes storage transactionally.
Old views become incompatible after the upgrade because their writers cannot maintain ranges.
The original `FormattedText.createSchema` factory is unchanged.

#### Arrays

Use `ExtrinsicLocations.createArraySchema` to create a scoped schema and read its content as a [`ReadonlyArrayNode`](https://fluidframework.com/docs/api/tree/readonlyarraynode-interface).
Edit content with `transactOnContent`, which supplies the mutable [`TreeArrayNode`](https://fluidframework.com/docs/api/tree/treearraynode-interface) API and maintains ranges across insertions, removals, and moves.

```typescript
import {
	ExtrinsicLocations,
	SchemaFactoryBeta,
	TreeViewConfiguration,
	createIndependentTreeAlpha,
} from "@fluidframework/tree/alpha";

const sf = new SchemaFactoryBeta("com.example.review");
class Comment extends sf.object("Comment", { message: sf.string }) {}
class Document extends ExtrinsicLocations.createArraySchema(sf, Comment, sf.string) {}

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
const { start, end } = comment; // start.index === 2, end.index === 4
document.content.slice(start.index, end.index); // ["Build", "Ship"]
```

The callback must be synchronous, and you must not retain the mutable array for later edits.
Callbacks on the same manager cannot be nested.
For moves between managed arrays, nest both managers' callbacks so both sets of ranges are maintained.
Stored endpoints are synchronized before `transactOnContent` returns.

#### Shared range behavior

Use `ExtrinsicLocations.RangeCollection` to create, look up, reposition, and remove ranges, and enumerate keys.
Each `ExtrinsicLocations.TrackedRange` exposes borrowed `ArrayPlaceAnchor` endpoints through its read-only `start` and `end` properties.
Read `start.index` and `end.index` for current positions; copy those numbers to retain a snapshot.
Do not dispose these anchors: doing so throws a `UsageError`. Remove the range with `removeTrackedRange` instead.
Assign `data` to replace the associated data, or edit fields within object data, without changing the range's identity or endpoints.
Handles remain bound to their original range; reading endpoint indexes or assigning data after removal or replacement throws a `UsageError`.

Ranges use half-open intervals `[start, end)`.
Insertion at the start is excluded, insertion at the end is included, and empty ranges stay empty.
Removing all covered content collapses a range without deleting its data.
Ranges remain with their array or text rather than following moved content.

#### Early implementation limitations

All writers must use these APIs instead of modifying the underlying stored fields.
Structural content edits, range creation/removal, and bound changes use document-wide `noChange` transaction constraints, so concurrent changes anywhere in the document can reject the entire edit.
Data edits use ordinary tree editing semantics and do not add these constraints.
Observe commit outcomes if your application needs to report or retry rejected edits.
Undo also requires the document to be unchanged since the edit; selective undo across intervening edits can be rejected.

Content events are not buffered.
Range handles use temporary anchors to resolve positions while editing.
A known anchor event-ordering bug can cause change-event listeners registered before the editing scope to read stale positions, including for formatted text.
Reads after an edit returns within an array callback are current.
Reentrant structural edits on the same text are not supported.
