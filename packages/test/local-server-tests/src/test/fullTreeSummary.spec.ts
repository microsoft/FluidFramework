/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	stringToBuffer,
	Uint8ArrayToString,
} from "@fluid-internal/client-utils";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/internal";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import {
	ContainerRuntime,
	blobsTreeName,
	type IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type {
	ISummaryTree,
	SummaryObject,
} from "@fluidframework/driver-definitions";
import { SummaryType } from "@fluidframework/driver-definitions";
import { SharedMap } from "@fluidframework/map/internal";
import {
	channelsTreeName,
	gcTreeKey,
} from "@fluidframework/runtime-definitions/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
	createSummarizerCore,
	createTestConfigProvider,
	getContainerEntryPointBackCompat,
	type ITestFluidObject,
	LoaderContainerTracker,
	summarizeNow,
	TestFluidObjectFactory,
} from "@fluidframework/test-utils/internal";

import { createLoader } from "./utils.js";

const snapshotBasedFullTreeSummaryKey =
	"Fluid.ContainerRuntime.SnapshotBasedFullTreeSummary";

const runtimeOptions: IContainerRuntimeOptions = {
	summaryOptions: {
		summaryConfigOverrides: {
			state: "summaryOnRequest",
			initialSummarizerDelayMs: 0,
			maxAckWaitTime: 20_000,
			maxOpsSinceLastSummary: 7_000,
		},
	},
};

describe("Snapshot-based full tree summary", () => {
	let deltaConnectionServer: ReturnType<typeof LocalDeltaConnectionServer.create>;
	let tracker: LoaderContainerTracker;

	beforeEach(() => {
		deltaConnectionServer = LocalDeltaConnectionServer.create();
		tracker = new LoaderContainerTracker(true);
	});

	afterEach(async () => {
		tracker.reset();
		await deltaConnectionServer.webSocketServer.close();
	});

	it("materializes an incremental summary and loads it as a complete snapshot", async () => {
		const dataStoreFactory = new TestFluidObjectFactory(
			[["map", SharedMap.getFactory()]],
			"default",
		);
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: dataStoreFactory,
			registryEntries: [[dataStoreFactory.type, Promise.resolve(dataStoreFactory)]],
			runtimeOptions,
		});
		const { loaderProps, codeDetails, urlResolver } = createLoader({
			deltaConnectionServer,
			defaultDataStoreFactory: dataStoreFactory,
			runtimeFactory,
		});
		const loader = new Loader({
			...loaderProps,
			configProvider: createTestConfigProvider({
				[snapshotBasedFullTreeSummaryKey]: true,
			}),
		});
		tracker.add(loader);

		const container = await loader.createDetachedContainer(codeDetails);
		const root = await getContainerEntryPointBackCompat<ITestFluidObject>(container);

		const secondaryDataStore =
			await root.context.containerRuntime.createDataStore(dataStoreFactory.type);
		const secondary = (await secondaryDataStore.entryPoint.get()) as ITestFluidObject;
		secondary.root.set("stable", "unchanged");
		root.root.set("secondary", secondary.handle);

		const blobPayload = "materialized attachment content";
		const blobHandle = await root.runtime.uploadBlob(
			stringToBuffer(blobPayload, "utf8"),
		);
		root.root.set("blob", blobHandle);
		root.root.set("beforeParent", "parent value");

		await container.attach(urlResolver.createCreateNewRequest("full-tree-summary"));
		await tracker.ensureSynchronized();

		const { container: summarizerContainer, summarizer } = await createSummarizerCore(
			container,
			loader,
		);
		tracker.addContainer(summarizerContainer);
		await tracker.ensureSynchronized();

		const parentSummary = await summarizeNow(summarizer, {
			reason: "create incremental parent",
		});
		assert(
			containsHandle(parentSummary.summaryTree),
			"Expected the acknowledged parent summary to reuse content from the attach snapshot",
		);

		root.root.set("afterParent", "changed value");
		await tracker.ensureSynchronized();

		const legacyFullSummary = await (
			root.context.containerRuntime as ContainerRuntime
		).summarize({
			fullTree: true,
			trackState: false,
		});
		assertNoHandles(legacyFullSummary.summary);

		const materializedSummary = await summarizeNow(summarizer, {
			reason: "materialize full tree",
			fullTree: true,
		});
		assertNoHandles(materializedSummary.summaryTree);

		for (const key of [channelsTreeName, blobsTreeName, gcTreeKey]) {
			const expected = legacyFullSummary.summary.tree[key];
			const actual = materializedSummary.summaryTree.tree[key];
			assert(expected !== undefined, `Legacy full summary is missing ${key}`);
			assert(actual !== undefined, `Materialized full summary is missing ${key}`);
			assert.deepEqual(
				normalizeSummaryObject(actual),
				normalizeSummaryObject(expected),
				`${key} should match the legacy full-generation result`,
			);
		}

		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "Expected an absolute container URL");
		const loadedContainer = await loader.resolve({
			url,
			headers: {
				[LoaderHeader.cache]: false,
				[LoaderHeader.version]: materializedSummary.summaryVersion,
			},
		});
		const loadedRoot =
			await getContainerEntryPointBackCompat<ITestFluidObject>(loadedContainer);
		assert.equal(loadedRoot.root.get("beforeParent"), "parent value");
		assert.equal(loadedRoot.root.get("afterParent"), "changed value");

		const loadedSecondaryHandle =
			loadedRoot.root.get<IFluidHandle<ITestFluidObject>>("secondary");
		assert(loadedSecondaryHandle !== undefined, "Expected the secondary data store handle");
		const loadedSecondary = await loadedSecondaryHandle.get();
		assert.equal(loadedSecondary.root.get("stable"), "unchanged");

		const loadedBlobHandle =
			loadedRoot.root.get<IFluidHandle<ArrayBufferLike>>("blob");
		assert(loadedBlobHandle !== undefined, "Expected the attachment blob handle");
		assert.equal(
			Uint8ArrayToString(new Uint8Array(await loadedBlobHandle.get()), "utf8"),
			blobPayload,
		);
	}).timeout(60_000);
});

type NormalizedSummaryObject =
	| {
			type: "tree";
			tree: Record<string, NormalizedSummaryObject>;
			unreferenced: true | undefined;
			groupId: string | undefined;
	  }
	| {
			type: "blob";
			content: string;
	  }
	| {
			type: "attachment";
			id: string;
	  };

function normalizeSummaryObject(object: SummaryObject): NormalizedSummaryObject {
	switch (object.type) {
		case SummaryType.Tree:
			return {
				type: "tree",
				tree: Object.fromEntries(
					Object.entries(object.tree).map(([key, value]) => [
						key,
						normalizeSummaryObject(value),
					]),
				),
				unreferenced: object.unreferenced,
				groupId: object.groupId,
			};
		case SummaryType.Blob: {
			const content =
				typeof object.content === "string"
					? new Uint8Array(stringToBuffer(object.content, "utf8"))
					: object.content;
			return {
				type: "blob",
				content: Uint8ArrayToString(content, "base64"),
			};
		}
		case SummaryType.Attachment:
			return {
				type: "attachment",
				id: object.id,
			};
		case SummaryType.Handle:
			assert.fail(`Unexpected summary handle: ${object.handle}`);
	}
}

function assertNoHandles(tree: ISummaryTree): void {
	for (const object of Object.values(tree.tree)) {
		assert.notEqual(object.type, SummaryType.Handle, "Full summary must not contain handles");
		if (object.type === SummaryType.Tree) {
			assertNoHandles(object);
		}
	}
}

function containsHandle(tree: ISummaryTree): boolean {
	return Object.values(tree.tree).some(
		(object) =>
			object.type === SummaryType.Handle ||
			(object.type === SummaryType.Tree && containsHandle(object)),
	);
}
