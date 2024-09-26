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

There is a precise scenario in which this matters to a user.
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

Revertibles are cloned at a specific point in time - namely, when creating a branch.
A branch's `branch()` method allows an array of revertibles to be passed in, and a corresponding array of cloned revertibles is returned.

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

The cloned revertibles may be disposed, just like the original revertibles.
Disposing a clone doesn't affect original.

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

### Branchless Cloning

What if we iterated on the above by adding an explicit clone method?
This puts cloning in the hands of the user to do if and when they wish.

```ts
interface Revertible {
	revert();
	dispose();
	/* Create an additional reference to this revertible. */
	clone();
}
```

Revertibles remain unassociated with a branch, but can be cloned as many times as necessary.
Only when all clones of the same revertible are disposed is the underlying data disposed (i.e. the revertibles are ref-counted).
This means that an application could clone revertibles and distribute them across isolated portions of its architecture without having to worry about one area's `dispose()` adversely affecting another area that shares the same (clone of a) revertible.
Now we have the benefits of "commit tokens" being decoupled from branches and have also alleviated the lifetime/disposal concerns.

However, this is also to be avoided because **revertibles are disposed when they are reverted**.
Put another way, _a revertible isn't meant to be invoked twice on the same branch_.
It doesn't make much sense for a revertible to apply twice to the same branch, so much so that we don't support it in the underlying system.
It would be (maybe) possible to support, but it seems extremely low value if it has any value at all.
Therefore, it actually makes sense that each revertible ought to be associated with a branch because after it does a revert on that branch, it's dead.
That same commit should not be reverted on the same branch again.
Therefore, it also makes sense to disallow the creation of multiple revertibles for the same branch.
If we did allow that, then it would require the same ref-counting scheme as above to manage manual disposing, but it would have no way to prevent two parts of the application (with no knowledge of each other) from both attempting to revert (the second one would fail).

This leads us back to the original API above - cloning only happens at most one time when a new branch is created.
Since the cloning happens at this one distinct time, it make sense to have it baked into the branch API rather than exposing some kind of `clone()` to the user.
And since a revertible is implicitly associated with both a commit _and_ a branch, it makes sense for its API to expose a single parameterless `revert()` method.
