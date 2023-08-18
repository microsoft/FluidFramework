/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { strict as assert } from "assert";
import { DDSFuzzModel, DDSFuzzTestState, createDDSFuzzSuite } from "@fluid-internal/test-dds-utils";
import { Jsonable } from "@fluidframework/datastore-definitions";
import {
	combineReducers,
	createWeightedGenerator,
	AsyncGenerator,
	Generator,
	takeAsync,
} from "@fluid-internal/stochastic-test-utils";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { MapFactory } from "../../map";
import { ISharedMap } from "../../interfaces";

interface Clear {
	type: "clear";
}

interface SetKey {
	type: "setKey";
	key: string;
	value: Jsonable;
}

interface DeleteKey {
	type: "deleteKey";
	key: string;
}

type Operation = SetKey | DeleteKey | Clear;

// This type gets used a lot as the state object of the suite; shorthand it here.
type State = DDSFuzzTestState<MapFactory>;

function assertMapsAreEquivalent(a: ISharedMap, b: ISharedMap) {
	assert.equal(a.size, b.size, `${a.id} and ${b.id} have different number of keys.`);
	for (const key of a.keys()) {
		const aVal = a.get(key);
		const bVal = b.get(key);
		assert.equal(aVal, bVal, `${a.id} and ${b.id} differ at ${key}: ${aVal} vs ${bVal}`);
	}
}

const reducer = combineReducers<Operation, DDSFuzzTestState<MapFactory>>({
	clear: ({ channel }) => channel.clear(),
	setKey: ({ channel }, { key, value }) => {
		channel.set(key, value);
	},
	deleteKey: ({ channel }, { key }) => {
		channel.delete(key);
	},
});

interface GeneratorOptions {
	setWeight: number;
	deleteWeight: number;
	clearWeight: number;
	keyPoolSize: number;
}

const defaultOptions: GeneratorOptions = {
	setWeight: 20,
	deleteWeight: 20,
	clearWeight: 1,
	keyPoolSize: 20,
};

function makeGenerator(optionsParam?: Partial<GeneratorOptions>): AsyncGenerator<Operation, State> {
	const { setWeight, deleteWeight, clearWeight, keyPoolSize } = {
		...defaultOptions,
		...optionsParam,
	};
	// Use numbers as the key names.
	const keyNames = Array.from({ length: keyPoolSize }, (_, i) => `${i}`);

	const setKey: Generator<SetKey, State> = ({ random }) => ({
		type: "setKey",
		key: random.pick(keyNames),
		value: random.bool() ? random.integer(1, 50) : random.string(random.integer(3, 7)),
	});
	const deleteKey: Generator<DeleteKey, State> = ({ random }) => ({
		type: "deleteKey",
		key: random.pick(keyNames),
	});

	const syncGenerator = createWeightedGenerator<Operation, State>([
		[setKey, setWeight],
		[deleteKey, deleteWeight],
		[{ type: "clear" }, clearWeight],
	]);

	return async (state) => syncGenerator(state);
}

describe("Map fuzz tests", () => {
	const model: DDSFuzzModel<MapFactory, Operation> = {
		workloadName: "default",
		factory: new MapFactory(),
		generatorFactory: () => takeAsync(100, makeGenerator()),
		reducer: async (state, operation) => reducer(state, operation),
		validateConsistency: assertMapsAreEquivalent,
	};

	createDDSFuzzSuite(model, {
		defaultTestCount: 100,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.1,
		},
		reconnectProbability: 0,
		// Uncomment to replay a particular seed.
		// replay: 0,
		saveFailures: { directory: path.join(__dirname, "../../../src/test/mocha/results/map") },
	});

	createDDSFuzzSuite(
		{ ...model, workloadName: "with reconnect" },
		{
			defaultTestCount: 100,
			numberOfClients: 3,
			clientJoinOptions: {
				maxNumberOfClients: 6,
				clientAddProbability: 0.1,
			},
			reconnectProbability: 0.1,
			// Uncomment to replay a particular seed.
			// replay: 0,
			saveFailures: {
				directory: path.join(__dirname, "../../../src/test/mocha/results/map-reconnect"),
			},
		},
	);

	createDDSFuzzSuite(
		{ ...model, workloadName: "with batches and rebasing" },
		{
			defaultTestCount: 100,
			numberOfClients: 3,
			clientJoinOptions: {
				maxNumberOfClients: 6,
				clientAddProbability: 0.1,
			},
			rebaseProbability: 0.2,
			containerRuntimeOptions: {
				flushMode: FlushMode.TurnBased,
				enableGroupedBatching: true,
			},
			// Uncomment to replay a particular seed.
			// replay: 0,
			saveFailures: {
				directory: path.join(__dirname, "../../../src/test/mocha/results/map-rebase"),
			},
		},
	);
});
