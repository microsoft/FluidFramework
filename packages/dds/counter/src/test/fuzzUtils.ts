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

function makeOperationGenerator(): Generator<IIncrementOperation, FuzzTestState> {
	type OpSelectionState = FuzzTestState & {
		incrementAmount: number;
	};

	async function increment(state: OpSelectionState): Promise<IIncrementOperation> {
		return {
			type: "increment",
			incrementAmount: state.random.integer(-10, 10),
		};
	}

	const clientBaseOperationGenerator = createWeightedGenerator<
		IIncrementOperation,
		OpSelectionState
	>([[increment, 1]]);

	return async (state: FuzzTestState) =>
		clientBaseOperationGenerator({
			...state,
			incrementAmount: state.random.integer(-10, 10),
		});
}

interface LoggingInfo {
	/**
	 * ids of the Counters to track over time
	 */
	counterNames: string[];
}

function logCurrentState(state: FuzzTestState, loggingInfo: LoggingInfo): void {
	for (const client of state.clients) {
		const counter = client.channel;
		assert(counter !== undefined);
		if (loggingInfo.counterNames.includes(client.containerRuntime.clientId)) {
			console.log(`Counter ${counter.id} value: ${counter.value}\n`);
		}
	}
}

function makeReducer(loggingInfo?: LoggingInfo): Reducer<IIncrementOperation, FuzzTestState> {
	const withLogging =
		<T>(baseReducer: Reducer<T, FuzzTestState>): Reducer<T, FuzzTestState> =>
		(state, operation) => {
			if (loggingInfo !== undefined) {
				logCurrentState(state, loggingInfo);
				console.log("-".repeat(20));
				console.log("Next operation:", JSON.stringify(operation, undefined, 4));
			}
			baseReducer(state, operation);
		};

	const reducer = combineReducers<IIncrementOperation, FuzzTestState>({
		increment: ({ client }, { incrementAmount }) => {
			client.channel.increment(incrementAmount);
		},
	});

	return withLogging(reducer);
}

function assertEqualCounters(a: ISharedCounter, b: ISharedCounter): void {
	assert.equal(a.value, b.value, `Counter values do not match: ${a.value} !== ${b.value}`);
}

/**
 * Base fuzz model for Counter
 */
export const baseCounterModel: DDSFuzzModel<
	CounterFactory,
	IIncrementOperation,
	FuzzTestState
> = {
	workloadName: "default configuration",
	generatorFactory: () => take(100, makeOperationGenerator()),
	reducer: makeReducer(),
	validateConsistency: (a, b) => assertEqualCounters(a.channel, b.channel),
	factory: new CounterFactory(),
};
