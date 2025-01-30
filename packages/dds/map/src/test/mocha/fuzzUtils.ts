/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type AsyncGenerator,
	type Generator,
	combineReducers,
	createWeightedGenerator,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import type {
	DDSFuzzModel,
	DDSFuzzTestState,
} from "@fluid-private/test-dds-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { isObject } from "@fluidframework/core-utils/internal";
import type { Serializable } from "@fluidframework/datastore-definitions/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";

import { type ISharedMap, MapFactory } from "../../index.js";


interface MapClear {
	type: "clear";
}

interface MapSetKey {
	type: "setKey";
	key: string;
	value: Serializable<unknown>;
}

interface MapDeleteKey {
	type: "deleteKey";
	key: string;
}

type MapOperation = MapSetKey | MapDeleteKey | MapClear;

// This type gets used a lot as the state object of the suite; shorthand it here.
type MapState = DDSFuzzTestState<MapFactory>;

async function assertMapsAreEquivalent(a: ISharedMap, b: ISharedMap): Promise<void> {
	assert.equal(a.size, b.size, `${a.id} and ${b.id} have different number of keys.`);
	for (const key of a.keys()) {
		const aVal: unknown = a.get(key);
		const bVal: unknown = b.get(key);
		if (isObject(aVal) === true) {
			assert(
				isObject(bVal),
				`${a.id} and ${b.id} differ at ${key}: a is an object, b is not}`,
			);
			const aHandle = isFluidHandle(aVal) ? await aVal.get() : aVal;
			const bHandle = isFluidHandle(bVal) ? await bVal.get() : bVal;
			assert.equal(
				aHandle,
				bHandle,
				`${a.id} and ${b.id} differ at ${key}: ${JSON.stringify(aHandle)} vs ${JSON.stringify(
					bHandle,
				)}`,
			);
		} else {
			assert.equal(aVal, bVal, `${a.id} and ${b.id} differ at ${key}: ${aVal} vs ${bVal}`);
		}
	}
}

const mapReducer = combineReducers<MapOperation, MapState>({
	clear: ({ client }) => client.channel.clear(),
	setKey: ({ client }, { key, value }) => {
		client.channel.set(key, value);
	},
	deleteKey: ({ client }, { key }) => {
		client.channel.delete(key);
	},
});

interface MapGeneratorOptions {
	setWeight: number;
	deleteWeight: number;
	clearWeight: number;
	keyPoolSize: number;
}

const mapDefaultOptions: MapGeneratorOptions = {
	setWeight: 20,
	deleteWeight: 20,
	clearWeight: 1,
	keyPoolSize: 20,
};

function mapMakeGenerator(
	optionsParam?: Partial<MapGeneratorOptions>,
): AsyncGenerator<MapOperation, MapState> {
	const { setWeight, deleteWeight, clearWeight, keyPoolSize } = {
		...mapDefaultOptions,
		...optionsParam,
	};
	// Use numbers as the key names.
	const keyNames = Array.from({ length: keyPoolSize }, (_, i) => `${i}`);

	const setKey: Generator<MapSetKey, MapState> = ({ random }) => ({
		type: "setKey",
		key: random.pick(keyNames),
		value: random.pick([
			(): number => random.integer(1, 50),
			(): string => random.string(random.integer(3, 7)),
			(): IFluidHandle => random.handle(),
		])(),
	});
	const deleteKey: Generator<MapDeleteKey, MapState> = ({ random }) => ({
		type: "deleteKey",
		key: random.pick(keyNames),
	});

	const syncGenerator = createWeightedGenerator<MapOperation, MapState>([
		[setKey, setWeight],
		[deleteKey, deleteWeight],
		[{ type: "clear" }, clearWeight],
	]);

	return async (state) => syncGenerator(state);
}

/**
 * the maps fuzz model
 */
export const mapBaseModel: DDSFuzzModel<MapFactory, MapOperation> = {
	workloadName: "default",
	factory: new MapFactory(),
	generatorFactory: () => takeAsync(1000, mapMakeGenerator()),
	reducer: async (state, operation) => mapReducer(state, operation),
	validateConsistency: async (a, b) => assertMapsAreEquivalent(a.channel, b.channel),
};
