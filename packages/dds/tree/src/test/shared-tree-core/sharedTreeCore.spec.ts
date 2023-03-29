/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IEvent } from "@fluidframework/common-definitions";
import { IsoBuffer, TypedEventEmitter } from "@fluidframework/common-utils";
import { IChannelAttributes, IChannelStorageService } from "@fluidframework/datastore-definitions";
import { ISummaryTree, SummaryObject, SummaryType } from "@fluidframework/protocol-definitions";
import {
	ITelemetryContext,
	ISummaryTreeWithStats,
	IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import {
	MockFluidDataStoreRuntime,
	MockSharedObjectServices,
} from "@fluidframework/test-runtime-utils";
import { createSingleBlobSummary } from "@fluidframework/shared-object-base";
import {
	ChangeEvents,
	SharedTreeCore,
	IndexSummarizer,
	SummaryElementParser,
	SummaryElementStringifier,
} from "../../shared-tree-core";
import { AnchorSet, rootFieldKeySymbol } from "../../core";
import {
	defaultChangeFamily,
	DefaultChangeset,
	DefaultEditBuilder,
	singleTextCursor,
} from "../../feature-libraries";
import { brand } from "../../util";
import { ISubscribable } from "../../events";

describe("SharedTreeCore", () => {
	describe("emits", () => {
		/** Implementation of SharedTreeCore which exposes change events */
		class ChangeEventSharedTree extends SharedTreeCore<DefaultEditBuilder, DefaultChangeset> {
			public constructor() {
				const runtime = new MockFluidDataStoreRuntime();
				const attributes: IChannelAttributes = {
					type: "ChangeEventSharedTree",
					snapshotFormatVersion: "0.0.0",
					packageVersion: "0.0.0",
				};
				super(
					[],
					defaultChangeFamily,
					new AnchorSet(),
					"ChangeEventSharedTree",
					runtime,
					attributes,
					"",
				);
			}

			public get events(): ISubscribable<ChangeEvents<DefaultChangeset>> {
				return this.changeEvents;
			}
		}

		function countTreeEvent(event: keyof ChangeEvents<DefaultChangeset>): {
			tree: ReturnType<typeof createTree>;
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
			tree.startTransaction();
			changeTree(tree);
			assert.equal(counter.count, 1);
			changeTree(tree);
			assert.equal(counter.count, 2);
		});

		it("no local change event when committing a transaction", async () => {
			const { tree, counter } = countTreeEvent("newLocalChange");
			tree.startTransaction();
			changeTree(tree);
			assert.equal(counter.count, 1);
			tree.commitTransaction();
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
			tree.startTransaction();
			changeTree(tree);
			assert.equal(counter.count, 1);
			changeTree(tree);
			assert.equal(counter.count, 2);
		});

		it("no local state event when committing a transaction", async () => {
			const { tree, counter } = countTreeEvent("newLocalState");
			tree.startTransaction();
			changeTree(tree);
			assert.equal(counter.count, 1);
			tree.commitTransaction();
			assert.equal(counter.count, 1);
		});
	});

	it("summarizes without indexes", async () => {
		const tree = createTree([]);
		const { summary, stats } = await tree.summarize();
		assert(summary);
		assert(stats);
		assert.equal(stats.treeNodeCount, 2);
		assert.equal(stats.blobNodeCount, 0);
		assert.equal(stats.handleNodeCount, 0);
	});

	describe("indexes", () => {
		it("are loaded", async () => {
			const index = new MockIndexSummarizer();
			let loaded = false;
			index.on("loaded", () => (loaded = true));
			const indexes = [index] as const;
			const tree = createTree(indexes);
			await tree.load(new MockSharedObjectServices({}));
			assert(loaded, "Expected index to load");
		});

		it("load blobs", async () => {
			const index = new MockIndexSummarizer();
			let loadedBlob = false;
			index.on("loaded", (blobContents) => {
				if (blobContents === MockIndexSummarizer.blobContents) {
					loadedBlob = true;
				}
			});
			const indexes = [index] as const;
			const tree = createTree(indexes);
			const { summary } = await tree.summarize();
			await tree.load(MockSharedObjectServices.createFromSummary(summary));
			assert.equal(loadedBlob, true);
		});

		it("summarize synchronously", () => {
			const indexA = new MockIndexSummarizer("Index A");
			let summarizedIndexA = false;
			indexA.on("summarizeAttached", () => (summarizedIndexA = true));
			const indexB = new MockIndexSummarizer("Index B");
			let summarizedIndexB = false;
			indexB.on("summarizeAttached", () => (summarizedIndexB = true));
			const indexes = [indexA, indexB] as const;
			const tree = createTree(indexes);
			const { summary, stats } = tree.getAttachSummary();
			assert(summarizedIndexA, "Expected Index A to summarize");
			assert(summarizedIndexB, "Expected Index B to summarize");
			const indexSummaryTree = summary.tree.indexes;
			assert(
				isSummaryTree(indexSummaryTree),
				"Expected index subtree to be present in summary",
			);
			assert.equal(
				Object.entries(indexSummaryTree.tree).length,
				indexes.length,
				"Expected both indexes to be present in the index subtree of the summary",
			);

			assert.equal(
				stats.treeNodeCount,
				4,
				"Expected summary stats to correctly count tree nodes",
			);
		});

		// TODO: Enable once SharedTreeCore properly implements async summaries
		it.skip("summarize asynchronously", async () => {
			const indexA = new MockIndexSummarizer("Index A");
			let summarizedIndexA = false;
			indexA.on("summarizeAsync", () => (summarizedIndexA = true));
			const indexB = new MockIndexSummarizer("Index B");
			let summarizedIndexB = false;
			indexB.on("summarizeAsync", () => (summarizedIndexB = true));
			const indexes = [indexA, indexB];
			const tree = createTree(indexes);
			const { summary, stats } = await tree.summarize();
			assert(summarizedIndexA, "Expected Index A to summarize");
			assert(summarizedIndexB, "Expected Index B to summarize");
			const indexSummaryTree = summary.tree.indexes;
			assert(
				isSummaryTree(indexSummaryTree),
				"Expected index subtree to be present in summary",
			);
			assert.equal(
				Object.entries(indexSummaryTree.tree).length,
				indexes.length,
				"Expected both indexes to be present in the index subtree of the summary",
			);

			assert.equal(
				stats.treeNodeCount,
				indexes.length + 1,
				"Expected summary stats to correctly count tree nodes",
			);
		});

		it("are asked for GC", () => {
			const index = new MockIndexSummarizer("Index");
			let requestedGC = false;
			index.on("gcRequested", () => (requestedGC = true));
			const indexes = [index] as const;
			const tree = createTree(indexes);
			tree.getGCData();
			assert(requestedGC, "Expected SharedTree to ask index for GC");
		});
	});

	function isSummaryTree(summaryObject: SummaryObject): summaryObject is ISummaryTree {
		return summaryObject.type === SummaryType.Tree;
	}

	function createTree<TIndexes extends readonly IndexSummarizer[]>(
		indexes: TIndexes,
	): SharedTreeCore<DefaultEditBuilder, DefaultChangeset> {
		const runtime = new MockFluidDataStoreRuntime();
		const attributes: IChannelAttributes = {
			type: "TestSharedTree",
			snapshotFormatVersion: "0.0.0",
			packageVersion: "0.0.0",
		};
		return new SharedTreeCore(
			indexes,
			defaultChangeFamily,
			new AnchorSet(),
			"TestSharedTree",
			runtime,
			attributes,
			"",
		);
	}

	interface MockIndexSummarizerEvents extends IEvent {
		(event: "loaded", listener: (blobContents?: string) => void): void;
		(event: "summarize" | "summarizeAttached" | "summarizeAsync" | "gcRequested"): void;
	}

	class MockIndexSummarizer
		extends TypedEventEmitter<MockIndexSummarizerEvents>
		implements IndexSummarizer
	{
		public static readonly blobKey = "MockIndexBlobKey";
		public static readonly blobContents = "MockIndexBlobContent";

		public constructor(public readonly key = "MockIndexSummarizer") {
			super();
		}

		public async load(
			services: IChannelStorageService,
			parse: SummaryElementParser,
		): Promise<void> {
			if (await services.contains(MockIndexSummarizer.blobKey)) {
				const blob = await services.readBlob(MockIndexSummarizer.blobKey);
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
				MockIndexSummarizer.blobKey,
				stringify(MockIndexSummarizer.blobContents),
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
	const field = tree.editor.sequenceField(undefined, rootFieldKeySymbol);
	field.insert(0, singleTextCursor({ type: brand("Node"), value: 42 }));
}
