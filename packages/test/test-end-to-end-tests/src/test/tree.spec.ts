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
import type { ISharedDirectory } from "@fluidframework/map/internal";
import type {
	IContainerRuntimeBase,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";
import {
	ITestObjectProvider,
	createContainerRuntimeFactoryWithDefaultDataStore,
	createSummarizerFromFactory,
	summarizeNow,
	type SummaryInfo,
} from "@fluidframework/test-utils/internal";
import { SchemaFactory, TreeViewConfiguration, type TreeView } from "@fluidframework/tree";
import { configuredSharedTreeBetaLegacy } from "@fluidframework/tree/legacy";

/**
 * Default data store; provides a root SharedDirectory where a handle to the
 * detached data store will be stored to trigger its attach.
 */
class DefaultDataObject extends DataObject {
	public static readonly Name = "DefaultDataObject";

	public get _root(): ISharedDirectory {
		return this.root;
	}

	public get containerRuntime(): IContainerRuntimeBase {
		return this.context.containerRuntime;
	}
}

const defaultFactory = new DataObjectFactory({
	type: DefaultDataObject.Name,
	ctor: DefaultDataObject,
});

const sf = new SchemaFactory("idCompressorDetachedDataStoreTest");
class Root extends sf.object("Root", {
	id: sf.identifier,
}) {}

const treeConfig = new TreeViewConfiguration({ schema: Root });

const SharedTree = configuredSharedTreeBetaLegacy({
	// This is the default value. Before the write-side fix for "Summarizer creates the data store from the attach op summary and can summarize"
	// was shipped, setting this to "true" also provided some verification that the read-side mitigation for the bug worked. The e2e test no longer
	// covers this case (unit tests do), but the test still helps prevent regressions for the scenario.
	healUnresolvableIdentifiersOnDecode: false,
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

	#treeView: TreeView<typeof Root> | undefined;

	public get treeView(): TreeView<typeof Root> {
		assert(this.#treeView !== undefined, "treeView has not been initialized");
		return this.#treeView;
	}

	protected override async initializingFirstTime(): Promise<void> {
		// Create the SharedTree while the data store is detached.
		const tree = SharedTree.create(this.runtime);
		this.root.set("tree", tree.handle);

		// Initialize while detached. Creating the Root node causes the
		// runtime's id compressor to allocate a local (negative) compressed
		// id for its `identifier` field because no finalize op has been
		// observed yet.
		const view = tree.viewWith(treeConfig);
		view.initialize({});
		this.#treeView = view;
	}
}

const treeOwningFactory = new DataObjectFactory({
	type: TreeOwningDataObject.Name,
	ctor: TreeOwningDataObject,
	sharedObjects: [SharedTree.getFactory()],
});

const registryEntries: NamedFluidDataStoreRegistryEntries = [
	[defaultFactory.type, Promise.resolve(defaultFactory)],
	[treeOwningFactory.type, Promise.resolve(treeOwningFactory)],
];

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
				registryEntries,
				runtimeOptions: {
					// SharedTree requires the runtime id compressor.
					enableRuntimeIdCompressor: "on",
					// Disbale summaries for regular clients so they don't interfere with on demand summaries.
					summaryOptions: {
						summaryConfigOverrides: {
							state: "disabled",
						},
					},
				},
			},
		);
		// This test reproduces a bug with SharedTree's encoding/decoding. Non-finalized op-space IDs can legitimately appear
		// in attach summaries. At the time of writing, SharedTree encoded the short ID but failed to include originator data
		// in the same summary (so that remote clients can decompress with respect to the actual client that generated the ID).
		// The attempt to summarize therefore failed on attempting to decode the non-finalized ID.
		// SharedTree has since been fixed to avoid writing non-finalized IDs in attach summaries.
		it("Summarizer loads data store from the attach op summary and can summarize", async () => {
			// 1. Create a container with an attached default data store.
			const container1 = await provider.createContainer(runtimeFactory);
			const defaultDataObject = (await container1.getEntryPoint()) as DefaultDataObject;

			// 2. Create the data store *detached*. The factory uses
			//    `createDetachedDataStore` + `attachRuntime` internally, and
			//    the data object's `initializingFirstTime` (which creates and
			//    initializes the SharedTree) runs while the data store is
			//    still detached.
			const treeDataStore = await treeOwningFactory.createInstance(
				defaultDataObject.containerRuntime,
			);

			// 3. Attach the data store by referencing its handle from
			//    the (attached) default data store. This produces an attach op
			//    that carries the data store's initial summary (including the
			//    SharedTree summary, which encodes the local ids).
			defaultDataObject._root.set("treeDataStore", treeDataStore.IFluidHandle);

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
				registryEntries,
			);
			await provider.ensureSynchronized();
			let summaryInfo: SummaryInfo | undefined;
			await assert.doesNotReject(async () => {
				summaryInfo = await summarizeNow(summarizer, "afterDetachedAttach");
			});
			assert(summaryInfo !== undefined);
		});
	},
);
