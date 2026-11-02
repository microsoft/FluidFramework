/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions -- These tests intentionally use partial runtime and factory mocks. */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions/internal";
import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import type {
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import {
	createMockLoggerExt,
	type IFluidErrorBase,
} from "@fluidframework/telemetry-utils/internal";
import { MockFluidDataStoreContext } from "@fluidframework/test-runtime-utils/internal";

import {
	loadChannel,
	loadChannelFactoryAndAttributes,
	type ChannelServiceEndpoints,
} from "../channelContext.js";
import {
	isChannelConfigurationSnapshotV1,
	isConfiguredChannelAttributes,
} from "../channelConfiguration.js";

describe("Channel configuration compatibility", () => {
	const attributes = { type: "configured", snapshotFormatVersion: "1" };
	const snapshot = { version: 1, revision: 0, values: { enabled: true } };
	const runtime = {
		attachState: AttachState.Attached,
	} as unknown as IFluidDataStoreRuntime;

	function channel(): IChannel {
		return {
			attributes: { ...attributes, configuration: snapshot },
		} as unknown as IChannel;
	}

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

	it("does not inherit unsupported factory configuration for old attach messages", async () => {
		const factoryAttributes = {
			...attributes,
			configuration: { ...snapshot, version: 2 },
		};
		const factory = {
			attributes: factoryAttributes,
		} as unknown as IChannelFactory;
		const result = await loadChannelFactoryAndAttributes(
			new MockFluidDataStoreContext(),
			{ objectStorage: { contains: async () => false } } as unknown as ChannelServiceEndpoints,
			"dds",
			{ get: () => factory },
			attributes.type,
		);
		assert.deepEqual(result.attributes, attributes);
		assert.equal(factory.attributes, factoryAttributes);
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
		it(`loads ${name} without inheriting factory configuration`, async () => {
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
		assert.equal(isConfiguredChannelAttributes(attributes), false);
		for (const configuration of [
			snapshot,
			{ ...snapshot, extra: true },
			{ ...snapshot, revision: -0 },
		]) {
			const configuredAttributes = { ...attributes, configuration };
			assert.equal(isChannelConfigurationSnapshotV1(configuration), true);
			assert.equal(isConfiguredChannelAttributes(configuredAttributes), true);
		}
	});

	for (const [name, configurations] of [
		["missing properties", [undefined, { version: 1, revision: 0 }]],
		["unsupported version", [{ ...snapshot, version: 2 }]],
		[
			"invalid revision",
			[
				{ ...snapshot, revision: undefined },
				{ ...snapshot, revision: -1 },
				{ ...snapshot, revision: 0.5 },
				{ ...snapshot, revision: Number.MAX_SAFE_INTEGER + 1 },
			],
		],
		[
			"invalid values",
			[
				{ ...snapshot, values: JSON.parse("null") as unknown },
				{ ...snapshot, values: [] },
			],
		],
	] as const) {
		it(`returns false for malformed persisted configuration: ${name}`, () => {
			for (const configuration of configurations) {
				assert.equal(isChannelConfigurationSnapshotV1(configuration), false);
				assert.equal(
					isConfiguredChannelAttributes({
						...attributes,
						configuration,
					} as IChannelAttributes),
					false,
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
			(error: IFluidErrorBase) => {
				assert.equal(error.errorType, FluidErrorTypes.dataCorruptionError);
				assert.equal(error.message, "Invalid persisted channel configuration");
				return true;
			},
		);
		assert.equal(loaded, false);
	});

	for (const [name, savedAttributes, loadedAttributes] of [
		["configuration preservation", channel().attributes, attributes],
		["legacy configuration activation", attributes, channel().attributes],
	] as const) {
		it(`leaves ${name} to the channel factory`, async () => {
			const loaded = { attributes: loadedAttributes } as IChannel;
			const result = await loadChannel(
				runtime,
				savedAttributes,
				{
					attributes,
					load: async () => loaded,
				} as unknown as IChannelFactory,
				{} as ChannelServiceEndpoints,
				createMockLoggerExt(),
				"dds",
			);
			assert.equal(result, loaded);
		});
	}
});
