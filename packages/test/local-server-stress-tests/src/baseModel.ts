/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import {
	type AsyncGenerator,
	type BaseOperation,
	combineReducersAsync,
	done,
	isOperationType,
	type MinimizationTransform,
} from "@fluid-private/stochastic-test-utils";
import { AttachState } from "@fluidframework/container-definitions/internal";

import { ddsModelMap } from "./ddsModels.js";
import {
	convertToRealHandles,
	covertLocalServerStateToDdsState,
	DDSModelOpGenerator,
	DDSModelOpReducer,
	loadAllHandles,
	type DDSModelOp,
	type OrderSequentially,
} from "./ddsOperations";
import { _dirname } from "./dirname.cjs";
import {
	createWeightedAsyncGeneratorWithDynamicWeights,
	type DynamicAsyncWeights,
} from "./dynamicWeightGenerator.js";
import type { LocalServerStressState } from "./localServerStressHarness";
import type { StressDataObjectOperations } from "./stressDataObject.js";

export type StressOperations = StressDataObjectOperations | DDSModelOp | OrderSequentially;

const orderSequentiallyReducer = async (
	state: LocalServerStressState,
	op: OrderSequentially,
): Promise<void> => {
	const { baseModel, taggedHandles } = await loadAllHandles(state);
	const ddsState = await covertLocalServerStateToDdsState(state);
	const rollbackError = new Error("rollback");
	try {
		state.datastore.orderSequentially(() => {
			for (const o of op.operations) {
				baseModel.reducer(ddsState, convertToRealHandles(o, taggedHandles));
			}
			if (op.rollback) {
				// Throwing any error during the orderSequentially callback will trigger a rollback attempt of all the ops we just played.
				// Since it's not a real error, we'll suppress it later.
				throw rollbackError;
			}
		});
	} catch (error) {
		if (error !== rollbackError) {
			throw error;
		}
	}
};

export const reducer = combineReducersAsync<StressOperations, LocalServerStressState>({
	enterStagingMode: async (state, op) => state.client.entryPoint.enterStagingMode(),
	exitStagingMode: async (state, op) => state.client.entryPoint.exitStagingMode(op.commit),
	createDataStore: async (state, op) => state.datastore.createDataStore(op.tag, op.asChild),
	createChannel: async (state, op) => {
		state.datastore.createChannel(op.tag, op.channelType);
	},
	uploadBlob: async (state, op) =>
		// this will hang if we are offline due to disconnect, so we don't wait for blob upload
		// this could potentially cause problems with replay if the blob upload doesn't finish
		// before its handle is used. this hasn't been seen in practice, but nothing but timing and
		// the fact that we assume local server is fast prevents it.
		void state.datastore.uploadBlob(op.tag, state.random.string(state.random.integer(1, 16))),
	DDSModelOp: DDSModelOpReducer,
	orderSequentially: orderSequentiallyReducer,
});

/**
 * Number of operations in the "creation phase" before attach.
 * During this phase, only createDataStore and createChannel operations are generated.
 */
const creationPhaseOps = 20;

export function makeGenerator<T extends BaseOperation>(
	additional: DynamicAsyncWeights<T, LocalServerStressState> = [],
): AsyncGenerator<StressOperations | T, LocalServerStressState> {
	// Track operation count for phasing during detached state
	let detachedOpCount = 0;

	/**
	 * Returns true if we're in the "creation phase" (prioritize creating datastores/channels).
	 * This is the first few operations while detached.
	 */
	const isCreationPhase = (state: LocalServerStressState): boolean =>
		state.client.container.attachState === AttachState.Detached &&
		detachedOpCount < creationPhaseOps;

	/**
	 * Returns true if we're in the "DDS ops phase" (prioritize DDS operations).
	 * This is after the creation phase but still detached.
	 */
	const isDdsOpsPhase = (state: LocalServerStressState): boolean =>
		state.client.container.attachState === AttachState.Detached &&
		detachedOpCount >= creationPhaseOps;

	const asyncGenerator = createWeightedAsyncGeneratorWithDynamicWeights<
		StressOperations | T,
		LocalServerStressState
	>([
		...additional,
		[
			async (state) => ({
				type: "createDataStore",
				asChild: state.random.bool(),
				tag: state.tag("datastore"),
			}),
			// Only during creation phase (detached), normal weight when attached
			(state) => (isDdsOpsPhase(state) ? 0 : isCreationPhase(state) ? 20 : 1),
		],
		[
			async (state) => ({
				type: "uploadBlob",
				tag: state.tag("blob"),
			}),
			5,
			// local server doesn't support detached blobs
			(state) => state.client.container.attachState !== AttachState.Detached,
		],
		[
			async (state) => ({
				type: "createChannel",
				channelType: state.random.pick([...ddsModelMap.keys()]),
				tag: state.tag("channel"),
			}),
			// Only during creation phase (detached), normal weight when attached
			(state) => (isDdsOpsPhase(state) ? 0 : isCreationPhase(state) ? 20 : 5),
		],
		[
			async () => ({
				type: "enterStagingMode",
			}),
			5,
			(state) =>
				!state.client.entryPoint.inStagingMode() &&
				state.client.container.attachState !== AttachState.Detached,
		],
		[
			async ({ random }) => ({
				type: "exitStagingMode",
				commit: random.bool(),
			}),
			25,
			(state) =>
				state.client.entryPoint.inStagingMode() &&
				state.client.container.attachState !== AttachState.Detached,
		],
		[
			DDSModelOpGenerator,
			// No DDS ops during creation phase, high weight during DDS ops phase
			(state) => {
				if (isCreationPhase(state)) {
					return 0;
				}
				if (isDdsOpsPhase(state)) {
					return 150;
				}
				return 100;
			},
		],
		[
			async (state) => {
				const operations: DDSModelOp[] = [];
				/**
				 * unfortunately we can't generate more than a single op here, as each op is generated off
				 * the current state, and if we generate multiple ops it can result in earlier ops invaliding
				 * the constrains necessary for later ops. for example, an earlier op might delete a sub-directory
				 * which a later op sets a key in, but the state and generator don't know that will happen.
				 */
				const op = await DDSModelOpGenerator(state);
				if (op !== done) {
					operations.push(op);
				}
				return {
					type: "orderSequentially",
					operations,
					rollback: state.random.bool(),
				} satisfies OrderSequentially;
			},
			10,
			(state) => state.client.container.attachState !== "Detached",
		],
	]);

	return async (state) => {
		const result = await asyncGenerator(state);
		// Track detached operation count for phasing (increment AFTER generating op)
		if (state.client.container.attachState === AttachState.Detached) {
			detachedOpCount++;
		}
		return result;
	};
}
export const saveFailures = { directory: path.join(_dirname, "../src/test/results") };
export const saveSuccesses = { directory: path.join(_dirname, "../src/test/results") };
export const saveFluidOps = { directory: path.join(_dirname, "../src/test/results") };

export const ddsModelMinimizers: MinimizationTransform<BaseOperation>[] = [
	...ddsModelMap.entries(),
]
	.flatMap(([channelType, model]) =>
		model.minimizationTransforms?.map((mt) => ({ channelType, mt })),
	)
	.filter((v): v is Exclude<typeof v, undefined> => v !== undefined)
	.map(({ channelType, mt }) => {
		return (op: BaseOperation) => {
			if (isOperationType<DDSModelOp>("DDSModelOp", op) && op.channelType === channelType) {
				mt(op.op);
			}
		};
	});
