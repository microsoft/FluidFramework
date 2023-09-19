/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IEvent } from "@fluidframework/core-interfaces";
import { IsoBuffer, TypedEventEmitter } from "@fluid-internal/client-utils";
import { IChannelAttributes, IChannelStorageService } from "@fluidframework/datastore-definitions";
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
	ChangeEvents,
	EditManager,
	SharedTreeCore,
	Summarizable,
	SummaryElementParser,
	SummaryElementStringifier,
} from "../../shared-tree-core";
import { ChangeFamily, ChangeFamilyEditor, rootFieldKey } from "../../core";
import { DefaultChangeset, DefaultEditBuilder, singleTextCursor } from "../../feature-libraries";
import { brand } from "../../util";
import { ISubscribable } from "../../events";
import { TestSharedTreeCore } from "./utils";

describe("SharedTreeCore", () => {
	describe("emits", () => {
		/** Implementation of SharedTreeCore which exposes change events */
		class ChangeEventSharedTree extends TestSharedTreeCore {
			public constructor() {
				const runtime = new MockFluidDataStoreRuntime();
				const attributes: IChannelAttributes = {
					type: "ChangeEventSharedTree",
					snapshotFormatVersion: "0.0.0",
					packageVersion: "0.0.0",
				};
				super();
			}

			public get events(): ISubscribable<ChangeEvents<DefaultChangeset>> {
				return this.changeEvents;
			}
		}

		function countTreeEvent(event: keyof ChangeEvents<DefaultChangeset>): {
			tree: ChangeEventSharedTree;
			counter: { count: number };
		} {
			const counter = {
				count: 0,
			};
			const tree = new ChangeEventSharedTree();
			tree.events.on(event, () => (counter.count += 1));
			return { tree, counter };
		}

		it("local change event after a change", async () => {
			const { tree, counter } = countTreeEvent("newLocalChange");
			changeTree(tree);
			assert.equal(counter.count, 1);
			changeTree(tree);
			assert.equal(counter.count, 2);
		});

		it("local change event after a change in a transaction", async () => {
			const { tree, counter } = countTreeEvent("newLocalChange");
			tree.getLocalBranch().startTransaction();
			changeTree(tree);
			assert.equal(counter.count, 1);
			changeTree(tree);
			assert.equal(counter.count, 2);
		});

		it("no local change event when committing a transaction", async () => {
			const { tree, counter } = countTreeEvent("newLocalChange");
			tree.getLocalBranch().startTransaction();
			changeTree(tree);
			assert.equal(counter.count, 1);
			tree.getLocalBranch().commitTransaction();
			assert.equal(counter.count, 1);
		});

		it("local state event after a change", async () => {
			const { tree, counter } = countTreeEvent("newLocalState");
			changeTree(tree);
			assert.equal(counter.count, 1);
			changeTree(tree);
			assert.equal(counter.count, 2);
		});

		it("local state event after a change in a transaction", async () => {
			const { tree, counter } = countTreeEvent("newLocalState");
			tree.getLocalBranch().startTransaction();
			changeTree(tree);
			assert.equal(counter.count, 1);
			changeTree(tree);
			assert.equal(counter.count, 2);
		});

		it("no local state event when committing a transaction", async () => {
			const { tree, counter } = countTreeEvent("newLocalState");
			tree.getLocalBranch().startTransaction();
			changeTree(tree);
			assert.equal(counter.count, 1);
			tree.getLocalBranch().commitTransaction();
			assert.equal(counter.count, 1);
		});
	});

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
		const runtime = new MockFluidDataStoreRuntime();
		const tree = new TestSharedTreeCore(runtime);
		const factory = new MockContainerRuntimeFactory();
		factory.createContainerRuntime(runtime);
		tree.connect({
			deltaConnection: runtime.createDeltaConnection(),
			objectStorage: new MockStorage(),
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

	it("evicts trunk commits only when no branches have them in their ancestry", () => {
		const runtime = new MockFluidDataStoreRuntime();
		const tree = new TestSharedTreeCore(runtime);
		const factory = new MockContainerRuntimeFactory();
		factory.createContainerRuntime(runtime);
		tree.connect({
			deltaConnection: runtime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		// The following scenario tests that branches are tracked across rebases and untracked after disposal.
		// Calling `factory.processAllMessages()` will result in the minimum sequence number being set to the the
		// sequence number just before the most recently received changed. Thus, eviction from this point of view
		// is "off by one"; a commit is only evicted once another commit is sequenced after it.
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
		assert.equal(getTrunkLength(tree), 2);
		branch1.dispose(); //                                [x (b2, b3), 2, 3]
		assert.equal(getTrunkLength(tree), 2);
		branch2.dispose(); //                                [x (b3), 2, 3]
		assert.equal(getTrunkLength(tree), 2);
		branch3.dispose(); //                                [x, x, 3]
		assert.equal(getTrunkLength(tree), 1);
		const branch4 = tree.getLocalBranch().fork(); //     [x, x, 3 (b4)]
		changeTree(tree);
		changeTree(tree);
		factory.processAllMessages(); //                     [x, x, x (b4), 4, 5]
		assert.equal(getTrunkLength(tree), 2);
		const branch5 = tree.getLocalBranch().fork(); //     [x, x, x (b4), 4, 5 (b5)]
		branch4.rebaseOnto(branch5); //                      [x, x, x, 4, 5 (b4, b5)]
		branch4.dispose(); //                                [x, x, x, 4, 5 (b5)]
		assert.equal(getTrunkLength(tree), 2);
		changeTree(tree);
		factory.processAllMessages(); //                     [x, x, x, x, 5 (b5), 6]
		assert.equal(getTrunkLength(tree), 1);
		changeTree(tree);
		branch5.dispose(); //                                [x, x, x, x, x, x, 7]
		assert.equal(getTrunkLength(tree), 1);
	});

	function isSummaryTree(summaryObject: SummaryObject): summaryObject is ISummaryTree {
		return summaryObject.type === SummaryType.Tree;
	}

	function createTree<TIndexes extends readonly Summarizable[]>(
		indexes: TIndexes,
	): TestSharedTreeCore {
		return new TestSharedTreeCore(undefined, undefined, indexes);
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
	field.insert(0, singleTextCursor({ type: brand("Node"), value: 42 }));
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
