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

import { ConsensusRegisterCollectionFactory } from "../consensusRegisterCollectionFactory.js";
import type { IConsensusRegisterCollection } from "../interfaces.js";
import { ReadPolicy } from "../interfaces.js";

import { _dirname } from "./dirname.cjs";

/**
 * Default options for ConsensusRegisterCollection fuzz testing
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

type FuzzTestState = DDSFuzzTestState<ConsensusRegisterCollectionFactory>;

interface WriteOperation {
	type: "write";
	key: string;
	value: string;
}

/**
 * ConsensusRegisterCollection operation types for fuzz testing
 */
type Operation = WriteOperation;

/**
 * Config options for generating ConsensusRegisterCollection operations
 */
interface OperationGenerationConfig {
	/**
	 * Number of keys to be generated
	 */
	keyPoolSize?: number;
	/**
	 * Length of key strings
	 */
	keyStringLength?: number;
	/**
	 * Length of value strings
	 */
	valueStringLength?: number;
}

/**
 * Default configuration for operation generation
 */
const defaultGenerationConfig: Required<OperationGenerationConfig> = {
	keyPoolSize: 5,
	keyStringLength: 3,
	valueStringLength: 5,
};

function makeOperationGenerator(
	optionsParam?: OperationGenerationConfig,
): Generator<Operation, FuzzTestState> {
	const fullOptions: Required<OperationGenerationConfig> = {
		...defaultGenerationConfig,
		...optionsParam,
	};
	type OpSelectionState = FuzzTestState & {
		key: string;
	};

	const keyPoolRandom = makeRandom(0);
	const dedupe = <T>(arr: T[]): T[] => [...new Set(arr)];
	const keyPool = dedupe(
		Array.from({ length: fullOptions.keyPoolSize }, () =>
			keyPoolRandom.string(fullOptions.keyStringLength),
		),
	);

	async function write(state: OpSelectionState): Promise<WriteOperation> {
		return {
			type: "write",
			key: state.key,
			value: state.random.string(fullOptions.valueStringLength),
		};
	}

	const clientBaseOperationGenerator = createWeightedGenerator<Operation, OpSelectionState>([
		[write, 1],
	]);

	return async (state: FuzzTestState) =>
		clientBaseOperationGenerator({
			...state,
			key: state.random.pick(keyPool),
		});
}

// Track async errors that occur during fire-and-forget operations
let pendingAsyncError: Error | undefined;

function makeReducer(): Reducer<Operation, FuzzTestState> {
	return combineReducers<Operation, FuzzTestState>({
		write: ({ client }, { key, value }) => {
			client.channel.write(key, value).catch((error) => {
				pendingAsyncError = error;
			});
		},
	});
}

function assertEqualConsensusRegisterCollections(
	a: IConsensusRegisterCollection,
	b: IConsensusRegisterCollection,
): void {
	const aKeys = a.keys();
	const bKeys = b.keys();
	assert.deepEqual(aKeys, bKeys, "Keys do not match");

	for (const key of aKeys) {
		const aValueLWW = a.read(key, ReadPolicy.LWW);
		const bValueLWW = b.read(key, ReadPolicy.LWW);
		assert.deepEqual(aValueLWW, bValueLWW, `LWW Values do not match for key: ${key}`);

		const aValueAtomic = a.read(key, ReadPolicy.Atomic);
		const bValueAtomic = b.read(key, ReadPolicy.Atomic);
		assert.deepEqual(aValueAtomic, bValueAtomic, `Atomic Values do not match for key: ${key}`);

		const aVersions = a.readVersions(key) ?? [];
		const bVersions = b.readVersions(key) ?? [];
		assert.deepEqual(aVersions, bVersions, `Versions do not match for key: ${key}`);
	}
}

/**
 * Base fuzz model for ConsensusRegisterCollection
 */
export const baseRegisterCollectionModel: DDSFuzzModel<
	ConsensusRegisterCollectionFactory,
	Operation,
	FuzzTestState
> = {
	workloadName: "default configuration",
	generatorFactory: () => take(100, makeOperationGenerator()),
	reducer: makeReducer(),
	validateConsistency: (a, b) => {
		// Check if any async errors occurred during fire-and-forget operations
		if (pendingAsyncError !== undefined) {
			throw pendingAsyncError;
		}
		assertEqualConsensusRegisterCollections(a.channel, b.channel);
	},
	factory: new ConsensusRegisterCollectionFactory(),
};
