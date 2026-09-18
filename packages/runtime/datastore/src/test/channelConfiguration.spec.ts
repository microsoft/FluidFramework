/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions -- These tests intentionally use partial runtime and factory mocks. */

import { strict as assert } from "node:assert";

import type {
	ChannelConfigurationChannel,
	ChannelConfigurationRuntime,
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import type {
	CreateChildSummarizerNodeFn,
	IRuntimeMessageCollection,
	ISummarizerNodeWithGC,
} from "@fluidframework/runtime-definitions/internal";
import { createMockLoggerExt } from "@fluidframework/telemetry-utils/internal";
import { MockFluidDataStoreContext } from "@fluidframework/test-runtime-utils/internal";

import {
	publishChannelConfiguration,
	validateChannelConfiguration,
} from "../channelConfiguration.js";
import {
	loadChannel,
	loadChannelFactoryAndAttributes,
	summarizeChannel,
	type ChannelServiceEndpoints,
} from "../channelContext.js";
import { LocalChannelContext } from "../localChannelContext.js";
import { RemoteChannelContext } from "../remoteChannelContext.js";

describe("Channel configuration compatibility", () => {
	const attributes = { type: "configured", snapshotFormatVersion: "1" };
	const snapshot = { version: 1, revision: 0, values: { enabled: true } };
	const sparse: unknown[] = [];
	sparse.length = 2;
	const runtime = {
		channelConfigurationEnabled: true,
	} as unknown as IFluidDataStoreRuntime & ChannelConfigurationRuntime;

	function channel(): IChannel & ChannelConfigurationChannel {
		return {
			attributes: { ...attributes, configuration: snapshot },
			channelConfigurationProtocolVersion: 1,
			onChannelConfigurationPublication: () => {},
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

	it("leaves detached serialization unpublished and publishes after snapshot capture", () => {
		const configured = channel();
		const order: string[] = [];
		Object.assign(configured, {
			getAttachSummary: () => {
				order.push("snapshot");
				return new SummaryTreeBuilder().getSummaryTree();
			},
			onChannelConfigurationPublication: () => order.push("published"),
		});
		summarizeChannel(configured);
		assert.deepEqual(order, ["snapshot"]);
		summarizeChannel(configured, true, false, undefined, runtime);
		assert.deepEqual(order, ["snapshot", "snapshot", "published"]);
	});

	it("gates publication before capturing a new-protocol snapshot", () => {
		let captured = false;
		const configured = channel();
		const unavailableRuntime = {
			channelConfigurationCreationEnabled: true,
			channelConfigurationEnabled: false,
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
			() => publishChannelConfiguration(configured, unavailableRuntime),
			/channel configuration is not active/,
		);
	});

	it("registers detached snapshots and publishes before connecting the instance", () => {
		const dataStoreContext = new MockFluidDataStoreContext();
		const publications: (() => void)[] = [];
		const localRuntime = {
			channelConfigurationEnabled: true,
			registerChannelConfigurationPublication: (publish: () => void) =>
				publications.push(publish),
		} as unknown as IFluidDataStoreRuntime & ChannelConfigurationRuntime;
		const configured = channel();
		const order: string[] = [];
		let published = false;
		Object.assign(configured, {
			id: "dds",
			onChannelConfigurationPublication: () => {
				if (!published) {
					order.push("published");
					published = true;
				}
			},
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
		context.getAttachSummary();
		assert.deepEqual(order, []);
		assert.equal(publications.length, 1);
		publications[0]?.();
		context.makeVisible();
		assert.deepEqual(order, ["published", "connected"]);
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
