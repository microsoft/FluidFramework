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

Instead, **the current plan is to pursue option 1 and iteratively refine the experience by adding and improving various features and APIs and performance** for applications to use to maintain data invariants and while doing the needed kinds of edits.
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

Extrinsic ranges for arrays and formatted text are available as an early `@alpha` minimum viable product (MVP) and are not yet production-ready.

See [Planned work](#planned-work) for implementation progress and future design plans.

## Usage

For arrays, see the API documentation in [extrinsicLocationsNamespace.ts](./extrinsicLocationsNamespace.ts) and the [executable usage example](../test/extrinsic-locations/arrayWithExtrinsicRanges.example.spec.ts).
For formatted text, see the [text documentation](../text/README.md).

## Current MVP limitations

The current MVP has the following requirements and limitations:

- SharedTree must be configured with `minVersionForCollab` of at least `2.80.0`.
- Concurrent changes anywhere in the document can reject an entire structural content edit, range creation/removal, or bound change, even when the changes affect unrelated content.
  Applications that need to report or retry rejected edits must observe commit outcomes.
  Undo and redo can also be rejected after intervening changes.
  Range data edits use ordinary tree editing semantics and do not add these constraints.
- All writers must use the provided content and range editing APIs to keep range endpoints correct.
  Other view schemas, import operations, or agents can bypass these APIs and leave stale endpoints.
- Content-editing callbacks must be synchronous, and editing scopes on the same array cannot be nested.
  Mutable content arrays obtained through a callback must not be used for editing outside that callback.
- Adding or removing ranges and explicitly changing their bounds during calls to [`transactOnContent`](./extrinsicLocationsNamespace.ts) or structural formatted-text editing methods throws a `UsageError`.
  This restriction applies to the collection whose content is being edited.
  Reading ranges and editing their data remain allowed.
  Perform range membership and bound changes before or after the content edit, optionally within an enclosing transaction.
- Change listeners can observe stale range positions alongside updated content, including positions outside the current array bounds.
  This known anchor bug affects some listeners during individual edits and descendant-node listeners during merged batches.
  Position reads after an edit returns within the callback are current.
  The independent [anchor regression-test PR](https://github.com/microsoft/FluidFramework/pull/28465) documents these cases.
- Edits to unhydrated nodes cannot roll back.
  If a content-editing callback throws, completed edits and their endpoint updates remain.

## Implementation structure

The MVP implements option 1 above: editing APIs maintain persisted numeric endpoints in a string-keyed map of range nodes.
The array and formatted-text integrations share the same tracker.

Each `ExtrinsicLocations.TrackedRange` exposes borrowed endpoint anchors whose `index` getters resolve through the tracker.
These anchors require no cleanup and must not be disposed by the caller; doing so throws a `UsageError`.
Remove the persisted range with `ExtrinsicLocations.RangeCollection.removeTrackedRange` instead.
Assigning `ExtrinsicLocations.TrackedRange.data` replaces its data without changing its identity or endpoints.

- [extrinsicLocationsNamespace.ts](./extrinsicLocationsNamespace.ts): Public namespace, shared range interfaces, and array schema integration.
- [extrinsicRangeTracker.ts](./extrinsicRangeTracker.ts): Internal tracker, guarded transactions, temporary anchors, and storage access.
- [textDomainFormatted.ts](../text/textDomainFormatted.ts): Formatted-text integration, schema upgrades, and lazy range storage.

## Planned work

Phase 1 status and remaining work (remaining Phase 1 work can proceed in parallel):

1. **Implemented:** An extrinsic range MVP using `NoChangeConstraint` to maintain its data invariants.
It stores numeric endpoints and uses temporary array insertion anchors, which process sequence deltas, to update at the after editing the array.
2. Schema versioning to allow for schema changes which change the field kind without strict field kind ordering rules to prevent cycles.
3. Add Experimental (alpha) field kind: index. Support edits like "if larger than A, add B" (where A is adjusted when rebasing over other edits).
4. Ensure stabilization and rollout of new field kinds is practical and robust (good errors, no asserts etc.)
5. Generalize staged field kind changes (required to option is supported, add required vs identifier. One direction will depend on 2).
6. Implement shallow "NoChangeConstraint" (also desired for tables)
7. "Drill down" aka "Batch" editing: way to apply same edit to all nodes at a path which can include wildcards and/or ranges. Also consider table and range formatting use-cases in design.
8. Work through the merge edge cases of the planned final design (see below), including undo/redo, moves, and cases where range ends can get swapped.
The MVP has tests for its current constrained behavior; those do not validate the future design.
9. **Partially implemented:** Range-enabled formatted text supports an explicit schema upgrade from existing text, with lazy range storage and no rewrite of existing content.
Production rollout and stabilization remain future work.
See the [upgrade documentation](../text/README.md#upgrade-existing-formatted-text).
10. Design anchors for presence (Not really part of this work, but has some overlap).
11. Ensure we have ways to hide fields from AI, not just expose methods to protected invariants.
12. Write command pattern demo with showing how to have telemetry for failure, and how one could implement retry.

Later:
These can overlap with phase one, but have some minimal dependency on parts of it and each-other.

1. Factor out Utilities for implementing terminal (no edits below them) and/or "static" (no edit to them can impact paths to content below them field kinds). Consider using for identifier field kind. Use for new "index" field kind. Add counter as a trivial feature using this as well (demo in inventory app). Should support multiple children: make things like a range kind with 2 children (start and end) easier we end up having to do that. Using this to add range start and range end, or fields with other kinds of anchoring are also options.
2. Improve MVP concurrency 1: (Optional: Skip if shallow change constraint is ready): Use index field kinds for range ends. Add dummy child node to range container, which is replaced for every change to the set of ranges (adding or removing a range). Replace "NoChangeConstraint" with "NodeInDocumentConstraint" pointing to current dummy node.
3. Improve MVP concurrency 2: (Optional: Skip if shallow change constraint is ready): Use index field kinds for range ends. Replace above dummy node scheme with a shallow `noChange` constraint pointing at the map of ranges.
4. Improve MVP concurrency 3: Replace constraints with "Drill down" editing of index fields. No more rejected transactions.
5. Deliver stable APIs, including safe rollout/evolution for existing text users.
6. Presence integration for arrays. Maybe share some logic with new field kind[s]? (Not really part of this work, but has some overlap)
7. Consider implementing support for multiple collections (or just single) ranges, or just locations.
There are several ways this setup could be made more flexible, from allowing you to have a record of collections of ranges and locations (instead of just a single map collection), or full first class reference support.

## Notes:

The following sections retain design questions and future plans.
They are not commitments to deliver particular features.

### Editing semantics:

The MVP ties range lifetime to its owning collection, not to the covered content.
Deletions shrink ranges without removing them, and moves use insertion-point semantics rather than carrying ranges with the moved content.
Future designs could consider optional move-following behavior and its constraints.
The relationship to anchors and presence remains a design question.

### Designs:

Index field kind (accepted design direction; not implemented by this MVP):
- Reuse code from sequence field kind (identical changeset logic, including rebase and ops)
- Child is just a number representing an index

Can we do better anchoring for better semantics? Does this require knowing both start and end, and maybe extra config inside the field, not just a single number?

### Bulk editing:

How does this work in our setup? Allow all nodes (or maybe fields) in changesets to be roots for structural bulk edits?
Do we need to make it more limited, like can only do edits which don't change the tree shape (Like replace leaf nodes)?
Changing the shape means rebased are more complex.
Do the later parts of this work (which impact merge results, not just optimized encoding) need to wait for
ongoing rebaser/changeset work?

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
