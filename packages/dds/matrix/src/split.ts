/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SetOperations, Pair } from "./bspSet";

/** Represents a half-open interval [a, b) */
export type Ivl<Index extends number = number> = Pair<Index>;

/** A much faster version of `Math.max` specialized to two numeric arguments. */
const fastMax = <Index extends number>(x1: Index, x2: Index): Index => (x1 < x2 ? x2 : x1);

/** A much faster version of `Math.min` specialized to two numeric arguments. */
const fastMin = <Index extends number>(x1: Index, x2: Index): Index => (x1 < x2 ? x1 : x2);

export function ivlJoin<Index extends number>(ivl1: Ivl<Index>, ivl2: Ivl<Index>): Ivl<Index> {
	const [x1a, x1b] = ivl1;
	const [x2a, x2b] = ivl2;
	return [fastMin(x1a, x2a), fastMax(x1b, x2b)];
}

export function ivlMeets(ivl1: Ivl, ivl2: Ivl): boolean {
	const [x1a, x1b] = ivl1;
	const [x2a, x2b] = ivl2;
	return fastMax(x1a, x2a) < fastMin(x1b, x2b);
}

export function ivlMeetsOrTouches(ivl1: Ivl, ivl2: Ivl): boolean {
	const [x1a, x1b] = ivl1;
	const [x2a, x2b] = ivl2;
	return fastMax(x1a, x2a) <= fastMin(x1b, x2b);
}

/** computes the set difference on intervals. Precondition: they meet */
export function ivlExcept<Index extends number>(
	ivl1: Ivl<Index>,
	ivl2: Ivl<Index>,
): Ivl<Index> | undefined {
	const [x1a, x1b] = ivl1;
	const [x2a, x2b] = ivl2;
	if (x1a < x2a && x2b >= x1b) {
		return [x1a, x2a];
	}
	if (x1a >= x2a && x2b < x1b) {
		return [x2b, x1b];
	}
	return undefined;
}

function ivlMeet<Index extends number>(ivl1: Ivl<Index>, ivl2: Ivl<Index>): Ivl<Index> {
	const [x1a, x1b] = ivl1;
	const [x2a, x2b] = ivl2;
	return [fastMax(x1a, x2a), fastMin(x1b, x2b)];
}

export function ivlCompare<Index extends number>(
	ivl1: Ivl<Index>,
	ivl2: Ivl<Index>,
): -1 | 0 | 1 | undefined {
	const [x1a, x1b] = ivl1;
	const [x2a, x2b] = ivl2;
	if (x1a === x2a && x1b === x2b) {
		return 0;
	}
	if (x1a >= x2a && x1b <= x2b) {
		return -1;
	}
	if (x1a <= x2a && x1b >= x2b) {
		return 1;
	}
	return undefined;
}

export interface Distribution {
	/** The cummulative distribution function. This is used to compute the probabilty mass of a given interval. */
	readonly cdf: (x: number) => number;

	/** The inverse cummulative distribution function. This is used to estimate a point given a quantile. */
	readonly invCdf: (x: number) => number;
}

/** This is a bounded pareto distribution with a shape parameter `alpha`, a lower bound `L` and an upper bound `H`.
 * It has good properties for being used as a space splitting function in sofar, as it causes the indices to grow
 * exponentially. This behavior guarantees `O(log k)` as worst-case execution time when it's used as a space-splitting
 * function.
 *
 * On the other hand, we now can use it to approximate the access to grids better than just binary search, a
 * similar argument as for using exponential search. But we can use it to give exact probability masses for arbitrary
 * intervals. This allows us to search in both dimensions of a grid and use the probability mass to decide what axis
 * to cut next.
 */
export function boundedPareto(alpha: number, L: number, H: number): Distribution {
	const lAlpha = L ** alpha;
	const cdfDenom = 1 - (L / H) ** alpha;
	const hAlpha = H ** alpha;
	const hlAlpha = hAlpha * lAlpha;
	const hAlphaSubLAlpha = hAlpha - lAlpha;
	const negAlphaInv = -1 / alpha;

	const cdf =
		alpha === 1
			? (x: number) => (1 - lAlpha / x) / cdfDenom
			: (x: number) => (1 - lAlpha * x ** -alpha) / cdfDenom;
	const invCdf =
		alpha === 1
			? (y: number) => 1 / ((hAlpha - y * hAlphaSubLAlpha) / hlAlpha)
			: (y: number) => ((hAlpha - y * hAlphaSubLAlpha) / hlAlpha) ** negAlphaInv;

	return { cdf, invCdf };
}

/** Creates a dimension splitter that operates on integer interval values and is based on a bounded Pareto
 * distribution. */
export function boundedParetoSplitter<Index extends number>(
	alpha: number,
	L: number,
	H: number,
): DimensionSplitter<Pair<Index>> {
	const distribution = boundedPareto(alpha, L, H);
	return {
		canSplit: ([keyLb, keyUb]) => keyUb - keyLb > 1,
		split([keyLb, keyUb]: Pair<Index>) {
			const ubCdf = distribution.cdf(keyUb);
			const lbCdf = distribution.cdf(keyLb + 1);
			const cuttingPoint = distribution.invCdf((ubCdf + lbCdf) / 2);
			// pick a cutting point, but making sure either side has at least one element in it.
			const discreteCuttingPoint = Math.min(
				Math.max(Math.round(cuttingPoint), keyLb + 1),
				keyUb - 1,
			) as Index;

			const leftProb = distribution.cdf(discreteCuttingPoint) - distribution.cdf(keyLb + 1);
			const rightProb = distribution.cdf(keyUb) - distribution.cdf(discreteCuttingPoint);

			const result: Pair<Pair<Pair<Index>, number>> = [
				[[keyLb, discreteCuttingPoint], leftProb],
				[[discreteCuttingPoint, keyUb], rightProb],
			];
			return result;
		},
	};
}

export function boundedParetoSetOperations<Index extends number, Id>(
	alpha: number,
	L: number,
	H: number,
	top: Pair<Index>,
	id: Id,
): SetOperations<Pair<Index>, Id> {
	const splitter = boundedParetoSplitter<Index>(alpha, L, H);
	return {
		id,
		split: (key) => splitter.split(key),
		canSplit: (key) => splitter.canSplit(key),
		meets: ivlMeets,
		intersect: ivlMeet,
		union: (x, y) => (ivlMeetsOrTouches(x, y) ? ivlJoin(x, y) : undefined),
		except: ivlExcept,
		compare: ivlCompare,
		top,
	};
}

export interface DimensionSplitter<Key> {
	/** For a given key, returns if the key can be further sub-divided. */
	canSplit(key: Key): boolean;
	/** Splits a key and returns the probability mass for either half. */
	split(key: Key): Pair<Pair<Key, number>>;
}
