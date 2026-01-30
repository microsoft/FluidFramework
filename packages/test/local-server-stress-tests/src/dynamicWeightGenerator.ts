/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	AcceptanceCondition,
	AsyncGenerator,
	BaseFuzzTestState,
} from "@fluid-private/stochastic-test-utils";

/**
 * A function that computes a weight dynamically based on the current state.
 */
export type WeightFunction<TState> = (state: TState) => number;

/**
 * A weight can be either a static number or a dynamic function that computes the weight based on state.
 */
export type DynamicWeight<TState> = number | WeightFunction<TState>;

/**
 * Array of weighted generators to select from, supporting dynamic weights.
 */
export type DynamicAsyncWeights<TOp, TState> = [
	TOp | AsyncGenerator<TOp, TState>,
	DynamicWeight<TState>,
	AcceptanceCondition<TState>?,
][];

/**
 * Evaluates a weight, which can be either a static number or a function that computes the weight.
 */
function evaluateWeight<TState>(weight: DynamicWeight<TState>, state: TState): number {
	return typeof weight === "function" ? weight(state) : weight;
}

/**
 * Creates a weighted async generator that supports dynamic weights.
 *
 * Unlike `createWeightedAsyncGenerator` from stochastic-test-utils which only accepts
 * static numeric weights, this function allows weights to be functions that are
 * evaluated at runtime with the current state.
 *
 * @param weights - Array of [generator, weight, acceptanceCondition?] tuples where
 * weight can be a number or a function (state) =\> number
 */
export function createWeightedAsyncGeneratorWithDynamicWeights<
	T,
	TState extends BaseFuzzTestState,
>(weights: DynamicAsyncWeights<T, TState>): AsyncGenerator<T, TState> {
	return async (state) => {
		// Evaluate weights dynamically and compute cumulative sums
		const cumulativeSums: [
			T | AsyncGenerator<T, TState>,
			number,
			AcceptanceCondition<TState>?,
		][] = [];
		let totalWeight = 0;
		for (const [generator, weight, acceptCondition] of weights) {
			const evaluatedWeight = evaluateWeight(weight, state);
			const cumulativeWeight = totalWeight + evaluatedWeight;
			if (evaluatedWeight > 0) {
				cumulativeSums.push([generator, cumulativeWeight, acceptCondition]);
			}
			totalWeight = cumulativeWeight;
		}

		if (totalWeight === 0) {
			throw new Error(
				"createWeightedAsyncGeneratorWithDynamicWeights must have some positive weight",
			);
		}

		const { random } = state;
		const sample = (): number => {
			const weightSelected = random.real(0, totalWeight);

			let opIndex = 0;
			while (
				opIndex + 1 < cumulativeSums.length &&
				cumulativeSums[opIndex][1] < weightSelected
			) {
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
		return typeof tOrGenerator === "function"
			? (tOrGenerator as AsyncGenerator<T, TState>)(state)
			: (tOrGenerator as unknown as T);
	};
}
