/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

/**
 * PROTOTYPE / SKELETON.
 *
 * A persistent, order-statistics ("counted") B+ tree intended to back the
 * sequence-field `Changeset` (currently a flat `Mark[]`). See the design
 * discussion tracked by "Create efficient data structure for representing
 * sequence field changeset" for motivation.
 *
 * ## Relationship to `@tylerbu/sorted-btree-es6` (the library behind `ChangeAtomIdBTree`)
 *
 * This is a *fork* of that library's `BNode`/`BNodeInternal` node shape, not a
 * subclass. We reuse its persistence/rebalancing *strategy*:
 * copy-on-write via an `isShared` flag + `clone()`; node split/merge thresholds
 * (`maxNodeSize`, splitting when full, merging when nodes fall below half-full);
 * and the `splitOffRightSide` / `takeFromLeft` / `takeFromRight` / `mergeSibling`
 * rebalancing shape.
 *
 * But every method that relied on "binary search by comparator over an
 * explicit sortable key" is replaced with "descend by cached subtree
 * cell-count" (an order-statistics / rope-style query), because marks have no
 * stable position key (storing one would go stale on every prior insert or
 * remove — see the sequence-field design notes on why cell index is always
 * *derived*, never stored).
 *
 * Each method below is tagged:
 * `[COPY]` means the same shape/logic as the corresponding method in b+tree.js,
 * only renamed/retyped (e.g. "keys" to "entries"). `[CHANGED]` means the same
 * purpose as an original method, but with the internal logic rewritten (key
 * comparison to count-based descent). `[NEW]` means there is no analogue in
 * the key-based BTree; this is net-new logic needed for offset-based
 * splitting/splicing.
 *
 * ## Concatenation (`concat`/`join`)
 *
 * `concat` is the operation the compose algorithm's "bulk splice a reused
 * block into the output" step actually needs, and it has no equivalent to
 * fork from in the key-based BTree at all (keys impose a global order, so
 * "concatenate two maps" isn't meaningful there). It's implemented by `join`,
 * which borrows its *shape* from how balanced search trees classically
 * implement joining two same-kind trees: descend the taller side's spine
 * until both subtrees being glued have equal height, combine directly
 * (splitting on overflow, same as `BNodeInternal.set`'s overflow handling),
 * and propagate any overflow back up the spine. Every subtree not on that
 * spine is reused by reference, which is what keeps this O(log n) instead of
 * the O(n) flatten-and-rebuild an earlier version of this file did. See the
 * comment block directly above `join` for the full explanation.
 */

/** A value that occupies `count` contiguous cells (e.g. a sequence-field `Mark`). */
export interface Counted {
	readonly count: number;
}

/**
 * TEST-ONLY INSTRUMENTATION.
 *
 * Counts how many `Leaf`/`Internal` node objects have been constructed since
 * the last `reset()`. This is not part of the "real" data structure - it
 * exists purely so tests can validate the complexity goals from the design
 * (e.g. "splitting a tree of a million marks only touches O(log n) nodes")
 * without needing to reach into private node internals.
 */
export const nodeConstructionStats = {
	count: 0,
	reset(): void {
		nodeConstructionStats.count = 0;
	},
};

/**
 * A function which splits an entry `T` into two entries whose counts sum to
 * the original entry's count, dividing at `offsetInEntry`.
 * For sequence-field `Mark`s, this is exactly `splitMark`.
 */
export type SplitEntry<T extends Counted> = (entry: T, offsetInEntry: number) => [T, T];

/**
 * A function which merges two adjacent entries into one, if possible
 * (used to keep leaves from fragmenting after repeated splits). Returning
 * `undefined` means "do not merge these."
 */
export type MergeEntries<T extends Counted> = (left: T, right: T) => T | undefined;

/**
 * Public ADT. A persistent, immutable ordered sequence of `T`, indexed by
 * cumulative `count` rather than by array index.
 */
export interface MarkTree<T extends Counted> {
	/** Sum of `count` over every entry in this tree. */
	readonly totalCount: number;

	/** Number of entries (marks) in this tree. Mainly diagnostic. */
	readonly entryCount: number;

	/**
	 * Height of the underlying tree (1 for a single leaf). Diagnostic: a
	 * well-shaped tree's height should stay proportional to
	 * log(entryCount) - a much larger height for a small `entryCount`
	 * indicates the tree has accumulated redundant indirection (e.g. from
	 * `splitAt` without its `collapseSingleChildChain` normalization).
	 */
	readonly height: number;

	/** Locate the entry covering `offset`, which must be at least zero and less than `totalCount`. */
	atOffset(offset: number): { entry: T; offsetInEntry: number };

	/**
	 * Split into `[left, right]` such that `left.totalCount === offset`.
	 * May split a single entry into two (via the tree's configured
	 * `SplitEntry` function) if `offset` falls in the middle of an entry.
	 */
	splitAt(offset: number): [MarkTree<T>, MarkTree<T>];

	/**
	 * Concatenate `this` then `other`. Reuses subtrees of both inputs by
	 * reference wherever possible (no copying of untouched entries) -- this
	 * is the operation the compose algorithm's "bulk splice" relies on.
	 */
	concat(other: MarkTree<T>): MarkTree<T>;

	/** Materializes the tree back into a flat array, e.g. for tests/debugging. */
	toArray(): T[];
}

/** Build a tree from a flat array of entries. */
export function markTreeFromArray<T extends Counted>(
	entries: readonly T[],
	splitEntry: SplitEntry<T>,
	mergeEntries: MergeEntries<T>,
	maxNodeSize = 32,
): MarkTree<T> {
	const root = buildBalanced([...entries], maxNodeSize);
	return new MarkTreeImpl(root, splitEntry, mergeEntries, maxNodeSize);
}

// ============================================================================
// Node representation (forked from b+tree.js's BNode / BNodeInternal)
// ============================================================================

abstract class Node<T extends Counted> {
	// [COPY] identical to BNode.isShared: a COW marker. When a node is
	// referenced by more than one tree (e.g. after `clone()`, or after being
	// spliced by reference into a composed output), it is marked shared and
	// must be cloned before any in-place mutation.
	public isShared: boolean | undefined;

	public abstract readonly totalCount: number;
	public abstract readonly entryCount: number;

	// [NEW] Height of this subtree (1 for a leaf, 1 + child height for an
	// internal node). Not needed by any of the original BTree's operations
	// (a keyed map has no notion of "join two trees"), but essential here:
	// `join` (used by `concat`) descends the taller side's spine exactly
	// `|heightA - heightB|` steps before it can merge, which is what keeps
	// concatenation logarithmic instead of linear. Relies on the invariant
	// (preserved by every construction path below) that all children of a
	// given `Internal` node have equal height, same as a normal B-tree's
	// "all leaves at equal depth" invariant.
	public abstract readonly height: number;

	// [COPY] mirrors BNode.clone() / BNodeInternal.clone(): shallow copy of
	// this node's own arrays; does not recursively clone children/entries.
	public abstract clone(): Node<T>;

	// [COPY] mirrors BNode.greedyClone(): used when we need a fully-owned
	// (non-shared) copy of an entire subtree, e.g. before an in-place edit
	// that will touch many descendants.
	public abstract greedyClone(force?: boolean): Node<T>;

	/**
	 * [CHANGED] Replaces BNode.indexOf(key, failXor, cmp) — instead of a
	 * binary search comparing `keys[mid]` against a target key, we binary
	 * (or linear, for leaves) search comparing cumulative counts against a
	 * target offset.
	 */
	public abstract locate(offset: number): LocateResult;

	/**
	 * [COPY] mirrors BNode.splitOffRightSide(): removes and returns the
	 * right half of this node's contents, leaving `this` with the left half.
	 * Used when a node overflows `maxNodeSize` during insertion/splicing.
	 */
	public abstract splitOffRightSide(maxNodeSize: number): Node<T>;
}

interface LocateResult {
	/** For a leaf: the index within `entries`. For internal: the index within `children`. */
	index: number;
	/** Offset of the target position within the located entry/child. */
	offsetInChild: number;
}

class Leaf<T extends Counted> extends Node<T> {
	// [COPY] analogous to BNode.keys, but we store whole entries (T) rather
	// than separate parallel `keys`/`values` arrays, since we have no
	// separate "key" concept anymore.
	public entries: T[];

	// [NEW] `prefixSums[i]` = sum of `count` over `entries[0..i)`. Kept in
	// sync (recomputed) after every mutation, exactly the way `Internal`
	// keeps `cachedEntryCount`/`cachedTotalCount` in sync after its own
	// mutations. This is what turns `locate` from a linear scan into a
	// binary search - the same computational shape as `BNode.indexOf`'s
	// binary search over `keys`, just comparing cumulative counts instead of
	// calling a key comparator. `cachedTotalCount` piggybacks on the same
	// recompute pass so reading `totalCount` is O(1) instead of re-summing
	// every entry.
	private prefixSums: number[] = [];
	private cachedTotalCount = 0;

	public constructor(entries: T[]) {
		super();
		this.entries = entries;
		this.recomputeSums();
		nodeConstructionStats.count++;
	}

	private recomputeSums(): void {
		const sums: number[] = [];
		let running = 0;
		for (const entry of this.entries) {
			sums.push(running);
			running += entry.count;
		}
		this.prefixSums = sums;
		this.cachedTotalCount = running;
	}

	public get entryCount(): number {
		return this.entries.length;
	}

	public get totalCount(): number {
		return this.cachedTotalCount;
	}

	public readonly height: number = 1;

	// [COPY] same shape as BNode.clone().
	public clone(): Leaf<T> {
		return new Leaf([...this.entries]);
	}

	// [COPY] same shape as BNode.greedyClone().
	public greedyClone(force = false): Leaf<T> {
		return this.isShared === true && !force ? this : this.clone();
	}

	// [CHANGED] Was a linear scan; now a binary search over the cached
	// `prefixSums`, mirroring `BNode.indexOf`'s binary-search shape (compare
	// against cumulative counts instead of calling a key comparator). Finds
	// the largest `i` such that `prefixSums[i] <= offset`; since
	// `prefixSums[0] === 0` and callers only ever pass `0 <= offset <=
	// totalCount`, such an `i` always exists. Note this also reproduces the
	// old linear-scan version's "offset === totalCount is treated as one
	// past the last entry" convention for free, with no special-casing:
	// when `offset === totalCount`, the largest qualifying `i` is the last
	// entry, and `offsetInChild = totalCount - prefixSums[last] =
	// entries[last].count` automatically.
	public locate(offset: number): LocateResult {
		let lo = 0;
		let hi = this.prefixSums.length;
		while (lo < hi) {
			const mid = Math.floor((lo + hi) / 2);
			if ((this.prefixSums[mid] ?? fail("index in range")) <= offset) {
				lo = mid + 1;
			} else {
				hi = mid;
			}
		}
		const index = lo - 1;
		return {
			index,
			offsetInChild: offset - (this.prefixSums[index] ?? fail("offset within bounds")),
		};
	}

	// [COPY] renamed from BNode.insertInLeaf; same shape (splice into array).
	public insertEntry(i: number, entry: T): void {
		this.entries.splice(i, 0, entry);
		this.recomputeSums();
	}

	// [COPY] same shape as BNode.splitOffRightSide(), operating on `entries`.
	public splitOffRightSide(maxNodeSize: number): Leaf<T> {
		const half = Math.floor(this.entries.length / 2);
		const removed = this.entries.splice(half);
		this.recomputeSums();
		return new Leaf(removed);
	}

	// [COPY] same shape as BNode.takeFromRight() / takeFromLeft(): used
	// during rebalancing to shift one entry between adjacent siblings
	// instead of a full split/merge.
	public takeFromRight(rhs: Leaf<T>): void {
		const entry = rhs.entries.shift();
		if (entry !== undefined) {
			this.entries.push(entry);
			this.recomputeSums();
			rhs.recomputeSums();
		}
	}
	public takeFromLeft(lhs: Leaf<T>): void {
		const entry = lhs.entries.pop();
		if (entry !== undefined) {
			this.entries.unshift(entry);
			this.recomputeSums();
			lhs.recomputeSums();
		}
	}

	// [COPY] same shape as BNode.mergeSibling(): absorbs a whole sibling's
	// contents (used when a sibling has shrunk below the minimum node size).
	public mergeSibling(rhs: Leaf<T>): void {
		this.entries.push(...rhs.entries);
		this.recomputeSums();
	}
}

class Internal<T extends Counted> extends Node<T> {
	// [COPY] analogous to BNodeInternal.children.
	public children: Node<T>[];

	// [CHANGED] BNodeInternal cached a single aggregate, `_size` (= entry
	// count, purely for rebalancing decisions). We need *three* aggregates:
	// entryCount (kept for parity with the original rebalancing heuristics),
	// totalCount (the cell-count aggregate our offset queries walk), and
	// height ([NEW]; see the comment on `Node.height` for why `join`/`concat`
	// need it).
	private cachedEntryCount: number;
	private cachedTotalCount: number;
	private readonly cachedHeight: number;

	public constructor(children: Node<T>[]) {
		super();
		this.children = children;
		this.cachedEntryCount = children.reduce((s, c) => s + c.entryCount, 0);
		this.cachedTotalCount = children.reduce((s, c) => s + c.totalCount, 0);
		const firstChild = children[0] ?? fail("Internal node must have at least one child");
		// [NEW] Sanity check for the "all children of an Internal node have
		// equal height" invariant `join` relies on. Cheap: bounded by
		// `maxNodeSize`, same cost class as the reduces just above.
		assert(
			children.every((c) => c.height === firstChild.height),
			"All children of an Internal node must have equal height",
		);
		this.cachedHeight = firstChild.height + 1;
		nodeConstructionStats.count++;
	}

	public get entryCount(): number {
		return this.cachedEntryCount;
	}
	public get totalCount(): number {
		return this.cachedTotalCount;
	}
	public get height(): number {
		return this.cachedHeight;
	}

	// [COPY] same shape as BNodeInternal.clone(): marks children shared,
	// shallow-copies the children array only.
	public clone(): Internal<T> {
		for (const c of this.children) {
			c.isShared = true;
		}
		return new Internal([...this.children]);
	}

	// [COPY] same shape as BNodeInternal.greedyClone().
	public greedyClone(force = false): Internal<T> {
		if (this.isShared === true && !force) {
			return this;
		}
		const nu = new Internal([...this.children]);
		for (let i = 0; i < nu.children.length; i++) {
			nu.children[i] = (nu.children[i] ?? fail("index in range")).greedyClone(force);
		}
		return nu;
	}

	// [CHANGED] replaces BNodeInternal's key-comparator descent
	// (`this.indexOf(key, 0, tree._compare)`) with descent by cached child
	// `totalCount`, i.e., the segment-tree-style "compare against left
	// subtree size" walk.
	public locate(offset: number): LocateResult {
		let remaining = offset;
		for (let i = 0; i < this.children.length; i++) {
			const c = (this.children[i] ?? fail("index in range")).totalCount;
			if (remaining < c) {
				return { index: i, offsetInChild: remaining };
			}
			remaining -= c;
		}
		const lastIndex = this.children.length - 1;
		return {
			index: lastIndex,
			offsetInChild: (this.children[lastIndex] ?? fail("non-empty internal node")).totalCount,
		};
	}

	// [COPY] same overflow-handling shape as BNodeInternal.splitOffRightSide().
	public splitOffRightSide(maxNodeSize: number): Internal<T> {
		const half = Math.floor(this.children.length / 2);
		const rightChildren = this.children.splice(half);
		this.cachedEntryCount = this.children.reduce((s, c) => s + c.entryCount, 0);
		this.cachedTotalCount = this.children.reduce((s, c) => s + c.totalCount, 0);
		return new Internal(rightChildren);
	}
}

// ============================================================================
// Tree construction helpers
// ============================================================================

// [NEW] Bulk-build a balanced tree bottom-up from a flat array. The
// key-based library has an analogous bulk-load helper (`extended/bulkLoad`);
// this is a simplified version of that idea, adapted to build leaves that
// are balanced by entry count rather than by key ranges.
function buildBalanced<T extends Counted>(entries: T[], maxNodeSize: number): Node<T> {
	if (entries.length === 0) {
		return new Leaf<T>([]);
	}
	let level: Node<T>[] = [];
	for (let i = 0; i < entries.length; i += maxNodeSize) {
		level.push(new Leaf(entries.slice(i, i + maxNodeSize)));
	}
	while (level.length > 1) {
		const nextLevel: Node<T>[] = [];
		for (let i = 0; i < level.length; i += maxNodeSize) {
			nextLevel.push(new Internal(level.slice(i, i + maxNodeSize)));
		}
		level = nextLevel;
	}
	return level[0] ?? fail("level is never empty here");
}

// ============================================================================
// Tree concatenation ("join"): [NEW], no analogue in the key-based BTree.
//
// This is the operation the compose algorithm's "bulk splice" actually needs:
// gluing a reused block of marks (its own subtree) onto the side of another
// changeset's tree. Two keyed trees can't be "concatenated" (keys impose a
// global order that has no notion of "and then all of this tree's keys come
// after"), so this has no equivalent to fork from in b+tree.js - it borrows
// its *shape* from how balanced search trees (2-3 trees, weight-balanced
// trees, ropes) classically implement a "join" of two same-kind trees: walk
// down the taller side's spine until the two subtrees being glued have equal
// height, combine them directly (possibly overflowing and splitting, exactly
// like `BNodeInternal.set`'s overflow handling), and propagate any overflow
// back up the spine, which grows the overall height by at most 1 - the same
// way inserting into a full BTree root grows its height by 1.
//
// Complexity: only the O(|height(left) - height(right)|) nodes on the spine
// are visited/reconstructed; every sibling not on that spine is reused by
// reference (via `[...tall.children.slice(...), ...]`, which copies pointers,
// not subtrees). This is what keeps `concat` at O(log n) instead of the O(n)
// flatten-and-rebuild the previous version of this file did.
// ============================================================================

/**
 * A node at the seam of a join, or a pair of nodes if combining would have
 * overflowed `maxNodeSize` and had to split - mirroring the "child.set(...)
 * returns either `true`/`false` or a new right-sibling node to insert"
 * overflow-propagation signal already used by the copied
 * `BNodeInternal.set`-derived logic elsewhere in this file (see the
 * discussion of overflow handling in `Internal.splitOffRightSide`).
 */
type JoinResult<T extends Counted> = Node<T> | readonly [Node<T>, Node<T>];

function wrapJoinResult<T extends Counted>(result: JoinResult<T>): Node<T> {
	return Array.isArray(result) ? new Internal([...result]) : (result as Node<T>);
}

/** Combines two nodes of equal height, splitting into a pair if they'd overflow `maxNodeSize`. */
function joinSameHeight<T extends Counted>(
	left: Node<T>,
	right: Node<T>,
	maxNodeSize: number,
): JoinResult<T> {
	if (left instanceof Leaf) {
		const rightLeaf = right as Leaf<T>;
		// The only place this whole algorithm copies entries directly - and
		// only ever at most `2 * maxNodeSize` of them, i.e. O(1), since both
		// inputs are already-valid (at-most-maxNodeSize) leaves.
		const combined = [...left.entries, ...rightLeaf.entries];
		if (combined.length <= maxNodeSize) {
			return new Leaf(combined);
		}
		const leafMid = Math.ceil(combined.length / 2);
		return [new Leaf(combined.slice(0, leafMid)), new Leaf(combined.slice(leafMid))] as const;
	}

	const leftInternal = left as Internal<T>;
	const rightInternal = right as Internal<T>;
	// Reuses every grandchild by reference; only the two parent arrays are
	// (shallowly) copied.
	const combinedChildren = [...leftInternal.children, ...rightInternal.children];
	if (combinedChildren.length <= maxNodeSize) {
		return new Internal(combinedChildren);
	}
	const childMid = Math.ceil(combinedChildren.length / 2);
	return [
		new Internal(combinedChildren.slice(0, childMid)),
		new Internal(combinedChildren.slice(childMid)),
	] as const;
}

/** Attaches `short` to the right of `tall` (`tall.height > short.height`), descending `tall`'s rightmost spine. */
function joinRight<T extends Counted>(
	tall: Internal<T>,
	short: Node<T>,
	maxNodeSize: number,
): JoinResult<T> {
	const lastIndex = tall.children.length - 1;
	const lastChild = tall.children[lastIndex] ?? fail("Internal node must have at least one child");
	const merged =
		lastChild.height === short.height
			? joinSameHeight(lastChild, short, maxNodeSize)
			: joinRight(lastChild as Internal<T>, short, maxNodeSize);

	if (Array.isArray(merged)) {
		// Overflow one level down: this level now needs one extra slot.
		const newChildren = [...tall.children.slice(0, lastIndex), ...(merged as Node<T>[])];
		if (newChildren.length <= maxNodeSize) {
			return new Internal(newChildren);
		}
		const mid = Math.ceil(newChildren.length / 2);
		return [
			new Internal(newChildren.slice(0, mid)),
			new Internal(newChildren.slice(mid)),
		] as const;
	}
	return new Internal([...tall.children.slice(0, lastIndex), merged as Node<T>]);
}

/** Attaches `short` to the left of `tall` (`tall.height > short.height`), descending `tall`'s leftmost spine. */
function joinLeft<T extends Counted>(
	tall: Internal<T>,
	short: Node<T>,
	maxNodeSize: number,
): JoinResult<T> {
	const firstChild = tall.children[0] ?? fail("Internal node must have at least one child");
	const merged =
		firstChild.height === short.height
			? joinSameHeight(short, firstChild, maxNodeSize)
			: joinLeft(firstChild as Internal<T>, short, maxNodeSize);

	if (Array.isArray(merged)) {
		const newChildren = [...(merged as Node<T>[]), ...tall.children.slice(1)];
		if (newChildren.length <= maxNodeSize) {
			return new Internal(newChildren);
		}
		const mid = Math.ceil(newChildren.length / 2);
		return [
			new Internal(newChildren.slice(0, mid)),
			new Internal(newChildren.slice(mid)),
		] as const;
	}
	return new Internal([merged as Node<T>, ...tall.children.slice(1)]);
}

/** Concatenates two non-empty trees' roots into one. Entry point for `MarkTreeImpl.concat`. */
function join<T extends Counted>(left: Node<T>, right: Node<T>, maxNodeSize: number): Node<T> {
	if (left.height === right.height) {
		return wrapJoinResult(joinSameHeight(left, right, maxNodeSize));
	}
	if (left.height > right.height) {
		return wrapJoinResult(joinRight(left as Internal<T>, right, maxNodeSize));
	}
	return wrapJoinResult(joinLeft(right as Internal<T>, left, maxNodeSize));
}

// ============================================================================
// MarkTree implementation (the public-facing wrapper)
// ============================================================================

class MarkTreeImpl<T extends Counted> implements MarkTree<T> {
	public constructor(
		private readonly root: Node<T>,
		private readonly splitEntry: SplitEntry<T>,
		private readonly mergeEntries: MergeEntries<T>,
		private readonly maxNodeSize: number,
	) {}

	public get totalCount(): number {
		return this.root.totalCount;
	}
	public get entryCount(): number {
		return this.root.entryCount;
	}
	public get height(): number {
		return this.root.height;
	}

	// [CHANGED] conceptually replaces BTree.get(key): descend via `locate`
	// instead of comparator-based `indexOf`.
	public atOffset(offset: number): { entry: T; offsetInEntry: number } {
		let node: Node<T> = this.root;
		let remaining = offset;
		for (;;) {
			const { index, offsetInChild } = node.locate(remaining);
			if (node instanceof Leaf) {
				return {
					entry: node.entries[index] ?? fail("index in range"),
					offsetInEntry: offsetInChild,
				};
			}
			node = (node as Internal<T>).children[index] ?? fail("index in range");
			remaining = offsetInChild;
		}
	}

	// [NEW] No analogue in the key-based BTree (which has no notion of
	// "split the whole collection at a position"). Implemented via a
	// recursive descent that, at each level, keeps everything to one side of
	// the split point *by reference* (no cloning of untouched subtrees) and
	// only clones/splits the single spine of nodes containing the split
	// point. `collapseSingleChildChain` then trims away any redundant
	// one-child wrapper nodes the split left behind (see its own doc
	// comment for why that's the right analogue here to the real BTree's
	// post-delete rebalancing).
	public splitAt(offset: number): [MarkTree<T>, MarkTree<T>] {
		const [left, right] = splitNode(this.root, offset, this.splitEntry);
		return [
			new MarkTreeImpl(
				collapseSingleChildChain(left),
				this.splitEntry,
				this.mergeEntries,
				this.maxNodeSize,
			),
			new MarkTreeImpl(
				collapseSingleChildChain(right),
				this.splitEntry,
				this.mergeEntries,
				this.maxNodeSize,
			),
		];
	}

	// [NEW] No analogue in the key-based BTree (keys impose a global order,
	// so "concatenate two trees" isn't a meaningful keyed-BTree operation;
	// for us, sequence order is positional, so concatenation is fundamental).
	// Delegates to `join`, which rebalances only along the seam (classic
	// rope/finger-tree concatenation) and reuses both input trees' subtrees
	// by reference everywhere else - see the comment above `join` for the
	// full explanation. The empty-side checks are a correctness/performance
	// shortcut: an empty tree (e.g. the outer end of a `splitAt(0)` or
	// `splitAt(totalCount)` result) has no meaningful "height" to join
	// against, so we just return the other side untouched (zero new nodes).
	public concat(other: MarkTree<T>): MarkTree<T> {
		const otherImpl = other as MarkTreeImpl<T>;
		if (this.root.entryCount === 0) {
			return otherImpl;
		}
		if (otherImpl.root.entryCount === 0) {
			return this;
		}
		const joined = join(this.root, otherImpl.root, this.maxNodeSize);
		return new MarkTreeImpl(joined, this.splitEntry, this.mergeEntries, this.maxNodeSize);
	}

	public toArray(): T[] {
		const result: T[] = [];
		collect(this.root, result);
		return result;
	}
}

function collect<T extends Counted>(node: Node<T>, out: T[]): void {
	if (node instanceof Leaf) {
		out.push(...node.entries);
	} else {
		for (const c of (node as Internal<T>).children) {
			collect(c, out);
		}
	}
}

// [NEW] Recursive split helper. Returns [leftSubtree, rightSubtree] such
// that leftSubtree.totalCount === offset. This is the operation the compose
// algorithm's "jump N cells into Y and bulk-copy the rest" step depends on:
// everything strictly left/right of the spine touched by this recursion is
// reused by reference (`node.children[i]` is passed through untouched),
// never copied or iterated.
function splitNode<T extends Counted>(
	node: Node<T>,
	offset: number,
	splitEntry: SplitEntry<T>,
): [Node<T>, Node<T>] {
	if (node instanceof Leaf) {
		const leaf = node as Leaf<T>;
		const { index: leafIndex, offsetInChild: offsetInEntry } = leaf.locate(offset);
		const entry = leaf.entries[leafIndex] ?? fail("index in range");
		if (offsetInEntry === 0) {
			// Boundary falls exactly *before* `entry` (e.g. offset 0, or any
			// offset that lines up with the start of a mark): no mark needs
			// splitting, `entry` goes entirely to the right side.
			return [
				new Leaf(leaf.entries.slice(0, leafIndex)),
				new Leaf(leaf.entries.slice(leafIndex)),
			];
		}
		if (offsetInEntry === entry.count) {
			// Boundary falls exactly *after* `entry` (this is the case
			// `locate` returns for offset === totalCount, i.e. "one past the
			// last cell": it reports the last entry with offsetInChild equal
			// to that entry's own count, not 0). Again, no split needed,
			// `entry` goes entirely to the left side.
			return [
				new Leaf(leaf.entries.slice(0, leafIndex + 1)),
				new Leaf(leaf.entries.slice(leafIndex + 1)),
			];
		}
		const [entryLeft, entryRight] = splitEntry(entry, offsetInEntry);
		return [
			new Leaf([...leaf.entries.slice(0, leafIndex), entryLeft]),
			new Leaf([entryRight, ...leaf.entries.slice(leafIndex + 1)]),
		];
	}

	const internal = node as Internal<T>;
	const { index, offsetInChild } = internal.locate(offset);
	const [childLeft, childRight] = splitNode(
		internal.children[index] ?? fail("index in range"),
		offsetInChild,
		splitEntry,
	);
	// Everything before `index` is reused by reference (untouched); same for
	// everything after `index`. Only the single split child is replaced.
	return [
		new Internal([...internal.children.slice(0, index), childLeft]),
		new Internal([childRight, ...internal.children.slice(index + 1)]),
	];
}

/**
 * [NEW] Post-processing for `splitAt`. Collapses any chain of Internal nodes
 * that each have exactly one child - which is exactly what `splitNode`
 * produces when the split point is near the very start or end of a tree
 * (e.g. `splitAt(0)`, or repeatedly splitting off small pieces from a large
 * tree). A one-child Internal node is redundant indirection: `join` only
 * cares about `height`, so leaving these chains in place doesn't cause
 * incorrect results, but it does inflate `height` well beyond what the
 * node's actual content needs, which would make a later `concat`/`join`
 * walk more (wasted) spine steps than necessary.
 *
 * This is the closest analogue, for this two-independent-trees-returned
 * operation, to how the real BTree prevents underfull nodes after a delete
 * via `takeFromLeft`/`takeFromRight`/`mergeSibling`: those methods borrow
 * from a *sibling still living under the same parent*, which doesn't apply
 * here (splitAt's `left` and `right` are two separate root trees, not
 * siblings) - so instead of borrowing, we simply remove the redundant
 * wrapper. Cheap: at most one node visited per level, i.e. O(height) =
 * O(log n).
 */
function collapseSingleChildChain<T extends Counted>(node: Node<T>): Node<T> {
	let current = node;
	while (current instanceof Internal && current.children.length === 1) {
		current = current.children[0] ?? fail("index in range");
	}
	return current;
}
