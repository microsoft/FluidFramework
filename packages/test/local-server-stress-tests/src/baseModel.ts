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
		const { absoluteUrl, handle } = await state.datastore.createDataStore(op.tag, op.asChild);
		// Register the new datastore in the state tracker
		state.stateTracker.registerDatastore(op.tag, absoluteUrl);

		// Store handle in current datastore's root (builds distributed attached graph)
		if (op.storeHandle) {
			state.datastore.storeHandleInRoot(op.tag, handle);
		}
	},
	createChannel: async (state, op) => {
		const handle = state.datastore.createChannel(op.tag, op.channelType);
		// Register the channel in the state tracker
		state.stateTracker.registerChannel(state.datastoreTag, op.tag, op.channelType);

		// Store handle in current datastore's root (builds distributed attached graph)
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
 * Number of operations in each creation sub-phase before attach.
 * Phase 1: Create datastores only
 * Phase 2: Create channels across all datastores
 * Phase 3: DDS operations
 */
const datastoreCreationPhaseOps = 10;
const channelCreationPhaseOps = 10;
const totalCreationPhaseOps = datastoreCreationPhaseOps + channelCreationPhaseOps;

export function makeGenerator<T extends BaseOperation>(
	additional: DynamicAsyncWeights<T, LocalServerStressState> = [],
): AsyncGenerator<StressOperations | T, LocalServerStressState> {
	// Track operation count for phasing during detached state
	let detachedOpCount = 0;

	/**
	 * Returns true if we're in the "datastore creation phase".
	 * First N operations while detached - only create datastores.
	 */
	const isDatastoreCreationPhase = (state: LocalServerStressState): boolean =>
		state.client.container.attachState === AttachState.Detached &&
		detachedOpCount < datastoreCreationPhaseOps;

	/**
	 * Returns true if we're in the "channel creation phase".
	 * After datastore creation, before DDS ops - create channels across all datastores.
	 */
	const isChannelCreationPhase = (state: LocalServerStressState): boolean =>
		state.client.container.attachState === AttachState.Detached &&
		detachedOpCount >= datastoreCreationPhaseOps &&
		detachedOpCount < totalCreationPhaseOps;

	/**
	 * Returns true if we're in either creation phase.
	 */
	const isCreationPhase = (state: LocalServerStressState): boolean =>
		isDatastoreCreationPhase(state) || isChannelCreationPhase(state);

	/**
	 * Returns true if we're in the "DDS ops phase" (prioritize DDS operations).
	 * This is after the creation phases but still detached.
	 */
	const isDdsOpsPhase = (state: LocalServerStressState): boolean =>
		state.client.container.attachState === AttachState.Detached &&
		detachedOpCount >= totalCreationPhaseOps;

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
				// Store handle to build attached graph: 90% during creation phase, 50% otherwise
				storeHandle: state.random.bool(isCreationPhase(state) ? 0.9 : 0.5),
			}),
			// High weight during datastore phase, zero during channel/DDS phases, normal when attached
			(state) =>
				isDatastoreCreationPhase(state)
					? 20
					: isChannelCreationPhase(state) || isDdsOpsPhase(state)
						? 0
						: 1,
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
			async (state) => {
				// Select channel type with bias toward under-represented types
				const channelType = state.stateTracker.selectChannelType(state.random);

				return {
					type: "createChannel",
					channelType,
					tag: state.tag("channel"),
					// Store handle to build attached graph: 90% during creation phase, 50% otherwise
					storeHandle: state.random.bool(isCreationPhase(state) ? 0.9 : 0.5),
				};
			},
			// Zero during datastore phase, high during channel phase, zero during DDS phase, normal when attached
			(state) =>
				isDatastoreCreationPhase(state)
					? 0
					: isChannelCreationPhase(state)
						? 20
						: isDdsOpsPhase(state)
							? 0
							: 5,
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
