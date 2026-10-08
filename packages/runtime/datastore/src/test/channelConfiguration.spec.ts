/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions -- These tests intentionally use partial runtime and factory mocks. */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import {
	AttachState,
	ContainerErrorTypes,
} from "@fluidframework/container-definitions/internal";
import type {
	ChannelConfigurationSupport,
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
import {
	MockFluidDataStoreContext,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils/internal";

import {
	loadChannel,
	loadChannelFactoryAndAttributes,
	summarizeChannel,
	summarizeChannelAsync,
	type ChannelServiceEndpoints,
} from "../channelContext.js";
import { supportsChannelConfiguration } from "../index.js";
import { LocalChannelContext, RehydratedLocalChannelContext } from "../localChannelContext.js";
import { RemoteChannelContext } from "../remoteChannelContext.js";

describe("Channel configuration compatibility", () => {
	const attributes = { type: "configured", snapshotFormatVersion: "1" };
	const snapshot = { version: 1, revision: 0, values: { enabled: true } };
	const runtime = {
		attachState: AttachState.Attached,
	} as unknown as IFluidDataStoreRuntime;

	function channel(): IChannel & ChannelConfigurationSupport {
		return {
			attributes: { ...attributes, configuration: snapshot },
			channelConfigurationProtocolVersion: 1,
			getAttachSummary: () => new SummaryTreeBuilder().getSummaryTree(),
		} as unknown as IChannel & ChannelConfigurationSupport;
	}

	it("reports configuration support for both channels and factories", () => {
		const configured = channel();
		const factory: IChannelFactory & ChannelConfigurationSupport = {
			type: attributes.type,
			attributes,
			channelConfigurationProtocolVersion: 1,
			create: () => configured,
			load: async () => configured,
		};
		assert.equal(supportsChannelConfiguration(configured), true);
		assert.equal(supportsChannelConfiguration(factory), true);
		assert.equal(
			supportsChannelConfiguration({ ...configured, attributes }),
			true,
			"Reader support must not depend on per-instance activation",
		);
	});

	it("does not infer reader support from configured attributes", () => {
		assert.equal(
			supportsChannelConfiguration({ attributes: channel().attributes } as IChannel),
			false,
		);
	});

	for (const version of [undefined, 0, 2, "1", true]) {
		it(`rejects unsupported reader version ${String(version)}`, () => {
			const candidate = {
				...channel(),
				channelConfigurationProtocolVersion: version,
			};
			assert.equal(supportsChannelConfiguration(candidate), false);
		});
	}

	it("loads legacy instances unchanged through a configuration-capable factory", async () => {
		const legacy = { attributes } as IChannel;
		const loaded = await loadChannel(
			runtime,
			attributes,
			{
				attributes,
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

	it("uses factory attributes unchanged for old attach messages", async () => {
		const factory = {
			attributes,
			channelConfigurationProtocolVersion: 1,
		} as unknown as IChannelFactory;
		const result = await loadChannelFactoryAndAttributes(
			new MockFluidDataStoreContext(),
			{ objectStorage: { contains: async () => false } } as unknown as ChannelServiceEndpoints,
			"dds",
			{ get: () => factory },
			attributes.type,
		);
		assert.equal("configuration" in result.attributes, false);
		assert.equal(result.attributes, factory.attributes);
	});

	it("keeps a missing configuration marker from an older summary with a configuration-capable factory", async () => {
		const factory = {
			attributes: channel().attributes,
			channelConfigurationProtocolVersion: 1,
		} as unknown as IChannelFactory;
		const result = await loadChannelFactoryAndAttributes(
			new MockFluidDataStoreContext(),
			{
				objectStorage: {
					contains: async () => true,
					readBlob: async () => stringToBuffer(JSON.stringify(attributes), "utf8"),
				},
			} as unknown as ChannelServiceEndpoints,
			"dds",
			{ get: () => factory },
		);
		assert.deepEqual(result.attributes, attributes);
		assert.equal("configuration" in result.attributes, false);
	});

	for (const hasPersistedAttributes of [false, true]) {
		it(`ignores factory configuration ${hasPersistedAttributes ? "with" : "without"} persisted attributes`, async () => {
			const saved = {
				...attributes,
				configuration: { ...snapshot, revision: 4, values: { enabled: false } },
			};
			const factory = {
				attributes: channel().attributes,
				channelConfigurationProtocolVersion: 1,
				load: async (
					_runtime: IFluidDataStoreRuntime,
					_id: string,
					_services: ChannelServiceEndpoints,
					loadedAttributes: IChannelAttributes,
				) => ({ ...channel(), attributes: loadedAttributes }),
			} as unknown as IChannelFactory;
			const result = await loadChannelFactoryAndAttributes(
				new MockFluidDataStoreContext(),
				{
					objectStorage: {
						contains: async () => hasPersistedAttributes,
						readBlob: async () => stringToBuffer(JSON.stringify(saved), "utf8"),
					},
				} as unknown as ChannelServiceEndpoints,
				"dds",
				{ get: () => factory },
				attributes.type,
			);
			assert.deepEqual(result.attributes, hasPersistedAttributes ? saved : attributes);
			assert.deepEqual(factory.attributes, channel().attributes);
			const loaded = await loadChannel(
				runtime,
				result.attributes,
				result.factory,
				{} as ChannelServiceEndpoints,
				createMockLoggerExt(),
				"dds",
			);
			assert.equal(loaded.attributes, result.attributes);
		});
	}

	for (const [message, configurations] of [
		[
			"Configuration is missing properties",
			[
				undefined,
				// eslint-disable-next-line unicorn/no-null -- Persisted JSON can contain null.
				null,
				true,
				[],
				{},
				{ version: 1, revision: 0 },
			],
		],
		[
			"Unsupported persisted configuration version",
			[
				{ ...snapshot, version: 2 },
				{ ...snapshot, version: "1" },
			],
		],
		[
			"Invalid revision",
			[
				{ ...snapshot, revision: undefined },
				{ ...snapshot, revision: "0" },
				{ ...snapshot, revision: -1 },
				{ ...snapshot, revision: 0.5 },
				{ ...snapshot, revision: Number.NaN },
				{ ...snapshot, revision: Number.POSITIVE_INFINITY },
				{ ...snapshot, revision: Number.MAX_SAFE_INTEGER + 1 },
			],
		],
	] as const) {
		for (const configuration of configurations) {
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
					validateAssertionError(message),
				);
				assert.equal(loaded, false);
			});
		}
	}

	for (const [name, configuration] of [
		["extra fields", { ...snapshot, extra: true }],
		["a negative-zero revision", { ...snapshot, revision: -0 }],
	] as const) {
		it(`loads and summarizes configuration with ${name}`, async () => {
			const configured = {
				...channel(),
				attributes: { ...attributes, configuration },
				summarize: async () => new SummaryTreeBuilder().getSummaryTree(),
			};
			const factory: IChannelFactory & ChannelConfigurationSupport = {
				type: attributes.type,
				attributes,
				channelConfigurationProtocolVersion: 1,
				create: () => configured,
				load: async (_runtime, _id, _services, saved) => {
					assert.equal(saved, configured.attributes);
					return configured;
				},
			};
			const loaded = await loadChannel(
				runtime,
				configured.attributes,
				factory,
				{} as ChannelServiceEndpoints,
				createMockLoggerExt(),
				"dds",
			);
			assert.equal(loaded, configured);
			for (const { summary } of [
				summarizeChannel(loaded),
				await summarizeChannelAsync(loaded),
			]) {
				const serialized = summary.tree[".attributes"];
				assert(serialized?.type === SummaryType.Blob);
				assert.equal(serialized.content, JSON.stringify(configured.attributes));
			}
		});
	}

	it("loads a supporting channel without a factory support declaration", async () => {
		const configured = channel();
		const loaded = await loadChannel(
			runtime,
			configured.attributes,
			{
				attributes,
				load: async () => configured,
			} as unknown as IChannelFactory,
			{} as ChannelServiceEndpoints,
			createMockLoggerExt(),
			"dds",
		);
		assert.equal(loaded, configured);
	});

	it("requires configuration support on the loaded instance", async () => {
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
			validateAssertionError("Configured channel did not declare configuration support"),
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
			validateAssertionError("Configured channel lost its persisted attributes"),
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
			validateAssertionError("Factory should not opt a legacy channel into configuration"),
		);
	});

	it("loads persisted instance attributes instead of factory defaults", async () => {
		const saved = {
			...attributes,
			configuration: { version: 1, revision: 4, values: { enabled: false } },
		};
		const factory = {
			attributes,
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

	it("does not require a support declaration for locally created channels", async () => {
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
			summarize: async () => {
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
		context.getAttachSummary();
		assert.equal(captured, true);
		captured = false;
		await context.summarize();
		assert.equal(captured, true);
		context.makeVisible();
		assert.equal(connected, true);
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

	for (const contextKind of ["rehydrated", "remote"] as const) {
		it(`rejects a ${contextKind} channel without instance support before replaying queued messages`, async () => {
			const dataStoreContext = new MockFluidDataStoreContext();
			const configured = channel();
			const order: string[] = [];
			const factory = {
				attributes,
				channelConfigurationProtocolVersion: 1,
				load: async (
					_runtime: IFluidDataStoreRuntime,
					_id: string,
					services: ChannelServiceEndpoints,
				) => {
					order.push("loaded");
					services.deltaConnection.attach({
						processMessages: () => order.push("replayed"),
						setConnectionState: () => order.push("connected"),
						reSubmit: () => {},
						applyStashedOp: () => {},
					});
					return { attributes: configured.attributes } as IChannel;
				},
			} as unknown as IChannelFactory;
			const snapshotTree = { trees: {}, blobs: { ".attributes": "attributes-blob" } };
			const blobs = new Map([
				["attributes-blob", stringToBuffer(JSON.stringify(configured.attributes), "utf8")],
			]);
			const registry = { get: () => factory };
			const createNode: CreateChildSummarizerNodeFn = () =>
				({ invalidate: () => {} }) as unknown as ISummarizerNodeWithGC;
			const context =
				contextKind === "rehydrated"
					? new RehydratedLocalChannelContext(
							"dds",
							registry,
							runtime,
							dataStoreContext,
							dataStoreContext.storage,
							createMockLoggerExt(),
							() => {},
							() => {},
							snapshotTree,
							blobs,
						)
					: new RemoteChannelContext(
							{ ...runtime, logger: createMockLoggerExt() },
							dataStoreContext,
							dataStoreContext.storage,
							() => {},
							() => {},
							"dds",
							snapshotTree,
							registry,
							blobs,
							createNode,
						);
			if (context instanceof RehydratedLocalChannelContext) {
				context.makeVisible();
			}
			context.processMessages({
				local: false,
				envelope: { sequenceNumber: 7 },
				messagesContent: [{ clientSequenceNumber: 1, contents: {} }],
			} as unknown as IRuntimeMessageCollection);
			assert.deepEqual(order, []);
			await assert.rejects(context.getChannel(), {
				errorType: ContainerErrorTypes.dataProcessingError,
				message: "Configured channel did not declare configuration support",
			});
			assert.deepEqual(order, ["loaded"]);
		});
	}

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
