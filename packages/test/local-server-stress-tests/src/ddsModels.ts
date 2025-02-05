/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	done,
	type AsyncGenerator,
	type AsyncReducer,
} from "@fluid-private/stochastic-test-utils";
import {
	DDSFuzzModel,
	DDSFuzzTestState,
	Client as DDSClient,
} from "@fluid-private/test-dds-utils";
import { fluidHandleSymbol } from "@fluidframework/core-interfaces";
import { assert, isObject } from "@fluidframework/core-utils/internal";
import type {
	IChannel,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";
// eslint-disable-next-line import/no-internal-modules
import { baseMapModel, baseDirModel } from "@fluidframework/map/internal/test";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import {
	baseSharedStringModel,
	baseIntervalModel,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/sequence/internal/test";

import {
	LocalServerStressState,
	makeUnreachableCodePathProxy,
	Client,
} from "./localServerStressHarness";

export function repeatFactoryAsync<T, TState = void>(
	factory: () => AsyncGenerator<T, TState>,
): AsyncGenerator<T, TState> {
	let generator = factory();
	return async (state: TState) => {
		const next = await generator(state);
		if (next !== done) {
			return next;
		}
		generator = factory();
		return generator(state);
	};
}

const generateSubModelMap = (
	...models: Omit<DDSFuzzModel<IChannelFactory, any>, "workloadName">[]
) => {
	const modelMap = new Map<
		string,
		{
			factory: IChannelFactory;
			generator: AsyncGenerator<any, DDSFuzzTestState<IChannelFactory>>;
			reducer: DDSFuzzModel<IChannelFactory, any>["reducer"];
			validateConsistency: DDSFuzzModel<IChannelFactory, any>["validateConsistency"];
			minimizationTransforms?: DDSFuzzModel<IChannelFactory, any>["minimizationTransforms"];
		}
	>();
	for (const model of models) {
		const { reducer, generatorFactory, factory, validateConsistency, minimizationTransforms } =
			model;
		const generator = repeatFactoryAsync(generatorFactory);
		modelMap.set(factory.attributes.type, {
			generator,
			reducer,
			factory,
			validateConsistency,
			minimizationTransforms,
		});
	}

	return modelMap;
};

export const ddsModelMap = generateSubModelMap(
	baseMapModel,
	baseDirModel,
	baseSharedStringModel,
	baseIntervalModel,
);

export interface DDSModelOp {
	type: "DDSModelOp";
	op: unknown;
}

const createDDSClient = (channel: IChannel): DDSClient<IChannelFactory> => {
	return {
		channel,
		containerRuntime: makeUnreachableCodePathProxy("containerRuntime"),
		dataStoreRuntime: makeUnreachableCodePathProxy("dataStoreRuntime"),
	};
};

const covertLocalServerStateToDdsState = async (
	state: LocalServerStressState,
): Promise<DDSFuzzTestState<IChannelFactory>> => {
	const channels = await state.datastore.getChannels();
	const allHandles = [
		...channels.map((c) => ({ tag: c.id, handle: c.handle })),
		...(await state.client.entryPoint.getContainerObjects()).filter(
			(v) => v.handle !== undefined,
		),
	];
	return {
		clients: makeUnreachableCodePathProxy("clients"),
		client: createDDSClient(state.channel),
		containerRuntimeFactory: makeUnreachableCodePathProxy("containerRuntimeFactory"),
		isDetached: state.isDetached,
		summarizerClient: makeUnreachableCodePathProxy("containerRuntimeFactory"),
		random: {
			...state.random,
			handle: () => {
				const { tag, handle } = state.random.pick(allHandles);
				const realHandle = toFluidHandleInternal(handle);
				return {
					tag,
					absolutePath: realHandle.absolutePath,
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
	};
};

export const DDSModelOpGenerator: AsyncGenerator<DDSModelOp, LocalServerStressState> = async (
	state,
) => {
	const channel = state.channel;
	const model = ddsModelMap.get(channel.attributes.type);
	assert(model !== undefined, "must have model");

	const op = await model.generator(await covertLocalServerStateToDdsState(state));

	return {
		type: "DDSModelOp",
		op,
	} satisfies DDSModelOp;
};

export const DDSModelOpReducer: AsyncReducer<DDSModelOp, LocalServerStressState> = async (
	state,
	op,
) => {
	const baseModel = ddsModelMap.get(state.channel.attributes.type);
	assert(baseModel !== undefined, "must have base model");
	const channels = await state.datastore.getChannels();
	const globalObjects = await state.client.entryPoint.getContainerObjects();
	const allHandles = [
		...channels.map((c) => ({ tag: c.id, handle: c.handle })),
		...globalObjects.filter((v) => v.handle !== undefined),
	];

	// we always serialize and then deserialize withe a handle look
	// up, as this ensure we all do the same thing, regardless of if
	// we are replaying from a file with serialized generated operations, or
	// running live with in-memory generated operations.
	const subOp = JSON.parse(JSON.stringify(op.op), (key, value: unknown) => {
		if (isObject(value) && "absolutePath" in value && "tag" in value) {
			const entry = allHandles.find((h) => h.tag === value.tag);
			assert(entry !== undefined, "entry must exist");
			return entry.handle;
		}
		return value;
	});
	await baseModel.reducer(await covertLocalServerStateToDdsState(state), subOp);
};

export const validateConsistencyOfAllDDS = async (clientA: Client, clientB: Client) => {
	const buildChannelMap = async (client: Client) => {
		const channelMap = new Map<string, IChannel>();
		for (const entry of (await client.entryPoint.getContainerObjects()).map((v) =>
			v.type === "stressDataObject" ? v : undefined,
		)) {
			if (entry !== undefined) {
				const stressDataObject = entry?.stressDataObject;
				if (stressDataObject?.attached === true) {
					const channels = await stressDataObject.getChannels();
					for (const channel of channels) {
						if (channel.isAttached()) {
							channelMap.set(`${entry.tag}/${channel.id}`, channel);
						}
					}
				}
			}
		}
		return channelMap;
	};
	const aMap = await buildChannelMap(clientA);
	const bMap = await buildChannelMap(clientB);
	assert(aMap.size === bMap.size, "channel maps should be the same size");
	for (const key of aMap.keys()) {
		const aChannel = aMap.get(key);
		const bChannel = bMap.get(key);
		assert(aChannel !== undefined, "channel must exist");
		assert(aChannel.attributes.type === bChannel?.attributes.type, "channel types must match");
		const model = ddsModelMap.get(aChannel.attributes.type);
		assert(model !== undefined, "model must exist");
		await model.validateConsistency(createDDSClient(aChannel), createDDSClient(bChannel));
	}
};
