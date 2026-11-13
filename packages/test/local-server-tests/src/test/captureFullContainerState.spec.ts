/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import {
	captureFullContainerState,
	createDetachedContainer,
	extractBlobAttachReferences,
	loadExistingContainer,
	loadFrozenContainerFromPendingState,
	waitContainerToCatchUp,
} from "@fluidframework/container-loader/internal";
import type { FluidObject } from "@fluidframework/core-interfaces/internal";
import type {
	IDocumentService,
	IDocumentServiceFactory,
	IDocumentStorageService,
	IResolvedUrl,
	ISequencedDocumentMessage,
	ISnapshotTree,
	IUrlResolver,
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

import { createLoader } from "./utils.js";

const toComparableArray = (map: ISharedMap): [string, unknown][] =>
	[...map.entries()].map(([key, value]) => [
		key,
		isFluidHandle(value) ? toFluidHandleInternal(value).absolutePath : value,
	]);

/**
 * Wraps explicit blob reads without intercepting the driver's own snapshot prefetch.
 */
function makeFactoryWithReadBlob(
	inner: IDocumentServiceFactory,
	readBlob: (storage: IDocumentStorageService, id: string) => Promise<ArrayBufferLike>,
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
									return async (id: string): Promise<ArrayBufferLike> =>
										readBlob(storageTarget, id);
								}
								if (storageProp === "getSnapshot" && storageTarget.getSnapshot !== undefined) {
									return storageTarget.getSnapshot.bind(storageTarget);
								}
								const value: unknown = Reflect.get(
									storageTarget,
									storageProp,
									storageReceiver,
								);
								return value;
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

/**
 * Makes live blob-read fallbacks fail so storage cannot mask incomplete captured state.
 */
function makeFactoryWithFailingReadBlob(
	inner: IDocumentServiceFactory,
): IDocumentServiceFactory {
	return makeFactoryWithReadBlob(inner, async () => {
		throw new Error("readBlob hit live storage — captured artifact was not self-contained");
	});
}

/**
 * Simulates a document service factory that hasn't flushed any ops to storage.
 *
 * This implementation works by intercepting storage fetches and delta stream connection attempts,
 * where the storage fetch is stubbed to return an empty stream, and the delta stream connection is wrapped
 * to begin with the ops fetched from the inner storage factory.
 */
function makeFactoryWithSocketOnlyOps(
	inner: IDocumentServiceFactory,
): IDocumentServiceFactory {
	const wrapService = (svc: IDocumentService): IDocumentService =>
		new Proxy(svc, {
			get: (target, prop, receiver) => {
				if (prop === "connectToDeltaStorage") {
					return async () => ({
						fetchMessages: () => ({
							read: async () => ({ done: true as const }),
						}),
					});
				}
				if (prop === "connectToDeltaStream") {
					return async (...args: Parameters<IDocumentService["connectToDeltaStream"]>) => {
						const [connection, socketOnlyOps] = await Promise.all([
							target.connectToDeltaStream(...args),
							readAllOps(await target.connectToDeltaStorage()),
						]);
						const initialMessages = socketOnlyOps;
						const checkpointSequenceNumber =
							initialMessages[initialMessages.length - 1]?.sequenceNumber ??
							connection.checkpointSequenceNumber;
						return new Proxy(connection, {
							get: (connectionTarget, connectionProp) => {
								if (connectionProp === "initialMessages") {
									return initialMessages;
								}
								if (connectionProp === "checkpointSequenceNumber") {
									return checkpointSequenceNumber;
								}
								const value = Reflect.get(
									connectionTarget,
									connectionProp,
									connectionTarget,
								) as unknown;
								if (typeof value !== "function") {
									return value;
								}
								const method = value as (...methodArgs: unknown[]) => unknown;
								return (...methodArgs: unknown[]): unknown =>
									method.apply(connectionTarget, methodArgs);
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

async function readAllOps(
	deltaStorage: Awaited<ReturnType<IDocumentService["connectToDeltaStorage"]>>,
): Promise<ISequencedDocumentMessage[]> {
	const stream = deltaStorage.fetchMessages(1, undefined);
	const ops: ISequencedDocumentMessage[] = [];
	let result = await stream.read();
	while (!result.done) {
		ops.push(...result.value);
		result = await stream.read();
	}
	return ops;
}

const initialize = async (): Promise<{
	container: IContainer;
	testFluidObject: ITestFluidObject;
	urlResolver: LocalResolver;
	codeLoader: LocalCodeLoader;
	documentServiceFactory: LocalDocumentServiceFactory;
	deltaConnectionServer: ReturnType<typeof LocalDeltaConnectionServer.create>;
}> => {
	const deltaConnectionServer = LocalDeltaConnectionServer.create();
	const { urlResolver, codeDetails, codeLoader, loaderProps, documentServiceFactory } =
		createLoader({ deltaConnectionServer });

	const container = await createDetachedContainer({ codeDetails, ...loaderProps });
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
		deltaConnectionServer,
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
			blobContentsMode?: "reference";
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
		assert.strictEqual(
			parsed.blobContentsMode,
			undefined,
			"default capture should remain self-contained without a live-storage marker",
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

	it("includes websocket ops that are not yet available from delta storage", async () => {
		const { container, testFluidObject, urlResolver, codeLoader, documentServiceFactory } =
			await initialize();

		await container.attach(urlResolver.createCreateNewRequest("test"));
		if (container.isDirty) {
			await timeoutPromise((resolve) => container.once("saved", () => resolve()));
		}

		testFluidObject.root.set("websocket-only", "captured");
		if (container.isDirty) {
			await timeoutPromise((resolve) => container.once("saved", () => resolve()));
		}

		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "Expected container to provide a valid absolute URL");

		const pendingLocalState = await captureFullContainerState({
			urlResolver,
			documentServiceFactory: makeFactoryWithSocketOnlyOps(documentServiceFactory),
			request: { url },
		});
		const parsed = JSON.parse(pendingLocalState) as {
			savedOps: { sequenceNumber: number }[];
		};
		assert(
			parsed.savedOps.length > 0,
			"savedOps should include ops delivered by the delta stream",
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
		assert.strictEqual(
			frozenEntryPoint.ITestFluidObject.root.get("websocket-only"),
			"captured",
		);
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

	it("omits snapshot and post-snapshot attachment payloads while preserving resumable structural state", async () => {
		const {
			container,
			testFluidObject,
			urlResolver,
			codeLoader,
			documentServiceFactory,
			deltaConnectionServer,
		} = await initialize();
		const containers = [container];
		try {
			const snapshotPayload = "snapshot-attachment";
			const snapshotHandle = await testFluidObject.runtime.uploadBlob(
				stringToBuffer(snapshotPayload, "utf8"),
			);
			testFluidObject.root.set("snapshotBlob", snapshotHandle);
			testFluidObject.root.set("snapshotValue", "before attach");
			await container.attach(urlResolver.createCreateNewRequest("test"));

			const postSnapshotPayload = "post-snapshot-attachment";
			const postSnapshotHandle = await testFluidObject.runtime.uploadBlob(
				stringToBuffer(postSnapshotPayload, "utf8"),
			);
			testFluidObject.root.set("postSnapshotBlob", postSnapshotHandle);
			testFluidObject.root.set("postSnapshotValue", "after attach");
			if (container.isDirty) {
				await timeoutPromise((resolve) => container.once("saved", () => resolve()));
			}
			const url = await container.getAbsoluteUrl("");
			assert(url !== undefined);
			const captureReads: string[] = [];
			const recordingFactory = makeFactoryWithReadBlob(
				documentServiceFactory,
				async (storage, id) => {
					captureReads.push(id);
					return storage.readBlob(id);
				},
			);
			const pendingLocalState = await captureFullContainerState({
				urlResolver,
				documentServiceFactory: recordingFactory,
				request: { url },
				blobCaptureMode: "structural",
			});
			const capturedState: {
				baseSnapshot: ISnapshotTree;
				snapshotBlobs: Record<string, string>;
				attachmentBlobContents?: Record<string, string>;
				blobContentsMode?: "reference" | "attachmentsOmitted";
				savedOps: ISequencedDocumentMessage[];
			} = JSON.parse(pendingLocalState);
			assert(Object.keys(capturedState.snapshotBlobs).length > 0);
			assert.strictEqual(capturedState.attachmentBlobContents, undefined);
			assert.strictEqual(capturedState.blobContentsMode, "attachmentsOmitted");

			const blobsTree: ISnapshotTree | undefined = capturedState.baseSnapshot.trees[".blobs"];
			assert(blobsTree !== undefined, "Expected snapshot attachment references");
			const snapshotAttachmentIds = Object.entries(blobsTree.blobs)
				.filter(([name]) => name !== ".redirectTable")
				.map(([, storageId]) => storageId);
			assert(snapshotAttachmentIds.length > 0, "Snapshot must contain an attachment");
			const postSnapshotReferences = capturedState.savedOps.flatMap((op) =>
				extractBlobAttachReferences(op),
			);
			assert(postSnapshotReferences.length > 0, "Saved ops must contain a BlobAttach");
			const attachmentIds = new Set([
				...snapshotAttachmentIds,
				...postSnapshotReferences.map((reference) => reference.storageId),
			]);
			assert(
				captureReads.every((id) => !attachmentIds.has(id)),
				"Capture must not explicitly read omitted attachment payloads via readBlob",
			);

			const replayReads: string[] = [];
			const attachmentOnlyFactory = makeFactoryWithReadBlob(
				documentServiceFactory,
				async (storage, id) => {
					assert(attachmentIds.has(id), `Structural blob ${id} fell through to storage`);
					replayReads.push(id);
					return storage.readBlob(id);
				},
			);
			const frozenContainer = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory: attachmentOnlyFactory,
				urlResolver,
				request: { url },
				pendingLocalState,
			});
			containers.push(frozenContainer);
			const entryPoint: FluidObject<TestFluidObject> = await frozenContainer.getEntryPoint();
			assert(entryPoint.ITestFluidObject !== undefined);
			const root = entryPoint.ITestFluidObject.root;
			assert.strictEqual(root.get("snapshotValue"), "before attach");
			assert.strictEqual(root.get("postSnapshotValue"), "after attach");
			assert.deepStrictEqual(replayReads, []);
			for (const [key, payload] of [
				["snapshotBlob", snapshotPayload],
				["postSnapshotBlob", postSnapshotPayload],
			]) {
				const handle: unknown = root.get(key);
				assert(isFluidHandle(handle));
				assert.deepStrictEqual(await handle.get(), stringToBuffer(payload, "utf8"));
			}
			assert.deepStrictEqual(new Set(replayReads), attachmentIds);

			for (const omissionMarker of ["attachmentsOmitted", undefined]) {
				const offlineContainer = await loadFrozenContainerFromPendingState({
					codeLoader,
					pendingLocalState: JSON.stringify({
						...capturedState,
						blobContentsMode: omissionMarker,
					}),
				});
				containers.push(offlineContainer);
				const offlineEntryPoint: FluidObject<TestFluidObject> =
					await offlineContainer.getEntryPoint();
				assert(offlineEntryPoint.ITestFluidObject !== undefined);
				const offlineRoot = offlineEntryPoint.ITestFluidObject.root;
				assert.strictEqual(offlineRoot.get("snapshotValue"), "before attach");
				assert.strictEqual(offlineRoot.get("postSnapshotValue"), "after attach");
				for (const key of ["snapshotBlob", "postSnapshotBlob"]) {
					const handle: unknown = offlineRoot.get(key);
					assert(isFluidHandle(handle));
					await assert.rejects(
						async () => handle.get(),
						(error: Error) => {
							// Handle resolution wraps the storage UsageError in a response exception.
							assert.match(error.message, /blob payload was not captured/);
							assert.match(error.message, /online form/);
							if (omissionMarker === "attachmentsOmitted") {
								assert.match(error.message, /blobCaptureMode: "structural"/);
								assert.match(error.message, /omits attachment payloads/);
							} else {
								assert.match(error.message, /"structural" omits attachments/);
							}
							return true;
						},
					);
				}
			}
		} finally {
			for (const loadedContainer of containers) {
				loadedContainer.close();
			}
			await deltaConnectionServer.close();
		}
	});

	it("captures references that can seed multiple independent online containers", async () => {
		const { container, testFluidObject, urlResolver, codeLoader, documentServiceFactory } =
			await initialize();

		const blobPayload = "reference-only-attachment";
		const blobHandle = await testFluidObject.runtime.uploadBlob(
			stringToBuffer(blobPayload, "utf8"),
		);
		testFluidObject.root.set("blobHandle", blobHandle);
		testFluidObject.root.set("baseline", "captured");
		await container.attach(urlResolver.createCreateNewRequest("test"));
		if (container.isDirty) {
			await timeoutPromise((resolve) => container.once("saved", () => resolve()));
		}

		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "Expected container to provide a valid absolute URL");

		const inlineState = await captureFullContainerState({
			urlResolver,
			documentServiceFactory,
			request: { url },
		});
		const referenceState = await captureFullContainerState({
			urlResolver,
			documentServiceFactory,
			request: { url },
			blobCaptureMode: "reference",
		});
		const parsedReferenceState = JSON.parse(referenceState) as {
			snapshotBlobs: Record<string, string>;
			blobContentsMode?: "reference";
			attachmentBlobContents?: Record<string, string>;
		};
		assert.deepStrictEqual(
			parsedReferenceState.snapshotBlobs,
			{},
			"Reference-only state should omit structural blob payloads",
		);
		assert.strictEqual(
			parsedReferenceState.blobContentsMode,
			"reference",
			"Reference-only state should identify its live-storage dependency",
		);
		assert.strictEqual(
			parsedReferenceState.attachmentBlobContents,
			undefined,
			"Reference-only state should omit attachment payloads",
		);
		assert(
			referenceState.length < inlineState.length,
			"Reference-only state should be smaller than the default inline state",
		);

		await assert.rejects(
			async () =>
				loadFrozenContainerFromPendingState({
					codeLoader,
					pendingLocalState: referenceState,
				}),
			/Reference-only state.*requires online driver wiring/,
			"Fully offline loading should clearly reject reference-only state",
		);

		const unmarkedEmptyState = JSON.stringify({
			...JSON.parse(referenceState),
			blobContentsMode: undefined,
		});
		await assert.rejects(
			async () =>
				loadFrozenContainerFromPendingState({
					codeLoader,
					pendingLocalState: unmarkedEmptyState,
				}),
			/Attempted to read a blob from a frozen-loaded container/,
			"An unmarked empty blob map should not be misclassified as reference-only state",
		);

		const loadFromBaseline = async (): Promise<{
			container: IContainer;
			root: ISharedMap;
		}> => {
			const loadedContainer = await loadExistingContainer({
				codeLoader,
				documentServiceFactory,
				urlResolver,
				request: { url },
				pendingLocalState: referenceState,
			});
			await waitContainerToCatchUp(loadedContainer);
			const entryPoint: FluidObject<TestFluidObject> = await loadedContainer.getEntryPoint();
			assert(
				entryPoint.ITestFluidObject !== undefined,
				"Expected loaded container entrypoint to be a valid TestFluidObject",
			);
			return { container: loadedContainer, root: entryPoint.ITestFluidObject.root };
		};

		const [first, second] = await Promise.all([loadFromBaseline(), loadFromBaseline()]);
		assert.strictEqual(first.root.get("baseline"), "captured");
		assert.strictEqual(second.root.get("baseline"), "captured");
		const retrievedBlob = await first.root.get("blobHandle").get();
		assert.strictEqual(
			bufferToString(retrievedBlob, "utf8"),
			blobPayload,
			"Reference-only loads should fetch omitted attachment contents from live storage",
		);

		first.root.set("firstEdit", "first");
		second.root.set("secondEdit", "second");
		await Promise.all(
			[first.container, second.container].map(async (loadedContainer) => {
				if (loadedContainer.isDirty) {
					await timeoutPromise((resolve) => loadedContainer.once("saved", () => resolve()));
				}
			}),
		);

		const finalContainer = await loadExistingContainer({
			codeLoader,
			documentServiceFactory,
			urlResolver,
			request: { url },
		});
		await waitContainerToCatchUp(finalContainer);
		const finalEntryPoint: FluidObject<TestFluidObject> = await finalContainer.getEntryPoint();
		assert(finalEntryPoint.ITestFluidObject !== undefined);
		assert.strictEqual(finalEntryPoint.ITestFluidObject.root.get("firstEdit"), "first");
		assert.strictEqual(finalEntryPoint.ITestFluidObject.root.get("secondEdit"), "second");
	});

	it("rejects at capture time when the resolver emits a non-conforming URL shape", async () => {
		const { documentServiceFactory } = await initialize();

		// A resolver whose IResolvedUrl.url violates tryParseCompatibleResolvedUrl's
		// required shape (`protocol://<string>/<tenantId>/<docId>(?...)`). The captured
		// artifact would not be rehydratable via the offline form of
		// loadFrozenContainerFromPendingState, so captureFullContainerState must fail
		// fast at capture time rather than silently produce a poisoned artifact.
		const malformedResolver: IUrlResolver = {
			resolve: async (): Promise<IResolvedUrl> => ({
				type: "fluid",
				id: "no-segments",
				// Single-segment path — fails the two-segment shape check.
				url: "fluid://example.com/onlyonesegment",
				tokens: {},
				endpoints: {},
			}),
			getAbsoluteUrl: async (): Promise<string> => "",
		};

		await assert.rejects(
			async () =>
				captureFullContainerState({
					urlResolver: malformedResolver,
					documentServiceFactory,
					request: { url: "https://example.com/anything" },
				}),
			/resolved URL is not in the shape required by tryParseCompatibleResolvedUrl/,
			"Expected captureFullContainerState to reject a resolver emitting a non-conforming URL shape",
		);
	});
});
