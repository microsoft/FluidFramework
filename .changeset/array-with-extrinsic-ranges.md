---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Track ranges and their data across array edits

The new alpha `ArrayWithExtrinsicRanges` API lets you associate application-defined data, such as review comments, with ranges in an array.
Create a scoped schema and read its content directly as a `ReadonlyArrayNode`.
Edit content with `transactOnContent`, which supplies the mutable array API and keeps range endpoints consistent with insertions, removals, and moves.
Read current endpoint snapshots through `getExtrinsicRange` rather than fields on range handles.
Removing all content covered by a range collapses the range without deleting its data.

The following example is also covered by an executable test:

```typescript
import { strict as assert } from "node:assert";

import {
	ArrayWithExtrinsicRanges,
	SchemaFactoryBeta,
	TreeArrayNode,
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
const comment = document.addExtrinsicRange(1, 3, { message: "Check these steps" });
document.transactOnContent((content) => {
	content.insertAt(0, TreeArrayNode.spread(["Design", "Review"]));
	const { start, end } = document.getExtrinsicRange(comment);
	assert.deepEqual([start, end], [3, 5]);
	assert.deepEqual(content.slice(start, end), ["Build", "Ship"]);
});

document.transactOnContent((content) => content.removeRange(3, 5));
assert.deepEqual(document.getExtrinsicRange(comment), { start: 3, end: 3 });
assert.equal(document.ranges[0], comment);
assert.equal(comment.data.message, "Check these steps");

document.setExtrinsicRange(comment, 2, 3);
comment.data.message = "Check the plan instead";
const position = document.getExtrinsicRange(comment);
assert.deepEqual(document.content.slice(position.start, position.end), ["Plan"]);
document.removeExtrinsicRange(comment);
assert.equal(document.ranges.length, 0);
view.dispose();
```

This is an early implementation.
Configure SharedTree with `minVersionForCollab` of at least `2.80.0`.
All writers must use these methods instead of modifying the underlying stored fields.
Each structural edit uses a document-wide `noChange` transaction constraint, so concurrent changes anywhere in the document can reject the whole edit.
Observe commit outcomes if your application needs to report or retry rejected edits.
Undo also requires the document to be unchanged since the edit; selective undo across intervening edits can be rejected.
The callback must be synchronous, and the mutable array must not be retained for later edits.
Content events are delivered normally during the callback; stored endpoints are synchronized before `transactOnContent` returns.
Manager methods use temporary anchors to resolve positions while editing.
A known anchor event-ordering bug can cause change-event listeners registered before the editing scope to read stale positions; reads after an edit returns within the callback are current.
Callbacks on the same manager cannot be nested.
For moves between managed arrays, nest both managers' callbacks so both sets of ranges are maintained.
Ranges remain with their manager rather than following moved content.

Ranges use half-open intervals `[start, end)`.
An insertion at either endpoint moves that endpoint after the new content:
insertion at the start is excluded, insertion at the end is included, and empty ranges stay empty.
