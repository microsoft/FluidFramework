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
import sinon from "sinon";

import {
	DataStoreMessageType,
	FluidDataStoreRuntime,
	ISharedObjectRegistry,
} from "../dataStoreRuntime.js";

type Patch<T, U> = Omit<T, keyof U> & U;

type FluidDataStoreRuntime_ForTesting = Patch<
	FluidDataStoreRuntime,
	IFluidDataStoreRuntimeExperimental & { contexts: Map<unknown, unknown> }
>;

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

describe("FluidDataStoreRuntime.isDirty tracking", () => {
	function createRuntime(id: string): FluidDataStoreRuntime_ForTesting {
		return new FluidDataStoreRuntime(
			new MockFluidDataStoreContext(id),
			{} as unknown as ISharedObjectRegistry,
			/* existing */ false,
			async (rt) => rt,
		) as unknown as FluidDataStoreRuntime_ForTesting;
	}

	// Dummy content
	const content: IRuntimeMessagesContent = {
		contents: {},
		clientSequenceNumber: 1,
		localOpMetadata: {},
	};

	// Helper to create a dummy ack with one more more messages
	const ack = ({
		local,
		messageCount,
	}: { local: boolean; messageCount: number }): IRuntimeMessageCollection => ({
		envelope: {
			type: "other", // allows us to test top-level logic of runtime.processMessages without actually providing a legit message
		} satisfies Partial<ISequencedMessageEnvelope> as ISequencedMessageEnvelope,
		local,
		messagesContent: Array.from({ length: messageCount }, () => content),
	});

	it("Submitting and processing local/non-local ops correctly updates isDirty", () => {
		const runtime = createRuntime("runtime1");

		assert.strictEqual(runtime.isDirty, false, "Runtime should start clean");

		runtime.submitMessage(DataStoreMessageType.ChannelOp, {}, undefined);
		assert.strictEqual(runtime.isDirty, true, "Runtime should be dirty after local op");

		// Submit a few more
		runtime.submitMessage(DataStoreMessageType.ChannelOp, {}, undefined);
		runtime.submitMessage(DataStoreMessageType.ChannelOp, {}, undefined);

		// Non-local ops should not affect isDirty
		const nonLocalOps = ack({ local: false, messageCount: 4 });
		runtime.processMessages(nonLocalOps);
		assert.strictEqual(
			runtime.isDirty,
			true,
			"Runtime should still be dirty after non-local ops",
		);

		// Simulate processing the "first" local op (it doesn't matter that the incoming content here is fake)
		const firstLocalOp = ack({ local: true, messageCount: 1 });
		runtime.processMessages(firstLocalOp);
		assert.strictEqual(
			runtime.isDirty,
			true,
			"Runtime should still be dirty, more ops to process",
		);

		// Simulate processing the remaining local ops
		const remainingLocalOps = ack({ local: true, messageCount: 2 });
		runtime.processMessages(remainingLocalOps);

		assert.strictEqual(
			runtime.isDirty,
			false,
			"Runtime should not be dirty after processing acks of all pending local op",
		);
	});
	it("maintains isDirty correctly with simple resubmitted channel ops", () => {
		const runtime = createRuntime("resubmitChannel");
		assert.strictEqual(runtime.isDirty, false, "Runtime should start clean");

		const submitSingleMessage = (): void =>
			runtime.submitMessage(DataStoreMessageType.ChannelOp, { address: "foo" }, undefined);

		// Simulate a channel context with a reSubmit method for internals of runtime.reSubmit call below
		sinon
			.stub(runtime, "contexts")
			.get(() => new Map([["foo", { reSubmit: submitSingleMessage }]]));

		// Initial local op
		runtime.submitMessage(DataStoreMessageType.ChannelOp, { address: "foo" }, undefined);
		assert.strictEqual(
			runtime.isDirty,
			true,
			"Runtime should be dirty after the first local op",
		);

		// Resubmit the op (simulating reconnect). Should still be dirty
		runtime.reSubmit(DataStoreMessageType.ChannelOp, { address: "foo" }, undefined);
		assert.strictEqual(
			runtime.isDirty,
			true,
			"Runtime should remain dirty after resubmitting the op",
		);

		// Simulate processing the local op's ack - now clean
		runtime.processMessages(ack({ local: true, messageCount: 1 }));
		assert.strictEqual(
			runtime.isDirty,
			false,
			"Runtime should be clean after the resubmitted op is acked",
		);
	});

	it("maintains isDirty correctly when resubmitting channel op results in nothing to submit", () => {
		const runtime = createRuntime("resubmitChannel");
		assert.strictEqual(runtime.isDirty, false, "Runtime should start clean");

		// Simulate a channel context with a reSubmit method that chooses not to submit anything, for internals of runtime.reSubmit call below
		sinon.stub(runtime, "contexts").get(() => new Map([["foo", { reSubmit: () => {} }]]));

		// Initial local op
		runtime.submitMessage(DataStoreMessageType.ChannelOp, { address: "foo" }, undefined);
		assert.strictEqual(
			runtime.isDirty,
			true,
			"Runtime should be dirty after the first local op",
		);

		// Resubmit the op (simulating reconnect). Should be clean since resubmit didn't result in a new op
		runtime.reSubmit(DataStoreMessageType.ChannelOp, { address: "foo" }, undefined);
		assert.strictEqual(
			runtime.isDirty,
			false,
			"Runtime should be clean after resubmitting since it was a no-op",
		);
	});

	it("maintains isDirty with resubmitted attach ops", () => {
		const runtime = createRuntime("resubmitAttach");
		assert.strictEqual(runtime.isDirty, false, "Runtime should start clean");

		// Submit a local attach op
		const attachMessage = {
			id: "attachId",
			type: "SomeType",
			snapshot: { type: SummaryType.Tree, tree: {} },
		};
		runtime.submitMessage(DataStoreMessageType.Attach, attachMessage, undefined);
		assert.strictEqual(runtime.isDirty, true, "Runtime should be dirty after attach op");

		// Resubmit same attach op
		runtime.reSubmit(DataStoreMessageType.Attach, attachMessage, undefined);
		assert.strictEqual(
			runtime.isDirty,
			true,
			"Runtime should remain dirty after resubmitting attach op",
		);

		// Ack the resubmitted attach op
		runtime.processMessages(ack({ local: true, messageCount: 1 }));

		assert.strictEqual(runtime.isDirty, false, "Runtime should be clean after all acks");
	});

	it("sets dirty state when applying stashed ops and clears after ack", async () => {
		const runtime = createRuntime("applyStashed");
		assert.strictEqual(runtime.isDirty, false, "Runtime should start clean");

		// Simulate a channel context with applyStashedOp and getChannel methods (don't need to implement them though)
		sinon
			.stub(runtime, "contexts")
			.get(() => new Map([["foo", { applyStashedOp: () => {}, getChannel: () => ({}) }]]));

		// Apply a stashed channel op
		await runtime.applyStashedOp({
			type: DataStoreMessageType.ChannelOp,
			content: { address: "foo" },
		});
		assert.strictEqual(
			runtime.isDirty,
			true,
			"Runtime should be dirty after applying stashed op",
		);

		runtime.processMessages(ack({ local: true, messageCount: 1 }));

		assert.strictEqual(
			runtime.isDirty,
			false,
			"Runtime should be clean after acking stashed op",
		);
	});

	it("clears dirty state on rollback", () => {
		const runtime = createRuntime("rollback");
		assert(
			typeof runtime.rollback === "function",
			"PRECONDITION: Rollback must be present on base runtime",
		);

		// Simulate a channel context with a rollback method (don't need to implement them though)
		sinon.stub(runtime, "contexts").get(() => new Map([["foo", { rollback: () => {} }]]));

		runtime.submitMessage(DataStoreMessageType.ChannelOp, { address: "foo" }, undefined);
		assert.strictEqual(runtime.isDirty, true, "Runtime should be dirty after local op");

		// Roll back the op
		runtime.rollback(
			DataStoreMessageType.ChannelOp,
			{ address: "foo" },
			/* localOpMetadata: */ undefined,
		);

		assert.strictEqual(runtime.isDirty, false, "Runtime should be clean after rollback");
	});
});
