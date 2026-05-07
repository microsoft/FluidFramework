/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import {
	captureFullContainerState,
	createDetachedContainer,
	extractBlobAttachReferences,
	loadFrozenContainerFromPendingState,
	asLegacyAlpha,
	type ContainerAlpha,
} from "@fluidframework/container-loader/internal";
import type { FluidObject } from "@fluidframework/core-interfaces/internal";
import type {
	IDocumentService,
	IDocumentServiceFactory,
	IDocumentStorageService,
} from "@fluidframework/driver-definitions/internal";
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

/**
 * Wraps a document service factory so that any `readBlob` call on the
 * resulting storage throws. Frozen-load delegates `readBlob` to the inner
 * storage when one is provided, which masks the case where the artifact
 * itself is not self-contained. Routing through this wrapper turns "blob
 * fell through to live storage" into a hard failure that the test can catch.
 */
function makeFactoryWithFailingReadBlob(
	inner: IDocumentServiceFactory,
): IDocumentServiceFactory {
	const wrapService = (svc: IDocumentService): IDocumentService =>
		new Proxy(svc, {
			get: (target, prop, receiver) => {
				if (prop === "connectToStorage") {
					return async (): Promise<IDocumentStorageService> => {
						const innerStorage = await target.connectToStorage();
						return new Proxy(innerStorage, {
							get: (storageTarget, storageProp, storageReceiver) => {
								if (storageProp === "readBlob") {
									return async (_id: string): Promise<ArrayBufferLike> => {
										throw new Error(
											"readBlob hit live storage — captured artifact was not self-contained",
										);
									};
								}
								return Reflect.get(storageTarget, storageProp, storageReceiver) as unknown;
							},
						});
					};
				}
				return Reflect.get(target, prop, receiver) as unknown;
			},
		});

	return {
		createContainer: async (...args) => wrapService(await inner.createContainer(...args)),
		createDocumentService: async (...args) =>
			wrapService(await inner.createDocumentService(...args)),
	};
}

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
			attachmentBlobContents?: Record<string, string>;
		};
		assert(
			parsed.attachmentBlobContents !== undefined,
			"Expected captured state to populate attachmentBlobContents for attachment blobs",
		);
		const inlinedPayloads = Object.values(parsed.attachmentBlobContents).map((v) =>
			bufferToString(stringToBuffer(v, "base64"), "utf8"),
		);
		assert(
			inlinedPayloads.includes(blobPayload),
			"Expected captured state to inline attachment blob contents by storage ID",
		);

		// Round-trip: the frozen container reads the blob through the cached
		// attachmentBlobContents entry (base64-decoded into the blob cache on
		// load), confirming the inlined copy is used on rehydrate.
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
		const retrievedBlob = await frozenEntryPoint.ITestFluidObject.root.get("blobHandle").get();
		assert(retrievedBlob !== undefined, "Expected blob handle to resolve in frozen container");
		assert.strictEqual(bufferToString(retrievedBlob, "utf8"), blobPayload);
	});

	it("round-trips non-UTF-8 attachment blob bytes byte-exactly", async () => {
		const { container, testFluidObject, urlResolver, codeLoader, documentServiceFactory } =
			await initialize();

		// Deliberately invalid UTF-8: 0xff/0xfe/0xc0 are not valid lead bytes
		// in any UTF-8 sequence, and a UTF-8 round-trip would replace them
		// with U+FFFD, losing the original bytes irrecoverably. Base64 is the
		// established encoding for binary attachment blobs in this codebase.
		const binaryPayload = new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0xc0]);
		const blobHandle = await testFluidObject.runtime.uploadBlob(binaryPayload.buffer);
		testFluidObject.root.set("binaryBlobHandle", blobHandle);

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

		// First, prove the captured pending state itself encodes the binary
		// bytes losslessly. local-server's FrozenDocumentService delegates
		// readBlob through to live storage, which masks corruption in the
		// pending state during rehydration; assert directly against the
		// captured payload so this test fails if attachment-blob encoding
		// regresses to UTF-8.
		const parsed = JSON.parse(pendingLocalState) as {
			attachmentBlobContents?: Record<string, string>;
		};
		assert(
			parsed.attachmentBlobContents !== undefined,
			"attachment blobs must be captured into attachmentBlobContents (not snapshotBlobs)",
		);
		const capturedDecoded = Object.values(parsed.attachmentBlobContents).map(
			(v) => new Uint8Array(stringToBuffer(v, "base64")),
		);
		const matched = capturedDecoded.find(
			(bytes) =>
				bytes.length === binaryPayload.length && bytes.every((b, i) => b === binaryPayload[i]),
		);
		assert(
			matched !== undefined,
			`captured attachmentBlobContents must contain the original bytes; got ${capturedDecoded
				.map((b) => `[${[...b].join(",")}]`)
				.join(", ")}`,
		);

		// Then verify end-to-end through rehydration that the frozen
		// container resolves the handle to the same bytes.
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
			.get("binaryBlobHandle")
			.get();
		assert(retrievedBlob !== undefined, "Expected blob handle to resolve in frozen container");
		assert.deepStrictEqual(
			new Uint8Array(retrievedBlob),
			binaryPayload,
			"Non-UTF-8 attachment blob bytes must round-trip byte-exactly through capture/rehydrate",
		);
	});

	it("inlines blobs uploaded after the base snapshot via blobAttach replay", async () => {
		const { container, testFluidObject, urlResolver, codeLoader, documentServiceFactory } =
			await initialize();

		// Take the container live first. The attach summary becomes the base
		// snapshot; any blob uploaded after this point reaches the captured
		// artifact only as a BlobAttach op in the tail, not via the snapshot's
		// `.blobs` redirect table.
		await container.attach(urlResolver.createCreateNewRequest("test"));
		if (container.isDirty) {
			await timeoutPromise((resolve) => container.once("saved", () => resolve()));
		}

		const blobPayload = "post-snapshot-attachment-payload";
		const blobHandle = await testFluidObject.runtime.uploadBlob(
			stringToBuffer(blobPayload, "utf8"),
		);
		testFluidObject.root.set("postSnapshotBlobHandle", blobHandle);
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

		// Sanity: the savedOps tail must contain at least one blobAttach op,
		// otherwise the test does not actually exercise the post-snapshot path.
		// Route through the public extractor so this prerequisite stays correct
		// if BlobAttach ops are ever wrapped in a groupedBatch.
		const parsed = JSON.parse(pendingLocalState) as {
			savedOps: { metadata?: unknown; contents: unknown }[];
			attachmentBlobContents?: Record<string, string>;
		};
		const totalBlobAttachReferences = parsed.savedOps.reduce(
			(count, op) => count + extractBlobAttachReferences(op).length,
			0,
		);
		assert(
			totalBlobAttachReferences > 0,
			"test prerequisite: savedOps must carry at least one blobAttach reference",
		);
		assert(
			parsed.attachmentBlobContents !== undefined,
			"Expected attachmentBlobContents to be populated for the post-snapshot blob",
		);
		const inlinedPayloads = Object.values(parsed.attachmentBlobContents).map((v) =>
			bufferToString(stringToBuffer(v, "base64"), "utf8"),
		);
		assert(
			inlinedPayloads.includes(blobPayload),
			`Expected captured artifact to inline the post-snapshot blob; got [${inlinedPayloads.join(", ")}]`,
		);

		// Round-trip with a factory whose live storage throws on readBlob.
		// If the captured artifact is genuinely self-contained, the handle
		// resolves from the cached attachment bytes and live storage is
		// never consulted.
		const noLiveStorageFactory = makeFactoryWithFailingReadBlob(documentServiceFactory);
		const frozenContainer = await loadFrozenContainerFromPendingState({
			codeLoader,
			documentServiceFactory: noLiveStorageFactory,
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
			.get("postSnapshotBlobHandle")
			.get();
		assert(retrievedBlob !== undefined, "Expected blob handle to resolve in frozen container");
		assert.strictEqual(bufferToString(retrievedBlob, "utf8"), blobPayload);
	});
});
