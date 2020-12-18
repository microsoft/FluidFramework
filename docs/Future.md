# Future Plans

This document contains high-level overviews of several desired SharedTree features.

## Edits

1. Allow edits to contain metadata for use by the application. The contents would be application specific. Example use cases might include:

    1. "Hierarchal edits": Encoding of how to regenerate the edit in a more semantic way (as commands in higher level domains).
       These are allowed to be non-deterministic, and might change behavior as the application is updated.
       They depend on the necessary domain code being loaded and supporting the used commands: some clients may be unable to make use of this data.
    1. Metadata about the changes for use with history viewing and manipulation tools (ex: author, time etc)

1. Provide a way to detect if two edits [commute](https://en.wikipedia.org/wiki/Commutative_property) for a particular version of the document (edits might commute for some documents but not others, so providing the document is required).
   This can be conservative in that it would be allowed to return false if it is unclear it they commute.
   A basic implementation of this would be a check if the write set of each change does not overlap the read set + write set of the other.

1. Provide a way to detect if the applying an edit had the _intended_ effect (ex: was it turned into a noop due to conflicts, or has high risk of other kinds of merge issues)

## Conflict Resolution

Rather than drop edits which cause a conflict, SharedTree could expose this, giving the application an opportunity to use the Edit metadata and its domain knowledge to attempt to recreate the Edit, resolving the conflict.

# Editing History

The history is a sequence of Edits, but it is append only.
Thus a logical edit of the history is actually done by creating a new Edit which modifies the current version of the document to be that which would have been produced by the alternative history.

This functionality will be provided by a library (yet to be written) which uses SharedTree's history inspection and Editing APIs to create history modifying Edits, including metadata necessary to properly inspect and merge them with future history modifying Edits.
This approach does not require extra functionality in SharedTree's core.
This approach intentionally pushes the complex merge logic into code that is not part of the DDS to:

-   reduce the code which can possibly impact consistency of documents between clients.
-   reduce the computation needed to interpret the history (apply Edits): burden of hard merges goes on the client that requested the merge.
-   minimize the feature set which must be supported long term for document compatibility.

This design has some downsides as well:

-   if used to make edits far back in the history, merge resolution can produce very bloated changes (large and expensive to store and apply)
-   repeated history edits (like someone undoing and redoing a change a lot) can bloat history

Because of these downsides, it may be desirable to limit use of history editing (it is intended to handle cases like undo and redo of recent edits),
particularly when the initial edit requires Automatic Conflict Resolution, and/or is working on very large Edits or Edits which are not recent.

These costs can be mitigated by encoding optimizations (Ex: allowing edits to refer to trees in snapshots and/or other edits to avoid duplication).

If these mitigation are not enough, directly supporting history editing within SharedTree's Edits could be added without breaking existing documents or legacy support for the old approach
(other than optionally reading the metadata when viewing history).
This will be done if the future only if a cost/benefit analysis suggests it would be a good idea.

## Example History Edit

This example shows how to replace the middle of 3 edits.
This generalizes to making arbitrary history edits by considering A, B, C, and X to be arbitrary (possibly empty) sequences of edits.

We start with these changes:

:::mermaid
graph LR
A(A) --> B(B) --> C(C)
:::

And want to end with changes:

:::mermaid
graph LR
A(A) --> X(X) --> C(C)
:::

Since history is append only, we actually end with:

:::mermaid
graph LR
A(A) --> B(B) --> C(C) --> Merge(Merge)
:::

### Low Level Commuting Merge

If B commutes with C in the revision output from A, and X commutes with C in the revision output from A: the history edit is considered non-conflicted, since there is a clear way to construct the Merge edit.
This is the only case supported by the "Low Level Commuting Merge".

In this case Merge can be constructed as inverse(B) followed by X.
Note that computing the inverse depends on the revision.
In this case a special revision produced by A followed by C is used.
Then B is applied, constructing inverse(B) in the process to use as part of the merge.

This amounts to moving B past C (allowed because they commute), then adding inverse(B), followed by X.
Placing X at the end is the same as placing it between A and C since it commutes with C (at revision output by A).

:::mermaid
graph LR
A(A) --> C(C) --> B(B) --> B2("B⁻¹") --> X(X)
:::

This can then be transformed into its final form, which meets the requirement of only adding to the original:
:::mermaid
graph LR
A(A) --> B(B) --> C(C) --> B2("Merge: B⁻¹ + X")
:::

Note that if B deletes any nodes, B⁻¹ must restore them with the same identity.

### Automatic Conflict Resolution

If a low level merge can not be applied directly because it is conflicted,
it can often be restated in terms of a different history edit which will have a non-conflicting Low Level Commuting Merge.

In the above example, it conflicts IIF A or X fail to commute with C.
In the general case, where C is a sequence of Edits,
this can always be avoided by moving edits from the beginning of C to the ends of B and X.
This can continue until there no longer is a conflict due to lack of commuting.
This is guaranteed to eventually fix the conflict since it can continue until C is empty, and thus commutes with anything.

For initial state:
:::mermaid
graph LR
A(A) --> B(B) --> C("C1 + C2")
:::

it can be regrouped like:
:::mermaid
graph LR
A(A) --> B("B + C1") --> C(C2)
:::

Making the desired final state:
:::mermaid
graph LR
A(A) --> X("X + C1") --> C(C2)
:::

This process can be though of as expanding the portion of the history being replaced to include a segment long enough to contain all the conflicts.
This modified replacement can then be applied using the Low Level Commuting Merge.

The challenge here is constructing `X + C1`.
Doing this applies C1 in a different context than it was initially applied, and this C1 itself could fail to apply.
This is where the hierarchal edit metadata can be used to assist merging.
If there is code loaded which can use the metadata from the Edits to reapply the edits at a higher level,
this can be used to generate a contextualized version of C1 to include in `X + C1`.
If the higher level edits fail to be applied (either they are not available, or they fail),
then the automatic merge resolution fails, and no merge is created
(effectively merging the change by picking the current version as the result).

### Editing Edited History

When editing history that has already been edited, care must be taken to not accidentally revert the previous edits.
This can be done by using metadata in history edits to construct the branch the history edit logically made with its alternative history instead of walking the actual op sequence.

When this is implemented, particular care will have to be taken to make sure that multiple edits to history which are created concurrently either merge safely (and in a way that future edits will handle), or conflict.
Details of this design are to be determined, but having history edits reference the newest acknowledged edit, and the range of history they are actually editing,
and only allowing edits of the acknowledged portion of history may be enough.
