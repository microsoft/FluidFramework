# Revertible API

This `Revertible` API is the entry point for allowing SharedTree users to revert changes to the tree, enabling features like Undo and Redo.
This document provides context for the `Revertible` API to help inform past and future decisions.
This document isn't meant to be wholly comprehensive but rather to document prior reasoning and discussion to help "fill in the gaps" about how the API landed in its current state.

> For more background on Undo/Redo, see the following documents:
>
> * [Undo.md](../main/undo.md)
> * [v1-undo.md](../main/v1-undo.md)

## Revert Operation

The fundamental operation that `Revertibles` are trying to accomplish is to:

1. Revert a commit in the history of some branch
2. Apply the reverted commit to the head of that branch

In theory, the API could be as simple as:

```ts
function revert(commit: CommitId, branch: Branch);
```

## Garbage Collection

However, there is an important reason that the API _can't_ be so simple, and that reason is the root cause of much of the complexity that has emerged.
It is potentially _expensive_, in both memory and network bandwidth, to retain the information that is required to revert an arbitrary commit.

For example, suppose a commit deletes a massive amount of content from the document.
That content cannot _actually_ be deleted from the user's program memory.
If the commit were to be reverted, then that massive amount of content would need to be re-inserted, and thus needs to be retained.

Additionally, consider that the "history" (i.e. the sequence of commits that have applied to a document so far) will grow unboundedly so long as every commit is eligible to be reverted. Those commits can never be dropped from memory, because the user might want to revert a commit from a "very long time ago".

### Revertibles

This is solved by exposing handles to commits which can (and should) be disposed when they are no longer possibly going to be reverted.
Since these handles are specifically used by the revert functionality, we call them `Revertibles`, and they have (something like) the following interface:

```ts
interface Revertible {
	revert();
	dispose();
}
```

Typically, revertibles are placed in an ordered undo and redo stack and managed by the user (perhaps via an undo/redo helper library).

> Revertibles need not be reverted in order.
> An undo/redo stack is a common use of revertibles, but other "undo-ish" data structures might be appropriate for an application as well. 

Importantly, revertibles are only allocated if the user requests them to be.
When a new commit is applied to the tree, an event (`"commitApplied"`) fires which provides the user a _function_ that they can call _if_ they want to allocate a revertible.
If they do this, then they are also responsible for disposing the revertible as soon as they no longer need it (for example, if it ends up too far back in their undo stack).
In this way, revertibles are given the minimal lifetime possible (if they are given a life at all) in order to reduce the overhead of maintaining them.

## Branches

How do revertibles interact with SharedTree [branches](../main/indexes-and-branches.md)?
Note that a `Revertible` has a parameterless `revert()` method.
Under the hood it is performing the fundamental `revert(commit, branch)` operation and therefore the revertible must be implicitly associated with both a commit _and_ a branch. This means that different branches will have different revertible objects, even for reverting the same commit.

This is accomplished by allowing revertibles to be _cloned_ (or "forked"). Cloning a revertible produces a new revertible which is associated with the provided branch - so, when `revert()` is called on that new revertible, it applies the reverted commit to the head of that branch.

> The original "non-cloned" revertible, which came from the `"commitApplied"` event, is implicitly associated with the branch that raised the event.

There is a particular scenario in which this is necessary for a user.
If a user wants to create a new branch and allow that branch to undo past the commit at which it was created (i.e., undo "back into its parent branch"), then all the relevant revertibles from the parent branch must be cloned and the clones must be associated with the new branch. For example:

1. Parent branch **P** appends commits _X_, _Y_, and _Z_.
2. Child branch **C** branches off of the current head (_Z_) of **P**.
3. The user wants to undo _Z_ and then _Y_, but on branch **C**, not on branch **P**.
   This would leave **P** untouched and leave **C** with a state including only the commit _X_.

In such a scenario the user must clone the revertibles that were acquired from **P** and associate them with **C**.
Typically this would look something like the following.

1. Parent branch **P** appends commits _X_, _Y_, and _Z_.
    * The revertibles for _X_, _Y_ and _Z_ are appended to the undo stack for **P**.
2. Child branch **C** branches off of the current head (_Z_) of **P**.
    * The revertibles for _X_, _Y_ and _Y_ are cloned, and put at the beginning of the undo stack for **C**.
3. The user wants to undo _Z_ and then _Y_, but on branch **C**, not on branch **P**.
   This would leave **P** untouched and leave **C** with a state including only the commit _X_.
    * The user pops and reverts the top two revertibles on **C**'s undo stack (and may or may not dispose them, depending on whether or not they might be needed again later).

> When a branch is disposed, all of the revertibles that were cloned with respect to it are automatically disposed too.

### Cloning

Revertibles are cloned via a `clone()` method on the revertible object.

```ts
interface Revertible {
	revert(): void;
	dispose(): void;
	clone(branch?: Branch): Revertible;
}
```

Note the optional `branch` parameter to the clone method.
If a branch is provided, then the resulting clone is associated with that branch (recall that every revertible is associated with one branch, which is the branch that the revert is applied to when `revert()` is called);
If a branch is not provided, then the clone is associated with the same branch as the original revertible.
The cloned revertibles may be disposed, just like the original revertibles.
Disposing a clone doesn't affect original.

There is one additional consequence of associating a revertible with a branch.
When a branch is disposed, all revertibles that are associated with it are also automatically disposed.
This makes sense because those revertibles could not possible do anything thereafter (they can't modify a disposed branch).

Clones create multiple references to the same commit.
The data associated with a commit required for reverting is only garbage collected when _all_ revertibles (original and clones) for that commit have been disposed.
This is essentially a ref-counting scheme where the revertibles are the references.

This lets us support the following scenarios:

1. An application creates a branch and delegates the management of that branch to a limited scope of the application code.
   For example, a particular UI component is responsible for displaying and interacting with a branch, but does not know about the parent branch and the rest of the application.
   That UI component owns the branch and owns its revertibles.
   Thus, when it and its branch X are being created, it is given a clone of the parent branch's revertibles via `parentRevertible.clone(X)'.
   When the component's lifecycle ends, it disposes the branch (and therefore its revertibles too) and there is no cleanup required by the parent branch/context.
2. An application creates multiple UI components that share the same branch.
   Like in scenario 1, each component and its code is concerned only with itself and does not want to reason about the state of other components and contexts.
   When each component is created, it is given a clone of the branch's revertible via 'branch.clone()' (no branch argument).
   Each component is responsible for its revertible, and can safely dispose it when the component lifecycle ends.
   The actual commit data will only be dropped when all the components have disposed.
3. The application doesn't want to do any pre-emptive cloning, and will just share the revertible objects across its entire architecture.
   The application is small and/or its developers are accustomed to monolithic development, so they are comfortable managing the lifetimes of the revertibles without the aid of `clone()`.
   In this case, to apply a revertible to a branch that is not the branch it is associated with, the application can simply do: `revertible.clone(branch)` immediately followed by `clone.revert()` and `clone.dispose()`.
   
If we make revertibles dispose themselves by default after reverting:

```ts
interface Revertible {
	revert(dispose = true): void; // Pass `false` to prevent disposal
	dispose(): void;
	clone(branch?: Branch): Revertible;
}
```

Then scenario 3 doesn't even have to dispose the clone, and can do it all in one go: `revertible.clone(branch).revert()`.

One way to categorize the scenarios above is that 1 and 2 are "preemptive" - the application is doing a clone ahead of time and giving ownership of that clone to a specific scope.
That scope has a limited lifetime and will dispose the clone when it dies.
Scenario 3, on the other hand, is not preemptive but rather applies the revert to a branch only at the moment when it is necessary - the branch is not known ahead of time.
Supporting both of these kinds of scenarios is straightforward with this API.

> Open question: should disposing a clone also dispose transitive clones that originated from it?
> In a strictly hierarchical branching setup, this makes sense, but branches can have an arbitrary fork and merge structure.

## Altenatives

Why must revertibles be associated with both a commit and a branch?
It is this requirement which implies the awkward clone-during-branching step presented above - can it be simpler?

### Shared Revertibles across Branches

Why can't each revertible be associated with a commit but not a branch?
Suppose that (at most) one revertible existed for each commit and that it was shared amongst all branches.
That would remove the need for the cloning step when branching.
Instead, the branch could have a `revert(revertible)` method on it, or perhaps the other way around: `Revertible.revert(branch)`.

We can generalize the paradigm a bit here and say that the user doesn't even interact with "revertibles" but rather with "commit tokens".
A commit token is simply a handle to a commit that can be disposed when no longer needed.
The revert function on/for a branch naturally accepts one of these tokens.
This sounds clean and somewhat untangles the primitive objects handled by the user.

However, a reason this is to be avoided is that it complicates the lifetimes of the revertible objects or tokens.
With such an API, the lifetime of each revertible would need to be the union of _all_ branches on which it might be applied, rather than merely that of the target branch.
Applications often desire to scope their code such that a branch and its associated functionality know about nothing outside of that branch.
But in this case, that code would still need to know whether it is _forbidden_ to dispose its revertibles (because they are used elsewhere, e.g. by a parent branch) or whether it is _required_ to dispose its revertibles (because nobody else is going to).
So, such an API removes the need for forking but introduces the need for global knowledge of the revertible lifetimes, which is a dangerous source of mistakes and something we'd like to discourage where we can.

### Cloning when Branching

Another possibility is to have no `clone` method at all.
Instead, cloning could be an explicit part of the branching API.

```ts
interface Branch {
	branch(): Branch;
	branch(revertiblesToClone: Revertible[]): Revertible[];
}
```

The returned array has the same number of revertibles as the input array, and the clones are in the same order as their sources.
This allows the caller to correlate each revertible to its clone based on its position in the array.

It would also be possible to have a simpler input interface like:

```ts
interface Branch {
	branch(cloneRevertibles: boolean): Revertible[];
}
```

However, even if the returned array has a well defined order (e.g. revertibles are ordered by when they were created), it is now more difficult or perhaps impossible copy an arbitrary data structure of revertibles on one branch to another branch, because it's unknown which revertibles correspond to which.

In either case, these options suffer from a couple of drawbacks.
Revertibles are now explicitly coupled to branching - two features that are only tangentially related are now tightly bonded by the API.
Additionally, scenario 2 (see the "Cloning" section) is no longer possible, nor is forking a revertible after a branch is created.
A revertible for a branch, if it is to exist at all, _must_ be cloned exactly when a branch is created, and no more than one clone can exist for that branch.
This seems unnecessarily restrictive and is assuming too much about the patterns we expect application developers to employ.
Additionally, the API is simply clumsy - passing/receiving arrays, and packing and unpacking those arrays, is cumbersome.

> Admittedly, there is a pleasing symmetry to the idea that clones can only be created at exactly one moment, because the original revertibles can only be created at exactly one moment (via the `"commitApplied"` event).
  But, that alone does not outweigh the drawbacks to this approach.
