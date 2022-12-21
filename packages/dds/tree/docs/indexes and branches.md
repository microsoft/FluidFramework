# Indexes and Branches

## Indexes

[shared-tree-core](../src/shared-tree-core/README.md) defines the type `Index` which fills the same role Indexes do [in databases](https://en.wikipedia.org/wiki/Database_index).
Because of this, shared-tree can be though of as a tree database which is interacted with through a collection of indexes.
To avoid needing an abstraction to storing the actual underlying document content, all persisted document data is actually owned by the indexes.
In database terms this means that we use [covering indexes](https://en.wikipedia.org/wiki/Database_index#Covering_index) to answer all queries.
Concretely this is done by [shared-tree](../src/shared-tree/README.md) providing a `ForestIndex` which is is a covering index (stores the actual data from each tree node), optimized for retrieving (and editing) parts of subtrees by path.
Schema data is similarly handled by `SchemaIndex`.
In the future we will have more index implementations, which can provide functionality like accelerating look of of nodes (in `ForestIndex`) by identifiers, text search etc.

Indexes are updated when the Fluid document (contents of the Shared Tree) is edited, and are persisted in Fluid summaries.

It is possible to have indexes which only have performance implications (never cause ops to apply differently), which optimistically cache some data in memory and persist nothing.
For simplicity we will consider these just like persisted indexes, where their persisted information is empty, and this document will focus on solving the harder general problem of indexes which may persist some data.

It is also possible for indexes to only keep a subset of their data in memory, relying on persisted data to load in the rest as needed.
This is planned for "ForestIndex", and is an important requirement that the design for indexes must support to allow documents to scale beyond memory.

## Branches

A branch is a timeline of a document's state as viewed from a particular user.
This is the same concept as [branches in version control](<https://en.wikipedia.org/wiki/Branching_(version_control)>).
From the perspective of a single Fluid client, there can be several relevant branches:

-   The sequenced branch: this includes everything that has been sequenced.
    It is append-only (never rebased or reset) and consists of all the ops from all the clients, rebased into the canonical order selected by the Fluid ordering service.

    When compared to common `git` workflows, this closely resembles a `main` branch which is only updated via pull requests into an upstream repository.

-   The local branch: the sequenced branch, plus any local edits (ops for them have not yet been sequenced).

    In our `git` metaphor this is a feature branch in the local repository.
    Every time `main` changes, it is rebased onto the new state of `main`
    It is merged into main by making pull requests one commit at a time which are always merged using rebase.

-   The working copy: the local branch, plus the current state of an in progress transaction.
    If async transactions are supported with snapshot isolation, the version of the local branch that the transaction branches off from might not always be the latest.

    In our `git` metaphor, this lines up with git's working copy, while the "local branch" in checked out.
    The in progress transaction aligns with the uncommitted changes.

-   Remote branches: branches which replicate what remote clients had in their local branches when an op was sent.
    These are necessary for correctly rebasing remote edits into main.

    In our `git` metaphor this represents a local copy of a different remote's feature branch.
    Since in Fluid all the clients do the rebase, but in `git` it happens once in the upstream repository,
    such branches would generally not be needed if using `git`, but are necessary for our actual Fluid setup.

-   Long lived branches: branches explicitly created by the user that can live separately from the "main" branch for long periods of time.

    In our `git` metaphor this represents feature branches (eventually might be merged) or release branches (likely never merged).
    They can be used to experiment with a copy of the document, work offline for expended periods while preserving history when merging,
    or just as a way to have a user-controlled snapshot.

    Currently shared-tree does not use or support this type of branches, but forward looking designs should consider them.

TODO: diagrams showing branch diagram for a couple clients over time.

## Branch Index Interactions

There are several different use-cases for indexes which would necessitate access to them at different times and on different branches.

-   Tip of the "working copy" branch.

    For example, editing code will likely need indexes for the working copy in order to provide access to schema and tree information while editing.
    If there are additional indexes (ex: subtree lookup from identifier, or text search), these likely would also be desired at the top of the working copy branch.

-   Tip of the "local" branch.

    This is the version typically reflected in the application's views (for example its user interface or exposed via APIs).
    It needs to support reading and interpreting the state of the document, as well as creating transactions at that state.

-   Tip of the sequenced branch.

    This is a logical branch to record the indexes for summarization, though the tip of the "local" branch could also be used since on summary clients they are the same.
    Future optimizations to not duplicate state in the summary client might lead to wanting to explicitly summarize the tip of the sequenced branch instead.

    This is also the state onto which edits are rebased (both remote edits, and the local branch).
    Doing this could make use of indexes at this point.

-   Tip of remote branches.

    This is the state in which remote edits are interpreted and rebased from.
    Since the creators of the ops had access to indexes at this state (via their local branch),
    they could optionally include relevant information from those indexes to avoid it having to be recovered when processed/rebased on other client.

-   Along merge reconciliation paths.

    If change rebasing or squashing requires access to indexes, they could be required anywhere along the merge reconciliation paths.

-   Other historical states.

    Inspecting old document versions could make use of old versions of indexes.
    Another approach to this would be to index history directly, so the current versions of indexes contain the needed historical information.

-   On long lived branches.

    Just like the main branch, if long lived branches are supported, they may needed indexes.
    They may even need indexes for their corresponding working copies and remote branches if they are used collaboratively.

## Optimizations Options

Maintaining full in-memory versions of all indexes for all these locations all the time would be very expensive performance wise.

This can be mitigated in several different ways:

-   Maintain indexes only at places in the revision graph that require them.

-   Use indexes when creating edits (tip of the "working copy" branch) but not when peer rebasing them.
    For indexes using this approach this prevents remote edits from requiring indexes to be rebased.
    This means that synchronously rebasing remote edits does not require index access, so index access can be async.
    This also (when combined with the above) avoids maintaining most of the possible versions of an index.

-   "Virtualized" indexes which lazily load data from blobs as needed, keeping only a portion of the data in memory at a given time.
    This can make some accesses async, and thus works well with the above.

-   Delta indexes: implements indexes as deltas to another version of the index which can be used similarly to a write back cache or the tiering in level db.
    This is a nice design pattern to handle the persisted vs in memory combination, but also generalizes.
    This can be used to keep multiple in memory versions for nearby locations in the revision graph (ex: persisted, sequenced, local and per transaction).

-   Copy on Write: Copy on write can also be used to optimize maintaining multiple indexes by sharing the parts that are the same.

Note that this list is not complete, but it is sufficient to motivate the decisions below.

## A General Approach

Depending on the specific index, it might be needed at different places, and thus have very different usage patterns and optimization requirements.

To keep as many options open as possible, shared tree's index abstraction can expose both the notion of branches and revisions to the index abstraction.
This complicates the index abstraction a bit, but leaves the index implementation to pick if mutation or copy on write is a good approach, and if it should do virtualization.
We then introduce the concept of an "IndexView", which accesses the index's information about a specific revision or branch.

To make implementations of indexes simpler, helper code could be authored for both copy on write and mutation based index approaches (likely involving deltas as well) so this logic does not need to be implemented multiple times.

To avoid having multiple data-structures tracking how different branches relate to each-other, we can generalize `Rebaser` into a `RevisionManager` that can handle this once, and indexes can use it to track/notify/lookup anything needed related to that.

Since indexes can depend on other indexes (like how ForestIndex depends on the SchemaIndex), the RevisionManager can be an index.
This would remove the need to special case how it stores its state in summaries: it could do so just like all the other indexes.

This approach leaves most of the design tradeoffs inside the index implementations, meaning that changing them will not impact the system architecture.
This also means that different indexes (or even the same indexes in different apps) can take different approaches, allowing for more specialized optimizations and incremental API migrations when needed.
