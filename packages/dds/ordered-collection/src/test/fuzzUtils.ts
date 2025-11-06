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
	takeAsync as take,
} from "@fluid-private/stochastic-test-utils";
import type {
	DDSFuzzModel,
	DDSFuzzSuiteOptions,
	DDSFuzzTestState,
} from "@fluid-private/test-dds-utils";

import { ConsensusQueueFactory } from "../consensusOrderedCollectionFactory.js";
import type { IConsensusOrderedCollection } from "../interfaces.js";
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
	resultType: ConsensusResult;
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
			resultType: state.random.pick([ConsensusResult.Complete, ConsensusResult.Release]),
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
		});
}

function makeReducer(): Reducer<ConsensusOrderedCollectionOperation, FuzzTestState> {
	const reducer = combineReducers<ConsensusOrderedCollectionOperation, FuzzTestState>({
		add: ({ client }, { value }) => {
			client.channel.add(value).catch((error) => {
				throw error;
			});
		},
		acquire: ({ client }, { resultType }) => {
			// Fire and forget - the fuzz framework handles sequencing
			client.channel
				.acquire(async (value) => {
					return resultType;
				})
				.catch((error) => {
					throw error;
				});
		},
	});
	return reducer;
}

function assertEqualConsensusOrderedCollections(
	a: IConsensusOrderedCollection,
	b: IConsensusOrderedCollection,
): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
	const aData = (a as any).data;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
	const bData = (b as any).data;
	assert.deepEqual(aData, bData, "Internal data properties should be equal");
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
	generatorFactory: () => take(100, makeOperationGenerator()),
	reducer: makeReducer(),
	validateConsistency: (a, b) => assertEqualConsensusOrderedCollections(a.channel, b.channel),
	factory: new ConsensusQueueFactory(),
};
