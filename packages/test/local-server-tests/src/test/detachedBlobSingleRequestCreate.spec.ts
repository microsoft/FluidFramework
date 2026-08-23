/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { bufferToString } from "@fluid-internal/client-utils";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/internal";
import {
	LoaderHeader,
	type IContainer,
	type ICodeDetailsLoader,
	type IFluidCodeDetails,
} from "@fluidframework/container-definitions/internal";
import {
	Loader,
	captureFullContainerState,
	createDetachedContainer,
	loadExistingContainer,
	loadFrozenContainerFromPendingState,
	rehydrateDetachedContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import {
	blobsTreeName,
	redirectTableBlobName,
} from "@fluidframework/container-runtime/internal";
import type { FluidObject, IFluidHandle } from "@fluidframework/core-interfaces/internal";
import {
	SummaryType,
	type ISummaryTree,
	type SummaryObject,
} from "@fluidframework/driver-definitions";
import type {
	IDocumentService,
	IDocumentServiceFactory,
	IDocumentStorageService,
} from "@fluidframework/driver-definitions/internal";
import type { LocalResolver } from "@fluidframework/local-driver/internal";
import { SharedMap } from "@fluidframework/map/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
	TestFluidObjectFactory,
	createSummarizerCore,
	summarizeNow,
	type ITestFluidObject,
} from "@fluidframework/test-utils/internal";

import { createLoader } from "./utils.js";

const embeddedBlobsTreeName = ".embeddedDetachedBlobs";
const embeddedBlobsGroupId = "embeddedDetachedBlobs";

interface StorageCallCounts {
	createContainer: number;
	createBlob: number;
	uploadSummaryWithContext: number;
	createSummary: ISummaryTree | undefined;
}

function wrapStorage(
	storage: IDocumentStorageService,
	counts: StorageCallCounts,
): IDocumentStorageService {
	return new Proxy(storage, {
		get: (target, property, receiver) => {
			if (property === "createBlob") {
				return async (...args: Parameters<IDocumentStorageService["createBlob"]>) => {
					counts.createBlob++;
					return target.createBlob(...args);
				};
			}
			if (property === "uploadSummaryWithContext") {
				return async (
					...args: Parameters<IDocumentStorageService["uploadSummaryWithContext"]>
				) => {
					counts.uploadSummaryWithContext++;
					return target.uploadSummaryWithContext(...args);
				};
			}
			return Reflect.get(target, property, receiver) as unknown;
		},
	});
}

function wrapService(service: IDocumentService, counts: StorageCallCounts): IDocumentService {
	return new Proxy(service, {
		get: (target, property, receiver) => {
			if (property === "connectToStorage") {
				return async () => wrapStorage(await target.connectToStorage(), counts);
			}
			return Reflect.get(target, property, receiver) as unknown;
		},
	});
}

function wrapDocumentServiceFactory(
	inner: IDocumentServiceFactory,
	counts: StorageCallCounts,
): IDocumentServiceFactory {
	return new Proxy(inner, {
		get: (target, property, receiver) => {
			if (property === "createContainer") {
				return async (...args: Parameters<IDocumentServiceFactory["createContainer"]>) => {
					counts.createContainer++;
					counts.createSummary = args[0];
					return wrapService(await target.createContainer(...args), counts);
				};
			}
			if (property === "createDocumentService") {
				return async (...args: Parameters<IDocumentServiceFactory["createDocumentService"]>) =>
					wrapService(await target.createDocumentService(...args), counts);
			}
			return Reflect.get(target, property, receiver) as unknown;
		},
	});
}

function createRuntimeFactory(
	defaultFactory: TestFluidObjectFactory,
	enableSingleRoundTripFileCreate: true | undefined,
): ContainerRuntimeFactoryWithDefaultDataStore {
	const props = {
		defaultFactory,
		registryEntries: [
			[defaultFactory.type, Promise.resolve(defaultFactory)] as [
				string,
				Promise<TestFluidObjectFactory>,
			],
		],
		runtimeOptions: {
			explicitSchemaControl: true,
			enableSingleRoundTripFileCreate,
		},
		oldestSupportedClient: "3.0.0" as const,
	};
	return new ContainerRuntimeFactoryWithDefaultDataStore(props);
}

async function getTestFluidObject(container: IContainer): Promise<ITestFluidObject> {
	const entryPoint: FluidObject<ITestFluidObject> = await container.getEntryPoint();
	assert(
		entryPoint.ITestFluidObject !== undefined,
		"Expected entrypoint to be a valid TestFluidObject",
	);
	return entryPoint.ITestFluidObject;
}

async function getBlob(root: ITestFluidObject["root"], key: string): Promise<Uint8Array> {
	const value = root.get(key);
	assert(isFluidHandle(value), `Expected ${key} to contain a blob handle`);
	return new Uint8Array(await (value as IFluidHandle<ArrayBufferLike>).get());
}

function assertBytes(actual: Uint8Array, expected: Uint8Array): void {
	assert.deepStrictEqual([...actual], [...expected]);
}

function getBlobManagerSummary(summary: ISummaryTree): ISummaryTree {
	const appSummary: SummaryObject | undefined = summary.tree[".app"];
	const runtimeSummary = appSummary?.type === SummaryType.Tree ? appSummary : summary;
	const blobsSummary: SummaryObject | undefined = runtimeSummary.tree[blobsTreeName];
	assert(blobsSummary?.type === SummaryType.Tree);
	return blobsSummary;
}

function getEmbeddedBlobSummary(summary: ISummaryTree): ISummaryTree {
	const blobsSummary = getBlobManagerSummary(summary);
	const embeddedBlobSummary: SummaryObject | undefined =
		blobsSummary.tree[embeddedBlobsTreeName];
	assert(embeddedBlobSummary?.type === SummaryType.Tree);
	assert.strictEqual(embeddedBlobSummary.groupId, embeddedBlobsGroupId);
	return embeddedBlobSummary;
}

function assertEmbeddedBlobSummary(
	summary: ISummaryTree | undefined,
	expectedBlobs: readonly Uint8Array[],
): void {
	assert(summary?.type === SummaryType.Tree);
	const blobsSummary = getBlobManagerSummary(summary);
	const redirectTableSummary: SummaryObject | undefined =
		blobsSummary.tree[redirectTableBlobName];
	assert(redirectTableSummary?.type === SummaryType.Blob);
	assert.strictEqual(redirectTableSummary.content, "[]");
	const embeddedBlobSummary = getEmbeddedBlobSummary(summary);
	const contents = Object.values(embeddedBlobSummary.tree).map((entry) => {
		assert(entry.type === SummaryType.Blob);
		assert(entry.content instanceof Uint8Array);
		return bufferToString(entry.content, "base64");
	});
	assert.deepStrictEqual(
		contents.sort(),
		expectedBlobs.map((blob) => bufferToString(blob, "base64")).sort(),
	);
}

function assertEmbeddedBlobHandles(summary: ISummaryTree, expectedBlobCount: number): void {
	const entries = Object.entries(getEmbeddedBlobSummary(summary).tree);
	assert.strictEqual(entries.length, expectedBlobCount);
	for (const [localId, entry] of entries) {
		assert.strictEqual(entry.type, SummaryType.Handle);
		assert.strictEqual(entry.handleType, SummaryType.Blob);
		assert.strictEqual(entry.handle, `/${blobsTreeName}/${embeddedBlobsTreeName}/${localId}`);
	}
}

function initialize(options?: { countStorageCalls?: boolean; enabled?: boolean }): {
	codeDetails: IFluidCodeDetails;
	codeLoader: ICodeDetailsLoader;
	counts: StorageCallCounts;
	documentServiceFactory: IDocumentServiceFactory;
	loaderProps: ILoaderProps;
	urlResolver: LocalResolver;
} {
	const deltaConnectionServer = LocalDeltaConnectionServer.create();
	const defaultDataStoreFactory = new TestFluidObjectFactory(
		[["map", SharedMap.getFactory()]],
		"default",
	);
	const runtimeFactory = createRuntimeFactory(
		defaultDataStoreFactory,
		options?.enabled === false ? undefined : true,
	);
	const base = createLoader({
		deltaConnectionServer,
		defaultDataStoreFactory,
		runtimeFactory,
	});
	const counts: StorageCallCounts = {
		createContainer: 0,
		createBlob: 0,
		uploadSummaryWithContext: 0,
		createSummary: undefined,
	};
	const documentServiceFactory =
		options?.countStorageCalls === true
			? wrapDocumentServiceFactory(base.documentServiceFactory, counts)
			: base.documentServiceFactory;
	const loaderProps = {
		...base.loaderProps,
		documentServiceFactory,
	};
	return {
		codeDetails: base.codeDetails,
		codeLoader: base.codeLoader,
		counts,
		documentServiceFactory,
		loaderProps,
		urlResolver: base.urlResolver,
	};
}

describe("Detached blob single-request create", () => {
	it("creates once with binary blobs in a shared loading group", async () => {
		const { codeDetails, counts, loaderProps, urlResolver } = initialize({
			countStorageCalls: true,
		});
		const container = await createDetachedContainer({ codeDetails, ...loaderProps });
		const fluidObject = await getTestFluidObject(container);
		const first = new Uint8Array([0xff, 0x00, 0x80, 0x01]);
		const second = new Uint8Array([0x10, 0x20, 0x30]);
		fluidObject.root.set("first", await fluidObject.runtime.uploadBlob(first.buffer));
		fluidObject.root.set("second", await fluidObject.runtime.uploadBlob(second.buffer));

		await container.attach(urlResolver.createCreateNewRequest("single-request"));

		assert.strictEqual(counts.createContainer, 1);
		assert.strictEqual(counts.createBlob, 0);
		assert.strictEqual(counts.uploadSummaryWithContext, 0);
		assertEmbeddedBlobSummary(counts.createSummary, [first, second]);

		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined);
		const loaded = await loadExistingContainer({
			...loaderProps,
			request: { url },
		});
		const loadedObject = await getTestFluidObject(loaded);
		assertBytes(await getBlob(loadedObject.root, "first"), first);
		assertBytes(await getBlob(loadedObject.root, "second"), second);
	});

	it("serializes and rehydrates detached binary blobs before single-request create", async () => {
		const { codeDetails, counts, loaderProps, urlResolver } = initialize({
			countStorageCalls: true,
		});
		const container = await createDetachedContainer({ codeDetails, ...loaderProps });
		const fluidObject = await getTestFluidObject(container);
		const expected = new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0x7f]);
		fluidObject.root.set("blob", await fluidObject.runtime.uploadBlob(expected.buffer));
		const serializedState = container.serialize();
		const serialized = JSON.parse(serializedState) as {
			attachmentBlobContents?: Record<string, string>;
			attachmentBlobs?: string;
			hasAttachmentBlobs?: boolean;
			snapshotBlobs: Record<string, string>;
			snapshotBlobContents?: Record<string, string>;
		};
		assert.strictEqual(serialized.attachmentBlobContents, undefined);
		assert.strictEqual(serialized.attachmentBlobs, undefined);
		assert.strictEqual(serialized.hasAttachmentBlobs, false);
		assert(serialized.snapshotBlobContents !== undefined);
		const binaryBlobId = Object.entries(serialized.snapshotBlobContents).find(
			([, content]) => content === bufferToString(expected, "base64"),
		)?.[0];
		assert(binaryBlobId !== undefined, "Detached serialized state should contain the blob");
		assert.strictEqual(
			serialized.snapshotBlobs[binaryBlobId],
			undefined,
			"Arbitrary binary must not be placed in the legacy UTF-8 map",
		);
		assert(
			Object.keys(serialized.snapshotBlobs).length > 0,
			"Lossless UTF-8 blobs should remain available to legacy loaders",
		);
		container.close();

		const rehydrated = await rehydrateDetachedContainer({
			...loaderProps,
			serializedState,
		});
		const rehydratedObject = await getTestFluidObject(rehydrated);
		assertBytes(await getBlob(rehydratedObject.root, "blob"), expected);
		const addedAfterRehydrate = new Uint8Array([0x80, 0x00, 0xff, 0x42]);
		rehydratedObject.root.set(
			"addedAfterRehydrate",
			await rehydratedObject.runtime.uploadBlob(addedAfterRehydrate.buffer),
		);
		await rehydrated.attach(urlResolver.createCreateNewRequest("rehydrated-single-request"));

		assert.strictEqual(counts.createContainer, 1);
		assert.strictEqual(counts.createBlob, 0);
		assert.strictEqual(counts.uploadSummaryWithContext, 0);
		assertEmbeddedBlobSummary(counts.createSummary, [expected, addedAfterRehydrate]);
	});

	it("uses legacy attachment upload when the feature is disabled", async () => {
		const { codeDetails, counts, loaderProps, urlResolver } = initialize({
			countStorageCalls: true,
			enabled: false,
		});
		const container = await createDetachedContainer({ codeDetails, ...loaderProps });
		const fluidObject = await getTestFluidObject(container);
		const expected = new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0x7f]);
		fluidObject.root.set("blob", await fluidObject.runtime.uploadBlob(expected.buffer));
		await container.attach(urlResolver.createCreateNewRequest("legacy-fallback"));

		assert.strictEqual(counts.createContainer, 1);
		assert.strictEqual(counts.createBlob, 1);
		assert.strictEqual(counts.uploadSummaryWithContext, 1);
		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined);
		const loaded = await loadExistingContainer({
			...loaderProps,
			request: { url },
		});
		const loadedObject = await getTestFluidObject(loaded);
		assertBytes(await getBlob(loadedObject.root, "blob"), expected);
	});

	it("preserves creator binary blobs through attached pending state", async () => {
		const { codeDetails, loaderProps, urlResolver } = initialize();
		const container = await createDetachedContainer({ codeDetails, ...loaderProps });
		const fluidObject = await getTestFluidObject(container);
		const expected = new Uint8Array([0xff, 0xc3, 0x28, 0x00, 0x80]);
		fluidObject.root.set("blob", await fluidObject.runtime.uploadBlob(expected.buffer));
		await container.attach(urlResolver.createCreateNewRequest("attached-pending-state"));
		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined);

		assert(container.getPendingLocalState !== undefined);
		const pendingLocalState = await container.getPendingLocalState();
		const parsedPendingState = JSON.parse(pendingLocalState) as {
			snapshotBlobs: Record<string, string>;
			snapshotBlobContents?: Record<string, string>;
		};
		assert(parsedPendingState.snapshotBlobContents !== undefined);
		const binaryBlobId = Object.entries(parsedPendingState.snapshotBlobContents).find(
			([, content]) => content === bufferToString(expected, "base64"),
		)?.[0];
		assert(binaryBlobId !== undefined, "Pending state should contain the blob");
		assert.strictEqual(
			parsedPendingState.snapshotBlobs[binaryBlobId],
			undefined,
			"Arbitrary binary must not be placed in the legacy UTF-8 map",
		);
		container.close();
		const loaded = await loadExistingContainer({
			...loaderProps,
			request: { url },
			pendingLocalState,
		});
		const loadedObject = await getTestFluidObject(loaded);
		assertBytes(await getBlob(loadedObject.root, "blob"), expected);
	});

	it("captures summary-backed blobs for an offline frozen load", async () => {
		const { codeDetails, codeLoader, documentServiceFactory, loaderProps, urlResolver } =
			initialize();
		const container = await createDetachedContainer({ codeDetails, ...loaderProps });
		const fluidObject = await getTestFluidObject(container);
		const expected = new Uint8Array([0x80, 0xff, 0x00, 0x7f]);
		fluidObject.root.set("blob", await fluidObject.runtime.uploadBlob(expected.buffer));
		await container.attach(urlResolver.createCreateNewRequest("captured-state"));
		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined);

		const pendingLocalState = await captureFullContainerState({
			documentServiceFactory,
			request: { url },
			urlResolver,
		});
		const capturedState = JSON.parse(pendingLocalState) as {
			snapshotBlobs: Record<string, string>;
			snapshotBlobContents?: Record<string, string>;
			attachmentBlobContents?: Record<string, string>;
		};
		assert(capturedState.snapshotBlobContents !== undefined);
		assert.strictEqual(capturedState.attachmentBlobContents, undefined);
		const binaryBlobId = Object.entries(capturedState.snapshotBlobContents).find(
			([, content]) => content === bufferToString(expected, "base64"),
		)?.[0];
		assert(binaryBlobId !== undefined, "Captured state should contain the blob");
		assert.strictEqual(
			capturedState.snapshotBlobs[binaryBlobId],
			undefined,
			"Arbitrary binary must not be placed in the legacy UTF-8 map",
		);
		const frozen = await loadFrozenContainerFromPendingState({
			codeLoader,
			pendingLocalState,
		});
		const frozenObject = await getTestFluidObject(frozen);
		assertBytes(await getBlob(frozenObject.root, "blob"), expected);
	});

	it("preserves binary blobs through clean ordinary and future full-tree summaries", async () => {
		const { codeDetails, loaderProps, urlResolver } = initialize();
		const loader = new Loader(loaderProps);
		const creator = await createDetachedContainer({ codeDetails, ...loaderProps });
		const creatorObject = await getTestFluidObject(creator);
		const expected = new Uint8Array([0xff, 0x80, 0x00, 0x01, 0x7f]);
		creatorObject.root.set("blob", await creatorObject.runtime.uploadBlob(expected.buffer));
		await creator.attach(urlResolver.createCreateNewRequest("summary-chain"));
		const url = await creator.getAbsoluteUrl("");
		assert(url !== undefined);

		const { container: summarizerContainer, summarizer } = await createSummarizerCore(
			creator,
			loader,
		);
		const ordinarySummary = await summarizeNow(
			summarizer,
			"embedded detached blob ordinary summary",
		);
		assertEmbeddedBlobHandles(ordinarySummary.summaryTree, 1);

		const ordinaryReload = await loader.resolve({
			url,
			headers: { [LoaderHeader.version]: ordinarySummary.summaryVersion },
		});
		const ordinaryReloadObject = await getTestFluidObject(ordinaryReload);
		assertBytes(await getBlob(ordinaryReloadObject.root, "blob"), expected);

		const { container: futureSummarizerContainer, summarizer: futureSummarizer } =
			await createSummarizerCore(ordinaryReload, loader, ordinarySummary.summaryVersion);
		const fullTreeSummary = await summarizeNow(futureSummarizer, {
			reason: "embedded detached blob future full-tree summary",
			fullTree: true,
		});
		assertEmbeddedBlobSummary(fullTreeSummary.summaryTree, [expected]);

		const fullTreeReload = await loader.resolve({
			url,
			headers: { [LoaderHeader.version]: fullTreeSummary.summaryVersion },
		});
		const fullTreeReloadObject = await getTestFluidObject(fullTreeReload);
		assertBytes(await getBlob(fullTreeReloadObject.root, "blob"), expected);

		fullTreeReload.close();
		futureSummarizerContainer.close();
		ordinaryReload.close();
		summarizerContainer.close();
		creator.close();
	});
});
