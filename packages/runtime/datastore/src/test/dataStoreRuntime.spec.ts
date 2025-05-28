/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ContainerErrorTypes } from "@fluidframework/container-definitions/internal";
import { FluidObject, IErrorBase } from "@fluidframework/core-interfaces";
import {
	IChannel,
	IFluidDataStoreRuntime,
	type IFluidDataStoreRuntimeExperimental,
} from "@fluidframework/datastore-definitions/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import {
	IContainerRuntimeBase,
	IFluidDataStoreContext,
	IGarbageCollectionData,
	type IRuntimeMessageCollection,
	type IRuntimeMessagesContent,
	type ISequencedMessageEnvelope,
} from "@fluidframework/runtime-definitions/internal";
import {
	MockFluidDataStoreContext,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils/internal";

import {
	DataStoreMessageType,
	FluidDataStoreRuntime,
	ISharedObjectRegistry,
} from "../dataStoreRuntime.js";

describe("FluidDataStoreRuntime Tests", () => {
	let dataStoreContext: MockFluidDataStoreContext;
	let sharedObjectRegistry: ISharedObjectRegistry;
	function createRuntime(
		context: IFluidDataStoreContext,
		registry: ISharedObjectRegistry,
		entrypointInitializationFn?: (rt: IFluidDataStoreRuntime) => Promise<FluidObject>,
	): FluidDataStoreRuntime {
		const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
			context,
			registry,
			/* existing */ false,
			entrypointInitializationFn ?? (async () => runtime),
		);
		return runtime;
	}

	beforeEach(() => {
		dataStoreContext = new MockFluidDataStoreContext();
		// back-compat 0.38 - DataStoreRuntime looks in container runtime for certain properties that are unavailable
		// in the data store context.
		dataStoreContext.containerRuntime = {} as unknown as IContainerRuntimeBase;
		sharedObjectRegistry = {
			get(type: string) {
				return {
					type,
					attributes: { type, snapshotFormatVersion: "0" },
					create: (runtime, id: string) =>
						({
							id,
							type,
							attributes: { type, snapshotFormatVersion: "0" },
							clientDetails: {},
						}) as unknown as IChannel,
					load: async (): Promise<IChannel> => ({}) as unknown as IChannel,
				};
			},
		};
	});

	it("constructor rejects ids with forward slashes", () => {
		const invalidId = "beforeSlash/afterSlash";
		dataStoreContext = new MockFluidDataStoreContext(invalidId);
		const codeBlock = (): FluidDataStoreRuntime =>
			new FluidDataStoreRuntime(
				dataStoreContext,
				sharedObjectRegistry,
				false,
				async (dataStoreRuntime) => {
					throw new Error("This shouldn't be called during the test");
				},
			);
		assert.throws(codeBlock, (e: Error) =>
			validateAssertionError(
				e,
				"Id cannot contain slashes. DataStoreContext should have validated this.",
			),
		);
	});

	it("can create a data store runtime", () => {
		let failed: boolean = false;
		let dataStoreRuntime: FluidDataStoreRuntime | undefined;
		try {
			dataStoreRuntime = createRuntime(dataStoreContext, sharedObjectRegistry);
		} catch {
			failed = true;
		}
		assert.strictEqual(failed, false, "Data store runtime creation failed");
		assert.strictEqual(
			dataStoreRuntime?.id,
			dataStoreContext.id,
			"Data store runtime's id in incorrect",
		);
	});

	it("can summarize an empty data store runtime", async () => {
		const dataStoreRuntime = createRuntime(dataStoreContext, sharedObjectRegistry);
		const summarizeResult = await dataStoreRuntime.summarize(true, false);
		assert(
			summarizeResult.summary.type === SummaryType.Tree,
			"Data store runtime did not return a summary tree",
		);
		assert(
			Object.keys(summarizeResult.summary.tree).length === 0,
			"The summary should be empty",
		);
	});

	it("can get GC data of an empty data store runtime", async () => {
		// The GC data should have a single node for the data store runtime with empty outbound routes.
		const expectedGCData: IGarbageCollectionData = {
			gcNodes: { "/": [] },
		};
		const dataStoreRuntime = createRuntime(dataStoreContext, sharedObjectRegistry);
		const gcData = await dataStoreRuntime.getGCData();
		assert.deepStrictEqual(gcData, expectedGCData, "The GC data is incorrect");
	});

	it("createChannel rejects ids with slashes", async () => {
		const dataStoreRuntime = createRuntime(dataStoreContext, sharedObjectRegistry);
		const invalidId = "beforeSlash/afterSlash";
		const codeBlock = (): IChannel => dataStoreRuntime.createChannel(invalidId, "SomeType");
		assert.throws(
			codeBlock,
			(e: IErrorBase) =>
				e.errorType === ContainerErrorTypes.usageError &&
				e.message === `Id cannot contain slashes: ${invalidId}`,
		);
	});

	it("createChannel with default guid", async () => {
		const dataStoreRuntime = createRuntime(dataStoreContext, sharedObjectRegistry);
		const type = "SomeType";
		const channel = dataStoreRuntime.createChannel(undefined, type);
		assert(channel !== undefined, "channel should be created");
		assert(type === channel.attributes.type, "type should be as expected");
	});

	it("createChannel and then attach to dataStore runtime", async () => {
		const dataStoreRuntime = createRuntime(dataStoreContext, sharedObjectRegistry);
		const type = "SomeType";
		const channel = {
			id: "id",
			type,
			attributes: { type, snapshotFormatVersion: "0" },
			clientDetails: {},
		} as unknown as IChannel;
		dataStoreRuntime.addChannel(channel);
		const channel1 = await dataStoreRuntime.getChannel(channel.id);
		assert.deepStrictEqual(channel, channel1, "both channel should match");
	});

	it("createChannel rejects ids with slashes when channel is created first", async () => {
		const dataStoreRuntime = createRuntime(dataStoreContext, sharedObjectRegistry);
		const invalidId = "beforeSlash/afterSlash";
		const type = "SomeType";
		const channel = {
			id: invalidId,
			type,
			attributes: { type, snapshotFormatVersion: "0" },
			clientDetails: {},
		} as unknown as IChannel;
		const codeBlock = (): void => dataStoreRuntime.addChannel(channel);
		assert.throws(
			codeBlock,
			(e: IErrorBase) =>
				e.errorType === ContainerErrorTypes.usageError &&
				e.message === `Id cannot contain slashes: ${invalidId}`,
		);
	});

	it("entryPoint is initialized correctly", async () => {
		const myObj: FluidObject = { fakeProp: "fakeValue" };
		const dataStoreRuntime = createRuntime(
			dataStoreContext,
			sharedObjectRegistry,
			async (dsRuntime) => myObj,
		);
		assert(
			(await dataStoreRuntime.entryPoint?.get()) === myObj,
			"entryPoint was not initialized",
		);
	});
});

type Patch<T, U> = Omit<T, keyof U> & U;

//* ONLY
//* ONLY
//* ONLY
describe.only("FluidDataStoreRuntime.isDirty tracking", () => {
	let dataStoreContext: MockFluidDataStoreContext;
	let sharedObjectRegistry: ISharedObjectRegistry;

	function createRuntimeWithContainerDirtyFlag(
		id: string,
	): Patch<FluidDataStoreRuntime, IFluidDataStoreRuntimeExperimental> {
		dataStoreContext = new MockFluidDataStoreContext(id);

		sharedObjectRegistry = {
			get(type: string) {
				return {
					type,
					attributes: { type, snapshotFormatVersion: "0" },
					create: (rt, channelId: string) =>
						({
							id: channelId,
							type,
							attributes: { type, snapshotFormatVersion: "0" },
							clientDetails: {},
						}) as unknown as IChannel,
					load: async () => ({}) as unknown as IChannel,
				};
			},
		};

		return new FluidDataStoreRuntime(
			dataStoreContext,
			sharedObjectRegistry,
			/* existing */ false,
			async (rt) => rt,
		) as unknown as Patch<FluidDataStoreRuntime, IFluidDataStoreRuntimeExperimental>;
	}

	// Dummy content
	const content: IRuntimeMessagesContent = {
		contents: {},
		clientSequenceNumber: 1,
		localOpMetadata: {},
	};

	it("reflects pending op count while ContainerRuntime is dirty", () => {
		const runtime = createRuntimeWithContainerDirtyFlag("runtime1");

		assert.strictEqual(runtime.isDirty, false, "Runtime should start clean");

		runtime.submitMessage(DataStoreMessageType.ChannelOp, {}, undefined);
		assert.strictEqual(runtime.isDirty, true, "Runtime should be dirty after local op");

		// Non-local ops should not affect isDirty
		const nonLocalOps: IRuntimeMessageCollection = {
			envelope: {
				type: "other", // allows us to test top-level logic of runtime.processMessages without actually providing a legit message
			} satisfies Partial<ISequencedMessageEnvelope> as ISequencedMessageEnvelope,
			local: false,
			messagesContent: [content, content, content],
		};
		runtime.processMessages(nonLocalOps);
		assert.strictEqual(
			runtime.isDirty,
			true,
			"Runtime should still be dirty after non-local ops",
		);

		// Non-local ops should not affect isDirty
		const localOp: IRuntimeMessageCollection = {
			envelope: {
				type: "other", // allows us to test top-level logic of runtime.processMessages without actually providing a legit message
			} satisfies Partial<ISequencedMessageEnvelope> as ISequencedMessageEnvelope,
			local: true,
			messagesContent: [content], // Just one, corresponding to the op submitted above
		};
		runtime.processMessages(localOp);
		assert.strictEqual(
			runtime.isDirty,
			false,
			"Runtime should not be dirty after processing ack of local op",
		);
	});
});
