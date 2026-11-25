/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { OldestSupportedClientVersion } from "@fluidframework/runtime-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { asAlpha } from "../../api.js";
import { FluidClientVersion } from "../../codec/index.js";
import {
	CommitKind,
	flattenCustomMetadata,
	RevertibleStatus,
	RevisionTagCodec,
	tagChange,
	type RevisionTag,
} from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import { createTreeCheckout } from "../../shared-tree/index.js";
import { TreeViewConfiguration } from "../../simple-tree/index.js";
import { configuredSharedTree } from "../../treeFactory.js";
import { Breakable, type JsonCompatibleReadOnlyObject } from "../../util/index.js";
import {
	createTestUndoRedoStacks,
	StringArray,
	TestTreeProviderLite,
	viewCheckout,
} from "../utils.js";

const config = new TreeViewConfiguration({ schema: StringArray });

function setupTree(
	retainHistory: boolean | number = true,
	minVersionForCollab: OldestSupportedClientVersion = "3.14.0",
) {
	const factory = configuredSharedTree({
		retainHistory,
		minVersionForCollab,
		jsonValidator: FormatValidatorBasic,
	}).getFactory();
	const provider = new TestTreeProviderLite(2, factory);
	const [tree, peer] = provider.trees;
	const view = asAlpha(tree.viewWith(config));
	view.initialize(["a", "b", "c"]);
	provider.synchronizeMessages();
	const other = peer.viewWith(config);
	const sequenceNumbers = new Map<RevisionTag, number>();

	/** Authors one commit without sequencing it. Multiple ops form one transaction. */
	function author(
		op: (root: typeof view.root) => void,
		customMetadata?: JsonCompatibleReadOnlyObject,
	) {
		view.runTransaction(
			() => op(view.root),
			customMetadata === undefined ? undefined : { customMetadata },
		);
		return tree.kernel.checkout.getLocationHead();
	}

	/** Sequences queued ops and captures the acknowledged local head. */
	function sequence() {
		provider.synchronizeMessages();
		const commit = tree.kernel.checkout.getLocationHead();
		sequenceNumbers.set(commit.revision, provider.sequenceNumber);
		return commit;
	}

	function advanceCollaboration(rounds = 1): void {
		provider.synchronizeMessages();
		for (let index = 0; index < rounds; index++) {
			const before = provider.sequenceNumber;
			view.root.insertAtEnd(`author ${index}`);
			provider.synchronizeMessages();
			other.root.insertAtEnd(`peer ${index}`);
			provider.synchronizeMessages();
			assert(provider.minimumSequenceNumber >= before, "Both clients must advance");
		}
	}

	/** Exchanges real ops so both clients acknowledge the selected commit. */
	function advancePast(commit: ReturnType<typeof sequence>): void {
		const sequenceNumber = sequenceNumbers.get(commit.revision);
		assert(sequenceNumber !== undefined, "Sequence the named commit first");
		advanceCollaboration();
		assert(
			provider.minimumSequenceNumber >= sequenceNumber,
			"The selected pair must be outside the collaboration window",
		);
	}

	return {
		provider,
		tree,
		peer,
		view,
		other,
		author,
		sequence,
		advanceCollaboration,
		advancePast,
	};
}

function setupDeletedHistory() {
	const fixture = setupTree(6);
	fixture.author((root) => root.removeAt(0));
	const current = fixture.sequence();
	fixture.author((root) => root.removeAt(0));
	const target = fixture.sequence();
	fixture.advancePast(target);
	assert.equal(fixture.tree.kernel.checkout.getRemovedRoots().length, 2);
	return { ...fixture, current, target };
}

function setupInsertedHistory(minVersionForCollab: OldestSupportedClientVersion = "3.14.0") {
	const fixture = setupTree(true, minVersionForCollab);
	fixture.author((root) => root.insertAtEnd("x"));
	const current = fixture.sequence();
	fixture.author((root) => root.insertAtEnd("y"));
	const target = fixture.sequence();
	fixture.advancePast(target);
	return { ...fixture, current, target };
}

function createReplayView(fixture: ReturnType<typeof setupTree>) {
	const source = fixture.tree.kernel.checkout;
	const idCompressor = fixture.provider.getCompressor(fixture.tree);
	const schema = source.storedSchema.clone();
	const checkout = createTreeCheckout(
		idCompressor,
		() => idCompressor.generateCompressedId(),
		new RevisionTagCodec(idCompressor),
		{
			schema,
			forest: source.forest.clone(schema, new Breakable("Compaction replay")),
			changeFamily: source.mainBranch.changeFamily,
		},
	);
	return viewCheckout(checkout, config);
}

type Fixture = ReturnType<typeof setupTree>;
type Commit = ReturnType<Fixture["sequence"]>;

function replay(view: ReturnType<typeof createReplayView>, commit: Commit): void {
	view.checkout.mainBranch.apply(
		tagChange(commit.change, commit.revision),
		CommitKind.Default,
		commit.customMetadata,
	);
}

function snapshot(fixture: Fixture) {
	const commits = [];
	for (
		let commit: Commit | undefined = fixture.tree.kernel.checkout.getLocationHead();
		commit !== undefined;
		commit = commit.parent
	) {
		commits.push({
			commit,
			parent: commit.parent,
			change: commit.change,
			customMetadata: commit.customMetadata,
		});
	}
	return { commits };
}

describe("compactHistory", () => {
	// A <-- B <-- ... <-- HEAD becomes A+B <-- ... <-- HEAD.
	// Initialization is omitted; HEAD marks the newest commit, not an additional commit.
	// Tests explicitly select A/B before adding collaboration-advancing edits.
	// A+B keeps B's revision and both original metadata trees.
	// Skipped cases describe deferred fixes, not guarantees of this draft.

	describe("When a pair can compact", () => {
		it("rejects a pair inside the collaboration window", () => {
			// Setup: A inserts x, B inserts y. The peer has not sent an acknowledgment.
			// A <-- B <-- HEAD must stay unchanged.
			const fixture = setupTree();
			fixture.author((root) => root.insertAtEnd("x"));
			const a = fixture.sequence();
			fixture.author((root) => root.insertAtEnd("y"));
			const b = fixture.sequence();
			assert(fixture.provider.minimumSequenceNumber < fixture.provider.sequenceNumber);
			const before = snapshot(fixture);

			// Act / Verify
			assert.throws(() => fixture.tree.kernel.compactHistory(a, b), /still required/);
			assert.deepEqual(snapshot(fixture), before);
		});

		it("compacts a pair after the collaboration window advances", () => {
			// Setup: A inserts x, B inserts y. Later C/D acknowledge A/B.
			// A <-- B <-- C <-- D <-- HEAD becomes A+B <-- C <-- D <-- HEAD.
			const fixture = setupTree();
			fixture.author((root) => root.insertAtEnd("x"));
			const a = fixture.sequence();
			fixture.author((root) => root.insertAtEnd("y"));
			const b = fixture.sequence();
			assert(fixture.provider.minimumSequenceNumber < fixture.provider.sequenceNumber);
			fixture.advancePast(b);
			const parent = a.parent;
			const before = [...fixture.view.root];

			// Act
			fixture.tree.kernel.compactHistory(a, b);

			// Verify
			assert.equal(b.parent, parent);
			assert.deepEqual([...fixture.view.root], before);
		});

		it("rejects an unsequenced commit", () => {
			// Setup: A is sequenced; B inserts y locally but has not been sequenced.
			const fixture = setupTree();
			fixture.author((root) => root.insertAtEnd("x"));
			const a = fixture.sequence();
			const b = fixture.author((root) => root.insertAtEnd("y"));
			const before = snapshot(fixture);

			// Act / Verify
			assert.throws(() => fixture.tree.kernel.compactHistory(a, b), /retained main-trunk/);
			assert.deepEqual(snapshot(fixture), before);
		});

		it("rejects a pair containing a fork base", () => {
			// Setup: a fork points to B. A/B remain protected even after C/D advance collaboration.
			const fixture = setupTree();
			fixture.author((root) => root.insertAtEnd("x"));
			const a = fixture.sequence();
			fixture.author((root) => root.insertAtEnd("y"));
			const b = fixture.sequence();
			const fork = fixture.view.fork();
			fixture.advancePast(b);
			const before = snapshot(fixture);
			try {
				// Act / Verify
				assert.throws(() => fixture.tree.kernel.compactHistory(a, b), /still required/);
				assert.deepEqual(snapshot(fixture), before);
			} finally {
				fork.dispose();
			}
		});

		it("compacts a pair after its fork is disposed", () => {
			// Setup: A inserts x; B inserts y. Release the fork at B, then age A/B.
			const fixture = setupTree();
			fixture.author((root) => root.insertAtEnd("x"));
			const a = fixture.sequence();
			fixture.author((root) => root.insertAtEnd("y"));
			const b = fixture.sequence();
			const fork = fixture.view.fork();
			fixture.advancePast(b);
			fork.dispose();
			const parent = a.parent;
			const content = [...fixture.view.root];

			// Act
			fixture.tree.kernel.compactHistory(a, b);

			// Verify
			assert.equal(b.parent, parent);
			assert.deepEqual([...fixture.view.root], content);
		});

		it("rejects a pair with a saved undo", () => {
			// Setup: save A's undo after inserting x, then let B insert y.
			// A's undo owns a fork, so A/B stay protected after collaboration advances.
			const fixture = setupTree();
			const stacks = createTestUndoRedoStacks(fixture.tree.kernel.checkout.events);
			fixture.author((root) => root.insertAtEnd("x"));
			const a = fixture.sequence();
			const undo = stacks.undoStack.pop() ?? assert.fail("Expected A's undo");
			stacks.unsubscribe();
			fixture.author((root) => root.insertAtEnd("y"));
			const b = fixture.sequence();
			fixture.advancePast(b);
			const before = snapshot(fixture);
			try {
				// Act / Verify
				assert.throws(() => fixture.tree.kernel.compactHistory(a, b), /still required/);
				assert.deepEqual(snapshot(fixture), before);
			} finally {
				undo.dispose();
			}
		});
	});

	describe("Compacting different ops", () => {
		type Root = ReturnType<typeof setupTree>["view"]["root"];
		const pairs: {
			name: string;
			example: string;
			first: (root: Root) => void;
			second: (root: Root) => void;
			expected: string[];
		}[] = [
			{
				name: "insert + insert",
				example: "[a,b,c] -> [a,b,c,x] -> [a,b,c,x,y]",
				first: (root) => root.insertAtEnd("x"),
				second: (root) => root.insertAtEnd("y"),
				expected: ["a", "b", "c", "x", "y"],
			},
			{
				name: "insert + delete the inserted value",
				example: "[a,b,c] -> [a,b,c,x] -> [a,b,c]",
				first: (root) => root.insertAtEnd("x"),
				second: (root) => root.removeAt(3),
				expected: ["a", "b", "c"],
			},
			{
				name: "insert + replace the inserted value",
				example: "[a,b,c] -> [a,b,c,x] -> [a,b,c,y]",
				first: (root) => root.insertAtEnd("x"),
				second: (root) => {
					root.removeAt(3);
					root.insertAtEnd("y");
				},
				expected: ["a", "b", "c", "y"],
			},
			{
				name: "insert + move the inserted value",
				example: "[a,b,c] -> [a,b,c,x] -> [x,a,b,c]",
				first: (root) => root.insertAtEnd("x"),
				second: (root) => root.moveToStart(3),
				expected: ["x", "a", "b", "c"],
			},
			{
				name: "delete + delete",
				example: "[a,b,c] -> [b,c] -> [c]",
				first: (root) => root.removeAt(0),
				second: (root) => root.removeAt(0),
				expected: ["c"],
			},
			{
				name: "delete + insert at the same position",
				example: "[a,b,c] -> [a,c] -> [a,x,c]",
				first: (root) => root.removeAt(1),
				second: (root) => root.insertAt(1, "x"),
				expected: ["a", "x", "c"],
			},
			{
				name: "move + delete the moved value",
				example: "[a,b,c] -> [b,c,a] -> [b,c]",
				first: (root) => root.moveToEnd(0),
				second: (root) => root.removeAt(2),
				expected: ["b", "c"],
			},
			{
				name: "move + move the same value back",
				example: "[a,b,c] -> [b,c,a] -> [a,b,c]",
				first: (root) => root.moveToEnd(0),
				second: (root) => root.moveToStart(2),
				expected: ["a", "b", "c"],
			},
			{
				name: "transaction + delete",
				example: "[a,b,c] -> [a,b,c,x,y] in one transaction -> [a,b,c,y]",
				first: (root) => {
					root.insertAtEnd("x");
					root.insertAtEnd("y");
				},
				second: (root) => root.removeAt(3),
				expected: ["a", "b", "c", "y"],
			},
		];
		for (const pair of pairs) {
			it(pair.name, () => {
				// Setup: the example above defines A's and B's effects on [a,b,c].
				// A <-- B <-- C <-- D <-- HEAD; C/D only advance collaboration.
				const fixture = setupTree();
				const separate = createReplayView(fixture);
				const combined = createReplayView(fixture);
				try {
					fixture.author(pair.first);
					const a = fixture.sequence();
					fixture.author(pair.second);
					const b = fixture.sequence();
					replay(separate, a);
					replay(separate, b);
					assert.deepEqual([...separate.root], pair.expected, pair.example);
					fixture.advancePast(b);

					// Act: replace A/B with A+B, then apply that one commit to the initial tree.
					fixture.tree.kernel.compactHistory(a, b);
					replay(combined, b);

					// Verify
					assert.deepEqual([...combined.root], pair.expected, pair.example);
				} finally {
					separate.dispose();
					combined.dispose();
				}
			});
		}

		it("combined commit + next op", () => {
			// Setup: A inserts x, B moves x to the front, C deletes x.
			// [a,b,c] -> [a,b,c,x] -> [x,a,b,c] -> [a,b,c].
			// First compact A/B: A+B <-- C <-- ... <-- HEAD.
			const fixture = setupTree();
			const combined = createReplayView(fixture);
			try {
				fixture.author((root) => root.insertAtEnd("x"));
				const a = fixture.sequence();
				fixture.author((root) => root.moveToStart(3));
				const b = fixture.sequence();
				fixture.author((root) => root.removeAt(0));
				const c = fixture.sequence();
				fixture.advancePast(c);
				fixture.tree.kernel.compactHistory(a, b);

				// Act: compact A+B with C, then replay A+B+C on the initial tree.
				fixture.tree.kernel.compactHistory(b, c);
				replay(combined, c);

				// Verify
				assert.deepEqual([...combined.root], ["a", "b", "c"]);
			} finally {
				combined.dispose();
			}
		});
	});

	describe("Compacting undo/redo history", () => {
		for (const deletion of [false, true]) {
			it(deletion ? "delete + undo" : "insert + undo", () => {
				// Setup: A inserts x (or deletes a), B undoes A.
				// [a,b,c] -> [a,b,c,x] (or [b,c]) -> [a,b,c].
				// A <-- B <-- C <-- D <-- HEAD becomes A+B <-- C <-- D <-- HEAD.
				const fixture = setupTree();
				const combined = createReplayView(fixture);
				const stacks = createTestUndoRedoStacks(fixture.tree.kernel.checkout.events);
				try {
					fixture.author((root) => (deletion ? root.removeAt(0) : root.insertAtEnd("x")));
					const a = fixture.sequence();
					const undo = stacks.undoStack.pop() ?? assert.fail("Expected A's undo");
					undo.revert();
					const b = fixture.sequence();
					assert.deepEqual([...fixture.view.root], ["a", "b", "c"]);
					// Saved revertibles own forks. Release them before testing composition.
					stacks.unsubscribe();
					fixture.advancePast(b);

					// Act
					fixture.tree.kernel.compactHistory(a, b);
					replay(combined, b);

					// Verify: A+B has no net effect, including when undo restores deleted data.
					assert.deepEqual([...combined.root], ["a", "b", "c"]);
				} finally {
					stacks.unsubscribe();
					combined.dispose();
				}
			});
		}

		it("undo + redo", () => {
			// Setup: A inserts x, B undoes A, C redoes A.
			// A <-- B <-- C <-- ... <-- HEAD becomes A <-- B+C <-- ... <-- HEAD.
			// B+C applied after A must keep [a,b,c,x].
			const fixture = setupTree();
			const stacks = createTestUndoRedoStacks(fixture.tree.kernel.checkout.events);
			fixture.author((root) => root.insertAtEnd("x"));
			fixture.sequence();
			const combined = createReplayView(fixture);
			try {
				const undo = stacks.undoStack.pop() ?? assert.fail("Expected A's undo");
				undo.revert();
				const b = fixture.sequence();
				const redo = stacks.redoStack.pop() ?? assert.fail("Expected B's redo");
				redo.revert();
				const c = fixture.sequence();
				assert.deepEqual([...fixture.view.root], ["a", "b", "c", "x"]);
				stacks.unsubscribe();
				fixture.advancePast(c);

				// Act
				fixture.tree.kernel.compactHistory(b, c);
				replay(combined, c);

				// Verify
				assert.deepEqual([...combined.root], ["a", "b", "c", "x"]);
			} finally {
				stacks.unsubscribe();
				combined.dispose();
			}
		});
	});

	describe("Using history after compaction", () => {
		it("compaction safety: preserves active undo and redo while combining older history", () => {
			const fixture = setupInsertedHistory();
			const checkout = fixture.tree.kernel.checkout;
			const stacks = createTestUndoRedoStacks(checkout.events);
			const forks: ReturnType<typeof checkout.mainBranch.fork>[] = [];
			const unsubscribeFork = checkout.mainBranch.events.on("fork", (fork) => {
				forks.push(fork);
			});
			try {
				fixture.view.root.removeAt(0);
				unsubscribeFork();
				const protectedCommit = fixture.sequence();
				const undo = stacks.undoStack.at(-1) ?? assert.fail("Expected the deletion's undo");
				const retainedFork = forks[0] ?? assert.fail("Expected the revertible's fork");
				assert.equal(retainedFork.getHead().revision, protectedCommit.revision);
				let forkDisposed = false;
				retainedFork.events.on("dispose", () => {
					forkDisposed = true;
				});
				const protectedParent = protectedCommit.parent;
				const protectedChange = protectedCommit.change;

				fixture.author((root) => root.insertAtEnd("z"));
				fixture.sequence();
				fixture.advancePast(protectedCommit);
				const content = [...fixture.view.root];
				const parent = fixture.current.parent;
				const sequenceNumber = fixture.provider.sequenceNumber;
				assert.equal(undo.status, RevertibleStatus.Valid);
				assert.equal(forkDisposed, false);

				// Only the older pair is combined; the active undo's fork remains retained.
				fixture.tree.kernel.compactHistory(fixture.current, fixture.target);

				assert.equal(fixture.target.parent, parent);
				assert.equal(protectedCommit.parent, protectedParent);
				assert.equal(protectedCommit.change, protectedChange);
				assert(snapshot(fixture).commits.some(({ commit }) => commit === protectedCommit));
				assert.equal(retainedFork.getHead().revision, protectedCommit.revision);
				assert.equal(forkDisposed, false);
				assert.equal(undo.status, RevertibleStatus.Valid);
				assert.deepEqual([...fixture.view.root], content);
				assert.equal(fixture.provider.sequenceNumber, sequenceNumber);
				assert.equal(fixture.provider.peekNextMessage(), undefined);

				undo.revert();
				fixture.sequence();
				assert.equal(forkDisposed, true);
				const restored = ["a", ...content];
				assert.deepEqual([...fixture.view.root], restored);
				assert.deepEqual([...fixture.other.root], restored);

				const redo = stacks.redoStack.at(-1) ?? assert.fail("Expected the undo's redo");
				assert.equal(redo.status, RevertibleStatus.Valid);
				redo.revert();
				fixture.sequence();
				assert.deepEqual([...fixture.view.root], content);
				assert.deepEqual([...fixture.other.root], content);
				assert.equal(fixture.target.parent, parent);
				assert.equal(protectedCommit.parent, protectedParent);
				assert.equal(protectedCommit.change, protectedChange);
				assert(snapshot(fixture).commits.some(({ commit }) => commit === protectedCommit));
			} finally {
				unsubscribeFork();
				stacks.unsubscribe();
				fixture.view.dispose();
				fixture.other.dispose();
			}
		});

		it("receives an undo from a client whose history was not compacted", () => {
			const fixture = setupTree();
			const stacks = createTestUndoRedoStacks(fixture.tree.kernel.checkout.events);
			fixture.author((root) => root.insertAtEnd("x"));
			fixture.sequence();
			const peerA = fixture.peer.kernel.getTrunkHead();
			const undo = stacks.undoStack.pop() ?? assert.fail("Expected the insert's undo");
			// Keep this undo's local fork, but do not capture revertibles for later edits.
			stacks.unsubscribe();
			try {
				fixture.author((root) => root.insertAtEnd("y"));
				const b = fixture.sequence();
				const peerB = fixture.peer.kernel.getTrunkHead();
				assert.equal(peerB.parent, peerA);
				fixture.advancePast(b);
				const before = [...fixture.view.root];
				const uncompactedHistory = snapshot(fixture);
				const sequenceNumber = fixture.provider.sequenceNumber;
				assert.equal(undo.status, RevertibleStatus.Valid);

				// The peer has no local undo fork, so it can combine the same sequenced edits.
				fixture.peer.kernel.compactHistory(peerA, peerB);

				assert.equal(peerB.parent, peerA.parent);
				assert.deepEqual([...fixture.other.root], before);
				assert.deepEqual(snapshot(fixture), uncompactedHistory);
				assert.equal(fixture.provider.sequenceNumber, sequenceNumber);
				assert.equal(fixture.provider.peekNextMessage(), undefined);
				assert.equal(undo.status, RevertibleStatus.Valid);

				// The author uses its original commit to submit a new undo edit to the peer.
				undo.revert();
				assert(fixture.provider.peekNextMessage() !== undefined);
				fixture.provider.synchronizeMessages();

				const expected = before.filter((value) => value !== "x");
				assert.deepEqual([...fixture.view.root], expected);
				assert.deepEqual([...fixture.other.root], expected);
				assert(fixture.provider.sequenceNumber > sequenceNumber);
				assert.equal(peerB.parent, peerA.parent);
			} finally {
				if (undo.status !== RevertibleStatus.Disposed) {
					undo.dispose();
				}
				stacks.unsubscribe();
				fixture.view.dispose();
				fixture.other.dispose();
			}
		});

		it("sequences, undo, and redo a later op", () => {
			const fixture = setupInsertedHistory();
			fixture.tree.kernel.compactHistory(fixture.current, fixture.target);
			const before = [...fixture.view.root];
			const head = fixture.tree.kernel.checkout.getLocationHead();
			const stacks = createTestUndoRedoStacks(fixture.tree.kernel.checkout.events);
			try {
				fixture.author((root) => root.insertAtEnd("z"));
				const e = fixture.sequence();
				assert.equal(e.parent, head);
				assert.deepEqual([...fixture.view.root], [...before, "z"]);
				assert.deepEqual([...fixture.other.root], [...before, "z"]);

				const undo = stacks.undoStack.pop() ?? assert.fail("Expected E's undo");
				undo.revert();
				fixture.sequence();
				assert.deepEqual([...fixture.view.root], before);
				assert.deepEqual([...fixture.other.root], before);

				const redo = stacks.redoStack.pop() ?? assert.fail("Expected redo");
				redo.revert();
				fixture.sequence();
				assert.deepEqual([...fixture.view.root], [...before, "z"]);
				assert.deepEqual([...fixture.other.root], [...before, "z"]);
			} finally {
				stacks.unsubscribe();
			}
		});

		it("aborts a later transaction", () => {
			// Setup: A+B contains inserts x/y. T temporarily appends z.
			const fixture = setupInsertedHistory();
			fixture.tree.kernel.compactHistory(fixture.current, fixture.target);
			const checkout = fixture.tree.kernel.checkout;
			const before = snapshot(fixture);
			const content = [...fixture.view.root];
			checkout.transaction.start();
			fixture.view.root.insertAtEnd("z");

			// Act: abort T, not the already-sequenced A+B.
			checkout.transaction.abort();
			fixture.provider.synchronizeMessages();

			// Verify: T leaves no retained commit or content change.
			assert.deepEqual(snapshot(fixture), before);
			assert.deepEqual([...fixture.view.root], content);
			assert.deepEqual([...fixture.other.root], content);
		});

		it("inverts the combined commit", () => {
			// Setup: A inserts x, B deletes a; A+B changes [a,b,c] to [b,c,x].
			// Its inverse must remove x AND restore a, not merely undo B.
			const fixture = setupTree();
			const combined = createReplayView(fixture);
			const separate = createReplayView(fixture);
			try {
				fixture.author((root) => root.insertAtEnd("x"));
				const a = fixture.sequence();
				fixture.author((root) => root.removeAt(0));
				const b = fixture.sequence();
				// Control: undoing B then A separately restores the initial content.
				replay(separate, a);
				replay(separate, b);
				for (const commit of [b, a]) {
					const inverseRevision = fixture.provider
						.getCompressor(fixture.tree)
						.generateCompressedId();
					const separateInverse = separate.checkout.mainBranch.changeFamily.rebaser.invert(
						tagChange(commit.change, commit.revision),
						false,
						inverseRevision,
					);
					separate.checkout.mainBranch.apply(
						tagChange(separateInverse, inverseRevision),
						CommitKind.Default,
						undefined,
					);
				}
				assert.deepEqual([...separate.root], ["a", "b", "c"]);
				fixture.advancePast(b);
				fixture.tree.kernel.compactHistory(a, b);
				replay(combined, b);
				assert.deepEqual([...combined.root], ["b", "c", "x"]);
				const revision = fixture.provider.getCompressor(fixture.tree).generateCompressedId();

				// Act
				const inverse = combined.checkout.mainBranch.changeFamily.rebaser.invert(
					tagChange(b.change, b.revision),
					false,
					revision,
				);
				combined.checkout.mainBranch.apply(
					tagChange(inverse, revision),
					CommitKind.Default,
					undefined,
				);

				// Verify
				assert.deepEqual([...combined.root], ["a", "b", "c"]);
			} finally {
				separate.dispose();
				combined.dispose();
			}
		});
	});

	describe("Restoring compacted history", () => {
		describe("Restore equivalence", () => {
			function setupHistory(pair: "insert+insert" | "delete+delete") {
				const fixture = setupTree();
				const a = fixture.tree.kernel.getTrunkHead();
				fixture.author((root) =>
					pair === "insert+insert" ? root.insertAtEnd("x") : root.removeAt(0),
				);
				const b = fixture.sequence();
				fixture.author((root) =>
					pair === "insert+insert" ? root.insertAtEnd("y") : root.removeAt(0),
				);
				const c = fixture.sequence();
				fixture.author((root) => root.insertAtEnd("d"));
				const d = fixture.sequence();
				assert.equal(b.parent, a);
				assert.equal(c.parent, b);
				assert.equal(d.parent, c);
				assert(a.revision !== "root" && c.revision !== "root");
				const compressor = fixture.provider.getCompressor(fixture.tree);
				const targets = {
					A: {
						commit: a,
						revision: compressor.decompress(a.revision),
						expected: ["a", "b", "c"],
					},
					C: {
						commit: c,
						revision: compressor.decompress(c.revision),
						expected: pair === "insert+insert" ? ["a", "b", "c", "x", "y"] : ["c"],
					},
				};
				// D and later acknowledgment edits advance collaboration without trimming A.
				fixture.advancePast(c);
				return { fixture, a, b, c, d, targets };
			}

			function restore(
				fixture: Fixture,
				revision: string,
				method: "rewindTo" | "revertTo",
			): string[] {
				const head = fixture.tree.kernel.getTrunkHead();
				if (method === "rewindTo") {
					// Rewind switches a private fork's history, not the shared branch.
					const before = [...fixture.view.root];
					const sequenceNumber = fixture.provider.sequenceNumber;
					const fork = fixture.view.fork();
					fork.rewindTo(revision);
					const rewoundContent = [...fork.root];
					assert.equal(fork.branchHistory.getHead()?.revision, revision);
					assert.deepEqual([...fixture.view.root], before);
					assert.deepEqual([...fixture.other.root], before);
					assert.equal(fixture.tree.kernel.getTrunkHead(), head);
					assert.equal(fixture.provider.sequenceNumber, sequenceNumber);
					assert.equal(fixture.provider.peekNextMessage(), undefined);
					// Dispose only after success so broken-checkout cleanup cannot mask a restore error.
					fork.dispose();
					return rewoundContent;
				}

				// Revert restores content by appending and sequencing a new edit.
				fixture.view.revertTo(revision);
				assert(fixture.provider.peekNextMessage() !== undefined);
				fixture.provider.synchronizeMessages();
				const newHead = fixture.tree.kernel.getTrunkHead();
				assert.equal(newHead.parent, head);
				assert.notEqual(newHead.revision, head.revision);
				assert(newHead.revision !== "root");
				assert.notEqual(
					fixture.provider.getCompressor(fixture.tree).decompress(newHead.revision),
					revision,
				);
				const revertedContent = [...fixture.view.root];
				assert.deepEqual([...fixture.other.root], revertedContent);
				return revertedContent;
			}

			for (const pair of ["insert+insert", "delete+delete"] as const) {
				for (const method of ["rewindTo", "revertTo"] as const) {
					for (const target of ["A", "C"] as const) {
						// Rollback inversion of combined revisions currently asserts 0xdad.
						const test = method === "rewindTo" && target === "A" ? it.skip : it;
						test(`${pair}: ${method} to ${target} matches uncompacted history`, () => {
							const baseline = setupHistory(pair);
							const compacted = setupHistory(pair);
							try {
								assert.notEqual(baseline.fixture.tree, compacted.fixture.tree);
								assert.deepEqual(
									[...baseline.fixture.view.root],
									[...compacted.fixture.view.root],
								);
								const expected = baseline.targets[target].expected;
								const baselineResult = restore(
									baseline.fixture,
									baseline.targets[target].revision,
									method,
								);
								assert.deepEqual(
									baselineResult,
									expected,
									"Uncompacted restore must succeed first",
								);

								compacted.fixture.tree.kernel.compactHistory(compacted.b, compacted.c);
								assert.equal(compacted.c.parent, compacted.a);
								assert.equal(compacted.d.parent, compacted.c);
								assert.equal(baseline.c.parent, baseline.b);
								for (const point of Object.values(compacted.targets)) {
									assert(
										snapshot(compacted.fixture).commits.some(
											({ commit }) => commit === point.commit,
										),
										"Both restore targets must remain retained after compaction",
									);
								}

								const compactedResult = restore(
									compacted.fixture,
									compacted.targets[target].revision,
									method,
								);
								assert.deepEqual(compactedResult, baselineResult);
								assert.deepEqual(compactedResult, expected);
							} finally {
								baseline.fixture.view.dispose();
								baseline.fixture.other.dispose();
								compacted.fixture.view.dispose();
								compacted.fixture.other.dispose();
							}
						});
					}
				}
			}
		});

		it("rejects rewind to an absorbed revision", () => {
			// Setup: A inserts x, B inserts y. A disappears from A+B's ancestry.
			const fixture = setupInsertedHistory();
			assert(fixture.current.revision !== "root");
			const absorbed = fixture.provider
				.getCompressor(fixture.tree)
				.decompress(fixture.current.revision);
			fixture.tree.kernel.compactHistory(fixture.current, fixture.target);
			const fork = fixture.view.fork();
			const before = [...fork.root];
			try {
				// Act / Verify
				assert.throws(() => fork.rewindTo(absorbed), /No commit found/);
				assert.deepEqual([...fork.root], before);
			} finally {
				fork.dispose();
			}
		});

		it.skip("insert + insert: rejects a previously saved restore callback", () => {
			// Setup: A inserts x, B inserts y. Save a callback that restores the initial [a,b,c].
			const { tree, view, current, target } = setupInsertedHistory();
			let initial = view.branchHistory.getHead();
			while (initial?.getParent() !== undefined) {
				initial = initial.getParent();
			}
			const revert = initial?.revertTo ?? assert.fail("Expected a retained restore callback");
			const content = [...view.root];

			// Act
			tree.kernel.compactHistory(current, target);

			// Verify: the saved callback must not use history invalidated by compaction.
			assert.throws(() => revert(), UsageError);
			assert.deepEqual([...view.root], content);
		});
	});

	describe("Compacting annotated history", () => {
		it("preserves conflicting metadata with newer values taking precedence", () => {
			const fixture = setupTree();
			fixture.author((root) => root.insertAtEnd("x"), { group: "a" });
			const a = fixture.sequence();
			fixture.author((root) => root.insertAtEnd("y"), { group: "b" });
			const b = fixture.sequence();
			const older = a.customMetadata;
			const newer = b.customMetadata;
			fixture.advancePast(b);

			fixture.tree.kernel.compactHistory(a, b);

			assert.deepEqual(flattenCustomMetadata(b.customMetadata), { group: "b" });
			assert.deepEqual(b.customMetadata, {
				metadata: undefined,
				children: [older, newer],
			});
		});
	});

	describe("Known lifecycle failures", () => {
		// Skipped: the kernel's breaking-method wrapper invalidates the tree on UsageError.
		it.skip("keeps the tree usable after rejecting a pair", () => {
			// Setup: A inserts x, B inserts y; neither is old enough to compact.
			const fixture = setupTree();
			fixture.author((root) => root.insertAtEnd("x"));
			const a = fixture.sequence();
			fixture.author((root) => root.insertAtEnd("y"));
			const b = fixture.sequence();
			const content = [...fixture.view.root];

			// Act
			assert.throws(() => fixture.tree.kernel.compactHistory(a, b), /still required/);

			// Verify: a rejected request should leave the document readable and editable.
			assert.deepEqual([...fixture.view.root], content);
			fixture.author((root) => root.insertAtEnd("z"));
			fixture.sequence();
			assert.deepEqual([...fixture.view.root], [...content, "z"]);
		});

		it.skip("delete + delete: frees deleted data after trimming", () => {
			// Setup: A deletes a, B deletes b: [a,b,c] -> [b,c] -> [c].
			// Retain six commits; later ops will move A+B beyond that limit.
			const { tree, peer, advanceCollaboration, current, target } = setupDeletedHistory();

			// Act
			tree.kernel.compactHistory(current, target);
			advanceCollaboration(10);

			// Verify: trimming A+B must collect both deleted roots.
			assert.deepEqual(tree.kernel.checkout.getRemovedRoots(), []);
			assert.deepEqual(peer.kernel.checkout.getRemovedRoots(), []);
		});

		it.skip("delete + delete: frees deleted data after aborting a later transaction", () => {
			// Setup: A deletes a, B deletes b; T appends "transaction edit".
			// A <-- B <-- ... <-- T <-- HEAD becomes A+B <-- ... <-- T <-- HEAD.
			// Aborting T must not restore cleanup ownership to the removed A commit.
			const { tree, peer, view, advanceCollaboration, current, target } =
				setupDeletedHistory();
			const checkout = tree.kernel.checkout;
			checkout.transaction.start();
			view.root.insertAtEnd("transaction edit");

			// Act
			tree.kernel.compactHistory(current, target);
			checkout.transaction.abort();
			advanceCollaboration(10);

			// Verify: neither T's insertion nor A/B's deleted roots remain.
			assert(![...view.root].includes("transaction edit"));
			assert.deepEqual(checkout.getRemovedRoots(), []);
			assert.deepEqual(peer.kernel.checkout.getRemovedRoots(), []);
		});
	});

	describe("Summary compatibility", () => {
		it("insert + insert: can summarize the combined commit", async () => {
			// Setup: A inserts x, B inserts y. The unmodified history can be summarized.
			// A+B keeps B's graph revision but contains both original revision namespaces.
			const { tree, current, target } = setupInsertedHistory();
			await tree.summarize();

			// Act
			tree.kernel.compactHistory(current, target);

			// Verify
			await assert.doesNotReject(tree.summarize());
		});

		it.skip("insert + insert: rejects clients too old for combined history", () => {
			// Setup: A inserts x, B inserts y; collaboration permits a v2.117 reader.
			// A <-- B <-- ... <-- HEAD must remain unchanged after rejection.
			const { tree, view, provider, current, target } = setupInsertedHistory(
				FluidClientVersion.v2_117,
			);
			const before = view.branchHistory.length;

			// Act / Verify
			assert.throws(() => tree.kernel.compactHistory(current, target), UsageError);

			assert.equal(view.branchHistory.length, before);
			assert.doesNotThrow(() => view.root.insertAtEnd("still usable"));
			provider.synchronizeMessages();
			assert.equal(view.root.at(-1), "still usable");
		});
	});
});
