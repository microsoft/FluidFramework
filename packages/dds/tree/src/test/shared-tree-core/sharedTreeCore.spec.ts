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
	Index,
	SharedTreeCore,
	SummaryElement,
	SummaryElementParser,
	SummaryElementStringifier,
} from "../../shared-tree-core";
import { AnchorSet, EditManager } from "../../core";
import {
	DefaultChangeFamily,
	defaultChangeFamily,
	DefaultChangeset,
} from "../../feature-libraries";

describe("SharedTreeCore", () => {
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
			const index = new MockIndex();
			let loaded = false;
			index.on("loaded", () => (loaded = true));
			const indexes = [index] as const;
			const tree = createTree(indexes);
			await tree.load(new MockSharedObjectServices({}));
			assert(loaded, "Expected index to load");
		});

		it("load blobs", async () => {
			const index = new MockIndex();
			let loadedBlob = false;
			index.on("loaded", (blobContents) => {
				if (blobContents === MockIndex.blobContents) {
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
			const indexA = new MockIndex("Index A");
			let summarizedIndexA = false;
			indexA.on("summarizeAttached", () => (summarizedIndexA = true));
			const indexB = new MockIndex("Index B");
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
			const indexA = new MockIndex("Index A");
			let summarizedIndexA = false;
			indexA.on("summarizeAsync", () => (summarizedIndexA = true));
			const indexB = new MockIndex("Index B");
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
			const index = new MockIndex("Index");
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

	function createTree<TIndexes extends readonly Index[]>(
		indexes: TIndexes,
	): SharedTreeCore<DefaultChangeset, DefaultChangeFamily, TIndexes> {
		const runtime = new MockFluidDataStoreRuntime();
		const attributes: IChannelAttributes = {
			type: "TestSharedTree",
			snapshotFormatVersion: "0.0.0",
			packageVersion: "0.0.0",
		};
		const anchors = new AnchorSet();
		const editManager: EditManager<DefaultChangeset, DefaultChangeFamily> = new EditManager(
			defaultChangeFamily,
			anchors,
		);

		return new SharedTreeCore(
			indexes,
			defaultChangeFamily,
			editManager,
			anchors,
			"TestSharedTree",
			runtime,
			attributes,
			"",
		);
	}

	interface TestIndexEvents extends IEvent {
		(event: "loaded", listener: (blobContents?: string) => void): void;
		(event: "summarize" | "summarizeAttached" | "summarizeAsync" | "gcRequested"): void;
	}

	class MockIndex extends TypedEventEmitter<TestIndexEvents> implements Index, SummaryElement {
		public static readonly blobKey = "MockIndexBlobKey";
		public static readonly blobContents = "MockIndexBlobContent";

		public summaryElement: SummaryElement = this;

		public constructor(public readonly key = "MockIndex") {
			super();
		}

		public async load(
			services: IChannelStorageService,
			parse: SummaryElementParser,
		): Promise<void> {
			if (await services.contains(MockIndex.blobKey)) {
				const blob = await services.readBlob(MockIndex.blobKey);
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
			return createSingleBlobSummary(MockIndex.blobKey, stringify(MockIndex.blobContents));
		}

		public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
			this.emit("gcRequested");
			return { gcNodes: {} };
		}
	}
});
