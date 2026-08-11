/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import * as path from "node:path";

import type {
	AsyncGenerator as Generator,
	Reducer,
} from "@fluid-private/stochastic-test-utils";
import {
	combineReducers,
	createWeightedAsyncGenerator as createWeightedGenerator,
	takeAsync as take,
} from "@fluid-private/stochastic-test-utils";
import type {
	DDSFuzzModel,
	DDSFuzzSuiteOptions,
	DDSFuzzTestState,
} from "@fluid-private/test-dds-utils";

import type { IIncrementOperation } from "../counter.js";
import { CounterFactory } from "../counterFactory.js";
import type { ISharedCounter } from "../interfaces.js";

import { _dirname } from "./dirname.cjs";

/**
 * Default options for Counter fuzz testing
 */
export const defaultOptions: Partial<DDSFuzzSuiteOptions> = {
	validationStrategy: { type: "fixedInterval", interval: 10 },
	clientJoinOptions: {
		maxNumberOfClients: 6,
		clientAddProbability: 0.05,
		stashableClientProbability: 0.2,
	},
	defaultTestCount: 100,
	saveFailures: { directory: path.join(_dirname, "../../src/test/results") },
};

type FuzzTestState = DDSFuzzTestState<CounterFactory>;

/**
 * Represents Counter operation types for fuzz testing
 */
export type CounterOperation = IIncrementOperation;

function makeOperationGenerator(): Generator<CounterOperation, FuzzTestState> {
	async function increment(state: FuzzTestState): Promise<CounterOperation> {
		return {
			type: "increment",
			incrementAmount: state.random.integer(-10, 10),
		};
	}

	const clientBaseOperationGenerator = createWeightedGenerator<
		CounterOperation,
		FuzzTestState
	>([[increment, 1]]);

	return async (state: FuzzTestState) =>
		clientBaseOperationGenerator({
			...state,
		});
}

function makeReducer(): Reducer<CounterOperation, FuzzTestState> {
	const reducer = combineReducers<CounterOperation, FuzzTestState>({
		increment: ({ client }, { incrementAmount }) => {
			client.channel.increment(incrementAmount);
		},
	});
	return reducer;
}

function assertEqualCounters(a: ISharedCounter, b: ISharedCounter): void {
	assert.equal(a.value, b.value, `Counter values do not match: ${a.value} !== ${b.value}`);
}

/**
 * Base fuzz model for Counter
 */
export const baseCounterModel: DDSFuzzModel<CounterFactory, CounterOperation, FuzzTestState> =
	{
		workloadName: "default configuration",
		generatorFactory: () => take(100, makeOperationGenerator()),
		reducer: makeReducer(),
		validateConsistency: (a, b) => assertEqualCounters(a.channel, b.channel),
		factory: new CounterFactory(),
	};
