/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type AsyncGenerator, type AsyncReducer } from "@fluid-private/stochastic-test-utils";
import { DDSFuzzTestState, Client as DDSClient } from "@fluid-private/test-dds-utils";
import { AttachState } from "@fluidframework/container-definitions/internal";
import { fluidHandleSymbol, type IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, isObject } from "@fluidframework/core-utils/internal";
import type {
	IChannel,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import { timeoutAwait } from "@fluidframework/test-utils/internal";

import { ddsModelMap } from "./ddsModels.js";
import { LocalServerStressState, Client } from "./localServerStressHarness.js";
import { makeUnreachableCodePathProxy } from "./utils.js";

export interface DDSModelOp {
	type: "DDSModelOp";
	op: unknown;
}

export interface OrderSequentially {
	type: "orderSequentially";
	operations: DDSModelOp[];
	/** Induce a rollback after playing all operations */
	rollback: boolean;
}

const createDDSClient = (channel: IChannel): DDSClient<IChannelFactory> => {
	return {
		channel,
		containerRuntime: makeUnreachableCodePathProxy("containerRuntime"),
		dataStoreRuntime: makeUnreachableCodePathProxy("dataStoreRuntime"),
	};
};

export const covertLocalServerStateToDdsState = async (
	state: LocalServerStressState,
): Promise<DDSFuzzTestState<IChannelFactory>> => {
	const channels = await state.datastore.getChannels();
	const allHandles = [
		...channels.map((c) => ({ tag: c.id, handle: c.handle })),
		...(await state.client.entryPoint.getContainerObjects()).filter(
			(v) => v.handle !== undefined,
		),
	];
	const makeHandle = (random) => () => {
		/**
		 * here we do some funky stuff with handles so we can serialize them like json for output, but not bind them,
		 * as they may not be attached. look at the reduce code to see how we deserialized these fake handles into real
		 * handles.
		 */
		const { tag, handle } = random.pick(allHandles);
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
	};

	return {
		clients: makeUnreachableCodePathProxy("clients"),
		client: createDDSClient(state.channel),
		containerRuntimeFactory: makeUnreachableCodePathProxy("containerRuntimeFactory"),
		isDetached: state.client.container.attachState === AttachState.Detached,
		summarizerClient: makeUnreachableCodePathProxy("containerRuntimeFactory"),
		random: {
			...state.random,
			handle: makeHandle(state.random),
		},
	};
};

export const DDSModelOpGenerator: AsyncGenerator<DDSModelOp, LocalServerStressState> = async (
	state,
) => {
	const channel = state.channel;
	const model = ddsModelMap.get(channel.attributes.type);
	assert(model !== undefined, "must have model");

	const op = await timeoutAwait(
		model.generator(await covertLocalServerStateToDdsState(state)),
		{
			errorMsg: `Timed out waiting for dds generator: ${state.channel.attributes.type}`,
		},
	);

	return {
		type: "DDSModelOp",
		op,
	} satisfies DDSModelOp;
};

export const DDSModelOpReducer: AsyncReducer<DDSModelOp, LocalServerStressState> = async (
	state,
	op,
) => {
	const { baseModel, taggedHandles } = await loadAllHandles(state);
	const subOp = convertToRealHandles(op, taggedHandles);
	baseModel.reducer(await covertLocalServerStateToDdsState(state), subOp);
};

export const loadAllHandles = async (state: LocalServerStressState) => {
	const baseModel = ddsModelMap.get(state.channel.attributes.type);
	assert(baseModel !== undefined, "must have base model");
	const channels = await state.datastore.getChannels();
	const globalObjects = await state.client.entryPoint.getContainerObjects();

	return {
		baseModel,
		taggedHandles: [
			...channels.map((c) => ({ tag: c.id, handle: c.handle })),
			...globalObjects.filter((v) => v.handle !== undefined),
		],
	};
};

export const convertToRealHandles = (
	op: DDSModelOp,
	handles: { tag: string; handle: IFluidHandle }[],
): unknown => {
	// we always serialize and then deserialize with a handle look
	// up, as this ensure we always do the same thing, regardless of if
	// we are replaying from a file with serialized generated operations, or
	// running live with in-memory generated operations.
	return JSON.parse(JSON.stringify(op.op), (key, value: unknown) => {
		if (isObject(value) && "absolutePath" in value && "tag" in value) {
			const entry = handles.find((h) => h.tag === value.tag);
			assert(entry !== undefined, "entry must exist");
			return entry.handle;
		}
		return value;
	});
};

export const validateConsistencyOfAllDDS = async (clientA: Client, clientB: Client) => {
	const buildChannelMap = async (client: Client) => {
		/**
		 * here we build a map of all the channels in the container based on their absolute path,
		 * once we have this we can match channels in different container (clientA and clientB),
		 * and then reuse the per dds validators to ensure eventual consistency.
		 */
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
		try {
			await model.validateConsistency(createDDSClient(aChannel), createDDSClient(bChannel));
		} catch (error) {
			if (error instanceof Error) {
				error.message = `comparing ${clientA.tag} and ${clientB.tag}: ${error.message}`;
			}
			throw error;
		}
	}
};
