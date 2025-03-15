/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import {
	type AsyncGenerator,
	combineReducersAsync,
	createWeightedAsyncGenerator,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import { AttachState } from "@fluidframework/container-definitions";

import { ddsModelMap } from "../ddsModels.js";
import {
	DDSModelOpGenerator,
	DDSModelOpReducer,
	validateConsistencyOfAllDDS,
	type DDSModelOp,
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
});

function makeGenerator(): AsyncGenerator<StressOperations, LocalServerStressState> {
	const asyncGenerator = createWeightedAsyncGenerator<
		StressOperations,
		LocalServerStressState
	>([
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
			0,
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
		// replay: [76],
		// only: [28],
		saveFailures,
		// saveSuccesses,
		skip: [0, 13, 30, 45, 54, 56, 58, 90, 99],
	});
});
