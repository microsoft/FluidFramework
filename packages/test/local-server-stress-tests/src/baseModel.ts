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
	createDataStore: async (state, op) => {
		const { handle } = await state.datastore.createDataStore(op.tag, op.asChild);
		if (op.storeHandle) {
			state.datastore.storeHandleInRoot(op.tag, handle);
		}
	},
	createChannel: async (state, op) => {
		const handle = state.datastore.createChannel(op.tag, op.channelType);
		if (op.storeHandle) {
			state.datastore.storeHandleInRoot(op.tag, handle);
		}
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
 * Threshold for the "datastore creation phase": the first N operations before attach
 * prioritize creating datastores so they exist before channels are created in them.
 */
const datastoreCreationPhaseOps = 10;

/**
 * Threshold for the "channel creation phase": after datastores are created,
 * the next N operations prioritize creating channels across available datastores.
 */
const channelCreationPhaseOps = 20;

export function makeGenerator<T extends BaseOperation>(
	additional: DynamicAsyncWeights<T, LocalServerStressState> = [],
): AsyncGenerator<StressOperations | T, LocalServerStressState> {
	// Track operation count for phasing during detached state
	let detachedOpCount = 0;

	/**
	 * Returns true if we're in the detached "datastore creation phase".
	 * This is the first few operations while detached, before channel creation.
	 */
	const isDetachedDatastoreCreationPhase = (state: LocalServerStressState): boolean =>
		state.client.container.attachState === AttachState.Detached &&
		detachedOpCount < datastoreCreationPhaseOps;

	/**
	 * Returns true if we're in the detached "channel creation phase".
	 * This is after datastore creation but before the DDS ops phase.
	 */
	const isDetachedChannelCreationPhase = (state: LocalServerStressState): boolean =>
		state.client.container.attachState === AttachState.Detached &&
		detachedOpCount >= datastoreCreationPhaseOps &&
		detachedOpCount < channelCreationPhaseOps;

	/**
	 * Returns true if we're in the detached "DDS ops phase" (prioritize DDS operations).
	 * This is after both creation phases but still detached.
	 */
	const isDetachedDdsOpsPhase = (state: LocalServerStressState): boolean =>
		state.client.container.attachState === AttachState.Detached &&
		detachedOpCount >= channelCreationPhaseOps;

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
				storeHandle: state.random.bool(isDetachedDatastoreCreationPhase(state) ? 0.9 : 0.5),
			}),
			// High weight during datastore creation phase, zero during channel creation and DDS ops phases, low otherwise
			(state) => {
				if (isDetachedDatastoreCreationPhase(state)) {
					return 20;
				}
				if (isDetachedChannelCreationPhase(state) || isDetachedDdsOpsPhase(state)) {
					return 0;
				}
				return 1;
			},
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
				storeHandle: state.random.bool(isDetachedChannelCreationPhase(state) ? 0.9 : 0.5),
			}),
			// High weight during channel creation phase, zero during datastore creation and DDS ops phases, low otherwise
			(state) => {
				if (isDetachedChannelCreationPhase(state)) {
					return 20;
				}
				if (isDetachedDatastoreCreationPhase(state) || isDetachedDdsOpsPhase(state)) {
					return 0;
				}
				return 5;
			},
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
			// Zero weight during creation phases, otherwise high weight
			(state) => {
				if (isDetachedDatastoreCreationPhase(state) || isDetachedChannelCreationPhase(state)) {
					return 0;
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
		// Capture attach state before generating the operation so phase selection
		// uses the pre-increment detachedOpCount value.
		const wasDetached = state.client.container.attachState === AttachState.Detached;
		const op = await asyncGenerator(state);
		// Track detached operation count for phasing after the operation is generated.
		if (wasDetached) {
			detachedOpCount++;
		}
		return op;
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
