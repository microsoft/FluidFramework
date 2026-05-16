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

import { MapFactory } from "../../index.js";

import { _dirname } from "./dirname.cjs";

interface SetPoisonedKey {
	type: "setPoisonedKey";
	key: string;
}

interface SetKey {
	type: "setKey";
	key: string;
	value: string | number;
}

interface DeleteKey {
	type: "deleteKey";
	key: string;
}

interface ClearMap {
	type: "clear";
}

type SquashOperation = SetPoisonedKey | SetKey | DeleteKey | ClearMap;

type SquashFactory = MapFactory;
type FuzzState = SquashFuzzTestState<SquashFactory>;

const keyPool = ["k0", "k1", "k2", "k3"];

function isPoisonedHandle(value: unknown): boolean {
	return (
		isFluidHandle(value) &&
		(value as unknown as { poisoned?: unknown }).poisoned === true
	);
}

function makeGenerator(): (state: FuzzState) => Promise<SquashOperation | typeof done> {
	const isInStaging = (state: FuzzState): boolean =>
		state.client.stagingModeStatus === "staging";

	const setPoisoned = async (state: FuzzState): Promise<SetPoisonedKey> => ({
		type: "setPoisonedKey",
		key: state.random.pick(keyPool),
	});

	const setKey = async (state: FuzzState): Promise<SetKey> => ({
		type: "setKey",
		key: state.random.pick(keyPool),
		value: state.random.pick([
			(): string => state.random.string(state.random.integer(1, 4)),
			(): number => state.random.integer(0, 100),
		])(),
	});

	const deleteKey = async (state: FuzzState): Promise<DeleteKey> => ({
		type: "deleteKey",
		key: state.random.pick(keyPool),
	});

	const clear = async (): Promise<ClearMap> => ({ type: "clear" });

	return createWeightedAsyncGenerator<SquashOperation, FuzzState>([
		[setKey, 6],
		[setPoisoned, 4, isInStaging],
		[deleteKey, 3],
		[clear, 1],
	]);
}

function makeExitingGenerator(): Generator<SquashOperation, FuzzState> {
	return (state): SquashOperation | typeof done => {
		const channel = state.client.channel;
		for (const [key, value] of channel.entries()) {
			if (isPoisonedHandle(value)) {
				return { type: "deleteKey", key };
			}
		}
		return done;
	};
}

function reducer(state: FuzzState, op: SquashOperation): void {
	const { client } = state;
	switch (op.type) {
		case "setKey": {
			client.channel.set(op.key, op.value);
			break;
		}
		case "setPoisonedKey": {
			client.channel.set(op.key, state.random.poisonedHandle());
			break;
		}
		case "deleteKey": {
			client.channel.delete(op.key);
			break;
		}
		case "clear": {
			client.channel.clear();
			break;
		}
		default: {
			break;
		}
	}
}

function validatePoisonedContentRemoved(client: { channel: ReturnType<MapFactory["create"]> }): void {
	for (const [key, value] of client.channel.entries()) {
		assert(
			!isPoisonedHandle(value),
			`Poisoned handle at key "${key}" not removed before exiting staging mode`,
		);
	}
}

const squashModel: SquashFuzzModel<SquashFactory, SquashOperation> = {
	workloadName: "map squashing",
	generatorFactory: () => takeAsync(60, makeGenerator()),
	reducer,
	validateConsistency: async (a, b) => {
		assert.equal(a.channel.size, b.channel.size);
		for (const [key, valueA] of a.channel.entries()) {
			const valueB: unknown = b.channel.get(key);
			if (isFluidHandle(valueA)) {
				assert(isFluidHandle(valueB));
			} else {
				assert.equal(valueA, valueB);
			}
		}
	},
	factory: new MapFactory(),
	exitingStagingModeGeneratorFactory: makeExitingGenerator,
	validatePoisonedContentRemoved,
};

const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();

describe("SharedMap squash fuzz", () => {
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
		saveFailures: { directory: path.join(_dirname, "../../src/test/results-squash-map") },
		emitter,
		stagingMode: { changeStagingModeProbability: 0.15 },
	});
});
