/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	AsyncGenerator as Generator,
	Reducer,
} from "@fluid-private/stochastic-test-utils";
import {
	combineReducers,
	createWeightedAsyncGenerator as createWeightedGenerator,
	takeAsync as take,
} from "@fluid-private/stochastic-test-utils";
import type { DDSFuzzModel, DDSFuzzTestState } from "@fluid-private/test-dds-utils";

import type { IIncrementOperation } from "../counter.js";
import { CounterFactory } from "../counterFactory.js";
import type { ISharedCounter } from "../interfaces.js";

/**
 * Default options for Counter fuzz testing
 */
export const defaultOptions: Required<OperationGenerationConfig> = {
	validateInterval: 10,
	testCount: 100,
	operations: 100,
};

type FuzzTestState = DDSFuzzTestState<CounterFactory>;

/**
 * Represents Counter operation types for fuzz testing
 */
export type CounterOperation = IIncrementOperation;

/**
 * Config options for generating Counter operations
 */
interface OperationGenerationConfig {
	/**
	 * Number of ops in between each synchronization/validation of the Counters
	 */
	validateInterval?: number;
	/**
	 * Number of tests to generate
	 */
	testCount?: number;
	/**
	 * Number of operations to perform in each test
	 */
	operations?: number;
}

function makeOperationGenerator(): Generator<CounterOperation, FuzzTestState> {
	type OpSelectionState = FuzzTestState;

	async function increment(state: OpSelectionState): Promise<CounterOperation> {
		return {
			type: "increment",
			incrementAmount: state.random.integer(-10, 10),
		};
	}

	const clientBaseOperationGenerator = createWeightedGenerator<
		CounterOperation,
		OpSelectionState
	>([[increment, 1]]);

	return async (state: FuzzTestState) =>
		clientBaseOperationGenerator({
			...state,
		});
}

interface LoggingInfo {
	/**
	 * ids of the Counters to track over time
	 */
	counterNames: string[];
}

function makeReducer(loggingInfo?: LoggingInfo): Reducer<CounterOperation, FuzzTestState> {
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
