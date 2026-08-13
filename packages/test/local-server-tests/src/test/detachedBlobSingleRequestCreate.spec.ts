/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/internal";
import type {
	IContainer,
	ICodeDetailsLoader,
	IFluidCodeDetails,
} from "@fluidframework/container-definitions/internal";
import {
	captureFullContainerState,
	createDetachedContainer,
	loadExistingContainer,
	loadFrozenContainerFromPendingState,
	rehydrateDetachedContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import {
	blobsTreeName,
	detachedBlobSummaryGroupId,
	detachedBlobSummaryTreeName,
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
	createTestConfigProvider,
	getRequiredPendingLocalState,
	type ITestFluidObject,
} from "@fluidframework/test-utils/internal";

import { createLoader } from "./utils.js";

const inlineDetachedBlobsConfig = "Fluid.Container.InlineDetachedBlobsAsSummaryBlobs";

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
		},
		// ContainerRuntimeFactoryWithDefaultDataStore forwards extra BaseContainerRuntimeFactory
		// properties through its constructor.
		minVersionForCollab: "2.115.0" as const,
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

function assertInlinedSummary(
	summary: ISummaryTree | undefined,
	expectedBlobCount: number,
): void {
	assert(summary?.type === SummaryType.Tree);
	const appSummary: SummaryObject | undefined = summary.tree[".app"];
	assert(appSummary?.type === SummaryType.Tree);
	const blobsSummary: SummaryObject | undefined = appSummary.tree[blobsTreeName];
	assert(blobsSummary?.type === SummaryType.Tree);
	const detachedBlobSummary = blobsSummary.tree[detachedBlobSummaryTreeName];
	assert(detachedBlobSummary?.type === SummaryType.Tree);
	assert.strictEqual(detachedBlobSummary.groupId, detachedBlobSummaryGroupId);
	assert.strictEqual(Object.keys(detachedBlobSummary.tree).length, expectedBlobCount);
}

function initialize(options?: {
	countStorageCalls?: boolean;
	inline?: boolean;
	offline?: boolean;
}): {
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
	const runtimeFactory = createRuntimeFactory(defaultDataStoreFactory);
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
	const configProvider = createTestConfigProvider({
		[inlineDetachedBlobsConfig]: options?.inline ?? true,
		...(options?.offline === true ? { "Fluid.Container.enableOfflineFull": true } : {}),
	});
	const loaderProps = {
		...base.loaderProps,
		documentServiceFactory,
		configProvider,
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
		assertInlinedSummary(counts.createSummary, 2);

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
		};
		assert.strictEqual(serialized.attachmentBlobContents, undefined);
		assert.strictEqual(serialized.attachmentBlobs, undefined);
		assert.strictEqual(serialized.hasAttachmentBlobs, false);
		container.close();

		const rehydrated = await rehydrateDetachedContainer({
			...loaderProps,
			serializedState,
		});
		const rehydratedObject = await getTestFluidObject(rehydrated);
		assertBytes(await getBlob(rehydratedObject.root, "blob"), expected);
		await rehydrated.attach(urlResolver.createCreateNewRequest("rehydrated-single-request"));

		assert.strictEqual(counts.createContainer, 1);
		assert.strictEqual(counts.createBlob, 0);
		assert.strictEqual(counts.uploadSummaryWithContext, 0);
		assertInlinedSummary(counts.createSummary, 1);
	});

	it("uses legacy attachment upload when the feature is disabled", async () => {
		const { codeDetails, counts, loaderProps, urlResolver } = initialize({
			countStorageCalls: true,
			inline: false,
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

	it("preserves detached summary blobs in pending state for an offline frozen load", async () => {
		const { codeDetails, codeLoader, loaderProps, urlResolver } = initialize({
			offline: true,
		});
		const container = await createDetachedContainer({ codeDetails, ...loaderProps });
		const fluidObject = await getTestFluidObject(container);
		const expected = new Uint8Array([0xff, 0x01, 0x00, 0xfe]);
		fluidObject.root.set("blob", await fluidObject.runtime.uploadBlob(expected.buffer));
		await container.attach(urlResolver.createCreateNewRequest("pending-state"));

		const pendingLocalState = await getRequiredPendingLocalState(container);
		const frozen = await loadFrozenContainerFromPendingState({
			codeLoader,
			pendingLocalState,
		});
		const frozenObject = await getTestFluidObject(frozen);
		assertBytes(await getBlob(frozenObject.root, "blob"), expected);
	});

	it("fetches omitted detached summary blobs when pending state is captured after a fresh load", async () => {
		const { codeDetails, codeLoader, loaderProps, urlResolver } = initialize({
			offline: true,
		});
		const container = await createDetachedContainer({ codeDetails, ...loaderProps });
		const fluidObject = await getTestFluidObject(container);
		const expected = new Uint8Array([0x80, 0xff, 0x00, 0x01]);
		fluidObject.root.set("blob", await fluidObject.runtime.uploadBlob(expected.buffer));
		await container.attach(urlResolver.createCreateNewRequest("fresh-pending-state"));
		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined);

		const fresh = await loadExistingContainer({
			...loaderProps,
			request: { url },
		});
		const pendingLocalState = await getRequiredPendingLocalState(fresh);
		const frozen = await loadFrozenContainerFromPendingState({
			codeLoader,
			pendingLocalState,
		});
		const frozenObject = await getTestFluidObject(frozen);
		assertBytes(await getBlob(frozenObject.root, "blob"), expected);
	});

	it("captures the detached blob summary group for an offline frozen load", async () => {
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
		const frozen = await loadFrozenContainerFromPendingState({
			codeLoader,
			pendingLocalState,
		});
		const frozenObject = await getTestFluidObject(frozen);
		assertBytes(await getBlob(frozenObject.root, "blob"), expected);
	});
});
