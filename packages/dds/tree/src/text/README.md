# Text

A collection of text related types, schema and utilities for working with text beyond the basic `SchemaStatics.string`.

## Status

`@alpha` work in progress.

## Formatted text with tracked ranges

Use `FormattedText.createSchemaWithRanges` from `@fluidframework/tree/alpha` to attach application-defined data to ranges of formatted text.
It accepts the same arguments as `FormattedText.createSchema`, followed by the schema for range data.
The existing text editing and formatting APIs remain available.

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

The `ranges` property returns a stable, live `RangeCollection`.
Use `ranges.getRange(key)` to look up a range and `ranges.keys()` to enumerate keys in unspecified order.
Use `ranges.setRangeBounds(key, { start, end })` to reposition a range and `ranges.removeTrackedRange(key)` to remove it without changing the text.
Range handles expose live, read-only `start` and `end` properties, and their `data` follows the supplied schema.
Copy the endpoints to retain a snapshot.
Handles refer to particular ranges, not subsequent ranges created at the same key.
Reading an endpoint throws a `UsageError` if its range was removed or replaced.
Undo that restores the same range makes the handle valid again.
Repeated lookups need not return the same handle object.

Positions count text atoms, not UTF-16 code units.
Each Unicode code point in a string becomes one atom; embedded objects and custom multi-character atoms each occupy one position.
Ranges use half-open intervals with insertion-point semantics: insertion at the start is excluded, insertion at the end is included, and empty ranges remain empty.
Removing text collapses covered endpoints to the removal start.
Moving text does not move its ranges to the destination.
Formatting alone does not change endpoints.

### Upgrade existing formatted text

The new factory preserves the existing text, content-array, and formatted-atom schema identifiers and adds an optional range collection.
To upgrade, keep the same factory scope, format schema, and allowed atom schemas as the existing `createSchema` call.
Open a view with the new schema and explicitly call `view.upgradeSchema()` when `view.compatibility.canUpgrade` is true.
This schema upgrade does not rewrite existing text or formatting.
Existing text starts with no ranges, and reading `ranges` does not create stored data.
The first range edit or structural text edit creates the collection within the same transaction as the edit.

Views using the old schema become incompatible after the upgrade.
Do not keep old writers active: they do not update range endpoints.
The original `createSchema` factory retains its existing stored schema and editing behavior.

### Collaboration and events

Configure SharedTree with `minVersionForCollab` of at least `2.80.0`.
Structural text edits and range edits run in transactions with document-wide `noChange` constraints, including on revert.
These constraints also apply before the first range exists, so an edit cannot race with range creation and leave stale endpoints.
Concurrent document changes can reject the whole transaction rather than merge it.
An intervening change can also reject undo or redo.
Formatting-only edits do not need range-tracking transactions.

Content events are delivered synchronously without buffering.
Reentrant structural edits on the same text are not supported.
During a structural edit, endpoint reads use temporary array insertion anchors.
There is a known anchor event-ordering limitation: a change listener registered before these anchors can observe their previous positions.
After the editing method returns, the stored endpoints are current.
