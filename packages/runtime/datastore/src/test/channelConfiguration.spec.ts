/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions -- These tests intentionally use partial runtime and factory mocks. */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions/internal";
import type {
	ChannelConfigurationChannel,
	ConfiguredChannelAttributes,
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { SummaryType } from "@fluidframework/driver-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import type {
	CreateChildSummarizerNodeFn,
	IRuntimeMessageCollection,
	ISummarizerNodeWithGC,
} from "@fluidframework/runtime-definitions/internal";
import { createMockLoggerExt } from "@fluidframework/telemetry-utils/internal";
import { MockFluidDataStoreContext } from "@fluidframework/test-runtime-utils/internal";

import {
	loadChannel,
	loadChannelFactoryAndAttributes,
	summarizeChannelAsync,
	type ChannelServiceEndpoints,
} from "../channelContext.js";
import { LocalChannelContext, RehydratedLocalChannelContext } from "../localChannelContext.js";
import { RemoteChannelContext } from "../remoteChannelContext.js";

describe("Channel configuration compatibility", () => {
	const attributes = { type: "configured", snapshotFormatVersion: "1" };
	const snapshot = { version: 1, revision: 0, values: { enabled: true } };
	const runtime = {
		attachState: AttachState.Attached,
	} as unknown as IFluidDataStoreRuntime;

	function channel(): IChannel & ChannelConfigurationChannel {
		return {
			attributes: { ...attributes, configuration: snapshot },
			channelConfigurationProtocolVersion: 1,
			getAttachSummary: () => new SummaryTreeBuilder().getSummaryTree(),
		} as unknown as IChannel & ChannelConfigurationChannel;
	}

	it("loads legacy instances unchanged through a configuration-capable factory", async () => {
		const legacy = { attributes } as IChannel;
		const loaded = await loadChannel(
			runtime,
			attributes,
			{
				attributes: channel().attributes,
				channelConfigurationProtocolVersion: 1,
				load: async (
					_runtime: unknown,
					_id: unknown,
					_services: unknown,
					saved: IChannelAttributes,
				) => {
					assert.equal(saved, attributes);
					return legacy;
				},
			} as unknown as IChannelFactory,
			{} as ChannelServiceEndpoints,
			createMockLoggerExt(),
			"dds",
		);
		assert.equal(loaded, legacy);
	});

	it("does not take configuration defaults from a factory for old attach messages", async () => {
		const result = await loadChannelFactoryAndAttributes(
			new MockFluidDataStoreContext(),
			{ objectStorage: { contains: async () => false } } as unknown as ChannelServiceEndpoints,
			"dds",
			{ get: () => ({ attributes: channel().attributes }) as IChannelFactory },
			attributes.type,
		);
		assert.equal("configuration" in result.attributes, false);
		assert.deepEqual(result.attributes, attributes);
	});

	it("keeps a missing configuration marker from an older summary even with configured factory defaults", async () => {
		const result = await loadChannelFactoryAndAttributes(
			new MockFluidDataStoreContext(),
			{
				objectStorage: {
					contains: async () => true,
					readBlob: async () => stringToBuffer(JSON.stringify(attributes), "utf8"),
				},
			} as unknown as ChannelServiceEndpoints,
			"dds",
			{ get: () => ({ attributes: channel().attributes }) as IChannelFactory },
		);
		assert.deepEqual(result.attributes, attributes);
		assert.equal("configuration" in result.attributes, false);
	});

	for (const configuration of [
		undefined,
		{ ...snapshot, version: 2 },
		{ ...snapshot, revision: -1 },
		{ ...snapshot, revision: -0 },
		{ ...snapshot, revision: Number.MAX_SAFE_INTEGER + 1 },
		{ ...snapshot, values: [] },
		{ ...snapshot, values: true },
		{ ...snapshot, extra: true },
	]) {
		it(`rejects malformed configuration ${JSON.stringify(configuration)}`, async () => {
			let loaded = false;
			const factory = {
				attributes,
				channelConfigurationProtocolVersion: 1,
				load: async () => {
					loaded = true;
					return channel();
				},
			} as unknown as IChannelFactory;
			await assert.rejects(
				loadChannel(
					runtime,
					{ ...attributes, configuration } as IChannelAttributes,
					factory,
					{} as ChannelServiceEndpoints,
					createMockLoggerExt(),
					"dds",
				),
			);
			assert.equal(loaded, false);
		});
	}

	it("rejects old factories before invoking load", async () => {
		let loaded = false;
		await assert.rejects(
			loadChannel(
				runtime,
				channel().attributes,
				{
					attributes,
					load: async () => {
						loaded = true;
						return channel();
					},
				} as unknown as IChannelFactory,
				{} as ChannelServiceEndpoints,
				createMockLoggerExt(),
				"dds",
			),
			/factory does not support/,
		);
		assert.equal(loaded, false);
	});

	it("requires a registered controller from a supporting factory", async () => {
		await assert.rejects(
			loadChannel(
				runtime,
				channel().attributes,
				{
					attributes,
					channelConfigurationProtocolVersion: 1,
					load: async () => ({ attributes: channel().attributes }) as IChannel,
				} as unknown as IChannelFactory,
				{} as ChannelServiceEndpoints,
				createMockLoggerExt(),
				"dds",
			),
			/did not register/,
		);
	});

	it("rejects a loaded channel that loses its configuration attributes", async () => {
		await assert.rejects(
			loadChannel(
				runtime,
				channel().attributes,
				{
					attributes,
					channelConfigurationProtocolVersion: 1,
					load: async () => ({ ...channel(), attributes }),
				} as unknown as IChannelFactory,
				{} as ChannelServiceEndpoints,
				createMockLoggerExt(),
				"dds",
			),
			/lost its persisted attributes/,
		);
	});

	it("rejects a factory that activates configuration while loading legacy attributes", async () => {
		await assert.rejects(
			loadChannel(
				runtime,
				attributes,
				{
					attributes,
					channelConfigurationProtocolVersion: 1,
					load: async () => channel(),
				} as unknown as IChannelFactory,
				{} as ChannelServiceEndpoints,
				createMockLoggerExt(),
				"dds",
			),
			/cannot opt a legacy channel into configuration/,
		);
	});

	it("requires a controller before capturing an asynchronous new-protocol snapshot", async () => {
		let captured = false;
		const configured = channel();
		Object.assign(configured, {
			channelConfigurationProtocolVersion: undefined,
			summarize: async () => {
				captured = true;
				return new SummaryTreeBuilder().getSummaryTree();
			},
		});
		await assert.rejects(summarizeChannelAsync(configured), /did not register/);
		assert.equal(captured, false);
	});

	it("loads persisted instance attributes instead of factory defaults", async () => {
		const saved = {
			...attributes,
			configuration: { version: 1, revision: 4, values: { enabled: false } },
		};
		const factory = {
			attributes: channel().attributes,
			channelConfigurationProtocolVersion: 1,
			load: async (
				_runtime: IFluidDataStoreRuntime,
				_id: string,
				_services: ChannelServiceEndpoints,
				loadedAttributes: IChannelAttributes,
			) => {
				assert.deepEqual(loadedAttributes, saved);
				return { ...channel(), attributes: loadedAttributes };
			},
		} as unknown as IChannelFactory;
		const result = await loadChannelFactoryAndAttributes(
			new MockFluidDataStoreContext(),
			{
				objectStorage: {
					contains: async () => true,
					readBlob: async () => stringToBuffer(JSON.stringify(saved), "utf8"),
				},
			} as unknown as ChannelServiceEndpoints,
			"dds",
			{ get: () => factory },
		);
		const loaded = await loadChannel(
			runtime,
			result.attributes,
			result.factory,
			{} as ChannelServiceEndpoints,
			createMockLoggerExt(),
			"dds",
		);
		assert.deepEqual(loaded.attributes, saved);
		assert.notDeepEqual(loaded.attributes, factory.attributes);
	});

	it("preserves current instance attributes in a custom asynchronous summary", async () => {
		const configured = channel();
		const finalAttributes = {
			...attributes,
			configuration: { version: 1, revision: 4, values: { enabled: false } },
		};
		Object.assign(configured, {
			summarize: async () => {
				await Promise.resolve();
				Object.assign(configured, { attributes: finalAttributes });
				return new SummaryTreeBuilder().getSummaryTree();
			},
		});
		const { summary } = await summarizeChannelAsync(configured);
		assert(summary.type === SummaryType.Tree);
		const serialized = summary.tree[".attributes"];
		assert(serialized?.type === SummaryType.Blob);
		assert.equal(serialized.content, JSON.stringify(finalAttributes));
	});

	it("keeps detached serialization local and captures final attributes before connection", () => {
		const dataStoreContext = new MockFluidDataStoreContext();
		const localRuntime = {
			attachState: AttachState.Detached,
		} as unknown as IFluidDataStoreRuntime;
		const configured = channel();
		const order: string[] = [];
		Object.assign(configured, {
			id: "dds",
			connect: () => order.push("connected"),
		});
		const context = new LocalChannelContext(
			configured,
			localRuntime,
			dataStoreContext,
			dataStoreContext.storage,
			createMockLoggerExt(),
			() => {},
			() => {},
		);
		const serializedSummary = context.getAttachSummary().summary;
		assert(serializedSummary.type === SummaryType.Tree);
		const serialized = serializedSummary.tree[".attributes"];
		assert(serialized?.type === SummaryType.Blob);
		assert.equal(serialized.content, JSON.stringify(configured.attributes));
		assert.deepEqual(order, []);
		assert.equal(localRuntime.attachState, AttachState.Detached);
		const finalAttributes = {
			...attributes,
			configuration: { version: 1, revision: 1, values: { enabled: false } },
		};
		Object.assign(configured, { attributes: finalAttributes });
		const attachSummary = context.getAttachSummary().summary;
		assert(attachSummary.type === SummaryType.Tree);
		const attach = attachSummary.tree[".attributes"];
		assert(attach?.type === SummaryType.Blob);
		assert.equal(attach.content, JSON.stringify(finalAttributes));
		assert.notEqual(serialized.content, attach.content);
		assert.deepEqual(order, []);
		assert.equal(localRuntime.attachState, AttachState.Detached);
		Object.assign(localRuntime, { attachState: AttachState.Attaching });
		context.makeVisible();
		assert.deepEqual(order, ["connected"]);
	});

	it("requires a controller before attach summaries and connection while detached", () => {
		const dataStoreContext = new MockFluidDataStoreContext();
		const localRuntime = {
			attachState: AttachState.Detached,
		} as unknown as IFluidDataStoreRuntime;
		let captured = false;
		let connected = false;
		const configured = channel();
		Object.assign(configured, {
			id: "dds",
			channelConfigurationProtocolVersion: undefined,
			getAttachSummary: () => {
				captured = true;
				return new SummaryTreeBuilder().getSummaryTree();
			},
			connect: () => {
				connected = true;
			},
		});
		const context = new LocalChannelContext(
			configured,
			localRuntime,
			dataStoreContext,
			dataStoreContext.storage,
			createMockLoggerExt(),
			() => {},
			() => {},
		);
		assert.throws(() => context.getAttachSummary(), /did not register/);
		assert.throws(() => context.makeVisible(), /did not register/);
		assert.equal(captured, false);
		assert.equal(connected, false);
	});

	it("loads configured rehydrated channels lazily and replays queued messages", async () => {
		const dataStoreContext = new MockFluidDataStoreContext();
		const localRuntime = runtime;
		const configured = channel();
		let loaded = false;
		const replayed: IRuntimeMessageCollection[] = [];
		const factory = {
			attributes,
			channelConfigurationProtocolVersion: 1,
			load: async (
				_runtime: IFluidDataStoreRuntime,
				_id: string,
				services: ChannelServiceEndpoints,
				saved: ConfiguredChannelAttributes,
			) => {
				loaded = true;
				assert.deepEqual(saved, configured.attributes);
				services.deltaConnection.attach({
					processMessages: (messages) => replayed.push(messages),
					setConnectionState: () => {},
					reSubmit: () => {},
					applyStashedOp: () => {},
				});
				return configured;
			},
		} as unknown as IChannelFactory;
		const context = new RehydratedLocalChannelContext(
			"dds",
			{ get: () => factory },
			localRuntime,
			dataStoreContext,
			dataStoreContext.storage,
			createMockLoggerExt(),
			() => {},
			() => {},
			{ trees: {}, blobs: { ".attributes": "attributes-blob" } },
			new Map([
				["attributes-blob", stringToBuffer(JSON.stringify(configured.attributes), "utf8")],
			]),
		);
		context.makeVisible();
		const collection = {
			local: false,
			envelope: { sequenceNumber: 7 },
			messagesContent: [
				{
					clientSequenceNumber: 1,
					contents: {
						version: 1,
						isChannelConfigurationOp: true,
						expectedRevision: 0,
						values: {},
					},
				},
			],
		} as unknown as IRuntimeMessageCollection;
		context.processMessages(collection);
		assert.equal(loaded, false);
		assert.deepEqual(replayed, []);
		assert.equal(await context.getChannel(), configured);
		assert.equal(loaded, true);
		assert.deepEqual(replayed, [collection]);
	});

	it("invalidates configuration-only ops while keeping remote channels lazy", () => {
		const dataStoreContext = new MockFluidDataStoreContext();
		let factoryLookups = 0;
		const invalidated: number[] = [];
		const createNode: CreateChildSummarizerNodeFn = () =>
			({
				invalidate: (sequenceNumber: number) => invalidated.push(sequenceNumber),
			}) as unknown as ISummarizerNodeWithGC;
		const context = new RemoteChannelContext(
			{ logger: createMockLoggerExt() } as unknown as IFluidDataStoreRuntime,
			dataStoreContext,
			dataStoreContext.storage,
			() => {},
			() => {},
			"dds",
			{ trees: {}, blobs: { ".attributes": JSON.stringify(channel().attributes) } },
			{
				get: () => {
					factoryLookups++;
					return undefined;
				},
			},
			undefined,
			createNode,
		);
		context.processMessages({
			local: false,
			envelope: { sequenceNumber: 7 },
			messagesContent: [
				{
					clientSequenceNumber: 1,
					contents: {
						version: 1,
						isChannelConfigurationOp: true,
						expectedRevision: 0,
						values: {},
					},
				},
			],
		} as unknown as IRuntimeMessageCollection);
		assert.deepEqual(invalidated, [7]);
		assert.equal(factoryLookups, 0);
	});
});
