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
	makeRandom,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import type {
	DDSFuzzModel,
	DDSFuzzSuiteOptions,
	DDSFuzzTestState,
} from "@fluid-private/test-dds-utils";

import { ConsensusQueueFactory } from "../consensusOrderedCollectionFactory.js";
import type { IConsensusOrderedCollection, IOrderedCollection } from "../interfaces.js";
import { ConsensusResult } from "../interfaces.js";

import { _dirname } from "./dirname.cjs";

/**
 * Config options for generating ConsensusOrderedCollection operations
 */
interface ConsensusOrderedCollectionValueConfig {
	/**
	 * Number of values to be generated for the pool
	 */
	valuePoolSize?: number;
	/**
	 * Length of value strings
	 */
	valueStringLength?: number;
}

const valueConfigs: Required<ConsensusOrderedCollectionValueConfig> = {
	valuePoolSize: 3,
	valueStringLength: 5,
};

/**
 * Default options for ConsensusOrderedCollection fuzz testing
 */
export const defaultOptions: Partial<DDSFuzzSuiteOptions> = {
	validationStrategy: { type: "fixedInterval", interval: 10 },
	clientJoinOptions: {
		maxNumberOfClients: 6,
		clientAddProbability: 0.05,
	},
	defaultTestCount: 100,
	saveFailures: { directory: path.join(_dirname, "../../src/test/results") },
};

type FuzzTestState = DDSFuzzTestState<ConsensusQueueFactory>;

export interface AddOperation {
	type: "add";
	value: string;
}

export interface AcquireOperation {
	type: "acquire";
	result: ConsensusResult;
}

/**
 * Represents ConsensusOrderedCollection operation types for fuzz testing
 */
export type ConsensusOrderedCollectionOperation = AddOperation | AcquireOperation;

function makeOperationGenerator(): Generator<
	ConsensusOrderedCollectionOperation,
	FuzzTestState
> {
	type OpSelectionState = FuzzTestState & {
		itemValue: string;
		pendingCallbacks: Map<string, string>;
	};

	const valuePoolRandom = makeRandom(0);
	const dedupe = <T>(arr: T[]): T[] => [...new Set(arr)];
	const valuePool = dedupe(
		Array.from({ length: valueConfigs.valuePoolSize }, () =>
			valuePoolRandom.string(valueConfigs.valueStringLength),
		),
	);

	async function add(state: OpSelectionState): Promise<AddOperation> {
		return {
			type: "add",
			value: state.itemValue,
		};
	}

	async function acquire(state: OpSelectionState): Promise<AcquireOperation> {
		return {
			type: "acquire",
			result: state.random.pick([ConsensusResult.Complete, ConsensusResult.Release]),
		};
	}

	const clientBaseOperationGenerator = createWeightedGenerator<
		ConsensusOrderedCollectionOperation,
		OpSelectionState
	>([
		[add, 1],
		[acquire, 1],
	]);

	return async (state: FuzzTestState) =>
		clientBaseOperationGenerator({
			...state,
			itemValue: state.random.pick(valuePool),
			pendingCallbacks: new Map<string, string>(),
		});
}

// Track async errors that occur during fire-and-forget operations
let pendingAsyncError: Error | undefined;

function makeReducer(): Reducer<ConsensusOrderedCollectionOperation, FuzzTestState> {
	const reducer = combineReducers<ConsensusOrderedCollectionOperation, FuzzTestState>({
		add: ({ client }, { value }) => {
			client.channel.add(value).catch((error: Error) => {
				pendingAsyncError = error;
			});
		},
		acquire: ({ client }, { result }) => {
			client.channel
				.acquire(async (_value: string): Promise<ConsensusResult> => {
					return result;
				})
				.catch((error: Error) => {
					pendingAsyncError = error;
				});
		},
	});
	return reducer;
}

function assertEqualConsensusOrderedCollections(
	a: IConsensusOrderedCollection,
	b: IConsensusOrderedCollection,
): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
	const aData = (a as any).data as IOrderedCollection<string>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
	const bData = (b as any).data as IOrderedCollection<string>;
	assert.equal(aData.size, bData.size, "Data sizes should be equal");
	assert.deepEqual(aData.asArray(), bData.asArray(), "Data contents should be equal");

	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
	const aJobTracking = (a as any).jobTracking as Map<
		string,
		{ value: string; clientId: string | undefined }
	>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
	const bJobTracking = (b as any).jobTracking as Map<
		string,
		{ value: string; clientId: string | undefined }
	>;

	assert.equal(aJobTracking.size, bJobTracking.size, "Job tracking sizes should be equal");
	for (const [key, aJob] of aJobTracking.entries()) {
		const bJob = bJobTracking.get(key);
		assert.deepEqual(aJob, bJob, `Job tracking entry for key ${key} should be equal`);
	}
}

/**
 * Base fuzz model for ConsensusOrderedCollection
 */
export const baseConsensusOrderedCollectionModel: DDSFuzzModel<
	ConsensusQueueFactory,
	ConsensusOrderedCollectionOperation,
	FuzzTestState
> = {
	workloadName: "default configuration",
	generatorFactory: () => takeAsync(100, makeOperationGenerator()),
	reducer: makeReducer(),
	validateConsistency: (a, b) => {
		// Check if any async errors occurred during fire-and-forget operations
		if (pendingAsyncError !== undefined) {
			throw pendingAsyncError;
		}
		assertEqualConsensusOrderedCollections(a.channel, b.channel);
	},
	factory: new ConsensusQueueFactory(),
};
