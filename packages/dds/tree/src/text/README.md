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
const { start, end } = comment; // start.index === 11, end.index === 16
text.formatRange(start.index, end.index, { bold: true });
text.getString(start.index, end.index); // "world"
comment.data = { message: "Updated review comment" };
```

The `ranges` property returns a stable, live `ExtrinsicLocations.RangeCollection`.
Use `ranges.getRange(key)` to look up a range and `ranges.keys()` to enumerate keys in unspecified order.
Use `ranges.setRangeBounds(key, { start, end })` to reposition a range and `ranges.removeTrackedRange(key)` to remove it without changing the text.
Each `ExtrinsicLocations.TrackedRange` exposes borrowed `ArrayPlaceAnchor` endpoints through its read-only `start` and `end` properties.
Read `start.index` and `end.index` for current positions; copy those numbers to retain a snapshot.
Do not dispose the anchors: doing so throws a `UsageError`. Remove the range through its collection instead.
Assign `data` to replace it with content matching the supplied schema, or edit fields within object data.
Data edits preserve the range's identity and endpoints.
Handles refer to particular ranges, not subsequent ranges created at the same key.
Reading an endpoint index or assigning data throws a `UsageError` if its range was removed or replaced.
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
Structural text edits, range creation/removal, and bound changes run in transactions with document-wide `noChange` constraints, including on revert.
These constraints also apply before the first range exists, so an edit cannot race with range creation and leave stale endpoints.
Concurrent document changes can reject the whole transaction rather than merge it.
An intervening change can also reject undo or redo.
Formatting-only edits and range data edits do not need range-tracking transactions.

Content events are delivered synchronously without buffering.
Reentrant structural edits on the same text are not supported.
Structural editing methods track content edits and update ranges automatically, as described in [`transactOnContent`](../extrinsic-locations/extrinsicLocationsNamespace.ts).
Adding or removing ranges in this text's collection or explicitly changing their bounds during these calls throws a `UsageError`.
Reading ranges and editing their data remain allowed.
There is a known anchor event-ordering limitation: a change listener registered before these anchors can observe their previous positions.
After the editing method returns, the stored endpoints are current.
