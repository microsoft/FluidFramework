/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MersenneTwister19937, pick, Engine } from "random-js";

/**
 * Converts all properties of an object to arrays of the
 * properties potential values. This will be used by generatePairwiseOptions
 * to compute original objects that contain pairwise combinations of all property values
 * @internal
 */
export type OptionsMatrix<T extends Record<string, any>> = Required<{
	[K in keyof T]: readonly T[K][];
}>;

/**
 * @internal
 */
export const booleanCases: readonly boolean[] = [true, false];

/**
 * @internal
 */
export const numberCases: readonly (number | undefined)[] = [undefined];

type PartialWithKeyCount<T extends Record<string, any>> = Partial<T> & {
	__partialKeyCount?: number;
};

function applyPairToPartial<T extends Record<string, any>>(
	randEng: Engine,
	keyCount: number,
	partials: PartialWithKeyCount<T>[],
	pair: { iKey: keyof T; jKey: keyof T; iVal: any; jVal: any },
) {
	const matchingPartials: PartialWithKeyCount<T>[] = [];
	for (const partial of partials) {
		// the pair exists, so nothing to do
		if (
			pair.iKey in partial &&
			pair.jKey in partial &&
			partial[pair.iKey] === pair.iVal &&
			partial[pair.jKey] === pair.jVal
		) {
			return;
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		if (partial.__partialKeyCount! < keyCount) {
			if (
				(pair.iKey in partial &&
					!(pair.jKey in partial) &&
					partial[pair.iKey] === pair.iVal) ||
				(pair.jKey in partial &&
					!(pair.iKey in partial) &&
					partial[pair.jKey] === pair.jVal)
			) {
				matchingPartials.push(partial);
			}
		}
	}
	if (matchingPartials.length === 0) {
		const partial: PartialWithKeyCount<T> = {};
		partial.__partialKeyCount = 2;
		partial[pair.iKey] = pair.iVal;
		partial[pair.jKey] = pair.jVal;
		partials.push(partial);
	} else {
		const found = pick(randEng, matchingPartials);
		if (pair.iKey in found) {
			found[pair.jKey] = pair.jVal;
		} else {
			found[pair.iKey] = pair.iVal;
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		found.__partialKeyCount!++;
	}
}

/**
 * @internal
 */
export function generatePairwiseOptions<T extends Record<string, any>>(
	optionsMatrix: OptionsMatrix<T>,
	randomSeed: number = 0x35843,
): T[] {
	const randEng = MersenneTwister19937.seed(randomSeed);

	// sort keys biggest to smallest, and prune those with only an undefined option
	const matrixKeys: (keyof T)[] = Object.keys(optionsMatrix)
		.filter((k) => optionsMatrix[k].length > 1 || optionsMatrix[k][0] !== undefined)
		.sort((a, b) => optionsMatrix[b].length - optionsMatrix[a].length);

	if (matrixKeys.length === 0) {
		return [];
	}

	if (matrixKeys.length === 1) {
		const values = optionsMatrix[matrixKeys[0]];
		return values.map<T>((v) => {
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			return { [matrixKeys[0]]: v } as T;
		});
	}

	// compute all pairs, and apply them
	const partials: PartialWithKeyCount<T>[] = [];
	for (let i = 0; i < matrixKeys.length - 1; i++) {
		const iKey = matrixKeys[i];
		for (let j = i + 1; j < matrixKeys.length; j++) {
			const jKey = matrixKeys[j];
			for (const iVal of optionsMatrix[iKey]) {
				for (const jVal of optionsMatrix[jKey]) {
					applyPairToPartial(randEng, matrixKeys.length, partials, {
						iKey,
						iVal,
						jKey,
						jVal,
					});
				}
			}
		}
	}

	// fix up any incomplete outputs
	for (const partial of partials) {
		if (partial.__partialKeyCount !== matrixKeys.length) {
			for (const key of matrixKeys) {
				if (!(key in partial)) {
					partial[key] = pick(randEng, optionsMatrix[key] as any[]);
				}
			}
		}
		delete partial.__partialKeyCount;
	}

	return partials as T[];
}
