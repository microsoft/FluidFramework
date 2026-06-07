/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ContainerErrorTypes } from "@fluidframework/container-definitions/internal";
import type { IErrorBase } from "@fluidframework/core-interfaces";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import type {
	CreateChildSummarizerNodeFn,
	IContainerRuntimeBase,
	IFluidDataStoreContext,
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
					ContainerErrorTypes.dataProcessingError,
					"thrown error should be a DataProcessingError",
				);
				assert(isFluidError(error), "thrown error should be a Fluid error");
				return true;
			},
		);

		mockLogger.assertMatchAny(
			[
				{
					eventName: "RemoteChannelContext:RealizeError",
					dataStoreId: { value: "testDataStoreId", tag: TelemetryDataTag.CodeArtifact },
					dataStorePackagePath: { value: "pkgA/pkgB", tag: TelemetryDataTag.CodeArtifact },
					channelId: { value: channelId, tag: TelemetryDataTag.CodeArtifact },
				},
			],
			"Expected one RealizeError event with tagged data-store and channel props",
		);
	});
});
