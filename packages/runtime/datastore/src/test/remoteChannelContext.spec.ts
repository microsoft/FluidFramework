/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { ContainerErrorTypes } from "@fluidframework/container-definitions/internal";
import type { IErrorBase } from "@fluidframework/core-interfaces";
import type {
	IChannel,
	IChannelAttributes,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import type {
	CreateChildSummarizerNodeFn,
	IContainerRuntimeBase,
	IFluidDataStoreContext,
	IRuntimeStorageService,
	ISummarizerNodeWithGC,
} from "@fluidframework/runtime-definitions/internal";
import {
	isFluidError,
	MockLogger,
	TelemetryDataTag,
} from "@fluidframework/telemetry-utils/internal";
import {
	MockFluidDataStoreContext,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils/internal";

import { FluidDataStoreRuntime, type ISharedObjectRegistry } from "../dataStoreRuntime.js";
import { RemoteChannelContext } from "../remoteChannelContext.js";

describe("RemoteChannelContext Tests", () => {
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
		// back-compat 0.38 - DataStoreRuntime looks in container runtime for certain properties that are unavailable
		// in the data store context.
		dataStoreContext.containerRuntime = {} as unknown as IContainerRuntimeBase;
		sharedObjectRegistry = {
			get(name: string) {
				throw new Error("Not implemented");
			},
		};
	});

	it("rejects ids with forward slashes", () => {
		const invalidId = "beforeSlash/afterSlash";
		const dataStoreRuntime = loadRuntime(dataStoreContext, sharedObjectRegistry);
		const codeBlock = (): RemoteChannelContext =>
			new RemoteChannelContext(
				dataStoreRuntime,
				dataStoreContext,
				dataStoreContext.storage,
				(c, lom) => {},
				(s: string) => {},
				invalidId,
				undefined as unknown as ISnapshotTree,
				sharedObjectRegistry,
				undefined,
				undefined as unknown as CreateChildSummarizerNodeFn,
				"SomeAttachMessageType",
			);
		assert.throws(
			codeBlock,
			validateAssertionError("Channel context ID cannot contain slashes"),
			"Expected exception was not thrown",
		);
	});

	it("first await on getChannel() logs ChannelLoadFailure with tagged props when load fails", async () => {
		const channelId = "ddsId";
		const mockLogger = new MockLogger();
		const contextWithMockLogger = new MockFluidDataStoreContext(
			"testDataStoreId",
			false,
			mockLogger.toTelemetryLogger(),
		);
		contextWithMockLogger.containerRuntime = {} as unknown as IContainerRuntimeBase;
		contextWithMockLogger.packagePath = ["pkgA", "pkgB"];

		const dataStoreRuntime = loadRuntime(contextWithMockLogger, sharedObjectRegistry);

		// Registry returns undefined so loadChannelFactoryAndAttributes throws
		// `channelFactoryNotRegisteredForGivenType` inside the LazyPromise body.
		const failingRegistry: ISharedObjectRegistry = {
			get: () => undefined,
		};

		const createSummarizerNode: CreateChildSummarizerNodeFn = () =>
			({
				invalidate: () => {},
				summarize: async () => ({ summary: {}, stats: {} }),
				getGCData: async () => ({ gcNodes: {} }),
				updateUsedRoutes: () => {},
			}) as unknown as ISummarizerNodeWithGC;

		const remoteChannelContext = new RemoteChannelContext(
			dataStoreRuntime,
			contextWithMockLogger,
			contextWithMockLogger.storage,
			() => {},
			() => {},
			channelId,
			{ trees: {}, blobs: {} } as unknown as ISnapshotTree,
			failingRegistry,
			undefined /* extraBlobs */,
			createSummarizerNode,
			"SomeAttachMessageType",
		);

		await assert.rejects(
			async () => remoteChannelContext.getChannel(),
			(error: IErrorBase) => {
				assert.strictEqual(
					error.errorType,
					ContainerErrorTypes.dataCorruptionError,
					"thrown error should be a DataCorruptionError",
				);
				assert(isFluidError(error), "thrown error should be a Fluid error");
				return true;
			},
		);

		mockLogger.assertMatchAny(
			[
				{
					eventName: "FluidDataStoreRuntime:RemoteChannelContext:RealizeError",
					dataStoreId: { value: "testDataStoreId", tag: TelemetryDataTag.CodeArtifact },
					dataStorePackagePath: { value: "pkgA/pkgB", tag: TelemetryDataTag.CodeArtifact },
					channelId: { value: channelId, tag: TelemetryDataTag.CodeArtifact },
				},
			],
			"Expected one RealizeError event with tagged data-store and channel props",
		);
	});

	it("logs channelType on RealizeError when the channel factory load fails after attributes are read", async () => {
		const channelId = "ddsId";
		const channelType = "https://graph.microsoft.com/types/TestTree";
		const mockLogger = new MockLogger();
		const contextWithMockLogger = new MockFluidDataStoreContext(
			"testDataStoreId",
			false,
			mockLogger.toTelemetryLogger(),
		);
		contextWithMockLogger.containerRuntime = {} as unknown as IContainerRuntimeBase;
		contextWithMockLogger.packagePath = ["pkgA", "pkgB"];

		const dataStoreRuntime = loadRuntime(contextWithMockLogger, sharedObjectRegistry);

		const attributes: IChannelAttributes = {
			type: channelType,
			snapshotFormatVersion: "1.0",
			packageVersion: "1.0",
		};

		// The factory and attributes resolve successfully (so `channelType` is captured at
		// remoteChannelContext.ts line 114), but `factory.load()` rejects — mirroring the production
		// "Supplied final ID was not finalized by this compressor." decompress failure that occurs
		// inside the channel's load.
		const failingFactory: IChannelFactory = {
			type: channelType,
			attributes,
			create: () => {
				throw new Error("not implemented");
			},
			load: async (): Promise<IChannel> => {
				throw new Error("Supplied final ID was not finalized by this compressor.");
			},
		};
		const registry: ISharedObjectRegistry = {
			get: (type: string) => (type === channelType ? failingFactory : undefined),
		};

		// ChannelStorageService returns the blob id as its own content (see channelStorageService.spec.ts),
		// so the `.attributes` blob "id" is the serialized attributes JSON itself.
		const snapshot = {
			blobs: { ".attributes": JSON.stringify(attributes) },
			trees: {},
		} as unknown as ISnapshotTree;
		const storage: Pick<IRuntimeStorageService, "readBlob"> = {
			readBlob: async (id: string) => stringToBuffer(id, "utf8"),
		};

		const createSummarizerNode: CreateChildSummarizerNodeFn = () =>
			({
				invalidate: () => {},
				summarize: async () => ({ summary: {}, stats: {} }),
				getGCData: async () => ({ gcNodes: {} }),
				updateUsedRoutes: () => {},
			}) as unknown as ISummarizerNodeWithGC;

		const remoteChannelContext = new RemoteChannelContext(
			dataStoreRuntime,
			contextWithMockLogger,
			storage as IRuntimeStorageService,
			() => {},
			() => {},
			channelId,
			snapshot,
			registry,
			undefined /* extraBlobs */,
			createSummarizerNode,
			"SomeAttachMessageType",
		);

		await assert.rejects(async () => remoteChannelContext.getChannel());

		mockLogger.assertMatchAny(
			[
				{
					eventName: "FluidDataStoreRuntime:RemoteChannelContext:RealizeError",
					channelId: { value: channelId, tag: TelemetryDataTag.CodeArtifact },
					channelType: { value: channelType, tag: TelemetryDataTag.CodeArtifact },
				},
			],
			"RealizeError should carry channelType once the factory/attributes have been resolved",
		);
	});
});
