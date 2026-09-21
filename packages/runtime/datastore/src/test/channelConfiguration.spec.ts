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
	ChannelConfigurationRuntime,
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
	validateChannelConfiguration,
	verifyChannelConfigurationCapability,
} from "../channelConfiguration.js";
import {
	loadChannel,
	loadChannelFactoryAndAttributes,
	summarizeChannel,
	type ChannelServiceEndpoints,
} from "../channelContext.js";
import { LocalChannelContext, RehydratedLocalChannelContext } from "../localChannelContext.js";
import { RemoteChannelContext } from "../remoteChannelContext.js";

describe("Channel configuration compatibility", () => {
	const attributes = { type: "configured", snapshotFormatVersion: "1" };
	const snapshot = { version: 1, revision: 0, values: { enabled: true } };
	const sparse: unknown[] = [];
	sparse.length = 2;
	const runtime = {
		attachState: AttachState.Attached,
		isChannelConfigurationEnabled: (type: string) => type === attributes.type,
	} as unknown as IFluidDataStoreRuntime & ChannelConfigurationRuntime;

	function channel(): IChannel & ChannelConfigurationChannel {
		return {
			attributes: { ...attributes, configuration: snapshot },
			channelConfigurationProtocolVersion: 1,
			getAttachSummary: () => new SummaryTreeBuilder().getSummaryTree(),
		} as unknown as IChannel & ChannelConfigurationChannel;
	}

	it("keeps marker-free attributes legacy", () => {
		assert.equal(validateChannelConfiguration(attributes), false);
	});

	it("accepts JSON keys that do not contain custom serialization or handles", () => {
		assert(
			validateChannelConfiguration({
				...attributes,
				configuration: {
					...snapshot,
					values: { toJSON: false, IFluidHandle: "a setting name" },
				},
			} as IChannelAttributes),
		);
	});

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

	it("does not take configuration defaults from a factory for old attach messages", async () => {
		const result = await loadChannelFactoryAndAttributes(
			new MockFluidDataStoreContext(),
			{ objectStorage: { contains: async () => false } } as unknown as ChannelServiceEndpoints,
			"dds",
			{ get: () => ({ attributes: channel().attributes }) as IChannelFactory },
			attributes.type,
		);
		assert.equal("configuration" in result.attributes, false);
	});

	for (const configuration of [
		undefined,
		// eslint-disable-next-line unicorn/no-null
		null,
		{},
		{ ...snapshot, version: 2 },
		{ ...snapshot, revision: -1 },
		{ ...snapshot, revision: 1.5 },
		{ ...snapshot, revision: Number.MAX_SAFE_INTEGER + 1 },
		{ ...snapshot, values: [] },
		{ ...snapshot, values: { bad: undefined } },
		{ ...snapshot, values: { bad: Infinity } },
		{ ...snapshot, values: { bad: -0 } },
		{ ...snapshot, extra: true },
		{ ...snapshot, values: { bad: { type: "__fluid_handle__", url: "/dds" } } },
		{ ...snapshot, values: { bad: sparse } },
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

	it("accepts a controller protocol marker without lifecycle callbacks", () => {
		assert.doesNotThrow(() => verifyChannelConfigurationCapability(channel(), runtime));
	});

	it("checks capability before capturing a new-protocol snapshot", () => {
		let captured = false;
		const configured = channel();
		const unavailableRuntime = {
			isChannelConfigurationCreationEnabled: (type: string) => type === attributes.type,
			isChannelConfigurationEnabled: () => false,
		} as unknown as IFluidDataStoreRuntime & ChannelConfigurationRuntime;
		Object.assign(configured, {
			getAttachSummary: () => {
				captured = true;
			},
		});
		assert.throws(
			() => summarizeChannel(configured, true, false, undefined, unavailableRuntime),
			/channel configuration is not active/,
		);
		assert.equal(captured, false);
		assert.throws(
			() => verifyChannelConfigurationCapability(configured, unavailableRuntime),
			/channel configuration is not active/,
		);
	});

	it("does not attach another type just because one type is active", () => {
		const configured = channel();
		const other = {
			...channel(),
			attributes: { ...channel().attributes, type: "other-configured" },
		};
		summarizeChannel(configured, true, false, undefined, runtime);
		assert.throws(
			() => summarizeChannel(other, true, false, undefined, runtime),
			/channel configuration is not active for this type/,
		);
		assert.throws(
			() => verifyChannelConfigurationCapability(other, runtime),
			/channel configuration is not active for this type/,
		);
	});

	for (const type of [attributes.type, "other-configured"]) {
		it(`checks persisted type membership before loading ${type}`, async () => {
			const saved = { ...channel().attributes, type };
			const attachedRuntime = {
				isChannelConfigurationEnabled: (channelType: string) =>
					channelType === attributes.type,
				isChannelConfigurationCreationEnabled: () => false,
				attachState: AttachState.Attached,
			} as unknown as IFluidDataStoreRuntime & ChannelConfigurationRuntime;
			let loaded = false;
			const factory = {
				attributes: { ...attributes, type },
				channelConfigurationProtocolVersion: 1,
				load: async () => {
					loaded = true;
					return { ...channel(), attributes: saved };
				},
			} as unknown as IChannelFactory;
			const load = async (): Promise<IChannel> =>
				loadChannel(
					attachedRuntime,
					saved,
					factory,
					{} as ChannelServiceEndpoints,
					createMockLoggerExt(),
					attributes.type,
				);
			if (type === attributes.type) {
				await load();
				assert.equal(loaded, true);
			} else {
				await assert.rejects(load(), /requires document capability/);
				assert.equal(loaded, false);
				await loadChannel(
					attachedRuntime,
					factory.attributes,
					{
						...factory,
						load: async () => ({ attributes: factory.attributes }) as IChannel,
					},
					{} as ChannelServiceEndpoints,
					createMockLoggerExt(),
					"legacy",
				);
			}
		});
	}

	it("keeps detached serialization local and captures final attributes before connection", () => {
		const dataStoreContext = new MockFluidDataStoreContext();
		const localRuntime = {
			attachState: AttachState.Detached,
			isChannelConfigurationEnabled: (type: string) => type === attributes.type,
		} as unknown as IFluidDataStoreRuntime & ChannelConfigurationRuntime;
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

	for (const attachState of [
		AttachState.Detached,
		AttachState.Attaching,
		AttachState.Attached,
	]) {
		it(`gates configured attach summaries and connection while ${attachState}`, () => {
			const dataStoreContext = new MockFluidDataStoreContext();
			const localRuntime = {
				attachState,
				isChannelConfigurationCreationEnabled: () => true,
				isChannelConfigurationEnabled: () => false,
			} as unknown as IFluidDataStoreRuntime & ChannelConfigurationRuntime;
			let captured = false;
			let connected = false;
			const configured = channel();
			Object.assign(configured, {
				id: "dds",
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
			assert.throws(() => context.getAttachSummary(), /channel configuration is not active/);
			assert.throws(() => context.makeVisible(), /channel configuration is not active/);
			assert.equal(captured, false);
			assert.equal(connected, false);
		});
	}

	for (const attachState of [
		AttachState.Detached,
		AttachState.Attaching,
		AttachState.Attached,
	]) {
		for (const connected of [false, true]) {
			it(`uses attach state rather than connectivity for configured loads (${attachState}, ${connected})`, async () => {
				const localRuntime = {
					attachState,
					connected,
					isChannelConfigurationEnabled: () => false,
				} as unknown as IFluidDataStoreRuntime & ChannelConfigurationRuntime;
				let loaded = false;
				const loading = loadChannel(
					localRuntime,
					channel().attributes,
					{
						attributes,
						channelConfigurationProtocolVersion: 1,
						load: async () => {
							loaded = true;
							return channel();
						},
					} as unknown as IChannelFactory,
					{} as ChannelServiceEndpoints,
					createMockLoggerExt(),
					"dds",
				);
				if (attachState === AttachState.Detached) {
					await loading;
					assert.equal(loaded, true);
				} else {
					await assert.rejects(loading, /requires document capability/);
					assert.equal(loaded, false);
				}
			});
		}
	}

	it("loads configured rehydrated channels lazily and replays queued messages with creation disabled", async () => {
		const dataStoreContext = new MockFluidDataStoreContext();
		const localRuntime = {
			...runtime,
			isChannelConfigurationCreationEnabled: () => false,
		} as unknown as IFluidDataStoreRuntime & ChannelConfigurationRuntime;
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
					contents: { version: 1, kind: "configuration", expectedRevision: 0, values: {} },
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
					contents: { version: 1, kind: "configuration", expectedRevision: 0, values: {} },
				},
			],
		} as unknown as IRuntimeMessageCollection);
		assert.deepEqual(invalidated, [7]);
		assert.equal(factoryLookups, 0);
	});
});
