/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AcceptanceCondition, AsyncGenerator, done, Weights } from './Types';

export function createWeightedGenerator<T, TState extends { rand: Random }>(
	weights: Weights<T, TState>
): AsyncGenerator<T, TState> {
	const cumulativeSums: [T | AsyncGenerator<T, TState>, number, AcceptanceCondition<TState>?][] = [];
	let totalWeight = 0;
	for (const [tOrGenerator, weight, shouldAccept] of weights) {
		const cumulativeWeight = totalWeight + weight;
		cumulativeSums.push([tOrGenerator, cumulativeWeight, shouldAccept]);
		totalWeight = cumulativeWeight;
	}

	return async (state) => {
		const { rand } = state;
		const sample = () => {
			const weightSelected = rand.integer(1, totalWeight);

			let opIndex = 0;
			while (cumulativeSums[opIndex][1] < weightSelected) {
				opIndex++;
			}

			return opIndex;
		};

		let index;
		let shouldAccept: AcceptanceCondition<TState> | undefined;
		do {
			index = sample();
			shouldAccept = cumulativeSums[index][2];
		} while (!(shouldAccept?.(state) ?? true));

		const [tOrGenerator] = cumulativeSums[index];
		return typeof tOrGenerator === 'function'
			? (tOrGenerator as AsyncGenerator<T, TState>)(state)
			: (tOrGenerator as unknown as T);
	};
}

/**
 * Higher-order generator operator which creates a new generator producing the first `n` elements of `generator`.
 */
export function take<T, TState>(n: number, generator: AsyncGenerator<T, TState>): AsyncGenerator<T, TState> {
	let count = 0;
	return async (state) => {
		if (count < n) {
			count++;
			return generator(state);
		}
		return done;
	};
}

/**
 * @returns a deterministic generator that always returns the items of `contents` in order.
 */
export function generatorFromArray<T, TAdditionalState>(contents: T[]): AsyncGenerator<T, TAdditionalState> {
	let index = -1;
	return async () => {
		if (index < contents.length) {
			index++;
			return contents[index] ?? done;
		}
		return done;
	};
}

/**
 * Higher-order generator operator which exhausts each input generator sequentially before moving on to the next.
 */
export function chain<T, TState>(...generators: AsyncGenerator<T, TState>[]): AsyncGenerator<T, TState> {
	let currentIndex = 0;
	return async (state) => {
		while (currentIndex < generators.length) {
			const generator = generators[currentIndex];
			const result = await generator(state);
			if (result !== done) {
				return result;
			} else {
				currentIndex++;
			}
		}
		return done;
	};
}
