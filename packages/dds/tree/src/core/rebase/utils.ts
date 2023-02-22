/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";

/**
 * Find an ancestor of some descendant.
 * @param descendant - a descendant. If an empty `path` array is included, it will be populated
 * with the chain of ancestry for `descendant` from most distant to closest (including `descendant`,
 * but not including the ancestor found by `predicate`).
 * @param predicate - a function which will be evaluated on every ancestor of `descendant` until it returns true.
 * @returns the closest ancestor of `descendant` that satisfies `predicate`, or `undefined` if no such ancestor exists.
 * @example
 * ```ts
 * interface Parented {
 *   id: string;
 *   parent?: Parented;
 * }
 * const g = { id: "g" }; // Grandparent
 * const p = { parent: g, id: "p" }; // Parent
 * const c = { parent: p, id: "c" }; // Child
 * const path: Parented[] = [];
 * const ancestor = findAncestor<Parented>([c, path], (n) => n.id === "g");
 * // ancestor === g
 * // path === [p, c]
 * ```
 */
export function findAncestor<T extends { parent?: T }>(
	descendant: T | [descendant: T, path?: T[]] | undefined,
	predicate: (t: T) => boolean,
): T | undefined {
	let d: T | undefined;
	let path: T[] | undefined;
	if (Array.isArray(descendant)) {
		[d, path] = descendant;
	} else {
		d = descendant;
	}
	for (let cur = d; cur !== undefined; cur = cur.parent) {
		if (predicate(cur)) {
			return cur;
		}
		path?.unshift(cur);
	}

	if (path !== undefined) {
		path.length = 0;
	}
	return undefined;
}

/**
 * Find a common ancestor between two descendants that are linked by parent pointers.
 * @param descendantA - a descendant. If an empty `path` array is included, it will be populated
 * with the chain of commits from the ancestor to `descendantA` (not including the ancestor).
 * @param descendantB - another descendant. If an empty `path` array is included, it will be populated
 * with the chain of commits from the ancestor to `descendantB` (not including the ancestor).
 * @returns the common ancestor of `descendantA` and `descendantB`, or `undefined` if no such ancestor exists.
 * @example
 * ```ts
 * interface Parented {
 *   parent?: Parented;
 * }
 * const shared = {};
 * const a = { parent: shared };
 * const b1 = { parent: shared };
 * const b2 = { parent: b1 };
 * const pathB: Parented[] = []
 * const ancestor = findCommonAncestor<Parented>(a, [b2, pathB]);
 * // ancestor === shared
 * // pathB === [b1, b2]
 * ```
 */
export function findCommonAncestor<T extends { parent?: T }>(
	descendantA: T | [descendantA: T, path?: T[]] | undefined,
	descendantB: T | [descendantB: T, path?: T[]] | undefined,
): T | undefined {
	let a: T | undefined;
	let b: T | undefined;
	let pathA: T[] | undefined;
	let pathB: T[] | undefined;
	if (Array.isArray(descendantA)) {
		[a, pathA] = descendantA;
		assert(pathA === undefined || pathA.length === 0, "Path A must be empty");
	} else {
		a = descendantA;
	}
	if (Array.isArray(descendantB)) {
		[b, pathB] = descendantB;
		assert(pathB === undefined || pathB.length === 0, "Path B must be empty");
	} else {
		b = descendantB;
	}

	if (a === b) {
		return a;
	}

	const visited = new Set();
	while (a !== undefined || b !== undefined) {
		if (a !== undefined) {
			if (visited.has(a)) {
				if (pathB !== undefined) {
					const indexInPathB = pathB.findIndex((r) => Object.is(r, a));
					pathB.splice(0, indexInPathB + 1);
				}
				return a;
			}
			visited.add(a);
			pathA?.unshift(a);
			a = a.parent;
		}

		if (b !== undefined) {
			if (visited.has(b)) {
				if (pathA !== undefined) {
					const indexInPathA = pathA.findIndex((r) => Object.is(r, b));
					pathA.splice(0, indexInPathA + 1);
				}
				return b;
			}
			visited.add(b);
			pathB?.unshift(b);
			b = b.parent;
		}
	}

	if (pathA !== undefined) {
		pathA.length = 0;
	}
	if (pathB !== undefined) {
		pathB.length = 0;
	}
	return undefined;
}
