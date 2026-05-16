/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import * as path from "node:path";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	type Generator,
	createWeightedAsyncGenerator,
	done,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import {
	type DDSFuzzHarnessEvents,
	type SquashFuzzModel,
	type SquashFuzzTestState,
	createSquashFuzzSuite,
} from "@fluid-private/test-dds-utils";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";

import { CellFactory } from "../cellFactory.js";

import { _dirname } from "./dirname.cjs";

interface SetOp {
	type: "set";
	value: string | number;
}
interface SetPoisonedOp {
	type: "setPoisoned";
}
interface DeleteOp {
	type: "delete";
}

type SquashOp = SetOp | SetPoisonedOp | DeleteOp;

type FuzzState = SquashFuzzTestState<CellFactory>;

function isPoisonedHandle(value: unknown): boolean {
	return (
		isFluidHandle(value) && (value as unknown as { poisoned?: unknown }).poisoned === true
	);
}

function makeGenerator(): (state: FuzzState) => Promise<SquashOp | typeof done> {
	const isInStaging = (state: FuzzState): boolean =>
		state.client.stagingModeStatus === "staging";

	const setOp = async (state: FuzzState): Promise<SetOp> => ({
		type: "set",
		value: state.random.pick([
			(): string => state.random.string(state.random.integer(1, 4)),
			(): number => state.random.integer(0, 100),
		])(),
	});
	const setPoisoned = async (): Promise<SetPoisonedOp> => ({ type: "setPoisoned" });
	const deleteOp = async (): Promise<DeleteOp> => ({ type: "delete" });

	return createWeightedAsyncGenerator<SquashOp, FuzzState>([
		[setOp, 6],
		[setPoisoned, 4, isInStaging],
		[deleteOp, 3],
	]);
}

function makeExitingGenerator(): Generator<SquashOp, FuzzState> {
	return (state): SquashOp | typeof done => {
		const value = state.client.channel.get();
		if (isPoisonedHandle(value)) {
			return { type: "delete" };
		}
		return done;
	};
}

function reducer(state: FuzzState, op: SquashOp): void {
	const { client } = state;
	switch (op.type) {
		case "set": {
			client.channel.set(op.value);
			break;
		}
		case "setPoisoned": {
			client.channel.set(state.random.poisonedHandle());
			break;
		}
		case "delete": {
			client.channel.delete();
			break;
		}
		default: {
			break;
		}
	}
}

const squashModel: SquashFuzzModel<CellFactory, SquashOp> = {
	workloadName: "cell squashing",
	generatorFactory: () => takeAsync(60, makeGenerator()),
	reducer,
	validateConsistency: async (a, b) => {
		const vA: unknown = a.channel.get();
		const vB: unknown = b.channel.get();
		if (isFluidHandle(vA)) {
			assert(isFluidHandle(vB));
		} else {
			assert.equal(vA, vB);
		}
	},
	factory: new CellFactory(),
	exitingStagingModeGeneratorFactory: makeExitingGenerator,
	validatePoisonedContentRemoved: (client) => {
		const value: unknown = client.channel.get();
		assert(
			!isPoisonedHandle(value),
			"Poisoned handle in cell not removed before exiting staging",
		);
	},
};

const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();

describe("SharedCell squash fuzz", () => {
	createSquashFuzzSuite(squashModel, {
		validationStrategy: { type: "fixedInterval", interval: 10 },
		reconnectProbability: 0.1,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 4,
			clientAddProbability: 0.05,
		},
		detachedStartOptions: { numOpsBeforeAttach: 0 },
		defaultTestCount: 50,
		saveFailures: { directory: path.join(_dirname, "../../src/test/results-squash-cell") },
		emitter,
		stagingMode: { changeStagingModeProbability: 0.15 },
	});
});
