/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import {
	type AsyncGenerator,
	combineReducersAsync,
	createWeightedAsyncGenerator,
	done,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import { DDSFuzzModel } from "@fluid-private/test-dds-utils";
import { fluidHandleSymbol, type IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import type { ISharedMap } from "@fluidframework/map/internal";
import { model as MapFuzzModel } from "@fluidframework/map/internal/test";
import type { IDataStore } from "@fluidframework/runtime-definitions/internal";

import {
	Client,
	createLocalServerStressSuite,
	LocalServerStressModel,
	makeUnreachableCodePathProxy,
	type LocalServerStressState,
} from "../localServerStressHarness";

import { _dirname } from "./dirname.cjs";

interface UploadBlob {
	type: "uploadBlob";
}
interface AliasDataStore {
	type: "aliasDataStore";
	id: string;
}
interface CreateDataStore {
	type: "createDataStore";
}

interface MapModel {
	type: "mapModel";
	op: unknown;
}

type StressOperations = UploadBlob | AliasDataStore | CreateDataStore | MapModel;

const reducer = combineReducersAsync<StressOperations, LocalServerStressState>({
	aliasDataStore: async (state, op) => {
		const entry = state.client.entryPoint.globalObjects[op.id];
		assert(entry.type === "newDatastore", "must be a new datastore");

		void entry.dataStore.trySetAlias(String.fromCodePoint(state.random.integer(0, 26) + 65));
	},
	createDataStore: async (state) => {
		state.client.entryPoint.createDataStore(state.random.uuid4());
	},
	uploadBlob: async (state) => {
		state.client.entryPoint.uploadBlob(
			state.random.uuid4(),
			state.random.string(state.random.integer(1, 246)),
		);
	},
	mapModel: async (state, op) => {
		await MapFuzzModel.reducer(
			{
				clients: makeUnreachableCodePathProxy("clients"),
				client: {
					channel: state.client.entryPoint.channels.root() as ISharedMap,
					containerRuntime: makeUnreachableCodePathProxy("containerRuntime"),
					dataStoreRuntime: makeUnreachableCodePathProxy("dataStoreRuntime"),
				},
				containerRuntimeFactory: makeUnreachableCodePathProxy("containerRuntimeFactory"),
				isDetached: state.isDetached,
				summarizerClient: makeUnreachableCodePathProxy("containerRuntimeFactory"),
				random: {
					...state.random,
					handle: () => {
						throw new Error("foo");
					},
				},
			},
			op.op as any,
		);
	},
});

function makeGenerator(): AsyncGenerator<StressOperations, LocalServerStressState> {
	const aliasDataStore: AsyncGenerator<AliasDataStore, LocalServerStressState> = async (
		state,
	) => {
		const newDataStores = Object.entries(state.client.entryPoint.globalObjects).filter(
			(
				e,
			): e is [
				string,
				{ type: "newDatastore"; dataStore: IDataStore; handle: IFluidHandle },
			] => e[1].type === "newDatastore",
		);
		const [id] = state.random.pick(newDataStores);
		return {
			type: "aliasDataStore",
			id,
		} satisfies AliasDataStore;
	};

	let mapGenerator = MapFuzzModel.generatorFactory();
	const mapModel: AsyncGenerator<MapModel, LocalServerStressState> = async (state) => {
		const op = await mapGenerator({
			clients: makeUnreachableCodePathProxy("clients"),
			client: {
				channel: state.client.entryPoint.channels.root() as ISharedMap,
				containerRuntime: makeUnreachableCodePathProxy("containerRuntime"),
				dataStoreRuntime: makeUnreachableCodePathProxy("dataStoreRuntime"),
			},
			containerRuntimeFactory: makeUnreachableCodePathProxy("containerRuntimeFactory"),
			isDetached: state.isDetached,
			summarizerClient: makeUnreachableCodePathProxy("containerRuntimeFactory"),
			random: {
				...state.random,
				handle: () => {
					const realHandle = state.random.pick(
						Object.values(state.client.entryPoint.globalObjects)
							.map((v) => v.handle)
							.filter((v): v is IFluidHandle => v !== undefined),
					);
					return {
						get [fluidHandleSymbol]() {
							return realHandle[fluidHandleSymbol];
						},
						async get() {
							return realHandle.get();
						},
						get isAttached() {
							return realHandle.isAttached;
						},
					};
				},
			},
		});

		if (op === done) {
			mapGenerator = MapFuzzModel.generatorFactory();
			return mapModel(state);
		}

		return {
			type: "mapModel",
			op,
		} satisfies MapModel;
	};

	const syncGenerator = createWeightedAsyncGenerator<StressOperations, LocalServerStressState>(
		[
			[
				aliasDataStore,
				1,
				(state) =>
					Object.values(state.client.entryPoint.globalObjects).some(
						(v) => v.type === "newDatastore",
					),
			],
			[{ type: "createDataStore" }, 1],
			[{ type: "uploadBlob" }, 1],
			[mapModel, 2],
		],
	);

	return async (state) => syncGenerator(state);
}
export const saveFailures = { directory: path.join(_dirname, "../../results") };
export const saveSuccesses = { directory: path.join(_dirname, "../../results") };

const ddsModelMap = new Map<string, DDSFuzzModel<IChannelFactory, any>>();
ddsModelMap.set(MapFuzzModel.factory.type, MapFuzzModel);

const validateConsistency = async (clientA: Client, clientB: Client) => {
	const buildChannelMap = (client: Client) => {
		const channelMap = new Map<string, IChannel>();
		for (const value of Object.values(client.entryPoint.globalObjects).map((v) =>
			v.type === "stressDataObject" ? v : undefined,
		)) {
			if (value?.StressDataObject.attached) {
				for (const channelF of Object.values(value.StressDataObject.channels)) {
					const channel = channelF();
					if (channel.isAttached()) {
						channelMap.set(`${value.StressDataObject.id}/${channel.id}`, channel);
					}
				}
			}
		}
		return channelMap;
	};
	const aMap = buildChannelMap(clientA);
	const bMap = buildChannelMap(clientB);
	assert(aMap.size === bMap.size, "channel maps should be the same size");
	for (const key of aMap.keys()) {
		const aChannel = aMap.get(key);
		const bChannel = bMap.get(key);
		assert(aChannel !== undefined, "types must match");
		assert(aChannel.attributes.type === bChannel?.attributes.type, "types must match");
		const model = ddsModelMap.get(aChannel.attributes.type);
		await model?.validateConsistency(
			{
				channel: aChannel,
				containerRuntime: makeUnreachableCodePathProxy("containerRuntime"),
				dataStoreRuntime: makeUnreachableCodePathProxy("dataStoreRuntime"),
			},
			{
				channel: bChannel,
				containerRuntime: makeUnreachableCodePathProxy("containerRuntime"),
				dataStoreRuntime: makeUnreachableCodePathProxy("dataStoreRuntime"),
			},
		);
	}
};

describe("Local Server Stress", () => {
	const model: LocalServerStressModel<StressOperations> = {
		workloadName: "default",
		generatorFactory: () => takeAsync(100, makeGenerator()),
		reducer: async (state, operation) => reducer(state, operation),
		validateConsistency,
	};

	createLocalServerStressSuite(model, {
		defaultTestCount: 100,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.1,
		},
		reconnectProbability: 0.1,
		skipMinimization: true,
		// Uncomment to replay a particular seed.
		saveFailures,
		saveSuccesses,
	});
});
