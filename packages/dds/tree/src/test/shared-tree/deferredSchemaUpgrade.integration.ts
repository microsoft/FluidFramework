/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import { MockContainerRuntime } from "@fluidframework/test-runtime-utils/internal";

import { FluidClientVersion } from "../../codec/index.js";
import {
	CommitOutcome,
	RevertibleStatus,
	type GraphCommit,
	type Revertible,
	type RevisionTag,
	type TreeStoredSchema,
} from "../../core/index.js";
import {
	ForestTypeOptimized,
	type SharedTreeChange,
	type TreeCheckout,
} from "../../shared-tree/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	toUpgradeSchema,
} from "../../simple-tree/index.js";
import {
	expectSchemaEqual,
	SharedTreeTestFactory,
	TestTreeProviderLite,
	type SharedTreeWithContainerRuntime,
} from "../utils.js";

const factory = new SchemaFactory("deferredSchemaUpgrade");
class Note extends factory.object("Note", { text: factory.string }) {}
const oldSchema = factory.array("Root", factory.string);
const newSchema = factory.array("Root", [factory.string, Note]);
const oldConfig = new TreeViewConfiguration({ schema: oldSchema });
const newConfig = new TreeViewConfiguration({ schema: newSchema });

/**
 * Creates three synchronized clients and retains the base history for outcome assertions.
 * The caller disposes additional views before disposing the scenario.
 */
function createScenario(flushMode: FlushMode = FlushMode.Immediate) {
	const provider = new TestTreeProviderLite(
		3,
		new SharedTreeTestFactory(() => {}, undefined, {
			forest: ForestTypeOptimized,
			// The partial-outcome test uses a no-change constraint.
			minVersionForCollab: FluidClientVersion.v2_80,
		}),
		true,
		flushMode,
	);
	const [remoteTree, localTree] = provider.trees;
	const remote = remoteTree.kernel.viewWith(oldConfig);
	remote.initialize(["A", "B"]);
	provider.synchronizeMessages();
	const base = localTree.kernel.checkout;
	const retainedBase = base.mainBranch.fork();
	return {
		provider,
		remote,
		remoteTree,
		localTree,
		base,
		dispose: () => {
			retainedBase.dispose();
			if (!remote.disposed) {
				remote.dispose();
			}
		},
	};
}

/**
 * Records local commit identities and their independent settled outcomes.
 */
function trackLocalChanges(checkout: TreeCheckout) {
	const revisions: RevisionTag[] = [];
	const outcomes: { revision: RevisionTag; outcome: CommitOutcome }[] = [];
	const unsubscribe: (() => void)[] = [];
	unsubscribe.push(
		checkout.events.on("changed", (metadata) => {
			if (metadata.isLocal) {
				const revision = checkout.mainBranch.getHead().revision;
				revisions.push(revision);
				unsubscribe.push(
					metadata.events.on("settled", (outcome) => outcomes.push({ revision, outcome })),
				);
			}
		}),
	);
	return {
		revisions,
		outcomes,
		dispose: () => {
			for (const off of unsubscribe) {
				off();
			}
		},
	};
}

type DocumentItem = string | { text: string };

/**
 * Reads the fixture's content without a view that could become incompatible after rebase.
 */
function readDocument(tree: SharedTreeWithContainerRuntime): DocumentItem[] {
	const items = tree.kernel.contentSnapshot().tree[0]?.fields?.[""];
	assert(items !== undefined, "The test document must contain its root array.");
	return items.map((node) => {
		if (node.type === Note.identifier) {
			const text = node.fields?.text?.[0]?.value;
			assert(typeof text === "string", "A test Note must contain text.");
			return { text };
		}
		assert(typeof node.value === "string", "Other test items must be strings.");
		return node.value;
	});
}

/**
 * Checks all clients, including the third client which authored neither conflicting change.
 */
function expectConverged(
	provider: TestTreeProviderLite,
	expected: readonly DocumentItem[],
	schema: TreeStoredSchema,
): void {
	for (const tree of provider.trees) {
		assert.deepEqual(readDocument(tree), expected, `Content differs on ${tree.id}.`);
		expectSchemaEqual(tree.kernel.checkout.storedSchema, schema);
	}
}

/**
 * Exercises existing branch, runtime, and undo primitives for ordered schema/data publication.
 * These tests do not enable the deferred-upgrade API or implement its retry controller.
 */
describe("deferred schema upgrades: ordered publication", () => {
	it("keeps a private upgrade and aborted application edits off the base", () => {
		const scenario = createScenario();
		const { provider, base } = scenario;
		const baseHead = base.mainBranch.getHead();
		const view = base.fork().viewWith(newConfig);
		try {
			assert.equal(view.compatibility.canView, false);
			view.upgradeSchema();
			const schemaHead = view.checkout.mainBranch.getHead();
			const result = view.runTransaction(() => {
				view.root.insertAtEnd(new Note({ text: "cancelled" }));
				return { rollback: true };
			});

			assert.equal(result.success, false);
			assert.equal(view.checkout.mainBranch.getHead() === schemaHead, true);
			assert.equal(view.compatibility.isEquivalent, true);
			assert.deepEqual([...view.root], ["A", "B"]);
			assert.equal(base.mainBranch.getHead() === baseHead, true);
			expectSchemaEqual(base.storedSchema, toUpgradeSchema(oldSchema));
			assert.equal(provider.peekNextMessage(), undefined, "Private work submitted an op.");
		} finally {
			view.dispose();
			scenario.dispose();
		}
	});

	it("publishes original commits without replacing inserted nodes or republishing history", () => {
		const scenario = createScenario();
		const { provider, base } = scenario;
		const view = base.fork().viewWith(newConfig);
		const appended: GraphCommit<SharedTreeChange>[] = [];
		const off = base.mainBranch.events.on("beforeChange", (event) => {
			if (event.type === "append") {
				appended.push(...event.newCommits);
			}
		});
		try {
			view.upgradeSchema();
			const schemaRevision = view.checkout.mainBranch.getHead().revision;
			const note = new Note({ text: "local" });
			view.root.insertAtEnd(note);
			const dataRevision = view.checkout.mainBranch.getHead().revision;
			assert.equal(provider.peekNextMessage(), undefined);

			// Keep the source branch alive. Matching commit identities let it catch up without
			// undoing the insertion and rebuilding an equivalent but different application node.
			base.merge(view, false);
			provider.synchronizeMessages();
			view.checkout.synchronizeFrom(base);

			assert.deepEqual(
				appended.map((commit) => commit.revision),
				[schemaRevision, dataRevision],
			);
			assert.deepEqual(
				appended.map((commit) => commit.change.changes.map((change) => change.type)),
				[["schema"], ["data"]],
			);
			assert.equal(view.root.at(2) === note, true, "Publication replaced the inserted node.");

			note.text = "updated";
			base.merge(view, false);
			provider.synchronizeMessages();
			assert.equal(appended.length, 3, "A later edit republished the schema or insertion.");
			assert.equal(view.root.at(2) === note, true);
			expectConverged(provider, ["A", "B", { text: "updated" }], toUpgradeSchema(newSchema));
		} finally {
			off();
			view.dispose();
			scenario.dispose();
		}
	});

	it("uses native data undo and redo while retaining schema and node identity", () => {
		const scenario = createScenario();
		const { provider, base } = scenario;
		const view = base.fork().viewWith(newConfig);
		const revertibles: Revertible[] = [];
		const off = view.events.on("changed", (metadata) => {
			if (metadata.isLocal) {
				const revertible = metadata.getRevertible();
				if (revertible !== undefined) {
					revertibles.push(revertible);
				}
			}
		});
		try {
			view.upgradeSchema();
			assert.equal(revertibles.length, 0, "The schema-only edit must not provide data undo.");
			const note = new Note({ text: "undoable" });
			view.root.insertAtEnd(note);
			base.merge(view, false);
			provider.synchronizeMessages();
			view.checkout.synchronizeFrom(base);

			const undo = revertibles[0];
			assert(undo !== undefined, "The separate data commit must provide a revertible.");
			undo.revert();
			base.merge(view, false);
			provider.synchronizeMessages();
			expectConverged(provider, ["A", "B"], toUpgradeSchema(newSchema));

			// Reverting the undo restores the original removed node, using unmodified repair IDs.
			const redo = revertibles[1];
			assert(redo !== undefined, "Undo must provide a redo revertible.");
			redo.revert();
			base.merge(view, false);
			provider.synchronizeMessages();
			assert.equal(view.root.at(2) === note, true, "Redo replaced the retained Note.");
			expectConverged(provider, ["A", "B", { text: "undoable" }], toUpgradeSchema(newSchema));
		} finally {
			off();
			for (const revertible of revertibles) {
				if (revertible.status === RevertibleStatus.Valid) {
					revertible.dispose();
				}
			}
			view.dispose();
			scenario.dispose();
		}
	});

	for (const flushMode of [FlushMode.Immediate, FlushMode.TurnBased]) {
		describe(FlushMode[flushMode], () => {
			it("settles the schema before the following data commit", () => {
				const scenario = createScenario(flushMode);
				const { provider, base } = scenario;
				const local = base.viewWith(newConfig);
				const tracked = trackLocalChanges(base);
				try {
					local.upgradeSchema();
					local.root.insertAtEnd(new Note({ text: "local" }));
					provider.synchronizeMessages();

					assert.deepEqual(
						tracked.outcomes,
						tracked.revisions.map((revision) => ({
							revision,
							outcome: CommitOutcome.FullyApplied,
						})),
					);
					assert.equal(tracked.revisions.length, 2);
					expectConverged(provider, ["A", "B", { text: "local" }], toUpgradeSchema(newSchema));
				} finally {
					tracked.dispose();
					local.dispose();
					scenario.dispose();
				}
			});

			it("drops every following data commit when the schema loses to remote data", () => {
				const scenario = createScenario(flushMode);
				const { provider, remote, remoteTree, base } = scenario;
				const local = base.viewWith(newConfig);
				const tracked = trackLocalChanges(base);
				try {
					remote.root.insertAtStart("remote");
					// Sequence remote work first without delivering it to the local author yet.
					remoteTree.containerRuntime.flush();
					local.upgradeSchema();
					local.root.insertAtEnd(new Note({ text: "requires upgrade" }));
					local.root.insertAtEnd("valid under old schema");
					const retained = base.mainBranch.fork();
					const original = retained.getHead();
					try {
						provider.synchronizeMessages();

						assert.deepEqual(
							tracked.outcomes,
							tracked.revisions.map((revision) => ({
								revision,
								outcome: CommitOutcome.FullyDropped,
							})),
						);
						assert.equal(tracked.revisions.length, 3);
						expectConverged(provider, ["remote", "A", "B"], toUpgradeSchema(oldSchema));
						assert.equal(retained.getHead(), original);
						assert.equal(original.change.changes[0]?.type, "data", "Recovery lost its input.");
					} finally {
						retained.dispose();
					}
				} finally {
					tracked.dispose();
					local.dispose();
					scenario.dispose();
				}
			});

			it("still drops local data when an equivalent remote schema wins", () => {
				const scenario = createScenario(flushMode);
				const { provider, remote, remoteTree, base } = scenario;
				remote.dispose();
				const upgradedRemote = remoteTree.kernel.viewWith(newConfig);
				const local = base.viewWith(newConfig);
				const tracked = trackLocalChanges(base);
				try {
					upgradedRemote.upgradeSchema();
					remoteTree.containerRuntime.flush();
					local.upgradeSchema();
					local.root.insertAtEnd(new Note({ text: "needs recovery" }));
					provider.synchronizeMessages();

					// This is the current conservative rebase behavior, not a desired retry result.
					assert.equal(local.compatibility.canView, true);
					assert.deepEqual(
						tracked.outcomes.map(({ outcome }) => outcome),
						[CommitOutcome.FullyDropped, CommitOutcome.FullyDropped],
					);
					expectConverged(provider, ["A", "B"], toUpgradeSchema(newSchema));
				} finally {
					tracked.dispose();
					local.dispose();
					upgradedRemote.dispose();
					scenario.dispose();
				}
			});

			it("preserves schema/data order through reconnect", () => {
				const scenario = createScenario(flushMode);
				const { provider, localTree, base } = scenario;
				const local = base.viewWith(newConfig);
				const tracked = trackLocalChanges(base);
				try {
					localTree.containerRuntime.connected = false;
					local.upgradeSchema();
					local.root.insertAtEnd(new Note({ text: "offline" }));
					localTree.containerRuntime.connected = true;
					provider.synchronizeMessages();

					assert.deepEqual(
						tracked.outcomes,
						tracked.revisions.map((revision) => ({
							revision,
							outcome: CommitOutcome.FullyApplied,
						})),
					);
					assert.equal(tracked.revisions.length, 2);
					expectConverged(
						provider,
						["A", "B", { text: "offline" }],
						toUpgradeSchema(newSchema),
					);
				} finally {
					tracked.dispose();
					local.dispose();
					scenario.dispose();
				}
			});

			it("does not revive dropped data when reconnect resubmits a rejected schema", () => {
				const scenario = createScenario(flushMode);
				const { provider, remote, localTree, base } = scenario;
				const local = base.viewWith(newConfig);
				const tracked = trackLocalChanges(base);
				try {
					localTree.containerRuntime.connected = false;
					local.upgradeSchema();
					local.root.insertAtEnd(new Note({ text: "offline" }));
					remote.root.insertAtStart("remote");
					provider.synchronizeMessages();
					// Reconnect processes received history before resubmitting the local suffix.
					localTree.containerRuntime.connected = true;
					provider.synchronizeMessages();

					assert.deepEqual(
						tracked.outcomes.map(({ outcome }) => outcome),
						[CommitOutcome.FullyDropped, CommitOutcome.FullyDropped],
					);
					expectConverged(provider, ["remote", "A", "B"], toUpgradeSchema(oldSchema));
				} finally {
					tracked.dispose();
					local.dispose();
					scenario.dispose();
				}
			});
		});
	}

	it("rolls back an unflushed pair in data-before-schema order", () => {
		const scenario = createScenario(FlushMode.TurnBased);
		const { provider, localTree, base } = scenario;
		const local = base.viewWith(newConfig);
		const removed: string[][] = [];
		const off = base.mainBranch.events.on("afterChange", (event) => {
			if (event.type === "remove") {
				removed.push(
					...event.removedCommits.map((commit) =>
						commit.change.changes.map((inner) => inner.type),
					),
				);
			}
		});
		try {
			local.upgradeSchema();
			local.root.insertAtEnd(new Note({ text: "cancelled" }));
			assert(localTree.containerRuntime instanceof MockContainerRuntime);
			assert(localTree.containerRuntime.rollback !== undefined);
			localTree.containerRuntime.rollback();
			provider.synchronizeMessages();

			assert.deepEqual(removed, [["data"], ["schema"]]);
			assert.equal(provider.peekNextMessage(), undefined);
			expectConverged(provider, ["A", "B"], toUpgradeSchema(oldSchema));
		} finally {
			off();
			local.dispose();
			scenario.dispose();
		}
	});

	it("keeps an accepted schema when later unflushed data is rolled back", () => {
		const scenario = createScenario(FlushMode.TurnBased);
		const { provider, localTree, base } = scenario;
		const local = base.viewWith(newConfig);
		try {
			local.upgradeSchema();
			provider.synchronizeMessages();
			local.root.insertAtEnd(new Note({ text: "cancelled later" }));
			assert(localTree.containerRuntime instanceof MockContainerRuntime);
			assert(localTree.containerRuntime.rollback !== undefined);
			localTree.containerRuntime.rollback();
			provider.synchronizeMessages();

			expectConverged(provider, ["A", "B"], toUpgradeSchema(newSchema));
		} finally {
			local.dispose();
			scenario.dispose();
		}
	});

	it("keeps an accepted schema when the following data violates its constraint", () => {
		const scenario = createScenario();
		const { provider, remote, remoteTree, base } = scenario;
		const local = base.viewWith(newConfig);
		const tracked = trackLocalChanges(base);
		local.upgradeSchema();
		provider.synchronizeMessages();
		remote.dispose();
		const upgradedRemote = remoteTree.kernel.viewWith(newConfig);
		try {
			upgradedRemote.root.insertAtStart("remote");
			local.runTransaction(() => {
				base.editor.addNoChangeConstraint();
				local.root.insertAtEnd(new Note({ text: "constrained" }));
			});
			provider.synchronizeMessages();

			assert.deepEqual(
				tracked.outcomes.map(({ outcome }) => outcome),
				[CommitOutcome.FullyApplied, CommitOutcome.NewContentOnly],
			);
			expectConverged(provider, ["remote", "A", "B"], toUpgradeSchema(newSchema));
		} finally {
			tracked.dispose();
			local.dispose();
			upgradedRemote.dispose();
			scenario.dispose();
		}
	});
});
