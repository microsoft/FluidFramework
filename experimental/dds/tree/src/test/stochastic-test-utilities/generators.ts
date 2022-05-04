/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	AcceptanceCondition,
	AsyncGenerator,
	AsyncWeights,
	BaseFuzzTestState,
	done,
	Generator,
	Weights,
} from './types';

export function createWeightedGenerator<T, TState extends BaseFuzzTestState>(
	weights: Weights<T, TState>
): Generator<T, TState> {
	const cumulativeSums: [T | Generator<T, TState>, number, AcceptanceCondition<TState>?][] = [];
	let totalWeight = 0;
	for (const [tOrGenerator, weight, shouldAccept] of weights) {
		const cumulativeWeight = totalWeight + weight;
		cumulativeSums.push([tOrGenerator, cumulativeWeight, shouldAccept]);
		totalWeight = cumulativeWeight;
	}

	return (state) => {
		const { random } = state;
		const sample = () => {
			const weightSelected = random.integer(1, totalWeight);

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
			? (tOrGenerator as Generator<T, TState>)(state)
			: (tOrGenerator as unknown as T);
	};
}

/**
 * Higher-order generator operator which creates a new generator producing the first `n` elements of `generator`.
 */
export function take<T, TState>(n: number, generator: Generator<T, TState>): Generator<T, TState> {
	let count = 0;
	return (state) => {
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
export function generatorFromArray<T, TAdditionalState>(contents: T[]): Generator<T, TAdditionalState> {
	let index = -1;
	return () => {
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
export function chain<T, TState>(...generators: Generator<T, TState>[]): Generator<T, TState> {
	let currentIndex = 0;
	return (state) => {
		while (currentIndex < generators.length) {
			const generator = generators[currentIndex];
			const result = generator(state);
			if (result !== done) {
				return result;
			} else {
				currentIndex++;
			}
		}
		return done;
	};
}

/**
 * Higher-order generator operator which exhausts each input generator sequentially before moving on to the next.
 */
export function chainIterables<T, TState>(generators: Generator<Generator<T, TState>, void>): Generator<T, TState> {
	let currentGenerator = generators();
	return (state) => {
		while (currentGenerator !== done) {
			const result = currentGenerator(state);
			if (result !== done) {
				return result;
			}

			currentGenerator = generators();
		}

		return done;
	};
}

/**
 * Interleaves outputs from `generator1` and `generator2`.
 * By default outputs are taken one at a time, but can be controlled with `numOps1` and `numOps2`.
 * This is useful in stochastic tests for producing a certain operation (e.g. "validate" or "synchronize") at a defined interval.
 * @example
 * ```typescript
 * // Assume gen1 produces 1, 2, 3, ... and gen2 produces 'a', 'b', 'c', ...
 * interleave(gen1, gen2) // 1, a, 2, b, 3, c, ...
 * interleave(gen1, gen2, 2) // 1, 2, a, 3, 4, b, 5, 6, c, ...
 * interleave(gen1, gen2, 2, 3) // 1, 2, a, b, c, 3, 4, d, e, f, ...
 * ```
 */
export function interleave<T, TState>(
	generator1: Generator<T, TState>,
	generator2: Generator<T, TState>,
	numOps1 = 1,
	numOps2 = 1
): Generator<T, TState> {
	let generatorIndex = 0;
	return chainIterables(() => {
		generatorIndex += 1;
		if (generatorIndex % 2 === 1) {
			return take(numOps1, generator1);
		} else {
			return take(numOps2, generator2);
		}
	});
}

/**
 * Creates a generator for an infinite stream of `t`s.
 * @param t Output value to repeatedly generate.
 */
export function repeat<T>(t: T): Generator<T, unknown> {
	return () => t;
}

export function createWeightedAsyncGenerator<T, TState extends BaseFuzzTestState>(
	weights: AsyncWeights<T, TState>
): AsyncGenerator<T, TState> {
	const cumulativeSums: [T | AsyncGenerator<T, TState>, number, AcceptanceCondition<TState>?][] = [];
	let totalWeight = 0;
	for (const [tOrGenerator, weight, shouldAccept] of weights) {
		const cumulativeWeight = totalWeight + weight;
		cumulativeSums.push([tOrGenerator, cumulativeWeight, shouldAccept]);
		totalWeight = cumulativeWeight;
	}

	return async (state) => {
		const { random } = state;
		const sample = () => {
			const weightSelected = random.integer(1, totalWeight);

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
export function takeAsync<T, TState>(n: number, generator: AsyncGenerator<T, TState>): AsyncGenerator<T, TState> {
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
export function asyncGeneratorFromArray<T, TAdditionalState>(contents: T[]): AsyncGenerator<T, TAdditionalState> {
	const generator = generatorFromArray(contents);
	return async (state) => generator(state);
}

/**
 * Higher-order generator operator which exhausts each input generator sequentially before moving on to the next.
 */
export function chainAsync<T, TState>(...generators: AsyncGenerator<T, TState>[]): AsyncGenerator<T, TState> {
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

/**
 * Higher-order generator operator which exhausts each input generator sequentially before moving on to the next.
 */
export function chainAsyncIterables<T, TState>(
	generators: AsyncGenerator<AsyncGenerator<T, TState>, void>
): AsyncGenerator<T, TState> {
	let currentGeneratorP = generators();
	return async (state) => {
		const currentGenerator = await currentGeneratorP;
		while (currentGenerator !== done) {
			const result = await currentGenerator(state);
			if (result !== done) {
				return result;
			}

			currentGeneratorP = generators();
		}

		return done;
	};
}

/**
 * Interleaves outputs from `generator1` and `generator2`.
 * By default outputs are taken one at a time, but can be controlled with `numOps1` and `numOps2`.
 * This is useful in stochastic tests for producing a certain operation (e.g. "validate" or "synchronize") at a defined interval.
 * @example
 * ```typescript
 * // Assume gen1 produces 1, 2, 3, ... and gen2 produces 'a', 'b', 'c', ...
 * interleave(gen1, gen2) // 1, a, 2, b, 3, c, ...
 * interleave(gen1, gen2, 2) // 1, 2, a, 3, 4, b, 5, 6, c, ...
 * interleave(gen1, gen2, 2, 3) // 1, 2, a, b, c, 3, 4, d, e, f, ...
 * ```
 */
export function interleaveAsync<T, TState>(
	generator1: AsyncGenerator<T, TState>,
	generator2: AsyncGenerator<T, TState>,
	numOps1 = 1,
	numOps2 = 1
): AsyncGenerator<T, TState> {
	let generatorIndex = 0;
	return chainAsyncIterables(async () => {
		generatorIndex += 1;
		if (generatorIndex % 2 === 1) {
			return takeAsync(numOps1, generator1);
		} else {
			return takeAsync(numOps2, generator2);
		}
	});
}

/**
 * Creates a generator for an infinite stream of `t`s.
 * @param t Output value to repeatedly generate.
 */
export function repeatAsync<T>(t: T): AsyncGenerator<T, unknown> {
	return async () => t;
}
