/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ContainerErrorTypes } from "@fluidframework/container-definitions/internal";
import type { IErrorBase } from "@fluidframework/core-interfaces";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import type { IFluidDataStoreContext } from "@fluidframework/runtime-definitions/internal";
import {
	extractTelemetryLoggerExt,
	isFluidError,
	MockLogger,
	TelemetryDataTag,
} from "@fluidframework/telemetry-utils/internal";
import {
	MockFluidDataStoreContext,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils/internal";

import { FluidDataStoreRuntime, type ISharedObjectRegistry } from "../dataStoreRuntime.js";
import { LocalChannelContext, RehydratedLocalChannelContext } from "../localChannelContext.js";

describe("LocalChannelContext Tests", () => {
	let dataStoreContext: MockFluidDataStoreContext;
	let sharedObjectRegistry: ISharedObjectRegistry;
	const loadRuntime = (
		context: IFluidDataStoreContext,
		registry: ISharedObjectRegistry,
	): FluidDataStoreRuntime =>
		new FluidDataStoreRuntime(context, registry, /* existing */ false, async () => ({
			myProp: "myValue",
		}));

	beforeEach(() => {
		dataStoreContext = new MockFluidDataStoreContext();
		sharedObjectRegistry = {
			get(type: string) {
				return {
					type,
					attributes: { type, snapshotFormatVersion: "0" },
					create: () => ({}) as unknown as IChannel,
					load: async () => ({}) as unknown as IChannel,
				};
			},
		};
	});

	it("LocalChannelContext rejects ids with forward slashes", () => {
		const invalidId = "beforeSlash/afterSlash";
		const dataStoreRuntime = loadRuntime(dataStoreContext, sharedObjectRegistry);
		const codeBlock = (): LocalChannelContext =>
			new LocalChannelContext(
				{ id: invalidId } as unknown as IChannel,
				dataStoreRuntime,
				dataStoreContext,
				dataStoreContext.storage,
				extractTelemetryLoggerExt(dataStoreContext.baseLogger),
				() => {},
				(s: string) => {},
			);
		assert.throws(
			codeBlock,
			validateAssertionError("Channel context ID cannot contain slashes"),
			"Expected exception was not thrown",
		);
	});

	it("RehydratedLocalChannelContext rejects ids with forward slashes", () => {
		const invalidId = "beforeSlash/afterSlash";
		const dataStoreRuntime = loadRuntime(dataStoreContext, sharedObjectRegistry);
		const codeBlock = (): RehydratedLocalChannelContext =>
			new RehydratedLocalChannelContext(
				invalidId,
				sharedObjectRegistry,
				dataStoreRuntime,
				dataStoreContext,
				dataStoreContext.storage,
				extractTelemetryLoggerExt(dataStoreContext.baseLogger),
				(content, localOpMetadata) => {},
				(s: string) => {},
				undefined as unknown as ISnapshotTree,
			);
		assert.throws(
			codeBlock,
			validateAssertionError("Channel context ID cannot contain slashes"),
			"Expected exception was not thrown",
		);
	});

	it("RehydratedLocalChannelContext first await on getChannel() logs ChannelLoadFailure with tagged props when load fails", async () => {
		const channelId = "ddsId";
		const mockLogger = new MockLogger();
		const contextWithMockLogger = new MockFluidDataStoreContext(
			"testDataStoreId",
			false,
			mockLogger.toTelemetryLogger(),
		);
		contextWithMockLogger.packagePath = ["pkgA", "pkgB"];
		const dataStoreRuntime = loadRuntime(contextWithMockLogger, sharedObjectRegistry);

		// Registry returns undefined so loadChannelFactoryAndAttributes throws
		// inside the LazyPromise body. With an empty snapshot tree and no
		// attachMessageType, this throws `channelTypeNotAvailable`.
		const failingRegistry: ISharedObjectRegistry = {
			get: () => undefined,
		};

		const rehydratedChannelContext = new RehydratedLocalChannelContext(
			channelId,
			failingRegistry,
			dataStoreRuntime,
			contextWithMockLogger,
			contextWithMockLogger.storage,
			extractTelemetryLoggerExt(contextWithMockLogger.baseLogger),
			() => {},
			() => {},
			{ trees: {}, blobs: {} } as unknown as ISnapshotTree,
		);

		await assert.rejects(
			async () => rehydratedChannelContext.getChannel(),
			(error: IErrorBase) => {
				assert.strictEqual(
					error.errorType,
					ContainerErrorTypes.dataProcessingError,
					"thrown error should be a DataProcessingError",
				);
				assert(isFluidError(error), "thrown error should be a Fluid error");
				return true;
			},
		);

		const failureEvents = mockLogger.events.filter(
			(event) =>
				typeof event.eventName === "string" && event.eventName.endsWith("ChannelLoadFailure"),
		);
		assert.strictEqual(
			failureEvents.length,
			1,
			"ChannelLoadFailure should be logged exactly once",
		);
		const failureEvent = failureEvents[0];
		assert(failureEvent !== undefined);
		assert.deepStrictEqual(
			failureEvent.fluidDataStoreId,
			{ value: "testDataStoreId", tag: TelemetryDataTag.CodeArtifact },
			"event should include tagged fluidDataStoreId",
		);
		assert.deepStrictEqual(
			failureEvent.fullPackageName,
			{ value: "pkgA/pkgB", tag: TelemetryDataTag.CodeArtifact },
			"event should include tagged fullPackageName",
		);
		assert.deepStrictEqual(
			failureEvent.channelId,
			{ value: channelId, tag: TelemetryDataTag.CodeArtifact },
			"event should include tagged channelId",
		);
	});
});
