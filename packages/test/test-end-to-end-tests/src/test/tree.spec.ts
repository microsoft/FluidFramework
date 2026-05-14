/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import type { IContainerRuntimeBase } from "@fluidframework/runtime-definitions/internal";
import type { ISharedObject } from "@fluidframework/shared-object-base/internal";
import {
	ITestObjectProvider,
	createContainerRuntimeFactoryWithDefaultDataStore,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils/internal";
import {
	ITree,
	SchemaFactory,
	TreeViewConfiguration,
	type TreeView,
} from "@fluidframework/tree";
import { configuredSharedTreeBetaLegacy } from "@fluidframework/tree/legacy";

const sf = new SchemaFactory("idCompressorDetachedDataStoreTest");
class Root extends sf.object("Root", {
	id: sf.identifier,
}) {}

const treeConfig = new TreeViewConfiguration({ schema: Root });

/**
 * Default data store; provides a root SharedDirectory where a handle to the
 * detached data store will be stored to trigger its attach.
 */
class DefaultDataObject extends DataObject {
	public static readonly Name = "DefaultDataObject";

	public get containerRuntime(): IContainerRuntimeBase {
		return this.context.containerRuntime;
	}

	public storeHandle(key: string, handle: IFluidHandle): void {
		this.root.set(key, handle);
	}

	public getStoredHandle<T>(key: string): IFluidHandle<T> | undefined {
		return this.root.get<IFluidHandle<T>>(key);
	}
}

const defaultFactory = new DataObjectFactory({
	type: DefaultDataObject.Name,
	ctor: DefaultDataObject,
});

/**
 * Data store that owns a SharedTree. Its first-time initialization runs
 * inside the detached creation flow (`createInstanceWithDataStore` then
 * `instantiateDataStore` then `initializingFirstTime`), so the tree mutations
 * happen while the data store is genuinely detached. The id compressor
 * therefore allocates only local (negative / not-yet-finalized) ids.
 */
class TreeOwningDataObject extends DataObject {
	public static readonly Name = "TreeOwningDataObject";
	private static readonly treeChannelId = "tree";

	#treeView: TreeView<typeof Root> | undefined;

	public get treeView(): TreeView<typeof Root> {
		assert(this.#treeView !== undefined, "treeView has not been initialized");
		return this.#treeView;
	}

	public get dataStoreRuntime(): IFluidDataStoreRuntime {
		return this.runtime;
	}

	protected override async initializingFirstTime(): Promise<void> {
		// Create the SharedTree channel while the data store is detached.
		const channel = this.runtime.createChannel(
			TreeOwningDataObject.treeChannelId,
			SharedTree.getFactory().type,
		);
		(channel as unknown as ISharedObject).bindToContext();
		const tree = channel as unknown as ITree;

		// Initialize while detached. Creating the Root node causes the
		// runtime's id compressor to allocate a local (negative) compressed
		// id for its `identifier` field because no finalize op has been
		// observed yet.
		const view = tree.viewWith(treeConfig);
		view.initialize({});
		this.#treeView = view;
	}
}

const SharedTree = configuredSharedTreeBetaLegacy({
	// This is the default value. Before the write-side fix for "Summarizer creates the data store from the attach op summary and can summarize"
	// was shipped, setting this to "true" also provided some verification that the read-side mitigation for the bug worked. The e2e test no longer
	// covers this case (unit tests do), but the test still helps prevent regressions for the scenario.
	healUnresolvableIdentifiersOnDecode: false,
});

const treeOwningFactory = new DataObjectFactory({
	type: TreeOwningDataObject.Name,
	ctor: TreeOwningDataObject,
	sharedObjects: [SharedTree.getFactory()],
});

describeCompat(
	"SharedTree in a data store created detached and attached via op",
	"NoCompat",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;

		beforeEach("getTestObjectProvider", () => {
			provider = getTestObjectProvider();
		});

		const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
			ContainerRuntimeFactoryWithDefaultDataStore,
			{
				defaultFactory,
				registryEntries: [
					[defaultFactory.type, Promise.resolve(defaultFactory)],
					[treeOwningFactory.type, Promise.resolve(treeOwningFactory)],
				],
				runtimeOptions: {
					// SharedTree requires the runtime id compressor.
					enableRuntimeIdCompressor: "on",
				},
			},
		);
		// This test reproduces a bug with SharedTree's encoding/decoding. Non-finalized op-space IDs can legitimately appear
		// in attach summaries. At the time of writing, SharedTree encoded the short ID but failed to include originator data
		// in the same summary (so that remote clients can decompress with respect to the actual client that generated the ID).
		// The attempt to summarize therefore failed on attempting to decode the non-finalized ID.
		// SharedTree has since been fixed to avoid writing non-finalized IDs in attach summaries.
		it("Summarizer creates the data store from the attach op summary and can summarize", async () => {
			// 1. Create a container with an attached default data store.
			const container1 = await provider.createContainer(runtimeFactory);
			const defaultDataObject = (await container1.getEntryPoint()) as DefaultDataObject;
			const containerRuntime = defaultDataObject.containerRuntime;

			// 2. Create the data store *detached*. The factory uses
			//    `createDetachedDataStore` + `attachRuntime` internally, and
			//    the data object's `initializingFirstTime` (which creates and
			//    initializes the SharedTree) runs while the data store is
			//    still detached.
			const treeDataStore = await treeOwningFactory.createInstance(containerRuntime);

			// 3. Attach the data store by referencing its handle from
			//    the (attached) default data store. This produces an attach op
			//    that carries the data store's initial summary (including the
			//    SharedTree summary, which encodes the local ids).
			defaultDataObject.storeHandle("treeDataStore", treeDataStore.IFluidHandle);

			await provider.ensureSynchronized();

			// 4. Create a summarizer (which loads the data store from the
			//    attach op's summary) and run an on-demand summary.
			// Originallly, would fail with `Unknown op space ID` in ID compressor.
			const { summarizer } = await createSummarizerFromFactory(
				provider,
				container1,
				defaultFactory,
				undefined /* summaryVersion */,
				ContainerRuntimeFactoryWithDefaultDataStore,
				[
					[defaultFactory.type, Promise.resolve(defaultFactory)],
					[treeOwningFactory.type, Promise.resolve(treeOwningFactory)],
				],
			);
			await provider.ensureSynchronized();
			await summarizeNow(summarizer, "afterDetachedAttach");
		});
	},
);
