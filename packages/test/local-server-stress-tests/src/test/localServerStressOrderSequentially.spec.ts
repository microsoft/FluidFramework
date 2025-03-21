/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { done, isOperationType, takeAsync } from "@fluid-private/stochastic-test-utils";

import { makeGenerator, reducer, saveFailures, type StressOperations } from "../baseModel.js";
import {
	convertToRealHandles,
	covertLocalServerStateToDdsState,
	DDSModelOpGenerator,
	loadAllHandles,
	validateConsistencyOfAllDDS,
	type DDSModelOp,
	type OrderSequentially,
} from "../ddsOperations.js";
import {
	createLocalServerStressSuite,
	LocalServerStressModel,
	type LocalServerStressState,
} from "../localServerStressHarness.js";

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
			}
			if (op.rollback) {
				// Thowing any error during the orderSequentially callback will trigger a rollback attempt of all the ops we just played.
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
		skip: [
			...[0, 2, 7, 10, 13, 15, 26, 29, 39, 52, 61, 66, 67, 75, 76, 82, 84, 88, 90], // RollbackError: Unsupported op type for rollback (shared intervals)
			...[1, 3, 6, 8, 14, 23, 30, 53, 55, 56, 58, 59, 64, 70, 77, 80, 86, 93, 99], // RollbackError: Can't rollback attach message
			...[12, 28, 36, 44, 60], // timeout (probably minimization),
			...[31], // MergeTree insert failed
			...[32, 45, 89], //  Number of subDirectories not same
		],
	});
});
