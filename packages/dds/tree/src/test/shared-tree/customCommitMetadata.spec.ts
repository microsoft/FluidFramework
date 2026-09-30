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
import {
	createIdCompressor,
	SerializationVersion,
} from "@fluidframework/id-compressor/internal";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
	validateUsageError,
} from "@fluidframework/test-runtime-utils/internal";
import {
	getRequiredPendingLocalState,
	type TestFluidObjectInternal,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { asAlpha } from "../../api.js";
import type { SchematizingSimpleTreeView } from "../../shared-tree/index.js";
import { FluidClientVersion } from "../../codec/index.js";
import { type RevertibleAlpha, RevertibleStatus } from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	TreeViewConfiguration,
	type ITree,
	type TreeBranchHistory,
	type TreeViewAlpha,
} from "../../simple-tree/index.js";
import {
	configuredSharedTree,
	SharedTree as SharedTreeKind,
	type ISharedTree,
} from "../../treeFactory.js";
import type { JsonCompatibleReadOnlyObject } from "../../util/index.js";
import {
	createTestUndoRedoStacks,
	getView,
	SharedTreeTestFactory,
	StringArray,
	SummarizeType,
	TestTreeProvider,
	TestTreeProviderLite,
} from "../utils.js";

const config = new TreeViewConfiguration({ schema: StringArray });

interface MetadataOptions {
	readonly retainHistory?: boolean;
	readonly minVersionForCollab?: (typeof FluidClientVersion)[keyof typeof FluidClientVersion];
}

/** A factory whose defaults enable persisted commit metadata. */
function makeFactory(options: MetadataOptions = {}): IChannelFactory<ITree> {
	return configuredSharedTree({
		jsonValidator: FormatValidatorBasic,
		minVersionForCollab: options.minVersionForCollab ?? FluidClientVersion.v2_117,
		retainHistory: options.retainHistory ?? false,
	}).getFactory();
}

/**
 * An initialized standalone view.
 * @remarks Sufficient for everything that does not involve replication or persistence.
 */
function createView(): SchematizingSimpleTreeView<typeof StringArray> {
	const view = getView(config, { minVersionForCollab: FluidClientVersion.v2_117 });
	view.initialize([]);
	return view;
}

/** `count` connected trees, with an initialized view on each. */
function createConnectedViews(
	count: number,
	options: MetadataOptions = {},
): { provider: TestTreeProviderLite; views: TreeViewAlpha<typeof StringArray>[] } {
	const provider = new TestTreeProviderLite(count, makeFactory(options));
	const first = asAlpha(provider.trees[0].viewWith(config));
	first.initialize([]);
	provider.synchronizeMessages();
	return {
		provider,
		views: [first, ...provider.trees.slice(1).map((t) => asAlpha(t.viewWith(config)))],
	};
}

/** The metadata of the branch's head commit. */
function headMetadata(history: TreeBranchHistory): JsonCompatibleReadOnlyObject | undefined {
	return history.getHead()?.custom;
}

/** The metadata of every commit in the branch's history, ordered from newest to oldest. */
function allMetadata(
	history: TreeBranchHistory,
): (JsonCompatibleReadOnlyObject | undefined)[] {
	const metadata: (JsonCompatibleReadOnlyObject | undefined)[] = [];
	for (let commit = history.getHead(); commit !== undefined; commit = commit.getParent()) {
		metadata.push(commit.custom);
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

describe("custom commit metadata", () => {
	describe("Reading", () => {
		it("is readable on the commit it was attached to, and undefined on other commits", () => {
			const view = createView();

			view.runTransaction(
				() => {
					view.root.insertAtEnd("a");
				},
				{ customMetadata: { tag: "first" } },
			);
			// An unannotated edit in between, to check that the metadata does not "slide" onto it.
			view.root.insertAtEnd("b");
			view.runTransaction(
				() => {
					view.root.insertAtEnd("c");
				},
				{ customMetadata: { tag: "second" } },
			);

			assert.deepEqual(allMetadata(view.branchHistory).slice(0, 3), [
				{ tag: "second" },
				undefined,
				{ tag: "first" },
			]);
		});

		it("is readable as a single-node tree for an un-nested transaction", () => {
			const view = createView();

			view.runTransaction(
				() => {
					view.root.insertAtEnd("a");
				},
				{ customMetadata: { tag: "first" } },
			);

			assert.deepEqual(view.branchHistory.getHead()?.customTree, {
				metadata: { tag: "first" },
				children: [],
			});
		});

		it("has an undefined tree exactly when it has no flattened metadata", () => {
			const view = createView();

			view.root.insertAtEnd("a");

			const head = view.branchHistory.getHead();
			assert.equal(head?.custom, undefined);
			assert.equal(head?.customTree, undefined);
		});

		it("distinguishes an empty metadata object from an unannotated commit", () => {
			// Guards against the encoder using a truthiness check rather than an `undefined` check,
			// which would drop an empty object on the way to the peer.
			const {
				provider,
				views: [view1, view2],
			} = createConnectedViews(2);

			view1.runTransaction(
				() => {
					view1.root.insertAtEnd("a");
				},
				{ customMetadata: {} },
			);
			provider.synchronizeMessages();

			assert.deepEqual(headMetadata(view1.branchHistory), {});
			assert.deepEqual(headMetadata(view2.branchHistory), {});
		});
	});

	describe("Replication", () => {
		it("replicates to a peer and is readable there after synchronization", () => {
			const {
				provider,
				views: [view1, view2],
			} = createConnectedViews(2);

			view1.runTransaction(
				() => {
					view1.root.insertAtEnd("a");
				},
				{ customMetadata: { tag: "from-peer-1" } },
			);
			provider.synchronizeMessages();

			assert.deepEqual(headMetadata(view2.branchHistory), { tag: "from-peer-1" });
		});

		it("survives rebase over a concurrent remote commit", () => {
			const {
				provider,
				views: [view1, view2],
			} = createConnectedViews(2);

			// Submit the remote edit first so that it is sequenced ahead of the local annotated commit,
			// forcing the local commit to be rebased. This is the regression test for the commit rebuild
			// sites in `mintCommit` and `rebaseBranch`.
			view2.root.insertAtStart("remote");
			view1.runTransaction(
				() => {
					view1.root.insertAtEnd("local");
				},
				{ customMetadata: { tag: "rebased" } },
			);
			provider.synchronizeMessages();

			assert.deepEqual(headMetadata(view1.branchHistory), { tag: "rebased" });
			assert.deepEqual(headMetadata(view2.branchHistory), { tag: "rebased" });
		});

		it("survives a disconnect and reconnect", () => {
			const {
				provider,
				views: [view1, view2],
			} = createConnectedViews(2);

			provider.trees[0].containerRuntime.connected = false;
			view1.runTransaction(
				() => {
					view1.root.insertAtEnd("a");
				},
				{ customMetadata: { tag: "resubmitted" } },
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
			const {
				provider,
				views: [view1, view2],
			} = createConnectedViews(2);

			const fork = view1.fork();
			fork.runTransaction(
				() => {
					fork.root.insertAtEnd("a");
				},
				{ customMetadata: { tag: "made-on-fork" } },
			);
			// The metadata is on the fork's commit before it is merged anywhere.
			assert.deepEqual(headMetadata(fork.branchHistory), { tag: "made-on-fork" });

			view1.merge(fork);
			assert.deepEqual(headMetadata(view1.branchHistory), { tag: "made-on-fork" });

			provider.synchronizeMessages();
			assert.deepEqual(headMetadata(view2.branchHistory), { tag: "made-on-fork" });
		});

		it("is still readable after the fork it was created on is disposed", () => {
			const view = createView();

			const fork = view.fork();
			fork.runTransaction(
				() => {
					fork.root.insertAtEnd("a");
				},
				{ customMetadata: { tag: "outlives-fork" } },
			);
			view.merge(fork);
			fork.dispose();

			assert.deepEqual(headMetadata(view.branchHistory), { tag: "outlives-fork" });
		});
	});

	describe("Transactions", () => {
		it("is attached by runTransactionAsync as well", async () => {
			const view = createView();

			await view.runTransactionAsync(
				// eslint-disable-next-line @typescript-eslint/require-await
				async () => {
					view.root.insertAtEnd("a");
				},
				{ customMetadata: { tag: "async" } },
			);

			assert.deepEqual(headMetadata(view.branchHistory), { tag: "async" });
		});

		it("discards the metadata of a transaction that makes no changes, without throwing", () => {
			const view = createView();
			const before = view.branchHistory.length;

			view.runTransaction(() => {}, { customMetadata: { tag: "no-change" } });

			assert.equal(view.branchHistory.length, before);
		});

		it("discards the metadata of a transaction that is rolled back, without throwing", () => {
			const view = createView();
			const before = view.branchHistory.length;

			const result = view.runTransaction(
				() => {
					view.root.insertAtEnd("a");
					return { rollback: true } as const;
				},
				{ customMetadata: { tag: "rolled-back" } },
			);

			assert.equal(result.success, false);
			assert.equal(view.branchHistory.length, before);
			assert.deepEqual([...view.root], []);
		});
	});

	describe("Nested transactions", () => {
		it("merge, with the outermost transaction winning on conflicting properties", () => {
			const view = createView();

			view.runTransaction(
				() => {
					view.runTransaction(
						() => {
							view.runTransaction(
								() => {
									view.root.insertAtEnd("a");
								},
								{ customMetadata: { innermost: 3, shared: "innermost" } },
							);
						},
						{ customMetadata: { middle: 2, shared: "middle" } },
					);
				},
				{ customMetadata: { outermost: 1, shared: "outermost" } },
			);

			assert.deepEqual(headMetadata(view.branchHistory), {
				innermost: 3,
				middle: 2,
				outermost: 1,
				shared: "outermost",
			});
		});

		it("are also readable as a tree mirroring the transaction nesting", () => {
			const view = createView();

			view.runTransaction(
				() => {
					view.runTransaction(
						() => {
							view.root.insertAtEnd("a");
						},
						{ customMetadata: { tag: "first-child" } },
					);
					view.runTransaction(
						() => {
							view.root.insertAtEnd("b");
						},
						{ customMetadata: { tag: "second-child" } },
					);
				},
				{ customMetadata: { tag: "outer" } },
			);

			assert.deepEqual(view.branchHistory.getHead()?.customTree, {
				metadata: { tag: "outer" },
				children: [
					{ metadata: { tag: "first-child" }, children: [] },
					{ metadata: { tag: "second-child" }, children: [] },
				],
			});
		});

		it("include a node for an unannotated transaction that contains an annotated one", () => {
			const view = createView();

			view.runTransaction(() => {
				view.runTransaction(
					() => {
						view.root.insertAtEnd("a");
					},
					{ customMetadata: { tag: "inner" } },
				);
			});

			assert.deepEqual(view.branchHistory.getHead()?.customTree, {
				metadata: undefined,
				children: [{ metadata: { tag: "inner" }, children: [] }],
			});
			// The flattened view still surfaces the inner metadata.
			assert.deepEqual(headMetadata(view.branchHistory), { tag: "inner" });
		});

		it("do not contribute metadata from a nested transaction that was rolled back", () => {
			const view = createView();

			view.runTransaction(
				() => {
					view.root.insertAtEnd("kept");
					view.runTransaction(
						() => {
							view.root.insertAtEnd("discarded");
							return { rollback: true } as const;
						},
						{ customMetadata: { discarded: true } },
					);
				},
				{ customMetadata: { tag: "outer" } },
			);

			assert.deepEqual(headMetadata(view.branchHistory), { tag: "outer" });
			// The rolled back transaction leaves no node behind either.
			assert.deepEqual(view.branchHistory.getHead()?.customTree, {
				metadata: { tag: "outer" },
				children: [],
			});
			assert.deepEqual([...view.root], ["kept"]);
		});
	});

	describe("Value handling", () => {
		it("snapshots the value so later mutation of the caller's object does not change the commit", () => {
			const view = createView();
			const supplied = { tag: "original", nested: { count: 1 } };

			view.runTransaction(
				() => {
					view.root.insertAtEnd("a");
				},
				{ customMetadata: supplied },
			);
			supplied.tag = "mutated";
			supplied.nested.count = 99;

			assert.deepEqual(headMetadata(view.branchHistory), {
				tag: "original",
				nested: { count: 1 },
			});
		});

		it("normalizes values with no JSON representation so local and replicated values agree", () => {
			const {
				provider,
				views: [view1, view2],
			} = createConnectedViews(2);

			view1.runTransaction(
				() => {
					view1.root.insertAtEnd("a");
				},
				{
					customMetadata: {
						notFinite: Number.NaN,
						alsoNotFinite: Number.POSITIVE_INFINITY,
						missing: undefined,
						kept: "value",
					},
				},
			);
			provider.synchronizeMessages();

			const expected = { notFinite: null, alsoNotFinite: null, kept: "value" };
			// The local read must match exactly what the peer sees, rather than the pre-JSON value.
			assert.deepEqual(headMetadata(view1.branchHistory), expected);
			assert.deepEqual(headMetadata(view2.branchHistory), expected);
		});

		it("preserves a valid '__proto__' key as an own property rather than a prototype", () => {
			const view = createView();

			view.runTransaction(
				() => {
					view.root.insertAtEnd("a");
				},
				{
					// `__proto__` is a legal JSON key, and a peer could send one.
					customMetadata: JSON.parse(
						'{"__proto__":{"polluted":true},"safe":1}',
					) as JsonCompatibleReadOnlyObject,
				},
			);

			const custom = headMetadata(view.branchHistory);
			assert(custom !== undefined);
			assert.equal(Object.hasOwn(custom, "__proto__"), true);
			assert.equal((custom as Record<string, unknown>).polluted, undefined);
			assert.equal(custom.safe, 1);
		});

		it("throws a UsageError for metadata that cannot be serialized", () => {
			const view = createView();
			const cyclic: Record<string, unknown> = {};
			cyclic.self = cyclic;

			assert.throws(
				() =>
					view.runTransaction(
						() => {
							view.root.insertAtEnd("a");
						},
						{ customMetadata: cyclic as JsonCompatibleReadOnlyObject },
					),
				validateUsageError(/must be JSON-serializable/),
			);
		});

		it("throws a UsageError for metadata that is not a JSON object", () => {
			const view = createView();

			assert.throws(
				() =>
					view.runTransaction(
						() => {
							view.root.insertAtEnd("a");
						},
						{
							customMetadata: ["not an object"] as unknown as JsonCompatibleReadOnlyObject,
						},
					),
				validateUsageError(/must be a JSON object/),
			);
		});
	});

	describe("Reverts", () => {
		/** Creates a view with one annotated commit, and returns the revertible for it. */
		function createViewWithRevertibleEdit(): {
			view: ReturnType<typeof createView>;
			revertible: RevertibleAlpha;
			unsubscribe: () => void;
		} {
			const view = createView();
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
			view.runTransaction(
				() => {
					view.root.insertAtEnd("a");
				},
				{ customMetadata: { tag: "original" } },
			);
			const revertible = undoStack.pop();
			assert(revertible !== undefined);
			return { view, revertible, unsubscribe };
		}

		it("do not inherit the metadata of the commit they revert", () => {
			const { view, revertible, unsubscribe } = createViewWithRevertibleEdit();

			revertible.revert();

			assert.deepEqual(allMetadata(view.branchHistory).slice(0, 2), [
				undefined,
				{ tag: "original" },
			]);
			unsubscribe();
		});

		it("can be given their own metadata", () => {
			const { view, revertible, unsubscribe } = createViewWithRevertibleEdit();

			revertible.revert({ customMetadata: { tag: "the-revert" } });

			assert.deepEqual([...view.root], []);
			assert.deepEqual(tags(view.branchHistory), ["the-revert", "original"]);
			unsubscribe();
		});

		it("can be given metadata without disposing the revertible", () => {
			const { view, revertible, unsubscribe } = createViewWithRevertibleEdit();

			revertible.revert({ dispose: false, customMetadata: { tag: "the-revert" } });

			assert.equal(revertible.status, RevertibleStatus.Valid);
			assert.deepEqual(headMetadata(view.branchHistory), { tag: "the-revert" });
			unsubscribe();
		});

		it("still inherit the reverted commit's labels", () => {
			const view = createView();
			const labels: unknown[] = [];
			view.events.on("changed", (metadata) => {
				if (metadata.isLocal) {
					labels.push([...metadata.labels]);
				}
			});
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(view.events);

			view.runTransaction(
				() => {
					view.root.insertAtEnd("a");
				},
				{ label: "original" },
			);
			const revertible = undoStack.pop();
			assert(revertible !== undefined);

			revertible.revert({ customMetadata: { tag: "the-revert" } });

			assert.deepEqual(labels[labels.length - 1], ["original"]);
			assert.deepEqual(headMetadata(view.branchHistory), { tag: "the-revert" });
			unsubscribe();
		});

		it("validate their metadata like any other commit", () => {
			const { revertible, unsubscribe } = createViewWithRevertibleEdit();

			assert.throws(
				() =>
					revertible.revert({
						customMetadata: [] as unknown as JsonCompatibleReadOnlyObject,
					}),
				validateUsageError(/must be a JSON object/),
			);
			unsubscribe();
		});
	});

	describe("revertTo", () => {
		it("attaches metadata to the commit it produces", () => {
			const view = createView();
			const revision = view.branchHistory.getHead()?.revision;
			assert(revision !== undefined);

			view.root.insertAtEnd("a");
			view.revertTo(revision, { customMetadata: { tag: "the-revert" } });

			assert.deepEqual([...view.root], []);
			assert.deepEqual(headMetadata(view.branchHistory), { tag: "the-revert" });
		});
	});

	describe("Persistence", () => {
		/**
		 * Creates two connected trees and sequences enough edits that the collaboration window advances
		 * past the annotated one.
		 */
		function generateHistory(options: MetadataOptions): TestTreeProviderLite {
			const {
				provider,
				views: [view1, view2],
			} = createConnectedViews(2, options);

			view1.runTransaction(
				() => {
					view1.root.insertAtEnd("annotated");
				},
				{ customMetadata: { tag: "old" } },
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
			const options = { retainHistory: true };
			const provider = generateHistory(options);
			const tree = provider.trees[0];

			const loaded = await loadFreshClient(
				tree,
				makeFactory(options),
				provider.getCompressor(tree),
			);

			assert.deepEqual(tags(loaded.kernel.checkout.branchHistory), ["old"]);
		});

		it("is dropped from the trunk and from the summary when its commit is trimmed", async () => {
			const options = { retainHistory: false };
			const provider = generateHistory(options);
			const tree = provider.trees[0];

			// The annotated commit fell out of the collaboration window, so it is gone in memory...
			assert.deepEqual(tags(tree.kernel.checkout.branchHistory), []);

			// ...and it is not written to the summary either.
			const loaded = await loadFreshClient(
				tree,
				makeFactory(options),
				provider.getCompressor(tree),
			);
			assert.deepEqual(tags(loaded.kernel.checkout.branchHistory), []);
		});

		it("loads a summary written before the feature was enabled and reads back undefined", async () => {
			// A client whose configured oldest supported version predates v7 writes no metadata,
			// even though the application supplies it.
			const provider = generateHistory({
				retainHistory: true,
				minVersionForCollab: FluidClientVersion.v2_80,
			});
			const tree = provider.trees[0];

			// Loading with a factory that understands the new field must still succeed.
			const loaded = await loadFreshClient(
				tree,
				makeFactory({ retainHistory: true }),
				provider.getCompressor(tree),
			);

			const history = loaded.kernel.checkout.branchHistory;
			assert(history.length > 0, "The summary should contain commits");
			assert.deepEqual(
				allMetadata(history).filter((m) => m !== undefined),
				[],
				"Every commit in a pre-feature summary should read back undefined",
			);
		});

		it("is not replicated when the configured oldest supported version predates the feature", () => {
			const {
				provider,
				views: [view1, view2],
			} = createConnectedViews(2, { minVersionForCollab: FluidClientVersion.v2_80 });

			view1.runTransaction(
				() => {
					view1.root.insertAtEnd("a");
				},
				{ customMetadata: { tag: "not-written" } },
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
					minVersionForCollab: FluidClientVersion.v2_117,
					retainHistory: true,
				}),
			);
			const view1 = asAlpha(provider.trees[0].viewWith(config));
			view1.initialize([]);
			view1.runTransaction(
				() => {
					view1.root.insertAtEnd("summarized");
				},
				{ customMetadata: { tag: "in-summary" } },
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
				{ customMetadata: { tag: "trailing" } },
			);
			await provider.ensureSynchronized();

			// This client loads the summary and then replays the trailing op.
			const loadedTree = await provider.createTree();
			await provider.ensureSynchronized();
			const loadedView = asAlpha(loadedTree.viewWith(config));

			assert.deepEqual(tags(loadedView.branchHistory), ["trailing", "in-summary"]);
		});

		it("survives the stashed op round trip", async () => {
			const provider = await TestTreeProvider.create(
				2,
				SummarizeType.disabled,
				new SharedTreeTestFactory(() => {}, undefined, {
					minVersionForCollab: FluidClientVersion.v2_117,
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
				{ customMetadata: { tag: "stashed" } },
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

	describe("Op rollback", () => {
		it("is removed along with its commit when the op is rolled back", () => {
			const runtimeFactory = new MockContainerRuntimeFactory({
				flushMode: FlushMode.TurnBased,
			});
			const runtime = new MockFluidDataStoreRuntime({
				idCompressor: createIdCompressor(SerializationVersion.V3),
			});
			const containerRuntime = runtimeFactory.createContainerRuntime(runtime);
			const tree = makeFactory().create(runtime, "tree");
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
				{ customMetadata: { tag: "rolled-back-op" } },
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
