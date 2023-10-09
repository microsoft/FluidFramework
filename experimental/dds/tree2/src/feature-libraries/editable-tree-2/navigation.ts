/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const Skip = Symbol("Skip");
export type Skip = typeof Skip;

/**
 * Visit iterable tree.
 *
 * @remarks
 * Non-recursive depth first traversal.
 */
export function visitIterableTree<T>(
	root: T,
	iterator: (t: T) => Iterable<T>,
	visitor: (item: T) => Skip | void,
): void {
	const queue: Iterable<T>[] = [[root]];
	let next: Iterable<T> | undefined;
	while ((next = queue.pop())) {
		for (const child of next) {
			if (visitor(child) !== Skip) {
				queue.push(iterator(child));
			}
		}
	}
}

/**
 * Visit iterable tree.
 * Allows state to be computed in parents and passed to children.
 *
 * @remarks
 * Non-recursive depth first traversal.
 */
export function visitIterableTreeWithState<T extends Iterable<T>, StatePassedDown>(
	root: T,
	initial: StatePassedDown,
	visitor: (item: T, fromAbove: StatePassedDown) => Skip | StatePassedDown,
): void {
	const queue: [StatePassedDown, Iterable<T>][] = [[initial, root]];
	let next: [StatePassedDown, Iterable<T>] | undefined;
	while ((next = queue.pop())) {
		const [state, nestItem] = next;
		for (const child of nestItem) {
			const result = visitor(child, state);
			if (result !== Skip) {
				queue.push([result, child]);
			}
		}
	}
}

/**
 * Visit bipartite iterable tree.
 *
 * @remarks
 * Non-recursive depth first traversal.
 *
 * Particularly useful for processing trees with their alternating node and field levels.
 */
export function visitBipartiteIterableTree<A extends Iterable<B>, B extends Iterable<A>>(
	root: A,
	visitorA: (item: A) => Skip | undefined,
	visitorB: (item: B) => Skip | undefined,
) {
	const queueA = [root];
	let nextA: A | undefined;
	while ((nextA = queueA.pop())) {
		if (visitorA(nextA) !== Skip) {
			for (const nextB of nextA) {
				if (visitorB(nextB) !== Skip) {
					for (const child of nextB) {
						queueA.push(child);
					}
				}
			}
		}
	}
}

/**
 * Visit bipartite iterable tree.
 * Allows state to be computed in parents and passed to children.
 *
 * @remarks
 * Non-recursive depth first traversal.
 *
 * Particularly useful for processing trees with their alternating node and field levels.
 *
 * @privateRemarks
 * Other traversal cases, like ones passing data up (via map or reduce patterns) could be supported by extending this or adding more utilities.
 * Such utility functions really only provide an improvement of hand coding each cases if the non-recessiveness is required.
 * Since supporting very deeps trees hasn't been a priority, such visitors are also not a priority, and are thus not included here for now.
 */
export function visitBipartiteIterableTreeWithState<A, B, StateA, StateB>(
	root: A,
	fromAbove: StateA,
	iterateA: (a: A) => Iterable<B>,
	iterateB: (b: B) => Iterable<A>,
	visitorA: (item: A, fromAbove: StateA) => Skip | StateB,
	visitorB: (item: B, fromAbove: StateB) => Skip | StateA,
) {
	const queueA: [A, StateA][] = [[root, fromAbove]];
	let next: [A, StateA] | undefined;
	while ((next = queueA.pop())) {
		const result = visitorA(...next);
		if (result !== Skip) {
			for (const nextB of iterateA(next[0])) {
				const resultB = visitorB(nextB, result);
				if (resultB !== Skip) {
					for (const child of iterateB(nextB)) {
						queueA.push([child, resultB]);
					}
				}
			}
		}
	}
}
