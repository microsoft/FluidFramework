/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { IsoBuffer, TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IEvent } from "@fluidframework/core-interfaces";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import {
	type ISummaryTree,
	type SummaryObject,
	SummaryType,
} from "@fluidframework/driver-definitions";
import type {
	IGarbageCollectionData,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import { createSingleBlobSummary } from "@fluidframework/shared-object-base/internal";
import {
	MockContainerRuntimeFactory,
	MockContainerRuntimeFactoryForReconnection,
	MockFluidDataStoreRuntime,
	MockSharedObjectServices,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import {
	type ChangeFamily,
	type ChangeFamilyEditor,
	type GraphCommit,
	rootFieldKey,
} from "../../core/index.js";
import {
	type DefaultChangeset,
	type DefaultEditBuilder,
	type ModularChangeset,
	cursorForJsonableTreeNode,
} from "../../feature-libraries/index.js";
import { Tree } from "../../shared-tree/index.js";
import type {
	ChangeEnricherReadonlyCheckout,
	EditManager,
	ResubmitMachine,
	SharedTreeCore,
	Summarizable,
	SummaryElementParser,
	SummaryElementStringifier,
} from "../../shared-tree-core/index.js";
import { brand, disposeSymbol } from "../../util/index.js";
import { SharedTreeTestFactory, StringArray, TestTreeProviderLite } from "../utils.js";

import { createTree, createTreeSharedObject, TestSharedTreeCore } from "./utils.js";
import { SchemaFactory, TreeViewConfiguration } from "../../simple-tree/index.js";
import { mockSerializer } from "../mockSerializer.js";

const enableSchemaValidation = true;

describe("SharedTreeCore", () => {
	it("summarizes without indexes", async () => {
		const tree = createTree([]);
		const { summary, stats } = tree.summarizeCore(mockSerializer);
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
			const defaultSummary = createTree([]).summarizeCore(mockSerializer);
			await tree.loadCore(
				MockSharedObjectServices.createFromSummary(defaultSummary.summary).objectStorage,
			);
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
			const { summary } = tree.summarizeCore(mockSerializer);
			await tree.loadCore(MockSharedObjectServices.createFromSummary(summary).objectStorage);
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
			const { summary, stats } = tree.summarizeCore(mockSerializer);
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
	});

	it("evicts trunk commits behind the minimum sequence number", () => {
		const runtime = new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() });
		const sharedObject = new TestSharedTreeCore(runtime);
		const factory = new MockContainerRuntimeFactory({ useProcessMessages: true });
		sharedObject.connect({
			deltaConnection: runtime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});
		const tree = sharedObject.kernel;

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
		const runtime = new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() });
		const sharedObject = new TestSharedTreeCore(runtime);
		const factory = new MockContainerRuntimeFactory({ useProcessMessages: true });
		factory.createContainerRuntime(runtime);
		sharedObject.connect({
			deltaConnection: runtime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});
		const tree = sharedObject.kernel;

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
		const containerRuntimeFactory = new MockContainerRuntimeFactory({
			useProcessMessages: true,
		});
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

		const sf = new SchemaFactory("0x4a6 repro");
		class TestNode extends sf.objectRecursive("test node", {
			child: sf.optionalRecursive([() => TestNode, sf.number]),
		}) {}

		const tree2 = await factory.load(
			dataStoreRuntime2,
			"B",
			{
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: MockStorage.createFromSummary(
					tree1.summarizeCore(mockSerializer).summary,
				),
			},
			factory.attributes,
		);

		const view1 = tree1.viewWith(
			new TreeViewConfiguration({ schema: TestNode, enableSchemaValidation }),
		);
		view1.initialize(new TestNode({}));
		containerRuntimeFactory.processAllMessages();
		const view2 = tree2.viewWith(
			new TreeViewConfiguration({ schema: TestNode, enableSchemaValidation }),
		);

		view2.root = new TestNode({});
		view1.root = new TestNode({});
		assert(Tree.is(view2.root, TestNode), "Expected set operation to set root node");
		view2.root.child = 42;
		view1.root = new TestNode({});
		view2.root.child = 43;
		containerRuntimeFactory.processAllMessages();
		assert.deepEqual(tree1.contentSnapshot().tree, [
			{
				type: TestNode.identifier,
			},
		]);
		assert.deepEqual(tree2.contentSnapshot().tree, [
			{
				type: TestNode.identifier,
			},
		]);
	});

	it("Does not submit changes that were aborted in an outer transaction", async () => {
		const provider = new TestTreeProviderLite(2);
		const view1 = provider.trees[0].viewWith(
			new TreeViewConfiguration({
				schema: StringArray,
				enableSchemaValidation,
			}),
		);
		view1.initialize(["A", "B"]);
		provider.processMessages();
		const view2 = provider.trees[1].viewWith(
			new TreeViewConfiguration({
				schema: StringArray,
				enableSchemaValidation,
			}),
		);

		const root1 = view1.root;
		const root2 = view2.root;

		Tree.runTransaction(root1, () => {
			// Remove A as part of the aborted transaction
			root1.removeAt(0);
			Tree.runTransaction(root1, () => {
				// Remove B as part of the committed inner transaction
				root1.removeAt(0);
			});
			return Tree.runTransaction.rollback;
		});

		provider.processMessages();
		assert.deepEqual([...root1], ["A", "B"]);
		assert.deepEqual([...root2], ["A", "B"]);

		// Make an additional change to ensure that all changes from the previous transactions were flushed
		Tree.runTransaction(root1, () => {
			root1.insertAtEnd("C");
		});

		provider.processMessages();
		assert.deepEqual([...root1], ["A", "B", "C"]);
		assert.deepEqual([...root2], ["A", "B", "C"]);
	});

	it("Does not submit changes that were aborted in an inner transaction", async () => {
		const provider = new TestTreeProviderLite(2);
		const view1 = provider.trees[0].viewWith(
			new TreeViewConfiguration({
				schema: StringArray,
				enableSchemaValidation,
			}),
		);
		view1.initialize(["A", "B"]);
		provider.processMessages();
		const view2 = provider.trees[1].viewWith(
			new TreeViewConfiguration({
				schema: StringArray,
				enableSchemaValidation,
			}),
		);

		const root1 = view1.root;
		const root2 = view2.root;

		Tree.runTransaction(root1, () => {
			// Remove A as part of the committed transaction
			root1.removeAt(0);
			Tree.runTransaction(root1, () => {
				// Remove B as part of the aborted transaction
				root1.removeAt(0);
				return Tree.runTransaction.rollback;
			});
		});

		assert.deepEqual([...root1], ["B"]);
		assert.deepEqual([...root2], ["A", "B"]);

		provider.processMessages();

		assert.deepEqual([...root1], ["B"]);
		assert.deepEqual([...root2], ["B"]);

		// Make an additional change to ensure that all changes from the previous transactions were flushed
		Tree.runTransaction(root1, () => {
			root1.insertAtEnd("C");
		});

		provider.processMessages();
		assert.deepEqual([...root2], ["B", "C"]);
		assert.deepEqual([...root2], ["B", "C"]);
	});

	describe("commit enrichment", () => {
		interface EnrichedCommit extends GraphCommit<ModularChangeset> {
			readonly original?: GraphCommit<ModularChangeset>;
		}
		class MockResubmitMachine implements ResubmitMachine<DefaultChangeset> {
			public readonly resubmitQueue: EnrichedCommit[] = [];
			public readonly sequencingLog: boolean[] = [];
			public readonly submissionLog: EnrichedCommit[] = [];
			public readonly resubmissionLog: GraphCommit<DefaultChangeset>[][] = [];

			public prepareForResubmit(toResubmit: readonly GraphCommit<ModularChangeset>[]): void {
				assert.equal(this.resubmitQueue.length, 0);
				assert.equal(toResubmit.length, this.submissionLog.length);
				this.resubmitQueue.push(...Array.from(toResubmit, (c) => ({ ...c, original: c })));
				this.isInResubmitPhase = true;
				this.resubmissionLog.push(toResubmit.slice());
			}
			public peekNextCommit(): GraphCommit<ModularChangeset> {
				assert.equal(this.isInResubmitPhase, true);
				assert.equal(this.resubmitQueue.length > 0, true);
				return this.resubmitQueue[0];
			}
			public isInResubmitPhase: boolean = false;
			public onCommitSubmitted(commit: GraphCommit<ModularChangeset>): void {
				const toResubmit = this.resubmitQueue.shift();
				if (toResubmit !== commit) {
					this.resubmitQueue.shift();
				}
				this.submissionLog.push(commit);
			}
			public onSequencedCommitApplied(isLocal: boolean): void {
				this.sequencingLog.push(isLocal);
			}
		}

		interface Enrichment<T extends object> {
			readonly input: T;
			readonly output: T;
		}

		class MockChangeEnricher<T extends object> implements ChangeEnricherReadonlyCheckout<T> {
			public isDisposed = false;
			public enrichmentLog: Enrichment<T>[] = [];

			public fork(): never {
				// SharedTreeCore should never call fork on a change enricher
				throw new Error("Unexpected use of fork");
			}

			public updateChangeEnrichments(input: T): T {
				assert.equal(this.isDisposed, false);
				const output = { ...input };
				this.enrichmentLog.push({ input, output });
				return output;
			}

			public [disposeSymbol](): void {
				assert.equal(this.isDisposed, false);
				this.isDisposed = true;
			}
		}

		it("notifies the ResubmitMachine of submitted and sequenced commits", () => {
			const machine = new MockResubmitMachine();
			const tree = createTreeSharedObject([], machine);
			const containerRuntimeFactory = new MockContainerRuntimeFactory({
				useProcessMessages: true,
			});
			const dataStoreRuntime1 = new MockFluidDataStoreRuntime({
				idCompressor: createIdCompressor(),
			});
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			tree.connect({
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			});

			assert.equal(machine.submissionLog.length, 0);
			assert.equal(machine.sequencingLog.length, 0);
			changeTree(tree.kernel);
			assert.equal(machine.submissionLog.length, 1);
			assert.equal(machine.sequencingLog.length, 0);
			containerRuntimeFactory.processAllMessages();
			assert.equal(machine.submissionLog.length, 1);
			assert.deepEqual(machine.sequencingLog, [true]);
		});

		it("enriches commits on first submit", () => {
			const enricher = new MockChangeEnricher<ModularChangeset>();
			const machine = new MockResubmitMachine();
			const tree = createTreeSharedObject([], machine, enricher);
			const containerRuntimeFactory = new MockContainerRuntimeFactory({
				useProcessMessages: true,
			});
			const dataStoreRuntime1 = new MockFluidDataStoreRuntime({
				idCompressor: createIdCompressor(),
			});
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			tree.connect({
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			});
			assert.equal(enricher.enrichmentLog.length, 0);
			changeTree(tree.kernel);
			assert.equal(enricher.enrichmentLog.length, 1);
			assert.equal(machine.submissionLog.length, 1);
			assert.equal(enricher.enrichmentLog[0].input, tree.getLocalBranch().getHead().change);
			assert.equal(enricher.enrichmentLog[0].output, machine.submissionLog[0].change);
		});

		it("enriches transactions on first submit", () => {
			const enricher = new MockChangeEnricher<ModularChangeset>();
			const machine = new MockResubmitMachine();
			const tree = createTreeSharedObject([], machine, enricher);
			const containerRuntimeFactory = new MockContainerRuntimeFactory({
				useProcessMessages: true,
			});
			const dataStoreRuntime1 = new MockFluidDataStoreRuntime({
				idCompressor: createIdCompressor(),
			});
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			tree.connect({
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			});
			tree.transaction.start();
			assert.equal(enricher.enrichmentLog.length, 0);
			changeTree(tree.kernel);
			assert.equal(enricher.enrichmentLog.length, 1);
			assert.equal(
				enricher.enrichmentLog[0].input,
				tree.transaction.activeBranch.getHead().change,
			);
			changeTree(tree.kernel);
			assert.equal(enricher.enrichmentLog.length, 2);
			assert.equal(
				enricher.enrichmentLog[1].input,
				tree.transaction.activeBranch.getHead().change,
			);
			tree.transaction.commit();
			assert.equal(enricher.enrichmentLog.length, 2);
			assert.equal(machine.submissionLog.length, 1);
			assert.notEqual(
				machine.submissionLog[0],
				tree.transaction.activeBranch.getHead().change,
			);
		});

		it("handles aborted outer transaction", () => {
			const enricher = new MockChangeEnricher<ModularChangeset>();
			const machine = new MockResubmitMachine();
			const tree = createTreeSharedObject([], machine, enricher);
			const containerRuntimeFactory = new MockContainerRuntimeFactory({
				useProcessMessages: true,
			});
			const dataStoreRuntime1 = new MockFluidDataStoreRuntime({
				idCompressor: createIdCompressor(),
			});
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			tree.connect({
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			});
			tree.transaction.start();
			assert.equal(enricher.enrichmentLog.length, 0);
			changeTree(tree.kernel);
			assert.equal(enricher.enrichmentLog.length, 1);
			assert.equal(
				enricher.enrichmentLog[0].input,
				tree.transaction.activeBranch.getHead().change,
			);
			tree.transaction.abort();
			assert.equal(enricher.enrichmentLog.length, 1);
			assert.equal(machine.submissionLog.length, 0);
		});

		it("update commit enrichments on re-submit", () => {
			const enricher = new MockChangeEnricher<ModularChangeset>();
			const machine = new MockResubmitMachine();
			const tree = createTreeSharedObject([], machine, enricher);
			const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection({
				useProcessMessages: true,
			});
			const dataStoreRuntime1 = new MockFluidDataStoreRuntime({
				idCompressor: createIdCompressor(),
			});
			const runtime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			tree.connect({
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			});
			runtime.connected = false;
			assert.equal(enricher.enrichmentLog.length, 0);
			changeTree(tree.kernel);
			changeTree(tree.kernel);
			assert.equal(enricher.enrichmentLog.length, 2);
			assert.equal(machine.resubmitQueue.length, 0);
			assert.equal(machine.submissionLog.length, 2);
			assert.equal(machine.sequencingLog.length, 0);
			runtime.connected = true;

			assert.equal(machine.resubmissionLog.length, 1);
			assert.equal(machine.resubmissionLog[0].length, 2);
			assert.equal(machine.resubmitQueue.length, 0);
			assert.equal(machine.submissionLog.length, 4);
			assert.equal(machine.submissionLog[2].original, machine.resubmissionLog[0][0]);
			assert.equal(machine.submissionLog[3].original, machine.resubmissionLog[0][1]);
			assert.equal(machine.sequencingLog.length, 0);
			containerRuntimeFactory.processAllMessages();
			assert.equal(machine.sequencingLog.length, 2);
		});
	});

	function isSummaryTree(summaryObject: SummaryObject): summaryObject is ISummaryTree {
		return summaryObject.type === SummaryType.Tree;
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
	const field = tree.getEditor().sequenceField({ parent: undefined, field: rootFieldKey });
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
