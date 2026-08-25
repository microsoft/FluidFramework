/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IContainer } from "@fluidframework/container-definitions/internal";
import type {
	IChannel,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import {
	getRequiredPendingLocalState,
	type TestFluidObjectInternal,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { asAlpha } from "../../api.js";
import { FluidClientVersion } from "../../codec/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	TreeViewConfiguration,
	type ITree,
	type TreeBranchHistory,
} from "../../simple-tree/index.js";
import {
	configuredSharedTree,
	SharedTree as SharedTreeKind,
	type ISharedTree,
} from "../../treeFactory.js";
import type { JsonCompatibleReadOnlyObject } from "../../util/index.js";
import {
	SharedTreeTestFactory,
	StringArray,
	SummarizeType,
	TestTreeProvider,
	TestTreeProviderLite,
} from "../utils.js";

const config = new TreeViewConfiguration({ schema: StringArray });

/**
 * Builds a SharedTree factory.
 * @param options - `minVersionForCollab` defaults to the first version that persists commit metadata.
 */
function makeFactory(
	options: {
		readonly retainHistory?: boolean;
		readonly minVersionForCollab?: (typeof FluidClientVersion)[keyof typeof FluidClientVersion];
	} = {},
): IChannelFactory<ITree> {
	return configuredSharedTree({
		jsonValidator: FormatValidatorBasic,
		minVersionForCollab: options.minVersionForCollab ?? FluidClientVersion.v3_0,
		retainHistory: options.retainHistory ?? false,
	}).getFactory();
}

/** The metadata of the branch's head commit. */
function headMetadata(history: TreeBranchHistory): JsonCompatibleReadOnlyObject | undefined {
	return history.getHead()?.persistedMetadata;
}

/** The metadata of every commit in the branch's history, ordered from newest to oldest. */
function allMetadata(
	history: TreeBranchHistory,
): (JsonCompatibleReadOnlyObject | undefined)[] {
	const metadata: (JsonCompatibleReadOnlyObject | undefined)[] = [];
	for (let commit = history.getHead(); commit !== undefined; commit = commit.getParent()) {
		metadata.push(commit.persistedMetadata);
	}
	return metadata;
}

/** The `tag` property of every annotated commit in the branch's history, newest first. */
function tags(history: TreeBranchHistory): unknown[] {
	return allMetadata(history)
		.filter((m) => m !== undefined)
		.map((m) => m.tag);
}

/** Summarizes `tree` and loads a fresh client from the resulting summary. */
async function loadFreshClient(
	tree: ITree,
	factory: IChannelFactory<ITree>,
	idCompressor: IIdCompressor,
): Promise<ISharedTree> {
	const { summary } = await (tree as unknown as IChannel).summarize();
	const runtime = new MockFluidDataStoreRuntime({ idCompressor });
	return (await factory.load(
		runtime,
		"loaded",
		{
			deltaConnection: runtime.createDeltaConnection(),
			objectStorage: MockStorage.createFromSummary(summary),
		},
		factory.attributes,
	)) as ISharedTree;
}

describe("persisted commit metadata", () => {
	describe("Reading", () => {
		it("is readable on the local client immediately", () => {
			const provider = new TestTreeProviderLite(1, makeFactory());
			const view = asAlpha(provider.trees[0].viewWith(config));
			view.initialize([]);

			view.runTransaction(
				() => {
					view.root.insertAtEnd("a");
				},
				{ persistedMetadata: { tag: "first" } },
			);

			assert.deepEqual(headMetadata(view.branchHistory), { tag: "first" });
		});

		it("is undefined for commits that were never annotated", () => {
			const provider = new TestTreeProviderLite(1, makeFactory());
			const view = asAlpha(provider.trees[0].viewWith(config));
			view.initialize([]);

			view.root.insertAtEnd("a");

			assert.equal(headMetadata(view.branchHistory), undefined);
		});

		it("stays with its own commit as later commits are added", () => {
			const provider = new TestTreeProviderLite(1, makeFactory());
			const view = asAlpha(provider.trees[0].viewWith(config));
			view.initialize([]);

			view.runTransaction(
				() => {
					view.root.insertAtEnd("a");
				},
				{ persistedMetadata: { tag: "first" } },
			);
			// An unannotated edit in between, to check that the metadata does not "slide" onto it.
			view.root.insertAtEnd("b");
			view.runTransaction(
				() => {
					view.root.insertAtEnd("c");
				},
				{ persistedMetadata: { tag: "second" } },
			);

			const head = view.branchHistory.getHead();
			assert(head !== undefined);
			assert.deepEqual(head.persistedMetadata, { tag: "second" });
			const parent = head.getParent();
			assert(parent !== undefined);
			assert.equal(parent.persistedMetadata, undefined);
			const grandparent = parent.getParent();
			assert(grandparent !== undefined);
			assert.deepEqual(grandparent.persistedMetadata, { tag: "first" });
		});
	});

	describe("Replication", () => {
		it("replicates to a peer and is readable there after synchronization", () => {
			const provider = new TestTreeProviderLite(2, makeFactory());
			const view1 = asAlpha(provider.trees[0].viewWith(config));
			view1.initialize([]);
			provider.synchronizeMessages();
			const view2 = asAlpha(provider.trees[1].viewWith(config));

			view1.runTransaction(
				() => {
					view1.root.insertAtEnd("a");
				},
				{ persistedMetadata: { tag: "from-peer-1" } },
			);
			provider.synchronizeMessages();

			assert.deepEqual(headMetadata(view2.branchHistory), { tag: "from-peer-1" });
		});

		it("survives rebase over a concurrent remote commit", () => {
			const provider = new TestTreeProviderLite(2, makeFactory());
			const view1 = asAlpha(provider.trees[0].viewWith(config));
			view1.initialize([]);
			provider.synchronizeMessages();
			const view2 = asAlpha(provider.trees[1].viewWith(config));

			// Submit the remote edit first so that it is sequenced ahead of the local annotated commit,
			// forcing the local commit to be rebased. This is the regression test for the commit rebuild
			// sites in `mintCommit` and `rebaseBranch`.
			view2.root.insertAtStart("remote");
			view1.runTransaction(
				() => {
					view1.root.insertAtEnd("local");
				},
				{ persistedMetadata: { tag: "rebased" } },
			);
			provider.synchronizeMessages();

			assert.deepEqual(headMetadata(view1.branchHistory), { tag: "rebased" });
			assert.deepEqual(headMetadata(view2.branchHistory), { tag: "rebased" });
		});

		it("survives a disconnect and reconnect", () => {
			const provider = new TestTreeProviderLite(2, makeFactory());
			const view1 = asAlpha(provider.trees[0].viewWith(config));
			view1.initialize([]);
			provider.synchronizeMessages();
			const view2 = asAlpha(provider.trees[1].viewWith(config));

			provider.trees[0].containerRuntime.connected = false;
			view1.runTransaction(
				() => {
					view1.root.insertAtEnd("a");
				},
				{ persistedMetadata: { tag: "resubmitted" } },
			);
			// Reconnecting resubmits the pending commit through `reSubmitCore`.
			provider.trees[0].containerRuntime.connected = true;
			provider.synchronizeMessages();

			assert.deepEqual(headMetadata(view1.branchHistory), { tag: "resubmitted" });
			assert.deepEqual(headMetadata(view2.branchHistory), { tag: "resubmitted" });
		});
	});

	describe("Branches", () => {
		it("is readable after a fork is merged into the main branch, and reaches a peer", () => {
			const provider = new TestTreeProviderLite(2, makeFactory());
			const view1 = asAlpha(provider.trees[0].viewWith(config));
			view1.initialize([]);
			provider.synchronizeMessages();
			const view2 = asAlpha(provider.trees[1].viewWith(config));

			const fork = view1.fork();
			fork.runTransaction(
				() => {
					fork.root.insertAtEnd("a");
				},
				{ persistedMetadata: { tag: "made-on-fork" } },
			);
			// The metadata is on the fork's commit before it is merged anywhere.
			assert.deepEqual(headMetadata(fork.branchHistory), { tag: "made-on-fork" });

			view1.merge(fork);
			assert.deepEqual(headMetadata(view1.branchHistory), { tag: "made-on-fork" });

			provider.synchronizeMessages();
			assert.deepEqual(headMetadata(view2.branchHistory), { tag: "made-on-fork" });
		});

		it("is still readable after the fork it was created on is disposed", () => {
			const provider = new TestTreeProviderLite(1, makeFactory());
			const view = asAlpha(provider.trees[0].viewWith(config));
			view.initialize([]);

			const fork = view.fork();
			fork.runTransaction(
				() => {
					fork.root.insertAtEnd("a");
				},
				{ persistedMetadata: { tag: "outlives-fork" } },
			);
			view.merge(fork);
			fork.dispose();

			assert.deepEqual(headMetadata(view.branchHistory), { tag: "outlives-fork" });
		});
	});

	describe("Transactions that produce no commit", () => {
		it("discards the metadata of a transaction that makes no changes, without throwing", () => {
			const provider = new TestTreeProviderLite(1, makeFactory());
			const view = asAlpha(provider.trees[0].viewWith(config));
			view.initialize([]);
			const before = view.branchHistory.length;

			view.runTransaction(() => {}, { persistedMetadata: { tag: "no-change" } });

			assert.equal(view.branchHistory.length, before);
			assert.equal(headMetadata(view.branchHistory), undefined);
		});

		it("discards the metadata of a transaction that is rolled back, without throwing", () => {
			const provider = new TestTreeProviderLite(1, makeFactory());
			const view = asAlpha(provider.trees[0].viewWith(config));
			view.initialize([]);
			const before = view.branchHistory.length;

			const result = view.runTransaction(
				() => {
					view.root.insertAtEnd("a");
					return { rollback: true } as const;
				},
				{ persistedMetadata: { tag: "rolled-back" } },
			);

			assert.equal(result.success, false);
			assert.equal(view.branchHistory.length, before);
			assert.equal(headMetadata(view.branchHistory), undefined);
			assert.deepEqual([...view.root], []);
		});
	});

	describe("Nested transactions", () => {
		it("resolve to the outermost transaction's metadata", () => {
			const provider = new TestTreeProviderLite(1, makeFactory());
			const view = asAlpha(provider.trees[0].viewWith(config));
			view.initialize([]);

			view.runTransaction(
				() => {
					view.runTransaction(
						() => {
							view.root.insertAtEnd("a");
						},
						{ persistedMetadata: { tag: "inner" } },
					);
				},
				{ persistedMetadata: { tag: "outer" } },
			);

			assert.deepEqual(headMetadata(view.branchHistory), { tag: "outer" });
		});

		it("use the outermost metadata even when only the inner transaction supplies it", () => {
			const provider = new TestTreeProviderLite(1, makeFactory());
			const view = asAlpha(provider.trees[0].viewWith(config));
			view.initialize([]);

			view.runTransaction(() => {
				view.runTransaction(
					() => {
						view.root.insertAtEnd("a");
					},
					{ persistedMetadata: { tag: "inner" } },
				);
			});

			assert.equal(headMetadata(view.branchHistory), undefined);
		});
	});

	describe("Persistence", () => {
		/**
		 * Creates two connected trees and sequences enough edits that the collaboration window advances
		 * past the annotated one.
		 */
		function generateHistory(factory: IChannelFactory<ITree>): TestTreeProviderLite {
			const provider = new TestTreeProviderLite(2, factory);
			const view1 = asAlpha(provider.trees[0].viewWith(config));
			view1.initialize([]);
			provider.synchronizeMessages();
			const view2 = asAlpha(provider.trees[1].viewWith(config));

			view1.runTransaction(
				() => {
					view1.root.insertAtEnd("annotated");
				},
				{ persistedMetadata: { tag: "old" } },
			);
			provider.synchronizeMessages();

			for (let i = 0; i < 10; ++i) {
				view1.root.insertAtStart("");
			}
			provider.synchronizeMessages();

			// These two edits have ref numbers corresponding to the last of the above edits, which advances
			// the collaboration window past the annotated commit.
			view1.root.insertAtStart("");
			view2.root.insertAtStart("");
			provider.synchronizeMessages();
			return provider;
		}

		it("survives a summary round trip to a freshly loaded client", async () => {
			const factory = makeFactory({ retainHistory: true });
			const provider = generateHistory(factory);
			const tree = provider.trees[0];

			const loaded = await loadFreshClient(tree, factory, provider.getCompressor(tree));

			assert.deepEqual(tags(loaded.kernel.checkout.branchHistory), ["old"]);
		});

		it("is dropped once its commit is trimmed from the trunk", async () => {
			const factory = makeFactory({ retainHistory: false });
			const provider = generateHistory(factory);
			const tree = provider.trees[0];

			// The annotated commit fell out of the collaboration window, so it is gone in memory...
			assert.deepEqual(tags(tree.kernel.checkout.branchHistory), []);

			// ...and it is not written to the summary either.
			const loaded = await loadFreshClient(tree, factory, provider.getCompressor(tree));
			assert.deepEqual(tags(loaded.kernel.checkout.branchHistory), []);
		});

		it("loads a summary written before the feature was enabled and reads back undefined", async () => {
			// A client whose configured oldest supported version predates v7 writes no metadata,
			// even though the application supplies it.
			const oldFactory = makeFactory({
				retainHistory: true,
				minVersionForCollab: FluidClientVersion.v2_80,
			});
			const provider = generateHistory(oldFactory);
			const tree = provider.trees[0];

			// Loading with a factory that understands the new field must still succeed.
			const newFactory = makeFactory({ retainHistory: true });
			const loaded = await loadFreshClient(tree, newFactory, provider.getCompressor(tree));

			const history = loaded.kernel.checkout.branchHistory;
			assert(history.length > 0, "The summary should contain commits");
			assert.deepEqual(
				allMetadata(history).filter((m) => m !== undefined),
				[],
				"Every commit in a pre-feature summary should read back undefined",
			);
		});

		it("is not replicated when the configured oldest supported version predates the feature", () => {
			const provider = new TestTreeProviderLite(
				2,
				makeFactory({ minVersionForCollab: FluidClientVersion.v2_80 }),
			);
			const view1 = asAlpha(provider.trees[0].viewWith(config));
			view1.initialize([]);
			provider.synchronizeMessages();
			const view2 = asAlpha(provider.trees[1].viewWith(config));

			view1.runTransaction(
				() => {
					view1.root.insertAtEnd("a");
				},
				{ persistedMetadata: { tag: "not-written" } },
			);
			provider.synchronizeMessages();

			// The metadata is still on the local commit in memory...
			assert.deepEqual(headMetadata(view1.branchHistory), { tag: "not-written" });
			// ...but it was never written to the op, so the peer does not see it.
			assert.equal(headMetadata(view2.branchHistory), undefined);
		});

		it("is recovered from trailing ops by a client that loads from an older summary", async () => {
			const provider = await TestTreeProvider.create(
				1,
				SummarizeType.onDemand,
				new SharedTreeTestFactory(() => {}, undefined, {
					minVersionForCollab: FluidClientVersion.v3_0,
					retainHistory: true,
				}),
			);
			const view1 = asAlpha(provider.trees[0].viewWith(config));
			view1.initialize([]);
			view1.runTransaction(
				() => {
					view1.root.insertAtEnd("summarized");
				},
				{ persistedMetadata: { tag: "in-summary" } },
			);
			await provider.ensureSynchronized();

			// This summary contains the commit annotated above.
			await provider.summarize();
			await provider.ensureSynchronized();

			// A later annotated edit, which is sequenced after the summary and is therefore a
			// trailing op for any client that loads from it.
			view1.runTransaction(
				() => {
					view1.root.insertAtEnd("trailing");
				},
				{ persistedMetadata: { tag: "trailing" } },
			);
			await provider.ensureSynchronized();

			// This client loads the summary and then replays the trailing op.
			const loadedTree = await provider.createTree();
			await provider.ensureSynchronized();
			const loadedView = asAlpha(loadedTree.viewWith(config));

			assert.deepEqual([...loadedView.root], ["summarized", "trailing"]);
			assert.deepEqual(tags(loadedView.branchHistory), ["trailing", "in-summary"]);
		});

		it("survives the stashed op round trip", async () => {
			const provider = await TestTreeProvider.create(
				2,
				SummarizeType.disabled,
				new SharedTreeTestFactory(() => {}, undefined, {
					minVersionForCollab: FluidClientVersion.v3_0,
				}),
			);
			const view1 = asAlpha(provider.trees[0].viewWith(config));
			view1.initialize([]);
			await provider.ensureSynchronized();

			// Pause the container so the annotated edit is left pending rather than sequenced.
			const pausedContainer: IContainer = provider.containers[0];
			await provider.opProcessingController.pauseProcessing(pausedContainer);
			view1.runTransaction(
				() => {
					view1.root.insertAtEnd("stashed");
				},
				{ persistedMetadata: { tag: "stashed" } },
			);
			const pendingOps = await getRequiredPendingLocalState(pausedContainer);
			pausedContainer.close();
			provider.opProcessingController.resumeProcessing();

			// Rehydrate the pending state on a new container, which routes through `applyStashedOp`.
			const loadedContainer = await provider.loadTestContainer(
				undefined,
				undefined,
				pendingOps,
			);
			const dataStore = (await loadedContainer.getEntryPoint()) as TestFluidObjectInternal;
			const tree = await dataStore.getInitialSharedObject("TestSharedTree");
			assert(SharedTreeKind.is(tree));
			const view = asAlpha(tree.viewWith(config));
			await waitForContainerConnection(loadedContainer, true);
			await provider.ensureSynchronized();

			assert.deepEqual([...view.root], ["stashed"]);
			assert.deepEqual(headMetadata(view.branchHistory), { tag: "stashed" });
		});
	});

	describe("Rollback", () => {
		it("is removed along with its commit when the op is rolled back", () => {
			const factory = makeFactory();
			const runtimeFactory = new MockContainerRuntimeFactory({
				flushMode: FlushMode.TurnBased,
			});
			const runtime = new MockFluidDataStoreRuntime({
				idCompressor: createIdCompressor(),
			});
			const containerRuntime = runtimeFactory.createContainerRuntime(runtime);
			const tree = factory.create(runtime, "tree");
			tree.connect({
				deltaConnection: runtime.createDeltaConnection(),
				objectStorage: new MockStorage(),
			});
			const view = asAlpha(tree.viewWith(config));
			view.initialize([]);
			containerRuntime.flush();
			runtimeFactory.processAllMessages();

			const before = view.branchHistory.length;
			view.runTransaction(
				() => {
					view.root.insertAtEnd("a");
				},
				{ persistedMetadata: { tag: "rolled-back-op" } },
			);
			assert.deepEqual(headMetadata(view.branchHistory), { tag: "rolled-back-op" });

			// Rolling back removes the commit from the local branch, and the metadata goes with it.
			containerRuntime.rollback?.();

			assert.equal(view.branchHistory.length, before);
			assert.equal(headMetadata(view.branchHistory), undefined);
			assert.deepEqual([...view.root], []);
		});
	});
});
