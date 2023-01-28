/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { __assign } from "tslib";
/** An interface for representing a readonly pair */
export type Pair<S, T = S> = readonly [S, T];

export const pair = <S, T = S>(left: S, right: T): Pair<S, T> => [left, right];

// using this polyfill, because `Object.assign` is not supported in IE.
const ObjectAssign: typeof Object.assign = __assign;

export enum SetKind {
	Dense,
	Empty,
}

interface TreeNode<Left, Right> {
	readonly left: Left;
	readonly right: Right;
}

interface KeyNode<Key, Exact> {
	readonly key: Key;
	readonly pathKey: Key;
	readonly isExact: Exact;
}

export type Empty = SetKind.Empty;

/** The term *Dense* means that a given subset contains all the elements of its particular
 * bounds. E.g. the whole set would be dense w.r.t. the bounds of the whole space. Or
 * if a set represents an interval [a, b), then it would be dense, if there are no holes in it,
 * i.e. the set is represented exactly using the current bounds.
 */
export type Dense = SetKind.Dense;

export const dense = SetKind.Dense;
export const empty = SetKind.Empty;

type KeyUnexact<Key> = KeyNode<Key, false>;

/** In the BSP-set, each node carries with it implicit bounds just by the position in the tree.
 * Furthermore, it can carry around a key. The key can either be an approximation, i.e. an upper bound
 * or it can be *exact*. Exact means, that the whole set can be exactly represented in terms of just the key.
 *
 * One might wonder, why we don't prune the tree at this point. This has to do with the fact that we are
 * representing arbitrary sets and so even though one of two sets could be represented exactly the other
 * might not be able to yet. In this case we need to unfold the key by splitting further. In order to avoid
 * excessive splitting and pruning, we just carry around the key but allow the tree to also be materialized, on-demand.
 */
type KeyExact<Key> = KeyNode<Key, true>;

type KeyUndefined = KeyNode<undefined, false>;
type KeyDefined<Key> = KeyUnexact<Key> | KeyExact<Key>;

type BalancePropertyHelper<Key, Left, Right> = TreeNode<
	UntypedSparse<Key> | Left,
	UntypedSparse<Key> | Right
>;

type TreeDefined<Key> =
	| BalancePropertyHelper<Key, Empty, Dense>
	| BalancePropertyHelper<Key, Dense, Empty>;
type TreeUndefined = TreeNode<undefined, undefined>;

type KeyDefinednessProperty<Key> = KeyDefined<Key> | KeyUndefined;

export type UntypedSparse<Key> =
	| (KeyDefinednessProperty<Key> & TreeDefined<Key>)
	| (KeyDefined<Key> & TreeUndefined);
/** The term *untyped* refers to the tree representation of a BSP set. Because BSP set trees are only compared in terms
 * of their structure, we need to ensure that cuts occur at the same exact points across all possible sets. This is
 * enforced by the fact, that at construction time, we attach an `Id` to each BSP set and only allow operations to
 * occur on sets with the same `Id`.
 *
 * The BSP set becomes *untyped*, when we drop that `Id`; now it is possible to operate on sets that are incompatible.
 * Doing this, however, allows us to store the set operations only once per set as opposed to carrying them around with
 * every node.
 */
export type UntypedBspSet<Key> = Empty | Dense | UntypedSparse<Key>;

/** A set is considred *sparse*, if we know that w.r.t. to it's bounds it is neither empty, nor dense. */
interface Sparse<Key extends Cachable<Key>, Id> {
	setOperations: SetOperations<Key, Id>;
	root: UntypedSparse<Key>;
}
export type BspSet<Key extends Cachable<Key>, Id> = Empty | Dense | Sparse<Key, Id>;

export interface KeyCache<T> {
	depth?: number;
	split?: Pair<Pair<CachedKey<T>, number>>;
}
export type CachedKey<T> = T & KeyCache<T>;
export type Cachable<T> = Disjoint<keyof T, keyof KeyCache<T>>;

export type Disjoint<T, U> = [T, U] extends [Exclude<T, U>, Exclude<U, T>] ? any : never;
export type RequireAtLeastOne<T> = {
	[K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>;
}[keyof T];

/** This is a concrete set operations implementation, tagged with an arbitrary id. */
export interface SetOperations<Key extends Cachable<Key>, Id> {
	/** Id here is just a phantom type, so that we can associate the various set instances together */
	readonly id: Id;

	/** Split the key into two. This will only be called when the current key is incomparable with an element.
	 * E.g. this would never be called if the key is already a 1x1 rectangle. */
	readonly split: (key: CachedKey<Key>) => Pair<Pair<CachedKey<Key>, number>>;

	/** Tells, if a given key can be split further */
	readonly canSplit: (key: CachedKey<Key>) => boolean;

	/** Tells if two keys overlap at all. */
	readonly meets: (key1: Key, key2: Key) => boolean;

	/** Intersect the keys, if it is possible to exactly respresent their intersection.
	 * An implementation is never required to compute the intersection as this is just an optimization.
	 * Precondition: It is guaranteed that the keys meet and that they are incomparable.
	 */
	readonly intersect: (key1: Key, key2: Key) => Key | undefined;

	/** Unions the keys, if it is possible to exactly represent their union.
	 * An implementation is never required to compute the union as this is just an optimization.
	 * Precondition: It is guaranteed that the keys are incomparable.
	 */
	readonly union: (key1: Key, key2: Key) => Key | undefined;

	/** Computes the set difference between two keys, if it is possible to exactly represent their set difference.
	 * An implementation is never required to compute the difference as this is just an optimization.
	 * Precondition: It is guaranteed that the keys meet.
	 */
	readonly except: (key1: Key, key2: Key) => Key | undefined;

	/** Compare two keys */
	readonly compare: (key1: Key, key2: Key) => -1 | 0 | 1 | undefined;

	/** The top element of the set. */
	readonly top: Key;
}

export const cacheKeySplitting =
	<Key>(
		splitFunction: (key: CachedKey<Key>) => Pair<Pair<CachedKey<Key>, number>>,
		top: CachedKey<Key>,
		maxDepth: number = 10,
	) =>
	(key: CachedKey<Key>) => {
		if (key.split !== undefined) {
			return key.split;
		}

		const split = splitFunction(key);
		const depth = key === top ? 0 : key.depth;
		if (depth !== undefined && depth < maxDepth) {
			key.split = split;
			split[0][0].depth = depth + 1;
			split[1][0].depth = depth + 1;
		}

		return split;
	};

export function fromUntyped<Key extends Cachable<Key>, Id>(
	setOperations: SetOperations<Key, Id>,
	root: UntypedBspSet<Key>,
): BspSet<Key, Id> {
	if (root === empty || root === dense) {
		return root;
	}
	return { setOperations, root };
}

const sparse = <Key, Exact, Left, Right>(
	left: Left,
	right: Right,
	pathKey: Key,
	key: Key,
	isExact: Exact,
) => ({ key, pathKey, left, right, isExact });

function fromKey<Key>(pathKey: Key, key: Key, isExact: boolean): UntypedSparse<Key> {
	if (isExact) {
		return sparse(undefined, undefined, pathKey, key, true as const);
	}

	return sparse(undefined, undefined, pathKey, key, false as const);
}

export function lazy<Key extends Cachable<Key>, Id>(
	setOperations: SetOperations<Key, Id>,
	pathKey: Key,
	key: Key,
): UntypedBspSet<Key> {
	if (!setOperations.meets(pathKey, key)) {
		return empty;
	}
	const cmp = setOperations.compare(pathKey, key);
	if (cmp !== undefined) {
		if (cmp <= 0) {
			return dense;
		}

		return fromKey(pathKey, key, true);
	}

	// this is not exactly necessary, but increases the amount of exact nodes and thus we can often
	// prune earlier.
	// Also, having intersect always work guarantees exact nodes, thus allowing for more efficient
	// storage and computation.
	const newKey = setOperations.intersect(pathKey, key);

	if (newKey !== undefined) {
		return fromKey(pathKey, newKey, true);
	}

	return fromKey(pathKey, key, false);
}

export function createFromKey<Key extends Cachable<Key>, Id>(
	uncachedSetOperations: SetOperations<Key, Id>,
) {
	const setOperations = {
		...uncachedSetOperations,
		split: cacheKeySplitting(uncachedSetOperations.split, uncachedSetOperations.top),
	};
	return (key: Key) => fromUntyped(setOperations, lazy(setOperations, setOperations.top, key));
}

function unionExact<Key extends Cachable<Key>, Id>(
	setOperations: SetOperations<Key, Id>,
	left: UntypedBspSet<Key> & KeyExact<Key>,
	right: UntypedBspSet<Key> & KeyExact<Key>,
) {
	const { pathKey, key: leftKey } = left;
	const { key: rightKey } = right;

	const cmp = setOperations.compare(leftKey, rightKey);
	if (cmp !== undefined) {
		return cmp < 0 ? right : left;
	}

	const combinedKey = setOperations.union(leftKey, rightKey);
	if (combinedKey !== undefined) {
		const combinedCmp = setOperations.compare(combinedKey, pathKey);
		if (combinedCmp !== undefined && combinedCmp === 0) {
			return dense;
		}
		return fromKey(pathKey, combinedKey, true);
	}
	return undefined;
}

/** This is an local combination, not a proper union. We use it to have simpler code elsewhere */
function combineChildren<Key>(
	left: UntypedBspSet<Key>,
	right: UntypedBspSet<Key>,
): Empty | Dense | (UntypedSparse<Key> & TreeDefined<Key>) {
	if (left === empty) {
		if (right === empty) {
			return empty;
		}

		return sparse(left, right, undefined, undefined, false as const);
	}

	if (right === empty) {
		return sparse(left, right, undefined, undefined, false as const);
	}

	if (left === dense) {
		if (right === dense) {
			return dense;
		}
		return sparse(left, right, undefined, undefined, false as const);
	}

	return sparse(left, right, undefined, undefined, false as const);
}

function materialize<Key extends Cachable<Key>, Id>(
	setOperations: SetOperations<Key, Id>,
	set: UntypedSparse<Key>,
): UntypedSparse<Key> & TreeDefined<Key> {
	if (set.left !== undefined) {
		return set;
	}

	const [[left], [right]] = setOperations.split(set.pathKey);
	const lChild = lazy(setOperations, left, set.key);
	const rChild = lazy(setOperations, right, set.key);

	const res = combineChildren<Key>(lChild, rChild);

	if (res === empty || res === dense) {
		throw new Error("incorrect set operations implementation");
	}

	// first check, that res actually has the desired type
	const typeCheck: TreeDefined<Key> = res;

	const setAlias: UntypedSparse<Key> = set;
	return ObjectAssign(setAlias, {
		left: typeCheck.left,
		right: typeCheck.right,
	});
}

export function unionUntyped<Key extends Cachable<Key>, Id>(
	setOperations: SetOperations<Key, Id>,
	left: UntypedBspSet<Key>,
	right: UntypedBspSet<Key>,
): UntypedBspSet<Key> {
	if (right === empty) {
		return left;
	}
	if (right === dense) {
		return right;
	}
	if (left === empty) {
		return right;
	}
	if (left === dense) {
		return left;
	}

	if (left.isExact && right.isExact) {
		const res = unionExact<Key, Id>(setOperations, left, right);
		if (res !== undefined) {
			return res;
		}
	}

	const newLeft = materialize<Key, Id>(setOperations, left);
	const newRight = materialize<Key, Id>(setOperations, right);

	const lChild = unionUntyped(setOperations, newLeft.left, newRight.left);
	const rChild = unionUntyped(setOperations, newLeft.right, newRight.right);

	return combineChildren(lChild, rChild);
}

export function union<Key extends Cachable<Key>, Id>(
	left: BspSet<Key, Id>,
	right: BspSet<Key, Id>,
): BspSet<Key, Id> {
	if (right === empty) {
		return left;
	}
	if (right === dense) {
		return right;
	}
	if (left === empty) {
		return right;
	}
	if (left === dense) {
		return left;
	}

	return fromUntyped(
		left.setOperations,
		unionUntyped<Key, Id>(left.setOperations, left.root, right.root),
	);
}

function intersectExact<Key extends Cachable<Key>, Id>(
	setOperations: SetOperations<Key, Id>,
	left: UntypedBspSet<Key> & KeyExact<Key>,
	right: UntypedBspSet<Key> & KeyExact<Key>,
) {
	const { pathKey, key: leftKey } = left;
	const { key: rightKey } = right;

	if (!setOperations.meets(leftKey, rightKey)) {
		return empty;
	}

	const cmp = setOperations.compare(leftKey, rightKey);
	if (cmp !== undefined) {
		return cmp < 0 ? left : right;
	}

	const combinedKey = setOperations.intersect(leftKey, rightKey);
	if (combinedKey !== undefined) {
		return fromKey(pathKey, combinedKey, true);
	}

	return undefined;
}

export function intersectUntyped<Key extends Cachable<Key>, Id>(
	setOperations: SetOperations<Key, Id>,
	left: UntypedBspSet<Key>,
	right: UntypedBspSet<Key>,
): UntypedBspSet<Key> {
	if (left === empty) {
		return left;
	}
	if (right === empty) {
		return right;
	}
	if (left === dense) {
		return right;
	}
	if (right === dense) {
		return left;
	}

	if (left.isExact && right.isExact) {
		const res = intersectExact<Key, Id>(setOperations, left, right);
		if (res !== undefined) {
			return res;
		}
	}

	const newLeft = materialize<Key, Id>(setOperations, left);
	const newRight = materialize<Key, Id>(setOperations, right);

	const lChild = intersectUntyped(setOperations, newLeft.left, newRight.left);
	const rChild = intersectUntyped(setOperations, newLeft.right, newRight.right);

	return combineChildren(lChild, rChild);
}

export function intersect<Key extends Cachable<Key>, Id>(
	left: BspSet<Key, Id>,
	right: BspSet<Key, Id>,
): BspSet<Key, Id> {
	if (left === empty) {
		return left;
	}
	if (right === empty) {
		return right;
	}
	if (left === dense) {
		return right;
	}
	if (right === dense) {
		return left;
	}

	return fromUntyped(
		left.setOperations,
		intersectUntyped<Key, Id>(left.setOperations, left.root, right.root),
	);
}

export function meetsUntyped<Key extends Cachable<Key>, Id>(
	setOperations: SetOperations<Key, Id>,
	left: UntypedBspSet<Key>,
	right: UntypedBspSet<Key>,
): boolean {
	if (left === empty || right === empty) {
		return false;
	}
	if (left === dense || right === dense) {
		return true;
	}
	if (left.isExact && right.isExact) {
		return setOperations.meets(left.key, right.key);
	}

	const newLeft = materialize<Key, Id>(setOperations, left);
	const newRight = materialize<Key, Id>(setOperations, right);

	return (
		meetsUntyped(setOperations, newLeft.left, newRight.left) ||
		meetsUntyped(setOperations, newLeft.right, newRight.right)
	);
}

export function meets<Key extends Cachable<Key>, Id>(
	left: BspSet<Key, Id>,
	right: BspSet<Key, Id>,
): boolean {
	if (left === empty || right === empty) {
		return false;
	}
	if (left === dense || right === dense) {
		return true;
	}
	return meetsUntyped<Key, Id>(left.setOperations, left.root, right.root);
}

function exceptExact<Key extends Cachable<Key>, Id>(
	setOperations: SetOperations<Key, Id>,
	left: UntypedSparse<Key> & KeyExact<Key>,
	right: KeyExact<Key>,
) {
	const { pathKey, key: leftKey } = left;
	const { key: rightKey } = right;

	if (!setOperations.meets(leftKey, rightKey)) {
		return left;
	}

	const combinedKey = setOperations.except(leftKey, rightKey);
	if (combinedKey !== undefined) {
		return fromKey(pathKey, combinedKey, true);
	}

	return undefined;
}

export function exceptUntyped<Key extends Cachable<Key>, Id>(
	setOperations: SetOperations<Key, Id>,
	left: UntypedBspSet<Key>,
	right: UntypedBspSet<Key>,
): UntypedBspSet<Key> {
	if (left === empty) {
		return left;
	}
	if (right === empty) {
		return left;
	}
	if (right === dense) {
		return empty;
	}
	if (left === dense) {
		const newRight_inner = materialize<Key, Id>(setOperations, right);
		const lChild_inner = exceptUntyped(setOperations, dense, newRight_inner.left);
		const rChild_inner = exceptUntyped(setOperations, dense, newRight_inner.right);
		return combineChildren(lChild_inner, rChild_inner);
	}
	if (left.isExact && right.isExact) {
		const res = exceptExact<Key, Id>(setOperations, left, right);
		if (res !== undefined) {
			return res;
		}
	}
	const newLeft = materialize<Key, Id>(setOperations, left);
	const newRight = materialize<Key, Id>(setOperations, right);

	const lChild = exceptUntyped(setOperations, newLeft.left, newRight.left);
	const rChild = exceptUntyped(setOperations, newLeft.right, newRight.right);

	return combineChildren(lChild, rChild);
}

export function except<Key extends Cachable<Key>, Id>(
	left: BspSet<Key, Id>,
	right: BspSet<Key, Id>,
): BspSet<Key, Id> {
	if (left === empty) {
		return left;
	}
	if (right === empty) {
		return left;
	}
	if (right === dense) {
		return empty;
	}
	if (left === dense) {
		return fromUntyped(
			right.setOperations,
			exceptUntyped<Key, Id>(right.setOperations, left, right.root),
		);
	}

	return fromUntyped(
		left.setOperations,
		exceptUntyped<Key, Id>(left.setOperations, left.root, right.root),
	);
}

const compareExact = <Key extends Cachable<Key>, Id>(
	setOperations: SetOperations<Key, Id>,
	left: KeyExact<Key>,
	right: KeyExact<Key>,
) => setOperations.compare(left.key, right.key);

export function combineCmp(left: -1 | 0 | 1 | undefined, right: -1 | 0 | 1 | undefined) {
	if (left === undefined || right === undefined) {
		return undefined;
	}
	if (left === 0) {
		return right;
	}
	if (right === 0) {
		return left;
	}
	return left === right ? left : undefined;
}

export function compareUntyped<Key extends Cachable<Key>, Id>(
	setOperations: SetOperations<Key, Id>,
	left: UntypedBspSet<Key>,
	right: UntypedBspSet<Key>,
): -1 | 0 | 1 | undefined {
	if (left === right) {
		return 0;
	}

	if (left === empty) {
		return -1;
	}

	if (right === empty) {
		return 1;
	}

	if (left === dense) {
		if (right === dense) {
			return 0;
		}

		return 1;
	}

	if (right === dense) {
		return -1;
	}

	if (left.isExact && right.isExact) {
		return compareExact(setOperations, left, right);
	}

	const newLeft = materialize<Key, Id>(setOperations, left);
	const newRight = materialize<Key, Id>(setOperations, right);
	const lCmp = compareUntyped(setOperations, newLeft.left, newRight.left);
	if (lCmp === undefined) {
		return undefined;
	}

	const rCmp = compareUntyped(setOperations, newLeft.right, newRight.right);

	if (rCmp === undefined) {
		return undefined;
	}

	return combineCmp(lCmp, rCmp);
}

export function compare<Key extends Cachable<Key>, Id>(
	left: BspSet<Key, Id>,
	right: BspSet<Key, Id>,
) {
	if (left === right) {
		return 0;
	}

	if (left === empty) {
		return -1;
	}

	if (right === empty) {
		return 1;
	}

	if (left === dense) {
		if (right === dense) {
			return 0;
		}

		return 1;
	}

	if (right === dense) {
		return -1;
	}

	return compareUntyped<Key, Id>(left.setOperations, left.root, right.root);
}

export const symmetricDiff = <Key extends Cachable<Key>, Id>(
	left: BspSet<Key, Id>,
	right: BspSet<Key, Id>,
) => union(except(left, right), except(right, left));

export const complement = <Key extends Cachable<Key>, Id>(set: BspSet<Key, Id>) =>
	except(dense, set);

function getNodeCountUntyped<T>(set: UntypedBspSet<T> | undefined): number {
	if (set === undefined || set === empty || set === dense) {
		return 0;
	}

	return getNodeCountUntyped(set.left) + getNodeCountUntyped(set.right) + 1;
}

export function getNodeCount<Key extends Cachable<Key>, Id>(set: BspSet<Key, Id>) {
	if (set === empty || set === dense) {
		return 0;
	}
	return getNodeCountUntyped(set.root);
}

function forEachKeyUntyped<Key extends Cachable<Key>, Id>(
	setOperations: SetOperations<Key, Id>,
	set: UntypedBspSet<Key>,
	f: (key: Key) => boolean,
): boolean {
	function loop(pathKey: Key, set_inner: UntypedBspSet<Key>): boolean {
		if (set_inner === empty) {
			return true;
		}
		if (set_inner === dense) {
			return f(pathKey);
		}
		if (set_inner.isExact) {
			return f(set_inner.key);
		}

		const newSet = materialize<Key, Id>(setOperations, set_inner);
		const [[left], [right]] = setOperations.split(pathKey);
		return loop(left, newSet.left) && loop(right, newSet.right);
	}

	return loop(setOperations.top, set);
}

export function forEachKey<Key extends Cachable<Key>, Id>(
	set: Empty | Sparse<Key, Id>,
	f: (key: Key) => boolean,
): boolean {
	if (set === empty) {
		return true;
	}
	return forEachKeyUntyped(set.setOperations, set.root, f);
}
