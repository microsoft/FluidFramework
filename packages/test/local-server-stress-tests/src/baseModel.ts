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
} from "@fluid-private/stochastic-test-utils";
import { AttachState } from "@fluidframework/container-definitions/internal";

import { ddsModelMap } from "./ddsModels.js";
import { DDSModelOpGenerator, DDSModelOpReducer, type DDSModelOp } from "./ddsOperations";
import { _dirname } from "./dirname.cjs";
import { type LocalServerStressState } from "./localServerStressHarness";
import type { StressDataObjectOperations } from "./stressDataObject.js";

export type StressOperations = StressDataObjectOperations | DDSModelOp;

export const reducer = combineReducersAsync<StressOperations, LocalServerStressState>({
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

export function makeGenerator<T extends BaseOperation>(
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
export const saveFailures = { directory: path.join(_dirname, "./results") };
export const saveSuccesses = { directory: path.join(_dirname, "./test/results") };
