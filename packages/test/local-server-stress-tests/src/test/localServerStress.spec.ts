/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import {
	type AsyncGenerator,
	type AsyncWeights,
	type BaseOperation,
	combineReducersAsync,
	createWeightedAsyncGenerator,
	done,
	isOperationType,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import { AttachState } from "@fluidframework/container-definitions/internal";

import { ddsModelMap } from "../ddsModels.js";
import {
	convertToRealHandles,
	covertLocalServerStateToDdsState,
	DDSModelOpGenerator,
	DDSModelOpReducer,
	loadAllHandles,
	validateConsistencyOfAllDDS,
	type DDSModelOp,
	type OrderSequentially,
} from "../ddsOperations";
import {
	createLocalServerStressSuite,
	LocalServerStressModel,
	type LocalServerStressState,
} from "../localServerStressHarness";
import type { StressDataObjectOperations } from "../stressDataObject.js";

import { _dirname } from "./dirname.cjs";

type StressOperations = StressDataObjectOperations | DDSModelOp;

const reducer = combineReducersAsync<StressOperations, LocalServerStressState>({
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
});

const orderSequentiallyReducer = async (
	state: LocalServerStressState,
	op: OrderSequentially,
) => {
	const { baseModel, taggedHandles } = await loadAllHandles(state);
	const ddsState = await covertLocalServerStateToDdsState(state);
	const rollbackError = new Error("rollback");
	try {
		state.datastore.orderSequentially(() => {
			for (const o of op.operations) {
				baseModel.reducer(ddsState, convertToRealHandles(o, taggedHandles));
				if (op.rollback) {
					throw rollbackError;
				}
			}
		});
	} catch (error) {
		if (error !== rollbackError) {
			throw error;
		}
	}
};

function makeGenerator<T extends BaseOperation>(
	additional: AsyncWeights<T, LocalServerStressState> = [],
): AsyncGenerator<StressOperations | T, LocalServerStressState> {
	const asyncGenerator = createWeightedAsyncGenerator<
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
			1,
		],
		[
			async (state) => ({
				type: "uploadBlob",
				tag: state.tag("blob"),
			}),
			10,
			// local server doesn't support detached blobs
			(state) => state.client.container.attachState !== AttachState.Detached,
		],
		[
			async (state) => ({
				type: "createChannel",
				channelType: state.random.pick([...ddsModelMap.keys()]),
				tag: state.tag("channel"),
			}),
			5,
		],
		[DDSModelOpGenerator, 100],
	]);

	return async (state) => asyncGenerator(state);
}
export const saveFailures = { directory: path.join(_dirname, "../../src/test/results") };
export const saveSuccesses = { directory: path.join(_dirname, "../../src/test/results") };

describe("Local Server Stress", () => {
	const model: LocalServerStressModel<StressOperations> = {
		workloadName: "default",
		generatorFactory: () => takeAsync(100, makeGenerator()),
		reducer,
		validateConsistency: validateConsistencyOfAllDDS,
	};

	createLocalServerStressSuite(model, {
		defaultTestCount: 100,
		// skipMinimization: true,
		// Uncomment to replay a particular seed.
		// replay: 93,
		// only: [28],
		saveFailures,
		// saveSuccesses,
	});
});

describe("Local Server Stress with rollback", () => {
	const model: LocalServerStressModel<StressOperations | OrderSequentially> = {
		workloadName: "rollback",
		generatorFactory: () =>
			takeAsync(
				100,
				makeGenerator<OrderSequentially>([
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
								rollback: true,
							} satisfies OrderSequentially;
						},
						50,
					],
				]),
			),
		reducer: async (state, op) =>
			isOperationType<OrderSequentially>("orderSequentially", op)
				? orderSequentiallyReducer(state, op)
				: reducer(state, op),
		validateConsistency: validateConsistencyOfAllDDS,
	};

	createLocalServerStressSuite(model, {
		defaultTestCount: 100,
		skipMinimization: true,
		// Uncomment to replay a particular seed.
		// only: [91],
		saveFailures,
		// saveSuccesses,
		configurations: { "Fluid.ContainerRuntime.EnableRollback": true },
		only: [
			3, 4, 9, 10, 13, 16, 21, 23, 27, 28, 33, 35, 37, 38, 39, 40, 47, 48, 49, 52, 56, 63, 68,
			71, 74, 87, 90, 92, 96, 98,
		],
	});
});
