/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { ISummarizer } from "@fluidframework/container-runtime/internal";
import {
	DataObjectFactoryType,
	getContainerEntryPointBackCompat,
	type ITestContainerConfig,
	type ITestFluidObject,
	type ITestObjectProvider,
	createSummarizer,
	summarizeNow,
} from "@fluidframework/test-utils/internal";
import type { ITree, TreeView } from "@fluidframework/tree";
import {
	configuredSharedTree,
	FluidClientVersion,
	incrementalEncodingPolicyForAllowedTypes,
	incrementalSummaryHint,
	SchemaFactoryAlpha,
	TreeCompressionStrategy,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
} from "@fluidframework/tree/internal";

// ---------------------------------------------------------------------------
// Schema: 3-depth nested structure with incrementalSummaryHint at depths 1 & 2
// ---------------------------------------------------------------------------
const sf = new SchemaFactoryAlpha("incrementalSummaryE2E");

class Tag extends sf.object("Tag", {
	name: sf.string,
}) {}

class Item extends sf.object("Item", {
	itemName: sf.string,
	tags: sf.types([{ type: sf.map(Tag), metadata: {} }], {
		custom: { [incrementalSummaryHint]: true },
	}),
}) {}

class Workspace extends sf.object("Workspace", {
	label: sf.string,
	items: sf.types([{ type: sf.map(Item), metadata: {} }], {
		custom: { [incrementalSummaryHint]: true },
	}),
}) {}

const viewConfig = new TreeViewConfigurationAlpha({ schema: Workspace });

// ---------------------------------------------------------------------------
// Factory configured for incremental summarization
// ---------------------------------------------------------------------------
const ConfiguredSharedTree = configuredSharedTree({
	treeEncodeType: TreeCompressionStrategy.CompressedIncremental,
	minVersionForCollab: FluidClientVersion.v2_74,
	shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(viewConfig),
});

const treeId = "sharedTree";

describeCompat(
	"SharedTree incremental summary handle paths",
	"NoCompat",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;

		const testContainerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			runtimeOptions: {
				enableRuntimeIdCompressor: "on",
			},
			registry: [[treeId, ConfiguredSharedTree.getFactory()]],
		};

		async function createContainerAndTree(): Promise<{
			container: IContainer;
			view: TreeView<typeof Workspace>;
		}> {
			const container = await provider.makeTestContainer(testContainerConfig);
			const dataObject =
				await getContainerEntryPointBackCompat<ITestFluidObject>(container);
			const tree = await dataObject.getSharedObject<ITree>(treeId);
			const view = tree.viewWith(new TreeViewConfiguration({ schema: Workspace }));
			view.initialize(
				new Workspace({
					label: "v1",
					items: {
						item1: new Item({
							itemName: "Item 1",
							tags: {
								tag1: new Tag({ name: "tag1" }),
							},
						}),
					},
				}),
			);
			return { container, view };
		}

		async function createTestSummarizer(
			container: IContainer,
		): Promise<ISummarizer> {
			const { summarizer } = await createSummarizer(
				provider,
				container,
				testContainerConfig,
			);
			return summarizer;
		}

		beforeEach("getTestObjectProvider", async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
		});

		/**
		 * Regression test for the stale incremental summary handle path bug fixed
		 * in PR #26990.
		 *
		 * The bug: when a parent incremental chunk was re-encoded with a new
		 * referenceId, child chunks that became handles still held a summaryPath
		 * string referencing the old referenceId. On the next summary those handle
		 * URLs pointed to keys that no longer existed in the preceding summary tree,
		 * causing a storage error (e.g. `TypeError: Cannot read properties of
		 * undefined (reading 'trees')`).
		 *
		 * To reproduce we need:
		 * 1. A schema with incrementalSummaryHint at 2+ levels deep.
		 * 2. CompressedIncremental encoding + ForestSummaryFormatVersion.v3.
		 * 3. Multiple summaries where the parent chunk changes but the child does
		 *    not — the child's handle path must be recomputed against the new parent
		 *    referenceId each time.
		 */
		it("handles remain valid across multiple incremental summaries when parent chunks change", async () => {
			const { container, view } = await createContainerAndTree();
			const summarizer = await createTestSummarizer(container);

			// 1. Initial summary — everything is encoded as full trees, no handles.
			await provider.ensureSynchronized();
			await summarizeNow(summarizer);

			// 2. Mutate the "items" map (depth 1) — this re-encodes the outer chunk.
			//    The "tags" map (depth 2) is unchanged → becomes a handle pointing into
			//    the first summary.
			const item1 = view.root.items.get("item1");
			assert(item1 !== undefined, "item1 not found");
			item1.itemName = "Item 1 - updated";

			await provider.ensureSynchronized();
			await summarizeNow(summarizer);

			// 3. Mutate the "items" map again — the outer chunk gets a NEW referenceId.
			//    The child "tags" handle must point into the second summary (not the
			//    first). Before the fix, the stale summaryPath would cause a failure here.
			item1.itemName = "Item 1 - updated again";

			await provider.ensureSynchronized();
			// This is the critical summary — it would fail before the fix because the
			// child handle's path referenced the old parent referenceId.
			await assert.doesNotReject(
				summarizeNow(summarizer),
				"Third summary should succeed — handle paths must be recomputed correctly",
			);

			// 4. Verify the document can still be loaded from the latest summary.
			const container2 = await provider.loadTestContainer(testContainerConfig);
			const dataObject2 =
				await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
			const tree2 = await dataObject2.getSharedObject<ITree>(treeId);
			const view2 = tree2.viewWith(new TreeViewConfiguration({ schema: Workspace }));
			assert.strictEqual(
				view2.root.items.get("item1")?.itemName,
				"Item 1 - updated again",
				"Loaded document should reflect the latest mutation",
			);
		});

		it("handles remain valid when depth-0 changes cause copy propagation of tracking entries", async () => {
			const { container, view } = await createContainerAndTree();
			const summarizer = await createTestSummarizer(container);

			// 1. Initial summary.
			await provider.ensureSynchronized();
			await summarizeNow(summarizer);

			// 2. Change at depth 1 — re-encodes items chunk, tags becomes a handle.
			const item1 = view.root.items.get("item1");
			assert(item1 !== undefined, "item1 not found");
			item1.itemName = "changed-1";

			await provider.ensureSynchronized();
			await summarizeNow(summarizer);

			// 3. Change at depth 0 only (non-incremental root field) — ALL incremental
			//    chunks become handles. completeSummary copies their tracking entries
			//    forward, including parentReferenceId values.
			view.root.label = "v2";

			await provider.ensureSynchronized();
			await summarizeNow(summarizer);

			// 4. Change at depth 1 again — the parent chunk gets a new referenceId.
			//    Child handles whose tracking entries were copied forward in step 3 must
			//    resolve correctly against the latest summary.
			item1.itemName = "changed-2";

			await provider.ensureSynchronized();
			await assert.doesNotReject(
				summarizeNow(summarizer),
				"Summary after copy-propagated tracking entries should succeed",
			);
		});
	},
);
