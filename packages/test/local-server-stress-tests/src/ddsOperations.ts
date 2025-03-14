/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type AsyncGenerator, type AsyncReducer } from "@fluid-private/stochastic-test-utils";
import { DDSFuzzTestState, Client as DDSClient } from "@fluid-private/test-dds-utils";
import { AttachState } from "@fluidframework/container-definitions/internal";
import { fluidHandleSymbol } from "@fluidframework/core-interfaces";
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
		isDetached: state.client.container.attachState === AttachState.Detached,
		summarizerClient: makeUnreachableCodePathProxy("containerRuntimeFactory"),
		random: {
			...state.random,
			handle: () => {
				/**
				 * here we do some funky stuff with handles so we can serialize them like json for output, but not bind them,
				 * as they may not be attached. look at the reduce code to see how we deserialized these fake handles into real
				 * handles.
				 */
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
	await timeoutAwait(baseModel.reducer(await covertLocalServerStateToDdsState(state), subOp), {
		errorMsg: `Timed out waiting for dds reducer: ${state.channel.attributes.type}`,
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
