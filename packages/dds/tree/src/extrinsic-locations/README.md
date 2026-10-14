# Extrinsic Locations

Utilities for storing locations of content in a tree as data elsewhere in the same tree.
Cases which need to store locations outside of the tree, or in memory are out of scope here, as they have very different requirements.

There are a few different options for how this could work:

1. We provide no special editing functionality, and users simply encode the positions somehow, and update them as necessary.

2. A format for locations with is persistable outside trees is used. For example a path to the location, and some identifier for the exact commit/revision that path was valid in. Then, assuming sufficient history is available, this can be rebased as needed to get a location in the current revision.

3. We provide first class support for the needed location types.
APIs are provided for the supported location schema types.
These schema can be used to store locations in the tree, and allow look up the position in the current version of the tree.
Behind the scenes, this could be implemented using either of the above two approaches, or some combination (like persisting them and the current location in the current revision, but storing and lazily updating them as needed them as a location + commit reference in memory).

4. You put something at the location in the tree you can search for, for example with an index. Putting an identifier on a node, then storing that identifier to look up where that node is is an example of this. This has overhead (extra data in the tree, and maintaining the index), and doesn't handle places in arrays in all cases.

Option 2 is only valid if you have sufficient history available to rebase them. That is suitable for use in Presence, but not a good fit for use as content in trees as needed for this Extrinsic Locations feature.

Option 1 is an excellent fit for in memory (non persisted) locations.
By subscribing to changes, they can be kept up to date.
For in memory locations which are nodes, holding onto a TreeNode accomplishes this, and the ArrayPlaceAnchor feature does array place locations (These amount to build in first class support, Option 3, built on-top of Option 1).

For data locations actually stored in trees which need to include support for array place and range type locations (eliminating option 4), first class support (option 3) would be nice, but it adds a lot of complexity, since unlike in the in memory case, all the update logic has to be stable and identical across all clients, including on branches for which we don't have a forest. This gets particularly problematic with incremental summaries and eventual partial checkout support and would most likely require storing all history information to allow replacing old locations to the current revision (which would have to be available synchronously if we wanted synchronous location resolution) which would defeat out ability to do partial checkouts, or downloading and keeping in memory at all tracked locations.
Theoretically some optimizations could be done by knowing where locations can be stored in the tree and what parts of the tree they are allowed to refer to to make partial checkouts still possible, but it complicates things a lot.

Instead, the current plan is to pursue option 1 and iteratively refine the experience by adding and improving various features and APIs and performance for applications to use to maintain data invariants and while doing the needed kinds of edits.
The idea is this approach gives the minimal functionality very early to unblock users.
Then we provide a series of generally useful SharedTree features and optimizations which we want to do anyway.
Collectively these improvements should get extrinsic location support point of being acceptable for production,
while greatly improving lots of other use-cases along the way.

Theoretically a followup to do option 3 could be done to provide a further improved experience if desired and the funding to address its challenges is provided.
At the point where that would be done, concrete usage pattern from real apps will be known and performance data for them can be collected.
Additionally we may have more information about needs or plans regarding partial document support at that point,
and/or have done other work which has similar interactions with partial documents support (like narrowing schema changes) or persisted indexes.
Thus we will be able to make a more informed choice about if and how to pursue option 3 at that point.

## Status

Early `@alpha` work in progress.

For now, work is focused on `Extrinsic Ranges`.

Currently the initial support is an extrinsic range manager node wraps both the array and a collections of ranges, which it keeps up to date when you edit the array through it.
See [arrayWithExtrinsicRangesDomain.ts](./arrayWithExtrinsicRangesDomain.ts)

For now everything in the implementation and the rest of this document is focused on "option 1" from above, where the application (with the help from the utilities we include in this directory) maintains the data invariants by updating both the locations as needed.

## Challenges:

Editing semantics:

Assuming we want the behavior where Extrinsic Ranges have lifetime of tied to the container, not the content,
then deletions need to shrink the range they apply to, but never remove it fully.
This complicates deletes (which contain all or part of the range) and moves.
Presumably a delete should just shorten the range, as should detaches, but if a portion is detached containing the entire range, and moved elsewhere in the same range, maybe it should move?
Maybe optionally detect such moves, and if some constraints pass, move the ranges with the main content?
Relations to anchors, cursors, presence?

Designs:


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
2. Schema versioning to allow for schema changes which change the field kind without strict field kind ordering rules to prevent cycles.
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
2. Improve MVP concurrency 1: (Optional: Skip if shallow change constraint is ready): Use index field kinds for range ends. Add dummy child node to range container, which is replaced for every change to the set of ranges (adding or removing a range). Replace "NoChangeConstraint" with "NodeInDocumentConstraint" pointing to current dummy node.
2. Improve MVP concurrency 2: (Optional: Skip if shallow change constraint is ready): Use index field kinds for range ends. Replace above dummy node scheme with no shallow change constraint pointing at array of ranges.
3. Improve MVP concurrency 3: Replace constraints with "Drill down" editing of index fields. No more rejected transactions.
4. Deliver stable APIs, including safe rollout/evolution for existing text users.
5. Presence integration for arrays. Maybe share some logic with new field kind[s]? (Not really part of this work, but has some overlap)

## Historical Decisions

### Rejected Parallel Array Design

One idea for tracking positions in an array was to store a dummy array for each range, and apply the same edits to it.
Markers in the dummy array could represent the range.
This does not handle deletes and thus the design was rejected.

### Focus on Option 1 (app does edits to maintain locations)

The choice to focus on this approach is motivated by the ability to have a quickly deliverable MVP,
following by incremental delivery of improvements through which also benefit other scenarios.

When compared option 3 (true native location/reference support) also avoids complicating possible future partial checkout support,
and generally avoids a lot of unknowns and complexity and thus reduces risk for the project.
Doing option 2 as additional work in the future is still an option:
doing option 1 first mostly front loads useful features we would want anyway even if doing option 3 later,
so its not wasting a lot or work nor incurring a large support burden.
