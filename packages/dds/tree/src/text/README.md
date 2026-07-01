# Text

A collection of text related types, schema and utilities for working with text beyond the basic `SchemaStatics.string`.

## Status

Very early work in progress.
See doc comment on `TextAsTree` for more details.

## Extrinsic Ranges

### Challenges:

Editing semantics:

Assuming we want the behavior where Extrinsic Ranges have lifetime of tied to the container, not the content,
then deletions need to shrink the range they apply to, but never remove it fully.
This complications deletes (which contain all or part of the range) and moves.
Presumably a delete should just shorten the range, as should detaches, but if a portion is detached containing the entire range, and moved elsewhere in the same range, maybe it should move?
Maybe optionally detect such moves, and if some constraints pass, move the ranges with the main content?
Relations to anchors, cursors, presense?

Designs:

parallel array:
 - Anchor marker at location in placeholder array: doesn't handle deletes well.
 - before and after tokens in parallel array: how do inserts produce the correct token type? How about moves?


index field kind:
- Reuse code from sequence field kind (identical changeset logic, including rebase and ops)
- Child is just a number representing an index

Can we do better anchoring for better semantics? Does this require knowing both start and end, and maybe extra config inside the field, not just a single number?

### Bulk editing:

How does this work in our setup? Allow all nodes (or maybe fields) in changesets to be roots for structural bulk edits?
Do we need to make it more limited, like can only do edits which don't change the tree shape? (Like replace leaf nodes)


Extrinsic Ranges Update:



After some initial design exploration, I think its possible to implement:

An extrinsic range MVP leveraging the "NoChangeConstraint" which can maintain its data invariants. I think we can do this with no currently unreleased features (just needs sufficient min version for collab for the constraint). This will not be robust to AI editing of the data generally, but we can expose methods which are safe for it to use. (Won't work for agents without view schema, but I don't think that's a priority). We could either make the implementation minimal (just store index numbers) or a parallel array approach. Items below will assume the array version, but I'll provide a comparison of the approaches in more detail later.
Optimized encoding for the extrinsic ranges (Brennan's current work for optimizing text's codec should actually be sufficient)
Optimized in memory format and traversal for the parallel arrays similar to the encoded format for chunked forest.
Add a "no shallow change" constraint (also desired for tables): when using the parallel array approach, this can allow concurrent editing of the main range/string as well as comments: you just can't concurrently add and/or remove ranges.
Bulk editing op, to allow expressing an update to all ranges at once with a wild card. When this is supported we can disable the shallow change constraint and get full concurrency. I think there might still be some issues with edge cases around un-removal (like delete undo): that needs some further investigation. Part of this (which could be delivered first and not avoid the need for the constraint) could be done separately and makes the Ops more efficient and (which is important as each character typed produces one) and not scale with the number of ranges.

All of these can be done in parallel.



The 1-4 subset has relatively few unknowns (mostly around the now shallow change constraint, and possibly some complications with undo/redo) does not need any new kinds of things we don't know how to incrementally add/maintain/version (Just an optimized codec, and a new constraint gated by min version for collab), and should be sufficient as long as the number of ranges isn't particularly large.