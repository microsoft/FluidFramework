# Text

A collection of text related types, schema and utilities for working with text beyond the basic `SchemaStatics.string`.

## Status

Very early work in progress.
See doc comment on `PlainText` for more details.


## Extrinsic Ranges

### Challenges:

Editing semantics:

Assuming we want the behavior where Extrinsic Ranges have lifetime of tied to the container, not the content,
then deletions need to shrink the range they apply to, but never remove it fully.
This complications deletes (which contain all or part of the range) and moves.
Presumably a delete should just shorten the range, as should detaches, but if a portion is detached containing the entire range, and moved elsewhere in the same range, maybe it should move?
Maybe optionally detect such moves, and if some constraints pass, move the ranges with the main content?
Relations to anchors, cursors, presence?

Designs:

parallel array (rejected)
 - Anchor marker at location in placeholder array: doesn't handle deletes well.
 - before and after tokens in parallel array: how do inserts produce the correct token type? How about moves?


index field kind (accepted)
- Reuse code from sequence field kind (identical changeset logic, including rebase and ops)
- Child is just a number representing an index

Can we do better anchoring for better semantics? Does this require knowing both start and end, and maybe extra config inside the field, not just a single number?

### Bulk editing:

How does this work in our setup? Allow all nodes (or maybe fields) in changesets to be roots for structural bulk edits?
Do we need to make it more limited, like can only do edits which don't change the tree shape (Like replace leaf nodes)?
Changing the shape means rebased are more complex. 
Do the later parts of this work (which impact merge results, not just optimized encoding) need to wait for
ongoing rebaser/changeset work?

### Planed work

Currently actionable work (Phase 1):

1. An extrinsic range MVP leveraging the "NoChangeConstraint" which can maintain its data invariants. I think we can do this with no currently unreleased features (just needs sufficient min version for collab for the constraint). This will not be robust to AI editing of the data generally, but we can expose methods which are safe for it to use. (Won't work for agents without view schema, but I don't think that's a priority). This will just store index numbers. Share code with sequence to ensure matching behavior.
2. Schema versioning to allow for schema changes which change the filed kind without strict field kind ordering rules to prevent cycles.
3. Add Experimental (alpha) field kind: index. Support edits like "if larger than A, add B" (where A is adjusted when rebasing over other edits).
4. Ensure stabilization and rollout of new field kinds is practical and robust (good errors, no asserts etc.)
5. Generalize staged field kind changes (required to option is supported, add required vs identifier. One direction will depend on 2).
6. Implement shallow "NoChangeConstraint" (also desired for tables)
7. "Drill down" aka "Batch" editing: way to apply same edit to all nodes at a path which can include wildcards and/or ranges. Also consider table and range formatting use-cases in design.
8. Work through the merge edge cases of planned final design (see below). Validate undo/redo. Determine implications of moves within character and range arrays. Consider cases where range ends can get swapped.
9. Design a safe rollout process for production apps using text without extrinsic ranges to get extrinsic range support.
10. Design anchors for presence (Not really part of this work, but has some overlap).
11. Ensure we have ways to hide fields from AI, not just expose methods to protected invariants.
12. Write command pattern demo with showing how to have telemetry for failure, and how one could implement retry.

These can all be done in parallel.

Later:
These can overlap with phase one, but have some minimal dependency on parts of it and each-other.

1. Factor out Utilities for implementing terminal (no edits below them) and/or "static" (no edit to them can impact paths to content below them field kinds). Consider using for identifier field kind. Use for new "index" field kind. Add counter as a trivial feature using this as well (demo in inventory app). Should support multiple children: make things like a range kind with 2 children (start and end) easier we end up having to do that. Using this to add range start and range end, or fields with other kinds of anchoring are also options.
2. Improve MVP concurrency 1: (Optional: Skip is shallow change constraint is ready): Use index field kinds for range ends. Add dummy child node to range container, which is replaced for every change to the set of ranges (adding or removing a range). Replace "NoChangeConstraint" with "NodeInDocumentConstraint" pointing to current dummy node.
2. Improve MVP concurrency 2: (Optional: Skip is shallow change constraint is ready): Use index field kinds for range ends. Replace above dummy node scheme with no shallow change constraint pointing at array of ranges.
3. Improve MVP concurrency 3: Replace constraints with "Drill down" editing of index fields. No more rejected transactions.
4. Deliver stable APIs, including safe rollout/evolution for existing text users.
5. Presence integration for arrays. Maybe share some logic with new field kind[s]? (Not really part of this work, but has some overlap)