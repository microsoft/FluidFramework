/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, type CompatApis } from "@fluid-private/test-version-utils";
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
	FluidClientVersion,
	ForestTypeOptimized,
	incrementalEncodingPolicyForAllowedTypes,
	incrementalSummaryHint,
	SchemaFactoryAlpha,
	TreeCompressionStrategy,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
} from "@fluidframework/tree/internal";

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

const treeId = "sharedTree";

function buildTestContainerConfig(apis: CompatApis): ITestContainerConfig {
	const { configuredSharedTree } = apis.dataRuntime.packages.tree;
	const ConfiguredSharedTree = configuredSharedTree({
		forest: ForestTypeOptimized,
		treeEncodeType: TreeCompressionStrategy.CompressedIncremental,
		minVersionForCollab: FluidClientVersion.v2_74,
		shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(viewConfig),
	});
	return {
		fluidDataObjectType: DataObjectFactoryType.Test,
		runtimeOptions: {
			enableRuntimeIdCompressor: "on",
		},
		registry: [[treeId, ConfiguredSharedTree.getFactory()]],
	};
}

describeCompat(
	"SharedTree incremental summary handle paths",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		let provider: ITestObjectProvider;
		const testContainerConfig = buildTestContainerConfig(apis);

		async function createContainerAndTree(): Promise<{
			container: IContainer;
			view: TreeView<typeof Workspace>;
		}> {
			const container = await provider.makeTestContainer(testContainerConfig);
			const dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
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

		async function createTestSummarizer(container: IContainer): Promise<ISummarizer> {
			const { summarizer } = await createSummarizer(provider, container, testContainerConfig);
			return summarizer;
		}

		beforeEach("getTestObjectProvider", async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
		});

		it("handles remain valid across multiple incremental summaries when parent chunks change", async () => {
			const { container, view } = await createContainerAndTree();
			const summarizer = await createTestSummarizer(container);
			let container2: IContainer | undefined;
			try {
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Mutate the "items" map (depth 1) — re-encodes the outer chunk.
				// The "tags" map (depth 2) is unchanged and becomes a handle.
				const item1 = view.root.items.get("item1");
				assert(item1 !== undefined, "item1 not found");
				item1.itemName = "Item 1 - updated";

				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Mutate again — the outer chunk gets a new referenceId. The child "tags"
				// handle must now point into the second summary. Before the fix the stale
				// summaryPath caused "Cannot read properties of undefined (reading 'trees')".
				item1.itemName = "Item 1 - updated again";

				await provider.ensureSynchronized();
				await assert.doesNotReject(
					summarizeNow(summarizer),
					"Third summary should succeed — handle paths must be recomputed correctly",
				);

				container2 = await provider.loadTestContainer(testContainerConfig);
				const dataObject2 =
					await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
				const tree2 = await dataObject2.getSharedObject<ITree>(treeId);
				const view2 = tree2.viewWith(new TreeViewConfiguration({ schema: Workspace }));
				assert.strictEqual(
					view2.root.items.get("item1")?.itemName,
					"Item 1 - updated again",
					"Loaded document should reflect the latest mutation",
				);
			} finally {
				container2?.close();
				summarizer.close();
				container.close();
			}
		});

		it("handles remain valid when depth-0 changes cause copy propagation of tracking entries", async () => {
			const { container, view } = await createContainerAndTree();
			const summarizer = await createTestSummarizer(container);
			try {
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Change at depth 1 — re-encodes items chunk, tags becomes a handle.
				const item1 = view.root.items.get("item1");
				assert(item1 !== undefined, "item1 not found");
				item1.itemName = "changed-1";

				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Change at depth 0 only — all incremental chunks become handles and
				// completeSummary copies their tracking entries forward.
				view.root.label = "v2";

				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Change at depth 1 again — the parent chunk gets a new referenceId.
				// Child handles copied forward in the previous summary must still resolve.
				item1.itemName = "changed-2";

				await provider.ensureSynchronized();
				await assert.doesNotReject(
					summarizeNow(summarizer),
					"Summary after copy-propagated tracking entries should succeed",
				);
			} finally {
				summarizer.close();
				container.close();
			}
		});
	},
);
