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
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
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
	type ChannelServiceEndpoints,
} from "../channelContext.js";
import { hasChannelConfiguration } from "../channelConfiguration.js";
import { supportsChannelConfiguration } from "../index.js";
import { RehydratedLocalChannelContext } from "../localChannelContext.js";
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
		} as unknown as IChannel & ChannelConfigurationSupport;
	}

	it("identifies reader support independently of persisted configuration", () => {
		const configured = channel();
		assert.equal(supportsChannelConfiguration(configured), true);
		assert.equal(
			supportsChannelConfiguration({ ...configured, attributes }),
			true,
			"Reader support must not depend on per-instance activation",
		);
		assert.equal(
			supportsChannelConfiguration({ attributes: configured.attributes } as IChannel),
			false,
		);
		const unsupported = { ...configured, channelConfigurationProtocolVersion: 2 };
		assert.equal(supportsChannelConfiguration(unsupported), false);
	});

	it("loads legacy instances unchanged without requiring configuration support", async () => {
		const legacy = { attributes } as IChannel;
		const loaded = await loadChannel(
			runtime,
			attributes,
			{
				attributes,
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

	for (const [name, saved] of [
		["missing attributes", undefined],
		["unconfigured attributes", attributes],
		[
			"configured attributes",
			{
				...attributes,
				configuration: { ...snapshot, revision: 4, values: { enabled: false } },
			},
		],
	] as const) {
		it(`loads ${name} without inheriting factory configuration or requiring factory support`, async () => {
			const factory = {
				attributes: channel().attributes,
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
						contains: async () => saved !== undefined,
						readBlob: async () => stringToBuffer(JSON.stringify(saved), "utf8"),
					},
				} as unknown as ChannelServiceEndpoints,
				"dds",
				{ get: () => factory },
				attributes.type,
			);
			assert.deepEqual(result.attributes, saved ?? attributes);
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

	it("recognizes absent and supported persisted configuration", () => {
		assert.equal(hasChannelConfiguration(attributes), false);
		for (const configuration of [
			snapshot,
			{ ...snapshot, extra: true },
			{ ...snapshot, revision: -0 },
		]) {
			const configuredAttributes = { ...attributes, configuration };
			assert.equal(hasChannelConfiguration(configuredAttributes), true);
		}
	});

	for (const [message, configurations] of [
		["Configuration is missing properties", [undefined, { version: 1, revision: 0 }]],
		["Unsupported persisted configuration version", [{ ...snapshot, version: 2 }]],
		[
			"Invalid revision",
			[
				{ ...snapshot, revision: undefined },
				{ ...snapshot, revision: -1 },
				{ ...snapshot, revision: 0.5 },
				{ ...snapshot, revision: Number.MAX_SAFE_INTEGER + 1 },
			],
		],
	] as const) {
		it(`rejects malformed persisted configuration: ${message}`, () => {
			for (const configuration of configurations) {
				assert.throws(
					() =>
						hasChannelConfiguration({ ...attributes, configuration } as IChannelAttributes),
					validateAssertionError(message),
				);
			}
		});
	}

	it("rejects invalid persisted configuration before invoking the factory", async () => {
		let loaded = false;
		await assert.rejects(
			loadChannel(
				runtime,
				{ ...attributes, configuration: { ...snapshot, version: 2 } } as IChannelAttributes,
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
			validateAssertionError("Unsupported persisted configuration version"),
		);
		assert.equal(loaded, false);
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
});
