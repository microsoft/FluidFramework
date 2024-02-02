/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { createIdCompressor } from "@fluidframework/id-compressor";
import { IEvent } from "@fluidframework/core-interfaces";
import { IsoBuffer, TypedEventEmitter } from "@fluid-internal/client-utils";
import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import { ISummaryTree, SummaryObject, SummaryType } from "@fluidframework/protocol-definitions";
import {
	ITelemetryContext,
	ISummaryTreeWithStats,
	IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockSharedObjectServices,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { createSingleBlobSummary } from "@fluidframework/shared-object-base";
import {
	EditManager,
	SharedTreeCore,
	Summarizable,
	SummaryElementParser,
	SummaryElementStringifier,
} from "../../shared-tree-core/index.js";
import {
	AllowedUpdateType,
	ChangeFamily,
	ChangeFamilyEditor,
	rootFieldKey,
} from "../../core/index.js";
import {
	DefaultEditBuilder,
	FieldKinds,
	FlexFieldSchema,
	SchemaBuilderBase,
	cursorForJsonableTreeNode,
	typeNameSymbol,
} from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import { SharedTreeTestFactory, schematizeFlexTree } from "../utils.js";
import { InitializeAndSchematizeConfiguration } from "../../shared-tree/index.js";
import { leaf } from "../../domains/index.js";
import { TestSharedTreeCore } from "./utils.js";

describe("SharedTreeCore", () => {
	it("summarizes without indexes", async () => {
		const tree = createTree([]);
		const { summary, stats } = await tree.summarize();
		assert(summary);
		assert(stats);
		assert.equal(stats.treeNodeCount, 3);
		assert.equal(stats.blobNodeCount, 1); // EditManager is always summarized
		assert.equal(stats.handleNodeCount, 0);
	});

	describe("summarizables", () => {
		it("are loaded", async () => {
			const summarizable = new MockSummarizable();
			let loaded = false;
			summarizable.on("loaded", () => (loaded = true));
			const summarizables = [summarizable] as const;
			const tree = createTree(summarizables);
			const defaultSummary = await createTree([]).summarize();
			await tree.load(MockSharedObjectServices.createFromSummary(defaultSummary.summary));
			assert(loaded, "Expected summarizable to load");
		});

		it("load blobs", async () => {
			const summarizable = new MockSummarizable();
			let loadedBlob = false;
			summarizable.on("loaded", (blobContents) => {
				if (blobContents === MockSummarizable.blobContents) {
					loadedBlob = true;
				}
			});
			const summarizables = [summarizable] as const;
			const tree = createTree(summarizables);
			const { summary } = await tree.summarize();
			await tree.load(MockSharedObjectServices.createFromSummary(summary));
			assert.equal(loadedBlob, true);
		});

		it("summarize synchronously", () => {
			const summarizableA = new MockSummarizable("summarizable A");
			let summarizedA = false;
			summarizableA.on("summarizeAttached", () => (summarizedA = true));
			const summarizableB = new MockSummarizable("summarizable B");
			let summarizedB = false;
			summarizableB.on("summarizeAttached", () => (summarizedB = true));
			const summarizables = [summarizableA, summarizableB] as const;
			const tree = createTree(summarizables);
			const { summary, stats } = tree.getAttachSummary();
			assert(summarizedA, "Expected summarizable A to summarize");
			assert(summarizedB, "Expected summarizable B to summarize");
			const summarizableTree = summary.tree.indexes;
			assert(
				isSummaryTree(summarizableTree),
				"Expected summarizable subtree to be present in summary",
			);
			assert.equal(
				Object.entries(summarizableTree.tree).length - 1, // EditManager is always summarized
				summarizables.length,
				"Expected both summaries to be present in the summarizable",
			);

			assert.equal(
				stats.treeNodeCount,
				5,
				"Expected summary stats to correctly count tree nodes",
			);
		});

		// TODO: Enable once SharedTreeCore properly implements async summaries
		it.skip("summarize asynchronously", async () => {
			const summarizableA = new MockSummarizable("summarizable A");
			let summarizedA = false;
			summarizableA.on("summarizeAsync", () => (summarizedA = true));
			const summarizableB = new MockSummarizable("summarizable B");
			let summarizedB = false;
			summarizableB.on("summarizeAsync", () => (summarizedB = true));
			const summarizables = [summarizableA, summarizableB];
			const tree = createTree(summarizables);
			const { summary, stats } = await tree.summarize();
			assert(summarizedA, "Expected summarizable A to summarize");
			assert(summarizedB, "Expected summarizable B to summarize");
			const summarizableTree = summary.tree.indexes;
			assert(
				isSummaryTree(summarizableTree),
				"Expected summarizable subtree to be present in summary",
			);
			assert.equal(
				Object.entries(summarizableTree.tree).length,
				summarizables.length,
				"Expected both summaries to be present in the summary",
			);

			assert.equal(
				stats.treeNodeCount,
				summarizables.length + 1,
				"Expected summary stats to correctly count tree nodes",
			);
		});

		it("are asked for GC", () => {
			const summarizable = new MockSummarizable("summarizable");
			let requestedGC = false;
			summarizable.on("gcRequested", () => (requestedGC = true));
			const summarizables = [summarizable] as const;
			const tree = createTree(summarizables);
			tree.getGCData();
			assert(requestedGC, "Expected SharedTree to ask summarizable for GC");
		});
	});

	it("evicts trunk commits behind the minimum sequence number", () => {
		const runtime = new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() });
		const tree = new TestSharedTreeCore(runtime);
		const factory = new MockContainerRuntimeFactory();
		factory.createContainerRuntime(runtime);
		tree.connect({
			deltaConnection: runtime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		// discard revertibles so that the trunk can be trimmed based on the minimum sequence number
		tree.getLocalBranch().on("newRevertible", (revertible) => {
			revertible.discard();
		});

		changeTree(tree);
		factory.processAllMessages(); // Minimum sequence number === 0
		assert.equal(getTrunkLength(tree), 1);
		changeTree(tree);
		changeTree(tree);
		// One commit is at the minimum sequence number and is evicted
		factory.processAllMessages(); // Minimum sequence number === 1
		assert.equal(getTrunkLength(tree), 2);
		changeTree(tree);
		changeTree(tree);
		changeTree(tree);
		// Three commits are behind or at the minimum sequence number and are evicted
		factory.processAllMessages(); // Minimum sequence number === 3
		assert.equal(getTrunkLength(tree), 6 - 3);
	});

	it("can complete a transaction that spans trunk eviction", () => {
		const runtime = new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() });
		const tree = new TestSharedTreeCore(runtime);
		const factory = new MockContainerRuntimeFactory();
		factory.createContainerRuntime(runtime);
		tree.connect({
			deltaConnection: runtime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		changeTree(tree);
		factory.processAllMessages();
		assert.equal(getTrunkLength(tree), 1);
		const branch1 = tree.getLocalBranch().fork();
		branch1.startTransaction();
		changeTree(tree);
		changeTree(tree);
		factory.processAllMessages();
		branch1.commitTransaction();
	});

	it("evicts trunk commits only when no branches have them in their ancestry", () => {
		const runtime = new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() });
		const tree = new TestSharedTreeCore(runtime);
		const factory = new MockContainerRuntimeFactory();
		factory.createContainerRuntime(runtime);
		tree.connect({
			deltaConnection: runtime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		// discard revertibles so that the trunk can be trimmed based on the minimum sequence number
		tree.getLocalBranch().on("newRevertible", (revertible) => {
			revertible.discard();
		});

		// The following scenario tests that branches are tracked across rebases and untracked after disposal.
		// Calling `factory.processAllMessages()` will result in the minimum sequence number being set to the the
		// sequence number just before the most recently received changed. Thus, eviction from this point of view
		// is "off by one"; a commit is only evicted once another commit is sequenced after it.
		// Eviction is performed up to the trunk commit that no branch has as its trunk base.
		// Additionally, by policy, the base commit of the trunk is never evicted, which adds another "off by one".
		//
		//                                            trunk: [seqNum1, (branchBaseA, branchBaseB, ...), seqNum2, ...]
		changeTree(tree);
		factory.processAllMessages(); //                     [1]
		assert.equal(getTrunkLength(tree), 1);
		const branch1 = tree.getLocalBranch().fork();
		const branch2 = tree.getLocalBranch().fork();
		const branch3 = branch2.fork();
		changeTree(tree);
		factory.processAllMessages(); //                     [x (b1, b2, b3), 2]
		changeTree(tree);
		factory.processAllMessages(); //                     [x (b1, b2, b3), 2, 3]
		assert.equal(getTrunkLength(tree), 3);
		branch1.dispose(); //                                [x (b2, b3), 2, 3]
		assert.equal(getTrunkLength(tree), 3);
		branch2.dispose(); //                                [x (b3), 2, 3]
		assert.equal(getTrunkLength(tree), 3);
		branch3.dispose(); //                                [x, x, 3]
		assert.equal(getTrunkLength(tree), 1);
		const branch4 = tree.getLocalBranch().fork(); //     [x, x, 3 (b4)]
		changeTree(tree);
		changeTree(tree);
		factory.processAllMessages(); //                     [x, x, x (b4), 4, 5]
		assert.equal(getTrunkLength(tree), 3);
		const branch5 = tree.getLocalBranch().fork(); //     [x, x, x (b4), 4, 5 (b5)]
		branch4.rebaseOnto(branch5); //                      [x, x, x, 4, 5 (b4, b5)]
		branch4.dispose(); //                                [x, x, x, 4, 5 (b5)]
		assert.equal(getTrunkLength(tree), 2);
		changeTree(tree);
		factory.processAllMessages(); //                     [x, x, x, x, 5 (b5), 6]
		assert.equal(getTrunkLength(tree), 2);
		changeTree(tree);
		branch5.dispose(); //                                [x, x, x, x, x, x, 7]
		assert.equal(getTrunkLength(tree), 1);
	});

	/**
	 * This test triggered 0x4a6 at the time of writing, as rebasing tree2's final edit over tree1's final edit
	 * didn't properly track state related to the detached node the edit affects.
	 *
	 * This test should basically be covered by lower-level editing tests now
	 * (see "can rebase a node replacement and a dependent edit to the new node incrementally")
	 * but for now is kept here for slightly higher e2e coverage for this sort of thing.
	 */
	it("Can rebase and process edits to detached portions of the tree", async () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactory();
		const dataStoreRuntime1 = new MockFluidDataStoreRuntime({
			idCompressor: createIdCompressor(),
		});
		const dataStoreRuntime2 = new MockFluidDataStoreRuntime({
			idCompressor: createIdCompressor(),
		});
		const factory = new SharedTreeTestFactory(() => {});

		containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
		containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
		const tree1 = factory.create(dataStoreRuntime1, "A");
		tree1.connect({
			deltaConnection: dataStoreRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		const b = new SchemaBuilderBase(FieldKinds.optional, {
			scope: "0x4a6 repro",
			libraries: [leaf.library],
		});
		const node = b.objectRecursive("test node", {
			child: FlexFieldSchema.createUnsafe(FieldKinds.optional, [() => node, leaf.number]),
		});
		const schema = b.intoSchema(node);

		const tree2 = await factory.load(
			dataStoreRuntime2,
			"B",
			{
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: MockStorage.createFromSummary((await tree1.summarize()).summary),
			},
			factory.attributes,
		);

		const config = {
			schema,
			initialTree: undefined,
			allowedSchemaModifications: AllowedUpdateType.Initialize,
		} satisfies InitializeAndSchematizeConfiguration;

		const view1 = schematizeFlexTree(tree1, config);
		containerRuntimeFactory.processAllMessages();
		const view2 = schematizeFlexTree(tree2, config);
		const editable1 = view1.flexTree;
		const editable2 = view2.flexTree;

		editable2.content = { [typeNameSymbol]: node.name, child: undefined };
		editable1.content = { [typeNameSymbol]: node.name, child: undefined };
		const rootNode = editable2.content;
		assert(rootNode?.is(node), "Expected set operation to set root node");
		rootNode.boxedChild.content = 42;
		editable1.content = { [typeNameSymbol]: node.name, child: undefined };
		rootNode.boxedChild.content = 43;
		containerRuntimeFactory.processAllMessages();
		assert.deepEqual(tree1.contentSnapshot().tree, [
			{
				type: node.name,
			},
		]);
		assert.deepEqual(tree2.contentSnapshot().tree, [
			{
				type: node.name,
			},
		]);
	});

	function isSummaryTree(summaryObject: SummaryObject): summaryObject is ISummaryTree {
		return summaryObject.type === SummaryType.Tree;
	}

	function createTree<TIndexes extends readonly Summarizable[]>(
		indexes: TIndexes,
	): TestSharedTreeCore {
		return new TestSharedTreeCore(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			undefined,
			indexes,
		);
	}

	interface MockSummarizableEvents extends IEvent {
		(event: "loaded", listener: (blobContents?: string) => void): void;
		(event: "summarize" | "summarizeAttached" | "summarizeAsync" | "gcRequested"): void;
	}

	class MockSummarizable
		extends TypedEventEmitter<MockSummarizableEvents>
		implements Summarizable
	{
		public static readonly blobKey = "MockIndexBlobKey";
		public static readonly blobContents = "MockIndexBlobContent";

		public constructor(public readonly key = "MockIndexsummarizable") {
			super();
		}

		public async load(
			services: IChannelStorageService,
			parse: SummaryElementParser,
		): Promise<void> {
			if (await services.contains(MockSummarizable.blobKey)) {
				const blob = await services.readBlob(MockSummarizable.blobKey);
				const blobContents = parse(IsoBuffer.from(blob).toString());
				this.emit("loaded", blobContents);
			} else {
				this.emit("loaded");
			}
		}

		public getAttachSummary(
			stringify: SummaryElementStringifier,
			fullTree?: boolean | undefined,
			trackState?: boolean | undefined,
			telemetryContext?: ITelemetryContext | undefined,
		): ISummaryTreeWithStats {
			this.emit("summarizeAttached");
			return this.summarizeCore(stringify);
		}

		public async summarize(
			stringify: SummaryElementStringifier,
			fullTree?: boolean | undefined,
			trackState?: boolean | undefined,
			telemetryContext?: ITelemetryContext | undefined,
		): Promise<ISummaryTreeWithStats> {
			this.emit("summarizeAsync");
			return this.summarizeCore(stringify);
		}

		private summarizeCore(stringify: SummaryElementStringifier): ISummaryTreeWithStats {
			this.emit("summarize");
			return createSingleBlobSummary(
				MockSummarizable.blobKey,
				stringify(MockSummarizable.blobContents),
			);
		}

		public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
			this.emit("gcRequested");
			return { gcNodes: {} };
		}
	}
});

/** Makes an arbitrary change to the given tree */
function changeTree<TChange, TEditor extends DefaultEditBuilder>(
	tree: SharedTreeCore<TEditor, TChange>,
): void {
	const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKey });
	field.insert(0, cursorForJsonableTreeNode({ type: brand("Node"), value: 42 }));
}

/** Returns the length of the trunk branch in the given tree. Acquired via unholy cast; use for glass-box tests only. */
function getTrunkLength<TEditor extends ChangeFamilyEditor, TChange>(
	tree: SharedTreeCore<TEditor, TChange>,
): number {
	const { editManager } = tree as unknown as {
		editManager: EditManager<TEditor, TChange, ChangeFamily<TEditor, TChange>>;
	};
	assert(
		editManager !== undefined,
		"EditManager in SharedTreeCore has been moved/deleted. Please update glass box tests.",
	);
	return editManager.getTrunkChanges().length;
}
