/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import {
	captureFullContainerState,
	createDetachedContainer,
	loadFrozenContainerFromPendingState,
	asLegacyAlpha,
	type ContainerAlpha,
} from "@fluidframework/container-loader/internal";
import type { FluidObject } from "@fluidframework/core-interfaces/internal";
import type {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import { SharedMap, type ISharedMap } from "@fluidframework/map/internal";
import { isFluidHandle, toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
	timeoutPromise,
	type ITestFluidObject,
	type LocalCodeLoader,
	type TestFluidObject,
} from "@fluidframework/test-utils/internal";

import { createLoader } from "../utils.js";

const toComparableArray = (map: ISharedMap): [string, unknown][] =>
	[...map.entries()].map(([key, value]) => [
		key,
		isFluidHandle(value) ? toFluidHandleInternal(value).absolutePath : value,
	]);

const initialize = async (): Promise<{
	container: ContainerAlpha;
	testFluidObject: ITestFluidObject;
	urlResolver: LocalResolver;
	codeLoader: LocalCodeLoader;
	documentServiceFactory: LocalDocumentServiceFactory;
}> => {
	const deltaConnectionServer = LocalDeltaConnectionServer.create();
	const { urlResolver, codeDetails, codeLoader, loaderProps, documentServiceFactory } =
		createLoader({ deltaConnectionServer });

	const container = asLegacyAlpha(
		await createDetachedContainer({ codeDetails, ...loaderProps }),
	);
	const entryPoint: FluidObject<TestFluidObject> = (await container.getEntryPoint()) ?? {};
	assert(
		entryPoint.ITestFluidObject !== undefined,
		"Expected entrypoint to be a valid TestFluidObject",
	);
	return {
		container,
		testFluidObject: entryPoint.ITestFluidObject,
		urlResolver,
		codeLoader,
		documentServiceFactory,
	};
};

describe("captureFullContainerState", () => {
	it("captures state that can rehydrate a frozen container with matching data", async () => {
		const { container, testFluidObject, urlResolver, codeLoader, documentServiceFactory } =
			await initialize();

		for (let i = 0; i < 5; i++) {
			testFluidObject.root.set(`detached-${i}`, i);
		}
		await container.attach(urlResolver.createCreateNewRequest("test"));
		for (let i = 0; i < 5; i++) {
			testFluidObject.root.set(`attached-${i}`, i);
		}
		if (container.isDirty) {
			await timeoutPromise((resolve) => container.once("saved", () => resolve()));
		}

		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "Expected container to provide a valid absolute URL");

		const pendingLocalState = await captureFullContainerState({
			urlResolver,
			documentServiceFactory,
			request: { url },
		});

		const parsed = JSON.parse(pendingLocalState) as {
			attached: boolean;
			pendingRuntimeState: unknown;
			url: string;
			savedOps: unknown[];
			baseSnapshot: unknown;
			snapshotBlobs: Record<string, string>;
		};
		assert.strictEqual(parsed.attached, true, "captured state should be marked attached");
		assert.strictEqual(
			parsed.pendingRuntimeState,
			undefined,
			"pendingRuntimeState must be undefined for driver-only capture",
		);
		assert(
			typeof parsed.url === "string" && parsed.url.length > 0,
			"captured state should include the resolved container url",
		);
		assert(parsed.baseSnapshot !== undefined, "captured state should include a base snapshot");
		assert(
			Object.keys(parsed.snapshotBlobs).length > 0,
			"captured state should inline snapshot blobs",
		);

		const frozenContainer = await loadFrozenContainerFromPendingState({
			codeLoader,
			documentServiceFactory,
			urlResolver,
			request: { url },
			pendingLocalState,
		});
		const frozenEntryPoint: FluidObject<TestFluidObject> =
			await frozenContainer.getEntryPoint();
		assert(
			frozenEntryPoint.ITestFluidObject !== undefined,
			"Expected frozen container entrypoint to be a valid TestFluidObject",
		);

		assert.deepEqual(
			toComparableArray(frozenEntryPoint.ITestFluidObject.root),
			toComparableArray(testFluidObject.root),
			"frozen container should reflect state at time of capture",
		);
	});

	it("includes ops posted after the snapshot in savedOps", async () => {
		const { container, testFluidObject, urlResolver, codeLoader, documentServiceFactory } =
			await initialize();

		await container.attach(urlResolver.createCreateNewRequest("test"));
		if (container.isDirty) {
			await timeoutPromise((resolve) => container.once("saved", () => resolve()));
		}

		// Make changes after attach so there are ops beyond the base snapshot.
		for (let i = 0; i < 10; i++) {
			testFluidObject.root.set(`post-snapshot-${i}`, i);
		}
		if (container.isDirty) {
			await timeoutPromise((resolve) => container.once("saved", () => resolve()));
		}

		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "Expected container to provide a valid absolute URL");

		const pendingLocalState = await captureFullContainerState({
			urlResolver,
			documentServiceFactory,
			request: { url },
		});
		const parsed = JSON.parse(pendingLocalState) as {
			savedOps: { sequenceNumber: number }[];
		};
		assert(
			parsed.savedOps.length > 0,
			"savedOps should contain the ops posted after the snapshot",
		);
		for (let i = 1; i < parsed.savedOps.length; i++) {
			assert(
				parsed.savedOps[i].sequenceNumber > parsed.savedOps[i - 1].sequenceNumber,
				"savedOps should be ordered by ascending sequence number",
			);
		}

		const frozenContainer = await loadFrozenContainerFromPendingState({
			codeLoader,
			documentServiceFactory,
			urlResolver,
			request: { url },
			pendingLocalState,
		});
		const frozenEntryPoint: FluidObject<TestFluidObject> =
			await frozenContainer.getEntryPoint();
		assert(
			frozenEntryPoint.ITestFluidObject !== undefined,
			"Expected frozen container entrypoint to be a valid TestFluidObject",
		);
		for (let i = 0; i < 10; i++) {
			assert.strictEqual(
				frozenEntryPoint.ITestFluidObject.root.get(`post-snapshot-${i}`),
				i,
				`frozen container should replay op for post-snapshot-${i}`,
			);
		}
	});

	it("captures DDS and blob references written before capture", async () => {
		const { container, testFluidObject, urlResolver, codeLoader, documentServiceFactory } =
			await initialize();

		await container.attach(urlResolver.createCreateNewRequest("test"));

		const nested = SharedMap.create(testFluidObject.runtime);
		nested.set("nestedKey", "nestedValue");
		testFluidObject.root.set("nestedMapId", nested.handle);

		if (container.isDirty) {
			await timeoutPromise((resolve) => container.once("saved", () => resolve()));
		}

		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "Expected container to provide a valid absolute URL");

		const pendingLocalState = await captureFullContainerState({
			urlResolver,
			documentServiceFactory,
			request: { url },
		});

		const frozenContainer = await loadFrozenContainerFromPendingState({
			codeLoader,
			documentServiceFactory,
			urlResolver,
			request: { url },
			pendingLocalState,
		});
		const frozenEntryPoint: FluidObject<TestFluidObject> =
			await frozenContainer.getEntryPoint();
		assert(
			frozenEntryPoint.ITestFluidObject !== undefined,
			"Expected frozen container entrypoint to be a valid TestFluidObject",
		);
		const retrieved = (await frozenEntryPoint.ITestFluidObject.root
			.get("nestedMapId")
			.get()) as ISharedMap;
		assert(retrieved !== undefined, "Expected to retrieve nested SharedMap from frozen state");
		assert.strictEqual(retrieved.get("nestedKey"), "nestedValue");
	});

	it("inlines attachment blob contents so reads don't go back to storage", async () => {
		const { container, testFluidObject, urlResolver, codeLoader, documentServiceFactory } =
			await initialize();

		// Upload before attach so the attach summary carries the blob in the
		// `.blobs` subtree. Local tests run without a summarizer, so this is
		// the only way to get attachment blobs into a fetched snapshot.
		const blobPayload = "attachment-blob-payload";
		const blobHandle = await testFluidObject.runtime.uploadBlob(
			stringToBuffer(blobPayload, "utf8"),
		);
		testFluidObject.root.set("blobHandle", blobHandle);

		await container.attach(urlResolver.createCreateNewRequest("test"));
		if (container.isDirty) {
			await timeoutPromise((resolve) => container.once("saved", () => resolve()));
		}

		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "Expected container to provide a valid absolute URL");

		const pendingLocalState = await captureFullContainerState({
			urlResolver,
			documentServiceFactory,
			request: { url },
		});
		const parsed = JSON.parse(pendingLocalState) as {
			snapshotBlobs: Record<string, string>;
		};
		const inlinedPayloads = Object.values(parsed.snapshotBlobs);
		assert(
			inlinedPayloads.includes(blobPayload),
			"Expected captured state to inline attachment blob contents by storage ID",
		);

		// Round-trip: the frozen container reads the blob through the cached
		// snapshotBlobs entry, confirming the inlined copy is used on load.
		const frozenContainer = await loadFrozenContainerFromPendingState({
			codeLoader,
			documentServiceFactory,
			urlResolver,
			request: { url },
			pendingLocalState,
		});
		const frozenEntryPoint: FluidObject<TestFluidObject> =
			await frozenContainer.getEntryPoint();
		assert(
			frozenEntryPoint.ITestFluidObject !== undefined,
			"Expected frozen container entrypoint to be a valid TestFluidObject",
		);
		const retrievedBlob = await frozenEntryPoint.ITestFluidObject.root
			.get("blobHandle")
			.get();
		assert(retrievedBlob !== undefined, "Expected blob handle to resolve in frozen container");
		assert.strictEqual(bufferToString(retrievedBlob, "utf8"), blobPayload);
	});
});
