# SharedTree Glossary

This glossary defines core concepts used throughout SharedTree's design and implementation, ordered
roughly from the simplest/most foundational concepts to the more complex ones that build on them.
It is intended as a reference for developers working on SharedTree internals (rather than the public
consumer-facing API).

## Node

An addressable piece of tree data. Every SharedTree document is made of nodes; there is always an
implicit root node. A node may have an optional [value](#value) and a set of [fields](#field).
See [data-model.md](./data-model.md#node).

## Value

The optional scalar payload (e.g. a number, string, or boolean) stored on a node. Values are opaque,
immutable byte sequences from the data model's perspective. See [data-model.md](./data-model.md#value).

## Field

A named relationship between a parent node and an ordered sequence of child nodes. Fields are
distinguished by a field *key*. See [data-model.md](./data-model.md#field).

## Cell

A conceptual unit of storage within a field's sequence that never moves and never disappears; it may be
*empty* or *full*. Higher level concepts like insertion, removal, and moving of content are built on top
of allocating, filling, clearing, and forwarding cells. See
[cell-model-of-collaborative-editing.md](./cell-model-of-collaborative-editing.md).

## Anchor

A stable reference to a location in the tree (e.g. a node or a position in a field) that remains valid
across edits, even as the tree changes shape around it. Anchors are how application code and internal
logic keep track of "the same place" over time without holding onto stale node identities.

## Forest

The in-memory data structure that stores the current state of the tree's content, indexed for efficient
navigation and editing (analogous to a forest of trees in the graph-theory sense). A `ForestIndex` is one
example of an [index](#index) that provides this functionality.
See [indexes-and-branches.md](./indexes-and-branches.md#indexes).

## Index

A piece of state, derived from and kept up to date by the document's edit history, that answers queries
about the tree (analogous to a database index). Indexes own all persisted document data; the forest and
schema are both implemented as indexes. See [indexes-and-branches.md](./indexes-and-branches.md#indexes).

## Changeset

The data describing the edit(s) made by a single [commit](#commit) — i.e., the concrete representation of
"what changed." Changesets are produced, composed, inverted, and rebased against one another by a
`ChangeFamily`/`Rebaser` implementation. See
[modular-change-family.md](./modular-change-family.md).

## Delta

A derived, lower-level description of the concrete effects of a changeset on the tree's content (e.g.
"insert this content here," "remove this content there"), used to actually update the [forest](#forest)
and notify listeners, as opposed to the changeset's richer, rebasable representation.

## Revision / Revision tag

A unique identifier (`RevisionTag`) assigned to a [commit](#commit). Commits that are rebased but remain
semantically the same operation retain the same revision tag across rebases.

## Commit

A node in a graph of changes: it pairs a [changeset](#changeset) with a [revision tag](#revision--revision-tag)
and a reference to its parent commit (the commit its change is based on). A sequence of commits linked by
parentage forms a [branch](#branch).

## Op

The Fluid Framework's unit of an operation sent over the wire to the ordering service and other clients.
Roughly speaking, a local [commit](#commit) becomes an op when it is submitted, and an op becomes a
sequenced commit on the [trunk](#trunk) once it is acknowledged/ordered by the service.

## Sequence number

The order assigned to an op by the Fluid ordering (sequencing) service once it has been totally ordered
relative to all other ops. This is what makes the [trunk](#trunk) a single, canonical timeline.

## Rebase

The operation of taking a commit (or a chain of commits) whose change was computed against one base state
and re-expressing it as an equivalent change against a different (usually newer) base state. Rebasing is
central to how SharedTree reconciles concurrent edits from different clients/branches.

## Branch

A timeline of a document's state as viewed from a particular perspective — the same concept as a branch in
version control. A branch is represented internally as a chain of [commits](#commit) sharing a common
ancestry. See [indexes-and-branches.md](./indexes-and-branches.md#branches).

## Trunk

The branch consisting of every commit that has been sequenced by the Fluid ordering service, in the
canonical order chosen by that service. The trunk is append-only (commits on it are never rebased or
reset). It is analogous to a `main` branch in `git` that is only updated by merging in already-agreed-upon
history. See [indexes-and-branches.md](./indexes-and-branches.md#branches).

## Trunk base

A special, non-sequenced commit that serves as the root/tail of the trunk, allowing the trunk to be
modeled uniformly with any other branch (as something that "branches off of" a base commit). As trunk
commits are evicted/trimmed (once every client has seen them), the most recently evicted commit becomes
the new trunk base.

## Main branch

Commonly used to refer to the primary shared document branch, i.e. the [trunk](#trunk) plus the current
client's [local branch](#local-branch) of not-yet-sequenced edits. In `git` terms, this is the combination
of the shared upstream history and the local commits not yet merged into it.

## Local branch

The [trunk](#trunk), plus any edits made locally that have not yet been sequenced (acknowledged by the
service). This is analogous to a local feature branch in `git` that gets rebased onto `main` every time
`main` advances. See [indexes-and-branches.md](./indexes-and-branches.md#branches).

## Peer branch / remote branch

A branch that replicates the local branch state a *remote* client had at the time it sent an op, used so
that the receiving client can correctly rebase that peer's edit relative to the trunk and other peers'
edits. Every connected client's outstanding edits are tracked this way.

## Working copy

The [local branch](#local-branch) plus the state of any in-progress (not yet committed) transaction. This
is analogous to the uncommitted changes in a `git` working copy on top of a checked-out branch.

## Transaction

A group of edits applied together as a single logical unit and represented as a single [commit](#commit).
Transactions may be nested, in which case their `customMetadata` is combined into a tree reflecting that
nesting.

## Session

A single connected client's identity/context (`SessionId`) for the purposes of generating and attributing
[commits](#commit). Every commit records (directly or via its revision tag) the session that authored it.

## Summary / Summarization

The Fluid mechanism by which a client serializes the current document state (including all
[indexes](#index), such as the forest and schema) so that new or reconnecting clients can load the
document without replaying the entire edit history. See
[indexes-and-branches.md](./indexes-and-branches.md#indexes).

## Reference (durable reference)

A lightweight, stable way to point at a particular node via its special *id* field, independent of the
node's current position in the tree — the basis for features like "share link" URLs and graph-like
relationships within the tree. See [data-model.md](./data-model.md#id).

## Long-lived branch

A branch explicitly created by a user/application that can persist independently of the [main
branch](#main-branch) for extended periods (e.g. feature branches, release branches, or offline work).
Not currently implemented/supported by SharedTree, but considered in forward-looking designs. See
[indexes-and-branches.md](./indexes-and-branches.md#branches).
