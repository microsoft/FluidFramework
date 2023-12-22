/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import { SessionId } from "@fluidframework/id-compressor";
import { unreachableCase } from "@fluidframework/core-utils";
import {
	ChangeFamily,
	ChangeRebaser,
	TaggedChange,
	emptyDelta,
	ChangeFamilyEditor,
	GraphCommit,
	DeltaRoot,
} from "../../core";
import { brand, clone, makeArray, RecursiveReadonly } from "../../util";
import { Commit, EditManager, SeqNumber } from "../../shared-tree-core";
import {
	TestChange,
	UnrebasableTestChangeRebaser,
	ConstrainedTestChangeRebaser,
	asDelta,
	NoOpChangeRebaser,
} from "../testChange";
import { createTestUndoRedoStacks, mintRevisionTag } from "../utils";
import {
	TestEditManager,
	testChangeEditManagerFactory,
	rebaseAdvancingPeerEditsOverTrunkEdits,
	rebaseLocalEditsOverTrunkEdits,
	rebasePeerEditsOverTrunkEdits,
} from "./editManagerTestUtils";

const localSessionId: SessionId = "0" as SessionId;
const peer1: SessionId = "1" as SessionId;
const peer2: SessionId = "2" as SessionId;

// TODO:#4557: Change the number of steps back to 5 once the way these tests are run changes
const NUM_STEPS = 4;
const NUM_PEERS = 2;
const peers: SessionId[] = makeArray(NUM_PEERS, (i) => String(i + 1) as SessionId);

type TestCommit = Commit<TestChange> & {
	seqNumber: SeqNumber;
	refNumber: SeqNumber;
};

/**
 * Represents the minting and sending of a new local change.
 */
interface UnitTestPushStep {
	type: "Push";
	/**
	 * The future sequence number of the change being pushed.
	 * This information is derived by the `runUnitTestScenario` function, but can be explicitly
	 * provided to make tests easier to read and debug.
	 */
	seq?: number;
}

/**
 * Represents the sequencing of a local change.
 */
interface UnitTestAckStep {
	type: "Ack";
	/**
	 * The sequence number for this change.
	 * Should match the sequence number of the oldest `UnitTestPushStep`
	 * for which there is no `UnitTestAckStep` step.
	 */
	seq: number;
}

/**
 * Represents the reception of a (sequenced) peer change
 */
interface UnitTestPullStep {
	type: "Pull";
	/**
	 * The sequence number for this change.
	 */
	seq: number;
	/**
	 * The sequence number of the latest change that the issuer of this change knew about
	 * at the time they issued this change.
	 */
	ref: number;
	/**
	 * The ID of the peer that issued the change.
	 */
	from: SessionId;
	/**
	 * The delta which should be produced by the `EditManager` when it receives this change.
	 * This information is derived by the `runUnitTestScenario` function, but can be explicitly
	 * provided to make tests easier to read and debug.
	 */
	expectedDelta?: number[];
}

type UnitTestScenarioStep = UnitTestPushStep | UnitTestAckStep | UnitTestPullStep;

describe("EditManager", () => {
	describe("Unit Tests", () => {
		runUnitTestScenario("Can handle non-concurrent local changes being sequenced immediately", [
			{ seq: 1, type: "Push" },
			{ seq: 1, type: "Ack" },
			{ seq: 2, type: "Push" },
			{ seq: 2, type: "Ack" },
			{ seq: 3, type: "Push" },
			{ seq: 3, type: "Ack" },
		]);

		runUnitTestScenario("Can handle non-concurrent local changes being sequenced later", [
			{ seq: 1, type: "Push" },
			{ seq: 2, type: "Push" },
			{ seq: 3, type: "Push" },
			{ seq: 1, type: "Ack" },
			{ seq: 2, type: "Ack" },
			{ seq: 3, type: "Ack" },
		]);

		runUnitTestScenario("Can handle non-concurrent local changes partially sequenced later", [
			{ seq: 1, type: "Push" },
			{ seq: 2, type: "Push" },
			{ seq: 1, type: "Ack" },
			{ seq: 3, type: "Push" },
			{ seq: 2, type: "Ack" },
			{ seq: 3, type: "Ack" },
		]);

		runUnitTestScenario("Can handle non-concurrent peer changes sequenced immediately", [
			{ seq: 1, type: "Pull", ref: 0, from: peer1 },
			{ seq: 2, type: "Pull", ref: 1, from: peer1 },
			{ seq: 3, type: "Pull", ref: 2, from: peer1 },
		]);

		runUnitTestScenario("Can handle non-concurrent peer changes sequenced later", [
			{ seq: 1, type: "Pull", ref: 0, from: peer1 },
			{ seq: 2, type: "Pull", ref: 0, from: peer1 },
			{ seq: 3, type: "Pull", ref: 0, from: peer1 },
		]);

		runUnitTestScenario("Can handle non-concurrent peer changes partially sequenced later", [
			{ seq: 1, type: "Pull", ref: 0, from: peer1 },
			{ seq: 2, type: "Pull", ref: 0, from: peer1 },
			{ seq: 3, type: "Pull", ref: 1, from: peer1 },
		]);

		runUnitTestScenario("Can rebase a single peer change over multiple peer changes", [
			{ seq: 1, type: "Pull", ref: 0, from: peer1 },
			{ seq: 2, type: "Pull", ref: 1, from: peer1 },
			{ seq: 3, type: "Pull", ref: 2, from: peer1 },
			{ seq: 4, type: "Pull", ref: 0, from: peer2 },
		]);

		runUnitTestScenario("Can rebase multiple non-interleaved peer changes", [
			{ seq: 1, type: "Pull", ref: 0, from: peer1 },
			{ seq: 2, type: "Pull", ref: 1, from: peer1 },
			{ seq: 3, type: "Pull", ref: 2, from: peer1 },
			{ seq: 4, type: "Pull", ref: 0, from: peer2 },
			{ seq: 5, type: "Pull", ref: 0, from: peer2 },
			{ seq: 6, type: "Pull", ref: 0, from: peer2 },
		]);

		runUnitTestScenario("Can rebase multiple interleaved peer changes", [
			{ seq: 1, type: "Pull", ref: 0, from: peer1 },
			{ seq: 2, type: "Pull", ref: 0, from: peer2 },
			{ seq: 3, type: "Pull", ref: 1, from: peer1 },
			{ seq: 4, type: "Pull", ref: 2, from: peer1 },
			{ seq: 5, type: "Pull", ref: 0, from: peer2 },
			{ seq: 6, type: "Pull", ref: 0, from: peer2 },
		]);

		runUnitTestScenario("Can rebase peer changes over a local change", [
			{ seq: 1, type: "Push" },
			{ seq: 1, type: "Ack" },
			{ seq: 2, type: "Pull", ref: 0, from: peer1 },
			{ seq: 3, type: "Pull", ref: 0, from: peer1 },
		]);

		runUnitTestScenario("Can rebase multiple local changes", [
			{ seq: 3, type: "Push" },
			{ seq: 4, type: "Push" },
			{ seq: 5, type: "Push" },
			{ seq: 1, type: "Pull", ref: 0, from: peer1, expectedDelta: [-5, -4, -3, 1, 3, 4, 5] },
			{ seq: 2, type: "Pull", ref: 1, from: peer1, expectedDelta: [-5, -4, -3, 2, 3, 4, 5] },
			{ seq: 3, type: "Ack" },
			{ seq: 4, type: "Ack" },
			{ seq: 5, type: "Ack" },
			{ seq: 6, type: "Pull", ref: 2, from: peer1, expectedDelta: [6] },
		]);

		runUnitTestScenario("Can rebase multiple interleaved peer and local changes", [
			{ seq: 3, type: "Push" },
			{ seq: 1, type: "Pull", ref: 0, from: peer1, expectedDelta: [-3, 1, 3] },
			{ seq: 2, type: "Pull", ref: 0, from: peer2, expectedDelta: [-3, 2, 3] },
			{ seq: 6, type: "Push" },
			{ seq: 8, type: "Push" },
			{ seq: 3, type: "Ack" },
			{ seq: 4, type: "Pull", ref: 1, from: peer1, expectedDelta: [-8, -6, 4, 6, 8] },
			{ seq: 5, type: "Pull", ref: 2, from: peer1, expectedDelta: [-8, -6, 5, 6, 8] },
			{ seq: 6, type: "Ack" },
			{ seq: 7, type: "Pull", ref: 0, from: peer2, expectedDelta: [-8, 7, 8] },
			{ seq: 8, type: "Ack" },
			{ seq: 9, type: "Pull", ref: 0, from: peer2, expectedDelta: [9] },
		]);

		runUnitTestScenario("Can handle ref numbers to operations that are not commits", [
			{ seq: 2, type: "Pull", ref: 0, from: peer1 },
			{ seq: 4, type: "Pull", ref: 1, from: peer2 },
			{ seq: 6, type: "Pull", ref: 3, from: peer1 },
			{ seq: 8, type: "Pull", ref: 3, from: peer1 },
			{ seq: 10, type: "Pull", ref: 1, from: peer2 },
			{ seq: 12, type: "Pull", ref: 1, from: peer2 },
		]);

		runUnitTestScenario("Can rebase changes from a peer that catches up", [
			{ seq: 1, type: "Push" },
			{ seq: 4, type: "Push" },
			{ seq: 1, type: "Ack" },
			{ seq: 2, type: "Pull", ref: 0, from: peer1 },
			{ seq: 3, type: "Pull", ref: 2, from: peer1 },
		]);

		runUnitTestScenario(
			// See the test "Rebases peer branches during trunk eviction" for a more detailed analysis of this case.
			"Can handle changes from a lagging peer which catches up after a local ack",
			[
				{ seq: 1, type: "Pull", from: peer1, ref: 0 },
				{ seq: 2, type: "Push" },
				{ seq: 2, type: "Ack" },
				{ seq: 3, type: "Pull", from: peer1, ref: 0 },
				{ seq: 4, type: "Pull", from: peer1, ref: 3 },
			],
		);

		describe("Trunk eviction", () => {
			function applyLocalCommit(
				manager: EditManager<
					ChangeFamilyEditor,
					TestChange,
					ChangeFamily<ChangeFamilyEditor, TestChange>
				>,
				inputContext: readonly number[] = [],
				intention: number | number[] = [],
			): Commit<TestChange> {
				const [_, commit] = manager.localBranch.apply(
					TestChange.mint(inputContext, intention),
					mintRevisionTag(),
				);
				return {
					change: commit.change,
					revision: commit.revision,
					sessionId: localSessionId,
				};
			}

			function peerCommit(
				peer: typeof peer1 | typeof peer2,
				inputContext: readonly number[] = [],
				intention: number | number[] = [],
			): Commit<TestChange> {
				return {
					change: TestChange.mint(inputContext, intention),
					revision: mintRevisionTag(),
					sessionId: peer,
				};
			}

			it("Evicts trunk commits according to a provided minimum sequence number", () => {
				const { manager } = testChangeEditManagerFactory({});
				for (let i = 1; i <= 10; ++i) {
					manager.addSequencedChange(applyLocalCommit(manager), brand(i), brand(i - 1));
				}

				assert.equal(manager.getTrunkChanges().length, 10);
				manager.advanceMinimumSequenceNumber(brand(5));
				assert.equal(manager.getTrunkChanges().length, 5);
				manager.advanceMinimumSequenceNumber(brand(10));
				assert.equal(manager.getTrunkChanges().length, 0);
				for (let i = 11; i <= 20; ++i) {
					manager.addSequencedChange(applyLocalCommit(manager), brand(i), brand(i - 1));
				}

				assert.equal(manager.getTrunkChanges().length, 10);
				manager.advanceMinimumSequenceNumber(brand(15));
				assert.equal(manager.getTrunkChanges().length, 5);
				manager.advanceMinimumSequenceNumber(brand(20));
				assert.equal(manager.getTrunkChanges().length, 0);
			});

			it("Evicts trunk commits at exactly the minimum sequence number", () => {
				const { manager } = testChangeEditManagerFactory({});
				manager.addSequencedChange(applyLocalCommit(manager), brand(1), brand(0));
				assert.equal(manager.getTrunkChanges().length, 1);
				manager.addSequencedChange(applyLocalCommit(manager), brand(2), brand(1));
				assert.equal(manager.getTrunkChanges().length, 2);
				manager.advanceMinimumSequenceNumber(brand(1));
				assert.equal(manager.getTrunkChanges().length, 1);
				manager.addSequencedChange(applyLocalCommit(manager), brand(3), brand(2));
				assert.equal(manager.getTrunkChanges().length, 2);
				manager.advanceMinimumSequenceNumber(brand(3));
				assert.equal(manager.getTrunkChanges().length, 0);
			});

			it("Rebases peer branches", () => {
				// This is a regression test that ensures peer branches are rebased up to at least the new tail of the trunk after trunk commits are evicted.
				const { manager } = testChangeEditManagerFactory({});
				// First, we receive a commit from a peer ("1").
				manager.addSequencedChange(peerCommit(peer1, [], 1), brand(1), brand(0));
				// We then submit and ack a local commit ("2").
				// This prevents an upcoming rebase of the peer branch from hitting an eager fast-path that keeps the branch caught up to the head of the trunk.
				manager.addSequencedChange(applyLocalCommit(manager, [1], 2), brand(2), brand(1));
				// We receive a second commit from the peer ("3").
				// Based on the ref seq number, we know that the peer is lagging "behind" by two commits,
				// i.e. it has sent a second op without receiving its first op ("1") or the local op ("2") that we applied just above.
				manager.addSequencedChange(peerCommit(peer1, [1], 3), brand(3), brand(0));
				// Our trunk should have all the commits we've sequenced so far.
				checkChangeList(manager, [1, 2, 3]);
				// Suppose that the peer catches up, and we are informed of the new minimum sequence number via some means (e.g. an op).
				manager.advanceMinimumSequenceNumber(brand(3));
				// Eviction ocurred, so we now expect the trunk to be fully evicted.
				checkChangeList(manager, []);
				// We also expect our copy of the peer's local branch to be updated even though we have not received any new commits from that peer since commit "3".
				// We can check this by receiving another commit from our peer.
				// We'll fail when trying to rebase if the branch was not already updated and is referencing evicted commits.
				manager.addSequencedChange(peerCommit(peer1, [1, 2, 3], 4), brand(4), brand(3));
				checkChangeList(manager, [4]);
			});

			it("Evicts properly when the minimum sequence number advances past the trunk (and there are no local commits)", () => {
				const { manager } = testChangeEditManagerFactory({});
				manager.addSequencedChange(applyLocalCommit(manager, [], 1), brand(1), brand(0));
				manager.advanceMinimumSequenceNumber(brand(2));
				manager.addSequencedChange(applyLocalCommit(manager, [1], 2), brand(3), brand(2));
				checkChangeList(manager, [2]);
			});

			it("Evicts properly when the minimum sequence number advances past the trunk (and there are local commits)", () => {
				const { manager } = testChangeEditManagerFactory({});
				manager.addSequencedChange(applyLocalCommit(manager, [], 1), brand(1), brand(0));
				const local = applyLocalCommit(manager, [1], 2);
				manager.advanceMinimumSequenceNumber(brand(2));
				manager.addSequencedChange(local, brand(3), brand(2));
				checkChangeList(manager, [2]);
			});

			it("Delays eviction of a branch base commit until the branch is disposed", () => {
				const { manager } = testChangeEditManagerFactory({});
				manager.addSequencedChange(applyLocalCommit(manager, [], 1), brand(1), brand(0));
				const local = applyLocalCommit(manager, [1], 2);
				const fork = manager.localBranch.fork();
				manager.addSequencedChange(local, brand(2), brand(1));
				checkChangeList(manager, [1, 2]);
				manager.advanceMinimumSequenceNumber(brand(2));
				checkChangeList(manager, [1, 2]);
				fork.dispose();
				checkChangeList(manager, []);
			});

			it("Evicts after the oldest branch rebases", () => {
				const { manager } = testChangeEditManagerFactory({});
				const local1 = applyLocalCommit(manager, [], 1);
				const fork1 = manager.localBranch.fork();
				manager.addSequencedChange(local1, brand(1), brand(0));
				const local2 = applyLocalCommit(manager, [1], 2);
				const fork2 = manager.localBranch.fork();
				manager.addSequencedChange(local2, brand(2), brand(1));
				checkChangeList(manager, [1, 2]);
				manager.advanceMinimumSequenceNumber(brand(2));
				checkChangeList(manager, [1, 2]);
				fork1.rebaseOnto(fork2);
				checkChangeList(manager, [1, 2]);
				fork1.rebaseOnto(manager.localBranch);
				checkChangeList(manager, [1, 2]);
				fork2.rebaseOnto(manager.localBranch);
				checkChangeList(manager, [2]);
			});

			it("Evicts properly when changes come in batches having the same sequence number", () => {
				const { manager } = testChangeEditManagerFactory({});
				manager.addSequencedChange(peerCommit(peer1, [], 1), brand(1), brand(0));
				manager.addSequencedChange(peerCommit(peer1, [1], 2), brand(1), brand(0));
				manager.addSequencedChange(peerCommit(peer1, [1, 2], 3), brand(1), brand(0));
				checkChangeList(manager, [1, 2, 3]);
				manager.advanceMinimumSequenceNumber(brand(2));
				checkChangeList(manager, []);
				manager.addSequencedChange(peerCommit(peer1, [1, 2, 3], 4), brand(4), brand(1));
				manager.addSequencedChange(peerCommit(peer1, [1, 2, 3, 4], 5), brand(4), brand(1));
				manager.addSequencedChange(
					peerCommit(peer2, [1, 2, 3, 4, 5], 6),
					brand(5),
					brand(4),
				);
				manager.addSequencedChange(
					peerCommit(peer2, [1, 2, 3, 4, 5, 6], 7),
					brand(5),
					brand(4),
				);
				manager.addSequencedChange(
					peerCommit(peer2, [1, 2, 3, 4, 5, 6, 7], 8),
					brand(5),
					brand(4),
				);
				checkChangeList(manager, [4, 5, 6, 7, 8]);
				manager.advanceMinimumSequenceNumber(brand(4));
				checkChangeList(manager, [6, 7, 8]);
			});

			it("does not evict commits including and after the oldest revertible commit", () => {
				const { manager } = testChangeEditManagerFactory({ autoDiscardRevertibles: false });
				const { unsubscribe } = createTestUndoRedoStacks(manager.localBranch);

				const commit1 = applyLocalCommit(manager, [], 1);
				const commit2 = applyLocalCommit(manager, [], 1);
				const commit3 = applyLocalCommit(manager, [], 1);
				const commit4 = applyLocalCommit(manager, [], 1);
				manager.addSequencedChange(commit1, brand(1), brand(0));
				manager.addSequencedChange(commit2, brand(2), brand(0));
				manager.addSequencedChange(commit3, brand(3), brand(0));
				manager.addSequencedChange(commit4, brand(4), brand(0));
				manager.advanceMinimumSequenceNumber(brand(4));

				// check that commits are all still in the trunk
				let current: GraphCommit<TestChange> | undefined = manager.getTrunkHead();
				assert.equal(current.revision, commit4.revision);
				current = current.parent;
				assert(current !== undefined);
				assert.equal(current.revision, commit3.revision);
				current = current.parent;
				assert(current !== undefined);
				assert.equal(current.revision, commit2.revision);
				current = current.parent;
				assert(current !== undefined);
				assert.equal(current.revision, commit1.revision);

				unsubscribe();
			});

			it("advances the oldest revertible commit when that revertible is disposed", () => {
				const { manager } = testChangeEditManagerFactory({ autoDiscardRevertibles: false });
				const { undoStack, unsubscribe } = createTestUndoRedoStacks(manager.localBranch);

				const commit1 = applyLocalCommit(manager, [], 1);
				const commit2 = applyLocalCommit(manager, [], 1);
				const commit3 = applyLocalCommit(manager, [], 1);
				const commit4 = applyLocalCommit(manager, [], 1);
				manager.addSequencedChange(commit1, brand(1), brand(0));
				manager.addSequencedChange(commit2, brand(2), brand(0));
				manager.addSequencedChange(commit3, brand(3), brand(0));
				manager.addSequencedChange(commit4, brand(4), brand(0));

				// discard the oldest revertible and trim the trunk
				undoStack[0].discard();
				manager.advanceMinimumSequenceNumber(brand(4));

				// check that all commits except the first are still in the trunk
				let current: GraphCommit<TestChange> | undefined = manager.getTrunkHead();
				assert.equal(current.revision, commit4.revision);
				current = current.parent;
				assert(current !== undefined);
				assert.equal(current.revision, commit3.revision);
				current = current.parent;
				assert(current !== undefined);
				assert.equal(current.revision, commit2.revision);
				current = current.parent;
				assert(current !== undefined);
				assert.notEqual(current.revision, commit1.revision);

				unsubscribe();
			});
		});

		it("Updates local branch when loading from summary", () => {
			// This regression tests ensures that the local branch is rebased to the head of the trunk
			// when the trunk is modified by a summary load
			const { manager } = testChangeEditManagerFactory({});
			const revision = mintRevisionTag();
			manager.loadSummaryData({
				trunk: [
					{
						change: TestChange.mint([0], [1]),
						revision,
						sessionId: "0" as SessionId,
						sequenceNumber: brand(1),
					},
				],
				branches: new Map(),
			});
			manager.addSequencedChange(
				{
					change: TestChange.mint([0, 1], [2]),
					revision: mintRevisionTag(),
					sessionId: "1" as SessionId,
				},
				brand(2),
				brand(1),
			);
			assert.equal(manager.localBranch.getHead(), manager.getTrunkHead());
		});

		describe("Reports correct max branch length", () => {
			it("When there are no branches", () => {
				const { manager } = testChangeEditManagerFactory({
					rebaser: new NoOpChangeRebaser(),
				});
				assert.equal(manager.getLongestBranchLength(), 0);
			});
			it("When the local branch is longest", () => {
				const { manager } = testChangeEditManagerFactory({
					rebaser: new NoOpChangeRebaser(),
				});
				const sequencedLocalChange = mintRevisionTag();
				manager.localBranch.apply(TestChange.emptyChange, sequencedLocalChange);
				manager.localBranch.apply(TestChange.emptyChange, mintRevisionTag());
				manager.localBranch.apply(TestChange.emptyChange, mintRevisionTag());
				manager.addSequencedChange(
					{
						change: TestChange.emptyChange,
						revision: mintRevisionTag(),
						sessionId: peer1,
					},
					brand(1),
					brand(0),
				);
				manager.addSequencedChange(
					{
						change: TestChange.emptyChange,
						revision: sequencedLocalChange,
						sessionId: manager.localSessionId,
					},
					brand(2),
					brand(0),
				);
				assert.equal(manager.getLongestBranchLength(), 2);
			});
			it("When a peer branch is longest", () => {
				const { manager } = testChangeEditManagerFactory({
					rebaser: new NoOpChangeRebaser(),
				});
				const sequencedLocalChange = mintRevisionTag();
				manager.localBranch.apply(TestChange.emptyChange, sequencedLocalChange);
				manager.localBranch.apply(TestChange.emptyChange, mintRevisionTag());
				manager.addSequencedChange(
					{
						change: TestChange.emptyChange,
						revision: sequencedLocalChange,
						sessionId: manager.localSessionId,
					},
					brand(1),
					brand(0),
				);
				manager.addSequencedChange(
					{
						change: TestChange.emptyChange,
						revision: mintRevisionTag(),
						sessionId: peer1,
					},
					brand(2),
					brand(0),
				);
				manager.addSequencedChange(
					{
						change: TestChange.emptyChange,
						revision: mintRevisionTag(),
						sessionId: peer1,
					},
					brand(3),
					brand(0),
				);
				assert.equal(manager.getLongestBranchLength(), 2);
			});
		});
	});

	describe("Perf", () => {
		describe("Avoids unnecessary rebases", () => {
			runUnitTestScenario(
				"Sequenced changes that are based on the trunk should not be rebased",
				[
					{ seq: 1, type: "Pull", ref: 0, from: peer1 },
					{ seq: 2, type: "Pull", ref: 0, from: peer1 },
					{ seq: 3, type: "Pull", ref: 0, from: peer1 },
					{ seq: 4, type: "Pull", ref: 3, from: peer2 },
					{ seq: 5, type: "Pull", ref: 4, from: peer2 },
					{ seq: 6, type: "Pull", ref: 5, from: peer1 },
					{ seq: 7, type: "Pull", ref: 5, from: peer1 },
				],
				new UnrebasableTestChangeRebaser(),
			);
			runUnitTestScenario(
				"Sequenced local changes should not be rebased over prior local changes if those earlier changes were not rebased",
				[
					{ seq: 1, type: "Push" },
					{ seq: 2, type: "Push" },
					{ seq: 4, type: "Push" },
					{ seq: 1, type: "Ack" },
					{ seq: 2, type: "Ack" },
					{ seq: 3, type: "Pull", ref: 2, from: peer2 },
					{ seq: 4, type: "Ack" },
				],
				new ConstrainedTestChangeRebaser(
					(change: TestChange, over: TaggedChange<TestChange>): boolean => {
						// This is the only rebase that should happen
						assert.deepEqual(change.intentions, [4]);
						assert.deepEqual(over.change.intentions, [3]);
						return true;
					},
				),
			);
			runUnitTestScenario(
				"Sequenced peer changes should not be rebased over changes from the same peer if those earlier changes were not rebased",
				[
					{ seq: 1, type: "Pull", ref: 0, from: peer1 },
					{ seq: 2, type: "Pull", ref: 0, from: peer1 },
					{ seq: 3, type: "Pull", ref: 2, from: peer2 },
					{ seq: 4, type: "Pull", ref: 0, from: peer1 },
				],
				new ConstrainedTestChangeRebaser(
					(change: TestChange, over: TaggedChange<TestChange>): boolean => {
						// This is the only rebase that should happen
						assert.deepEqual(change.intentions, [4]);
						assert.deepEqual(over.change.intentions, [3]);
						return true;
					},
				),
			);
		});

		interface Scenario {
			readonly rebasedEditCount: number;
			readonly trunkEditCount: number;
		}

		const scenarios: Scenario[] = [
			{ rebasedEditCount: 1, trunkEditCount: 1 },
			{ rebasedEditCount: 10, trunkEditCount: 1 },
			{ rebasedEditCount: 1, trunkEditCount: 10 },
			{ rebasedEditCount: 7, trunkEditCount: 3 },
		];

		describe("Local commit rebasing", () => {
			for (const { rebasedEditCount: L, trunkEditCount: T } of scenarios) {
				// This test simulates the following inputs to the EditManager:
				//   - Add local edit L1 with a ref seq# pointing to edit 0
				//   ...(not incrementing the ref seq# for each L)
				//   - Add local edit Lc with a ref seq# pointing to edit 0
				//   => we start measuring from here
				//   - Add trunk edit T1 with a ref seq# pointing to edit 0
				//   ...(incrementing the ref seq# for each T)
				//   - Add trunk edit Tc with a ref seq# pointing to edit Tc-1
				// This defines the following relationships between edits:
				//   (0)─(T1)─...─(Tc)
				//     └───────────────(L1)─...─(Lc)
				// Before we start measuring, the EditManager has the following structure:
				//   (0)
				//     └───────────────(L1)─...─(Lc)
				// By the end of the test, the EditManager has the following structure:
				//   (0)─(T1)─...─(Tc)
				//                   └─(L1)─...─(Lc)
				it(`Rebase ${L} local commits over ${T} trunk commits`, () => {
					const rebaser = new NoOpChangeRebaser();
					const manager = testChangeEditManagerFactory({ rebaser }).manager;
					const run = rebaseLocalEditsOverTrunkEdits(
						L,
						T,
						manager,
						() => TestChange.emptyChange,
						true,
					);
					rebaser.rebasedCount = 0;
					rebaser.invertedCount = 0;
					rebaser.composedCount = 0;
					run();
					const actual = {
						rebased: rebaser.rebasedCount,
						inverted: rebaser.invertedCount,
						composed: rebaser.composedCount,
					};
					const expected = {
						// As part of rebasing the local branch over the trunk edits,
						//   the Ith local edit on the branch is rebased over the composition of...
						//     - the inverse of each local edit before it
						//     - the new trunk edit
						//     - the rebased version of each local edit before it
						//   This adds up to 1 rebase for the Ith edit.
						//   Summing over all L edits gives us: L
						// Summing over all T branch rebases gives us: TL
						// Which simplifies to:
						rebased: T * L,
						// As part of rebasing the local branch over the trunk edits,
						//   the Ith local edit on the branch is inverted once
						//   Summing over all L edits gives us L
						// Summing over all T branch rebases gives us: TL
						inverted: T * L,
						// As part of rebasing the local branch over the trunk edits,
						//   we compose the new trunk edit: 1
						//   then for the Ith local edit on the branch we compose...
						//     - the inverse of the local edit: 1
						//     - the previous composition: 1
						//     - the rebased version of the local edit: 1
						//   This adds up to 3L + 1 changes composed per branch rebase.
						// Summing over all T branch rebases gives us:
						composed: T * (3 * L + 1),
					};
					assert.deepEqual(actual, expected);
				});
			}
		});

		describe("Peer commit rebasing for peer with fixed seq ref#", () => {
			for (const { rebasedEditCount: P, trunkEditCount: T } of scenarios) {
				// This test simulates the following inputs to the EditManager:
				//   - Add trunk edit T1 with a ref seq# pointing to edit 0
				//   ...(incrementing the ref seq# for each T)
				//   - Add trunk edit Tc with a ref seq# pointing to edit Tc-1
				//   => we start measuring from here
				//   - Add peer edit P1 with a ref seq# pointing to edit 0
				//   ...(not incrementing the ref seq# for each P)
				//   - Add peer edit Pc with a ref seq# pointing to edit 0
				// This defines the following relationships between edits:
				//   (0)─(T1)─...─(Tc)
				//     └───────────────(P1)─...─(Pc)
				// Before we start measuring, the EditManager has the following structure:
				//   (0)─(T1)─...─(Tc)
				//     └─
				// By the end of the test, the EditManager has the following structure:
				//   (0)─(T1)─...─(Tc)─(P1)─...─(Pc)
				//                                 └─
				it(`Rebase ${P} peer commits over ${T} trunk commits`, () => {
					const rebaser = new NoOpChangeRebaser();
					const manager = testChangeEditManagerFactory({ rebaser }).manager;
					const run = rebasePeerEditsOverTrunkEdits(
						P,
						T,
						manager,
						() => TestChange.emptyChange,
						true,
					);
					rebaser.rebasedCount = 0;
					rebaser.invertedCount = 0;
					rebaser.composedCount = 0;
					run();
					const actual = {
						rebased: rebaser.rebasedCount,
						inverted: rebaser.invertedCount,
						composed: rebaser.composedCount,
					};
					const expected = {
						// As part of rebasing the new peer edit to the tip of the trunk,
						//   For the Ith peer edit, we rebase it over...
						//     - the inverse of the peer edits on the peer branch: I - 1
						//     - the trunk edits that were not contributed by that peer: T
						//     - the the rebased version of the peer edits (now on the trunk): I - 1
						//   This adds up to T + 2I - 2 rebases for the Ith edit.
						//   Summing over all P edits transforms I into P(P + 1)/2
						//   Which gives us: PT + 2P(P + 1)/2 - 2P
						//   Which simplifies to:
						rebased: P * (T + P - 1),
						// As part of rebasing the new peer edit to the tip of the trunk,
						//   For the Ith peer edit, we invert...
						//     - each peer edit before it: I - 1
						//   Summing over all P edits transforms I into P(P + 1)/2
						//   Which gives us: P(P + 1)/2 - 1
						//   However, we cache the inverse of each change, so overall we only invert once each peer
						//   edit that has peer edit after it.
						inverted: P - 1,
						// As part of rebasing the local branch edit over the peer edit,
						//   For the Ith peer edit, we compose...
						//     - the rebased version of that peer edit: 1
						//   Summing over all P edits transforms gives us: P
						// Note: this composition is only needed to bake the RevisionTag into the changeset.
						composed: P,
					};
					assert.deepEqual(actual, expected);
				});
			}
		});

		describe("Peer commit rebasing for peer with advancing (but not tip) seq ref#", () => {
			for (const editCount of [1, 2, 10]) {
				// This test simulates the following inputs to the EditManager:
				//   - Add trunk edit T1 with a ref seq# pointing to edit 0
				//   ...(incrementing the ref seq# for each T)
				//   - Add trunk edit Tc with a ref seq# pointing to edit Tc-1
				//   => we start measuring from here
				//   - Add peer edit P1 with a ref seq# pointing to edit 0
				//   ...(incrementing the ref seq# for each P)
				//   - Add peer edit Pc with a ref seq# pointing to edit Tc-1
				// This defines the following relationships between edits:
				//   (0)─(T1)─...─(Tc─1)─(Tc)
				//     |    |          └──────(P1)─(P2)─...─(Pc)
				//     |    └─────────────────(P1)─(P2)
				//     └──────────────────────(P1)
				// Before we start measuring, the EditManager has the following structure:
				//   (0)─(T1)─...─(Tc─1)─(Tc)
				//     └─
				// By the end of the test, the EditManager has the following structure:
				//   (0)─(T1)─...─(Tc─1)─(Tc)─(P1)─(P2)─...─(Pc)
				//                                             └─
				it(`for ${editCount} peer commits and ${editCount} trunk commits`, () => {
					const rebaser = new NoOpChangeRebaser();
					const manager = testChangeEditManagerFactory({ rebaser }).manager;
					const run = rebaseAdvancingPeerEditsOverTrunkEdits(
						editCount,
						manager,
						() => TestChange.emptyChange,
						true,
					);
					rebaser.rebasedCount = 0;
					rebaser.invertedCount = 0;
					rebaser.composedCount = 0;
					run();
					const actual = {
						rebased: rebaser.rebasedCount,
						inverted: rebaser.invertedCount,
						composed: rebaser.composedCount,
					};
					const P = editCount;
					const T = editCount;
					const expected = {
						// As part of rebasing the peer branch that contains the prior peer edits,
						//   we rebase all edits on the branch over the one new trunk edit.
						//   For the Ith peer edit there are I - 1 edits to rebase.
						//     the Kth local edit on the branch is rebased over the composition of...
						//       - the inverse of each local edit before it
						//       - the new trunk edit
						//       - the rebased version of each local edit before it
						//     This adds up to 1 rebase for the Kth edit.
						//     Summing over all I - 1 edits gives us I - 1 rebases for the Ith branch rebase.
						//   Summing over all P edits transforms I into P(P + 1)/2
						//   This gives us: P(P + 1)/2 - P
						//   Which simplifies to: (P² + P)/2 - P
						// As part of rebasing the new peer edit to the tip of the trunk,
						//   For the Ith peer edit, we rebase it over...
						//     - the inverse of the peer edits on the peer branch: I - 1
						//     - the trunk edits that were not contributed by that peer: T - (I - 1)
						//     - the the rebased version of the peer edits (now on the trunk): I - 1
						//   This adds up to I - 1 + T rebases for the Ith edit.
						//   Summing over all P edits transforms I into P(P + 1)/2
						//   This gives us: P(P + 1)/2 - P + PT
						//   Which simplifies to: (P² - P)/2 + PT
						// Adding both terms and simplifying:
						rebased: P * (P + T - 1),
						// As part of rebasing the peer branch that contains the prior peer edits,
						//   For the Ith peer edit there are I-1 edits to invert.
						//   Summing over all P transforms I into P(P + 1)/2
						//   Which gives us: P(P + 1)/2 - P
						//   Which simplifies to: P(P - 1)/2
						// As part of rebasing the new peer edit to the tip of the trunk,
						//   For the Ith peer edit, there are I - 1 edits to invert.
						//   Summing over all P transforms I into P(P + 1)/2
						//   Which gives us: P(P + 1)/2 - P
						//   Which simplifies to: P(P - 1)/2
						// Adding both terms:
						inverted: (P - 1) * P,
						// As part of rebasing the peer branch that contains the prior peer edits,
						//   we compose the new trunk edit: 1
						//   then for the Ith peer edit there are I - 1 edits to rebase.
						//     for each of them we compose...
						//       - the inverse of the local edit: 1
						//       - the previous composition: 1
						//       - the rebased version of the local edit: 1
						//     This adds up to 3I - 3 peer changes composed per branch rebase.
						//   This adds up to 3I - 2 changes composed per branch rebase.
						// Summing over all P branch rebases transforms I into P(P + 1)/2
						// Which gives us: 3P(P + 1)/2 - 2P
						// Which simplifies to: (3P² - P)/2
						// Which gives us: (3P² - P)/2 - 1
						// From that, we have to subtract 1 for the first branch rebase, which is skipped.
						// As part of updating the local branch,
						//   for the Ith peer edit we compose that peer edit: 1
						//   Summing over all P branch rebases gives us: P
						// Adding both terms and simplifying:
						composed: (3 * P ** 2 + P) / 2 - 1,
					};
					assert.deepEqual(actual, expected);
				});
			}
		});

		describe("Single peer commit on top of existing peer branch", () => {
			describe("with peer commit ref# to the trunk edit that the existing peer branch should rebase over", () => {
				for (const { rebasedEditCount: P, trunkEditCount: T } of scenarios) {
					// This test simulates the following inputs to the EditManager:
					//   - Add trunk edit T1 with a ref seq# pointing to edit 0
					//   ...(incrementing the ref seq# for each T)
					//   - Add trunk edit Tc with a ref seq# pointing to edit Tc-1
					//   - Add peer edit P1 with a ref seq# pointing to edit 0
					//   ...(not incrementing the ref seq# for each P)
					//   - Add peer edit Pc with a ref seq# pointing to edit 0
					//   => we start measuring from here
					//   - Add peer edit P+ with a ref seq# pointing to edit Tc
					// This defines the following relationships between edits:
					//   (0)─(T1)─...─(Tc)
					//     |             └─(P1)─...─(Pc)─(P+)
					//     └───────────────(P1)─...─(Pc)
					// Before we start measuring, the EditManager has the following structure:
					//   (0)─(T1)─...─(Tc)─(P1)─...─(Pc)
					//     └───────────────(P1)─...─(Pc)
					// By the end of the test, the EditManager has the following structure:
					//   (0)─(T1)─...─(Tc)─(P1)─...─(Pc)─(P+)
					//                                      └─
					it(`For an existing peer branch with ${P} commits unaware of ${T} trunk commits`, () => {
						const rebaser = new NoOpChangeRebaser();
						const manager = testChangeEditManagerFactory({ rebaser }).manager;
						rebasePeerEditsOverTrunkEdits(P, T, manager, () => TestChange.emptyChange);
						rebaser.rebasedCount = 0;
						rebaser.invertedCount = 0;
						rebaser.composedCount = 0;
						manager.addSequencedChange(
							{
								change: TestChange.emptyChange,
								revision: mintRevisionTag(),
								sessionId: "peer" as SessionId,
							},
							brand(T + P + 1),
							brand(T),
						);
						const actual = {
							rebased: rebaser.rebasedCount,
							inverted: rebaser.invertedCount,
							composed: rebaser.composedCount,
						};
						const expected = {
							// As part of rebasing the peer branch that contains the phase-1 edits,
							//   we realize that the trunk already contains those edits.
							//   They therefore undergo no rebasing.
							// As part of rebasing P+ to the tip of the trunk,
							//   we realize that it is based on the tip of the trunk.
							//   It therefore undergoes no rebasing.
							rebased: 0,
							// As part of rebasing the peer branch that contains the phase-1 edits,
							//   we realize that the trunk already contains those edits.
							//   They therefore undergo no inverting.
							// As part of rebasing P+, we invert...
							//   - each of the phase-1 peer edits: P
							// Adding both terms and simplifying:
							inverted: P,
							// As part of rebasing the peer branch that contains the phase-1 edits, we compose...
							//   - the trunk edits: T
							//   then for the Ith local edit on the branch we compose...
							//     - the inverse of the local edit: 1
							//     - the previous composition: 1
							//     - the rebased version of the local edit: 1
							//   This adds up to 3 edits composed per edit on the branch
							// Summing for all P edit, this gives us: T + 3P
							// As part of rebasing the local branch, we compose...
							//   - the phase-2 peer edit: 1
							// Note: this composition is only needed to bake the RevisionTag into the changeset.
							// Adding both terms:
							composed: T + 3 * P + 1,
						};
						assert.deepEqual(actual, expected);
					});
				}
			});

			describe("with peer commit ref# to the trunk edit before the trunk edit that the existing peer branch should rebase over", () => {
				for (const { rebasedEditCount: P, trunkEditCount: T } of scenarios) {
					// This test simulates the following inputs to the EditManager:
					//   - Add trunk edit T1 with a ref seq# pointing to edit 0
					//   ...(incrementing the ref seq# for each T)
					//   - Add trunk edit Tc with a ref seq# pointing to edit Tc-1
					//   - Add trunk edit T+ with a ref seq# pointing to edit Tc
					//   - Add peer edit P1 with a ref seq# pointing to edit 0
					//   ...(not incrementing the ref seq# for each P)
					//   - Add peer edit Pc with a ref seq# pointing to edit 0
					//   => we start measuring from here
					//   - Add peer edit P+ with a ref seq# pointing to edit Tc
					// This defines the following relationships between edits:
					//   (0)─(T1)─...─(Tc)─(T+)
					//     |             └──────(P1)─...─(Pc)─(P+)
					//     └────────────────────(P1)─...─(Pc)
					// Before we start measuring, the EditManager has the following structure:
					//   (0)─(T1)─...─(Tc)─(T+)
					//     └────────────────────(P1)─...─(Pc)
					// By the end of the test, the EditManager has the following structure:
					//   (0)─(T1)─...─(Tc)─(T+)─(P1)─...─(Pc)─(P+)
					//                   └──(P1)─...─(Pc)─(P+)
					it(`For an existing peer branch with ${P} commits unaware of ${T}+1 trunk commits`, () => {
						const rebaser = new NoOpChangeRebaser();
						const manager = testChangeEditManagerFactory({ rebaser }).manager;
						rebasePeerEditsOverTrunkEdits(
							P,
							T + 1,
							manager,
							() => TestChange.emptyChange,
						);
						rebaser.rebasedCount = 0;
						rebaser.invertedCount = 0;
						rebaser.composedCount = 0;
						manager.addSequencedChange(
							{
								change: TestChange.emptyChange,
								revision: mintRevisionTag(),
								sessionId: "peer" as SessionId,
							},
							brand(T + P + 2),
							brand(T),
						);
						const actual = {
							rebased: rebaser.rebasedCount,
							inverted: rebaser.invertedCount,
							composed: rebaser.composedCount,
						};
						const expected = {
							// As part of rebasing the peer branch that contains the phase-1 edits,
							//   we rebase all P edits on the branch over T trunk edits.
							//     The Ith local edit on the branch is rebased over the composition of...
							//       - the inverse of each local edit before it
							//       - the T trunk edits
							//       - the rebased version of each local edit before it
							//     This adds up to 1 rebase for the Ith edit.
							//   Summing over all P edits gives us P rebases.
							// As part of rebasing P+,
							//   we rebase it over...
							//     - the inverse of each peer edit before it: P
							//       (these are based on commit Tc)
							//     - the one remaining trunk edit T+: 1
							//     - each peer fully rebased version of each peer edit before it: P
							//       (these are based on commit T+)
							//   This adds up to 2P + 1 rebases.
							// Adding both terms and simplifying:
							rebased: 3 * P + 1,
							// As part of rebasing the peer branch,
							//   we invert...
							//     - each of the phase-1 peer edits: P
							//       (these are based on commit 0)
							//   This adds up P inverts.
							// As part of rebasing P+ to the tip of the trunk,
							//   we invert...
							//     - each of the phase-1 peer edits: P
							//       (these are based on commit Tc)
							//   This adds up P inverts.
							// Adding both terms:
							inverted: 2 * P,
							// As part of rebasing the peer branch that contains the phase-1 edits, we compose...
							//   - the trunk edits: T
							//   then for the Ith local edit on the branch we compose...
							//     - the inverse of the local edit: 1
							//     - the previous composition: 1
							//     - the rebased version of the local edit: 1
							//   This adds up to 3 edits composed per edit on the branch
							// Summing for all P edit, this gives us: T + 3P
							// As part of rebasing the local branch,
							//   we compose...
							//     - the phase-2 peer edit P+: 1
							//   This adds up 1 edit composed.
							// Note: this composition is only needed to bake the RevisionTag into the changeset.
							// Adding both terms:
							composed: T + 3 * P + 1,
						};
						assert.deepEqual(actual, expected);
					});
				}
			});
		});
	});

	/**
	 * This test case effectively tests most of the scenarios covered by the other test cases.
	 * Despite that, it's good to keep the other tests cases for the following reasons:
	 *
	 * - They are easier to read and debug.
	 *
	 * - They help diagnose issues with the more complicated exhaustive test (e.g., if one of the above tests fails,
	 * but this one doesn't, then there might be something wrong with this test).
	 */
	it("Combinatorial test", () => {
		const meta = {
			peerRefs: makeArray(NUM_PEERS, () => 0),
			seq: 0,
			inFlight: 0,
		};
		for (const scenario of buildScenario([], meta)) {
			// Uncomment the code below to log the titles of generated scenarios.
			// This is helpful for creating a unit test out of a generated scenario that fails.
			// const title = scenario
			// 	.map((s) => {
			// 		if (s.type === "Pull") {
			// 			return `Pull(${s.seq}) from:${s.from} ref:${s.ref}`;
			// 		} else if (s.type === "Ack") {
			// 			return `Ack(${s.seq})`;
			// 		}
			// 		return `Push(${s.seq})`;
			// 	})
			// 	.join("|");
			// console.debug(title);
			runUnitTestScenario(undefined, scenario);
		}
	});
});

/**
 * State needed by the scenario builder.
 */
interface ScenarioBuilderState {
	/**
	 * The ref number of the last commit made by each peer (0 for peers that have made no commits).
	 */
	peerRefs: number[];
	/**
	 * The ref number of the last commit made by each peer (0 for peers that have made no commits).
	 */
	seq: number;
	/**
	 * The number of local changes that have yet to be acked.
	 */
	inFlight: number;
}

function* buildScenario(
	scenario: UnitTestScenarioStep[],
	meta: ScenarioBuilderState,
): Generator<readonly UnitTestScenarioStep[]> {
	if (scenario.length >= NUM_STEPS) {
		yield scenario;
	} else {
		// Push
		meta.inFlight += 1;
		scenario.push({ type: "Push" });
		for (const built of buildScenario(scenario, meta)) {
			yield built;
		}
		scenario.pop();
		meta.inFlight -= 1;

		// Ack (if there are any local changes)
		if (meta.inFlight > 0) {
			meta.inFlight -= 1;
			meta.seq += 1;
			scenario.push({ type: "Ack", seq: meta.seq });
			for (const built of buildScenario(scenario, meta)) {
				yield built;
			}
			scenario.pop();
			meta.seq -= 1;
			meta.inFlight += 1;
		}

		// Pull
		meta.seq += 1;
		for (let iPeer = 0; iPeer < NUM_PEERS; ++iPeer) {
			const prevRef = meta.peerRefs[iPeer];
			for (let ref = prevRef; ref < meta.seq; ++ref) {
				meta.peerRefs[iPeer] = ref;
				scenario.push({ type: "Pull", seq: meta.seq, ref, from: peers[iPeer] });
				for (const built of buildScenario(scenario, meta)) {
					yield built;
				}
				scenario.pop();
			}
			meta.peerRefs[iPeer] = prevRef;
		}
		meta.seq -= 1;
	}
}

function runUnitTestScenario(
	title: string | undefined,
	steps: readonly UnitTestScenarioStep[],
	rebaser?: ChangeRebaser<TestChange>,
): void {
	const run = (advanceMinimumSequenceNumber: boolean) => {
		const { manager } = testChangeEditManagerFactory({ rebaser });
		/**
		 * An `EditManager` that is kept up to date with all sequenced edits.
		 * Used as a source of summary data to spin-up `joiners`.
		 * This `EditManager` never has local changes.
		 */
		const summarizer = testChangeEditManagerFactory({
			rebaser,
			sessionId: "Summarizer" as SessionId,
		}).manager;
		/**
		 * A set of `EditManager`s spun-up based on summaries produced by `summarizer`.
		 * One such joiner is produced after every sequenced edit (i.e., after every "Ack" or "Pull" step).
		 * These are kept up to date with all sequenced edits.
		 * Used to check that summarization works properly.
		 */
		const joiners: TestEditManager[] = [];
		/**
		 * Local helper to update all the state that is dependent on the sequencing of new edits.
		 */
		const recordSequencedEdit = (commit: TestCommit): void => {
			trunk.push(commit.seqNumber);
			summarizer.addSequencedChange(commit, commit.seqNumber, commit.refNumber);
			for (const j of joiners) {
				j.addSequencedChange(commit, commit.seqNumber, commit.refNumber);
			}
		};
		/**
		 * Ordered list of local commits that have not yet been sequenced (i.e., `pushed - acked`)
		 */
		const localCommits: TestCommit[] = [];
		/**
		 * Ordered list of intentions that the manager has been made aware of (i.e., `pushed ⋃ pulled`).
		 */
		let knownToLocal: number[] = [];
		/**
		 * Ordered list of intentions that have been sequenced (i.e., `acked ⋃ pulled`)
		 */
		const trunk: number[] = [];
		/**
		 * The sequence number of the most recent sequenced commit that the manager is aware of
		 */
		let localRef: number = 0;
		/**
		 * The greatest sequence number that could have been received by all peers at the time when the local
		 * session is made aware of the given sequence number.
		 */
		const computeMinimumSequenceNumber = (sequenceNumber: number) => {
			if (advanceMinimumSequenceNumber) {
				// Find all non-local peers participating in this scenario by scanning the scenario steps
				const activePeers = steps
					.filter((s): s is UnitTestPullStep => s.type === "Pull")
					.map((s) => s.from);

				// For each peer, find its next step and extract the ref number.
				// The min of all these ref numbers for all peers is the highest possible min sequence number across those peers.
				const minPeerRef = activePeers
					.map(
						(peer) =>
							steps
								.filter(
									(s): s is UnitTestPullStep =>
										s.type === "Pull" && s.from === peer,
								)
								.find((s) => s.seq > sequenceNumber)?.ref ??
							Number.POSITIVE_INFINITY,
					)
					.reduce((p, c) => Math.min(p, c), Number.POSITIVE_INFINITY);

				// Compute the true min sequence number by including our local session's last seen sequence number as well.
				return Math.min(sequenceNumber, minPeerRef);
			}

			return 0;
		};
		/**
		 * The sequence number of the last sequenced in the scenario.
		 */
		const finalSequencedEdit = [...steps].reverse().find((s) => s.type !== "Push")?.seq ?? 0;
		/**
		 * The Ack steps of the scenario
		 */
		const acks = steps.filter((s) => s.type === "Ack") as readonly UnitTestAckStep[];
		/**
		 * Index of the "Ack" step in `acks` that matches the next encountered "Push" step
		 */
		let iNextAck = 0;
		for (const step of steps) {
			const minimumSequenceNumber = computeMinimumSequenceNumber(
				step.type === "Push" ? localRef : step.seq,
			);
			const type = step.type;
			switch (type) {
				case "Push": {
					let seq = step.seq;
					if (seq === undefined) {
						seq =
							iNextAck < acks.length
								? acks[iNextAck].seq
								: // If the pushed edit is never Ack-ed, assign the next available sequence number to it.
								  finalSequencedEdit + 1 + iNextAck - acks.length;
					}
					iNextAck += 1;
					const changeset = TestChange.mint(knownToLocal, seq);
					const revision = mintRevisionTag();
					const commit: TestCommit = {
						revision,
						sessionId: localSessionId,
						seqNumber: brand(seq),
						refNumber: brand(localRef),
						change: changeset,
					};
					localCommits.push(commit);
					knownToLocal.push(seq);
					// Local changes should always lead to a delta that is equivalent to the local change.
					manager.localBranch.apply(changeset, revision);
					assert.deepEqual(
						asDelta(manager.localBranch.getHead().change.intentions),
						asDelta([seq]),
					);
					break;
				}
				case "Ack": {
					const seq = step.seq;
					const commit = localCommits.shift();
					if (commit === undefined) {
						fail("Invalid test scenario: no local commit to acknowledge");
					}
					if (commit.seqNumber !== seq) {
						fail(
							"Invalid test scenario: acknowledged commit does not mach oldest local change",
						);
					}
					const delta = addSequencedChange(
						manager,
						commit,
						commit.seqNumber,
						commit.refNumber,
					);
					// Acknowledged (i.e., sequenced) local changes should always lead to an empty delta.
					assert.deepEqual(delta, emptyDelta);
					localRef = commit.seqNumber;
					manager.advanceMinimumSequenceNumber(brand(minimumSequenceNumber));
					recordSequencedEdit(commit);
					break;
				}
				case "Pull": {
					const seq = step.seq;
					/**
					 * Filter that includes changes that were on the trunk of the issuer of this commit.
					 */
					const peerTrunkChangesFilter = (s: UnitTestScenarioStep) =>
						s.type !== "Push" && s.seq <= step.ref;
					/**
					 * Filter that includes changes that were local to the issuer of this commit.
					 */
					const peerLocalChangesFilter = (s: UnitTestScenarioStep) =>
						s.type === "Pull" &&
						s.seq > step.ref &&
						s.seq < step.seq &&
						s.from === step.from;
					/**
					 * Changes that were known to the peer at the time it authored this commit.
					 */
					const knownToPeer: number[] = [
						...steps.filter(peerTrunkChangesFilter),
						...steps.filter(peerLocalChangesFilter),
					].map((s) => s.seq ?? fail("Sequenced changes must all have a seq number"));
					const commit: TestCommit = {
						revision: mintRevisionTag(),
						sessionId: step.from,
						seqNumber: brand(seq),
						refNumber: brand(step.ref),
						change: TestChange.mint(knownToPeer, seq),
					};
					/**
					 * Ordered list of intentions for local changes
					 */
					const localIntentions = localCommits.map((c) => c.seqNumber);
					// When a peer commit is received we expect the update to be equivalent to the
					// retraction of any local changes, followed by the peer changes, followed by the
					// updated version of the local changes.
					const expected = [
						...localIntentions.map((i) => -i).reverse(),
						seq,
						...localIntentions,
					];
					const delta = addSequencedChange(
						manager,
						commit,
						commit.seqNumber,
						commit.refNumber,
					);
					assert.deepEqual(delta, asDelta(expected));
					if (step.expectedDelta !== undefined) {
						// Verify that the test case was annotated with the right expectations.
						assert.deepEqual(step.expectedDelta, expected);
					}
					recordSequencedEdit(commit);
					knownToLocal = [...trunk, ...localCommits.map((c) => c.seqNumber)];
					localRef = commit.seqNumber;
					manager.advanceMinimumSequenceNumber(brand(minimumSequenceNumber));
					break;
				}
				default:
					unreachableCase(type);
			}
			// The exposed trunk and local changes should reflect what is known to the local client
			checkChangeList(
				manager,
				knownToLocal.filter(
					// Only expect changes which have not been dropped by trunk eviction
					(i) => i > minimumSequenceNumber,
				),
			);
			checkChangeList(summarizer, trunk);

			// Spin-up a new joiner whenever a summary client would have a different state.
			// This assumes summary clients have no local changes, which may change in the future.
			if (step.type !== "Push") {
				const joiner = testChangeEditManagerFactory({
					rebaser,
					sessionId: `Join${joiners.length}` as SessionId,
				}).manager;
				const summary = clone(summarizer.getSummaryData());
				joiner.loadSummaryData(summary);
				joiners.push(joiner);
			}

			// Verify that clients spun-up based on summaries are able to interpret new edits properly
			for (const j of joiners) {
				checkChangeList(j, trunk);
			}
		}
	};
	if (title !== undefined) {
		// Run two versions of the scenario, one where the minimum sequence number is advanced and one where it is not
		it(title, () => run(false));
		it(`${title} (while advancing the min seq number)`, () => run(true));
	} else {
		run(true);
	}
}

function checkChangeList(manager: TestEditManager, intentions: number[]): void {
	TestChange.checkChangeList(getAllChanges(manager), intentions);
}

function getAllChanges(manager: TestEditManager): RecursiveReadonly<TestChange>[] {
	return manager.getTrunkChanges().concat(manager.getLocalChanges());
}

/** Adds a sequenced change to an `EditManager` and returns the delta that was caused by the change */
function addSequencedChange(
	editManager: TestEditManager,
	...args: Parameters<(typeof editManager)["addSequencedChange"]>
): DeltaRoot {
	let delta: DeltaRoot = emptyDelta;
	const offChange = editManager.localBranch.on("afterChange", ({ change }) => {
		if (change !== undefined) {
			delta = asDelta(change.change.intentions);
		}
	});
	editManager.addSequencedChange(...args);
	offChange();
	return delta;
}
