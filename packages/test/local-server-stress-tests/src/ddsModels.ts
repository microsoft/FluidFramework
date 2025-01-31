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
import { IFluidHandle, fluidHandleSymbol } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
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
	channelType: string;
	channelId: string;
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
	channel: IChannel,
): Promise<DDSFuzzTestState<IChannelFactory>> => {
	const channels = await state.client.entryPoint.channels();
	const allHandles = [
		...Object.values(channels)
			.flatMap((c) => c)
			.map((c) => c.channel.handle)
			.filter((v): v is IFluidHandle => v !== undefined),
		...Object.values(state.client.entryPoint.globalObjects)
			.map((v) => v.handle)
			.filter((v): v is IFluidHandle => v !== undefined),
	];
	return {
		clients: makeUnreachableCodePathProxy("clients"),
		client: createDDSClient(channel),
		containerRuntimeFactory: makeUnreachableCodePathProxy("containerRuntimeFactory"),
		isDetached: state.isDetached,
		summarizerClient: makeUnreachableCodePathProxy("containerRuntimeFactory"),
		random: {
			...state.random,
			handle: () => {
				const realHandle = toFluidHandleInternal(state.random.pick(allHandles));
				return {
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
	const channels = await state.client.entryPoint.channels();
	const channelType = state.random.pick(Object.keys(channels));
	const channel = state.random.pick(channels[channelType]).channel;
	assert(channel !== undefined, "channel mist exist");
	const model = ddsModelMap.get(channelType);
	assert(model !== undefined, "must have model");

	const op = await model.generator(await covertLocalServerStateToDdsState(state, channel));

	return {
		type: "DDSModelOp",
		channelType,
		channelId: channel.id,
		op,
	} satisfies DDSModelOp;
};

export const DDSModelOpReducer: AsyncReducer<DDSModelOp, LocalServerStressState> = async (
	state,
	op,
) => {
	const baseModel = ddsModelMap.get(op.channelType);
	assert(baseModel !== undefined, "must have model");
	const channels = await state.client.entryPoint.channels();
	const channel = channels[op.channelType].find((v) => v.id === op.channelId)?.channel;
	assert(channel !== undefined, "must have channel");
	await baseModel.reducer(
		await covertLocalServerStateToDdsState(state, channel),
		op.op as any,
	);
};

export const validateConsistencyOfAllDDS = async (clientA: Client, clientB: Client) => {
	const buildChannelMap = async (client: Client) => {
		const channelMap = new Map<string, IChannel>();
		for (const value of Object.values(client.entryPoint.globalObjects).map((v) =>
			v.type === "stressDataObject" ? v : undefined,
		)) {
			const stressDataObject = await value?.stressDataObject;
			if (stressDataObject?.attached) {
				const channels = await stressDataObject.channels();
				for (const entry of Object.values(channels).flatMap((ca) => ca)) {
					const channel = entry.channel;
					if (channel.isAttached()) {
						channelMap.set(`${stressDataObject.id}/${channel.id}`, channel);
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
