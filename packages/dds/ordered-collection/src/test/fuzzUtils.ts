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
import { v4 as uuid } from "uuid";
import type {
	DDSFuzzModel,
	DDSFuzzSuiteOptions,
	DDSFuzzTestState,
} from "@fluid-private/test-dds-utils";

import { ConsensusQueueFactory } from "../consensusOrderedCollectionFactory.js";
import type { IConsensusOrderedCollection, IOrderedCollection } from "../interfaces.js";
import { ConsensusResult } from "../interfaces.js";

import { _dirname } from "./dirname.cjs";
import { createEmitter } from "@fluid-internal/client-utils";

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

interface ResolveEvent {
	resolve: (callbackId: string, result: ConsensusResult) => void;
}

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
}

export interface ResolveOperation {
	type: "resolve";
	result: ConsensusResult;
}

/**
 * Represents ConsensusOrderedCollection operation types for fuzz testing
 */
export type ConsensusOrderedCollectionOperation =
	| AddOperation
	| AcquireOperation
	| ResolveOperation;

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
		};
	}

	async function resolve(state: OpSelectionState): Promise<ResolveOperation> {
		return {
			type: "resolve",
			result: state.random.pick([ConsensusResult.Complete, ConsensusResult.Release]),
		};
	}

	const clientBaseOperationGenerator = createWeightedGenerator<
		ConsensusOrderedCollectionOperation,
		OpSelectionState
	>([
		[add, 1],
		[acquire, 1],
		[resolve, 1],
	]);

	return async (state: FuzzTestState) =>
		clientBaseOperationGenerator({
			...state,
			itemValue: state.random.pick(valuePool),
		});
}

function makeReducer(): Reducer<ConsensusOrderedCollectionOperation, FuzzTestState> {
	const pendingCallbacks = new Map<string, string>();
	const callbackResolver = createEmitter<ResolveEvent>();

	const reducer = combineReducers<ConsensusOrderedCollectionOperation, FuzzTestState>({
		add: ({ client }, { value }) => {
			client.channel.add(value).catch((error) => {
				throw error;
			});
		},
		acquire: ({ client }) => {
			const callback = async (value: string): Promise<ConsensusResult> => {
				const callbackId = uuid();
				pendingCallbacks.set(callbackId, value);
				return new Promise<ConsensusResult>((resolve) => {
					const onCallbackResolve = (id: string, result: ConsensusResult): void => {
						if (id === callbackId) {
							callbackResolver.off("resolve", onCallbackResolve);
							resolve(result);
						}
					};
					callbackResolver.on("resolve", onCallbackResolve);
				});
			};
			client.channel.acquire(callback).catch((error) => {
				throw error;
			});
		},
		resolve: ({ client }, { result }) => {
			new Promise<string>((resolve) => {
				if (result === ConsensusResult.Complete) {
					client.channel.once("localComplete", (value: string) => {
						resolve(value);
					});
				} else {
					client.channel.once("localRelease", (value: string) => {
						resolve(value);
					});
				}
			})
				.then((resolvedValue: string) => {
					const [callbackId, value] = pendingCallbacks.entries().next().value as [
						string,
						string,
					];
					if (callbackId !== undefined && resolvedValue === value) {
						pendingCallbacks.delete(callbackId);
						callbackResolver.emit("resolve", callbackId, result);
					}
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
	generatorFactory: () => take(100, makeOperationGenerator()),
	reducer: makeReducer(),
	validateConsistency: (a, b) => assertEqualConsensusOrderedCollections(a.channel, b.channel),
	factory: new ConsensusQueueFactory(),
};
