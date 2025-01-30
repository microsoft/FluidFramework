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

const covertLocalServerStateToDdsState = (
	state: LocalServerStressState,
	channel: IChannel,
): DDSFuzzTestState<IChannelFactory> => {
	return {
		clients: makeUnreachableCodePathProxy("clients"),
		client: createDDSClient(channel),
		containerRuntimeFactory: makeUnreachableCodePathProxy("containerRuntimeFactory"),
		isDetached: state.isDetached,
		summarizerClient: makeUnreachableCodePathProxy("containerRuntimeFactory"),
		random: {
			...state.random,
			handle: () => {
				const realHandle = toFluidHandleInternal(
					state.random.pick([
						...Object.values(state.client.entryPoint.channels)
							.flatMap((ca) => ca)
							.map((c) => c.handle),
						...Object.values(state.client.entryPoint.globalObjects)
							.map((v) => v.handle)
							.filter((v): v is IFluidHandle => v !== undefined),
					]),
				);
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
	const channelType = state.random.pick(Object.keys(state.client.entryPoint.channels));
	const channel = state.random.pick(state.client.entryPoint.channels[channelType]);
	const model = ddsModelMap.get(channelType);
	assert(model !== undefined, "must have model");

	const op = await model.generator(covertLocalServerStateToDdsState(state, channel));

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
	const channel = state.client.entryPoint.channels[op.channelType].find(
		(v) => v.id === op.channelId,
	);
	assert(channel !== undefined, "must have channel");
	await baseModel.reducer(covertLocalServerStateToDdsState(state, channel), op.op as any);
};

export const validateConsistencyOfAllDDS = async (clientA: Client, clientB: Client) => {
	const buildChannelMap = (client: Client) => {
		const channelMap = new Map<string, IChannel>();
		for (const value of Object.values(client.entryPoint.globalObjects).map((v) =>
			v.type === "stressDataObject" ? v : undefined,
		)) {
			if (value?.StressDataObject.attached) {
				for (const channel of Object.values(value.StressDataObject.channels).flatMap<IChannel>(
					(ca) => ca,
				)) {
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
		assert(aChannel !== undefined, "channel must exist");
		assert(aChannel.attributes.type === bChannel?.attributes.type, "channel types must match");
		const model = ddsModelMap.get(aChannel.attributes.type);
		assert(model !== undefined, "model must exist");
		await model.validateConsistency(createDDSClient(aChannel), createDDSClient(bChannel));
	}
};
