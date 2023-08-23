/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import { unreachableCase } from "@fluidframework/common-utils";
import {
	ChangeFamily,
	SessionId,
	ChangeRebaser,
	TaggedChange,
	emptyDelta,
	mintRevisionTag,
	ChangeFamilyEditor,
	Delta,
} from "../../core";
import { brand, clone, makeArray, RecursiveReadonly } from "../../util";
import {
	TestChange,
	UnrebasableTestChangeRebaser,
	ConstrainedTestChangeRebaser,
	asDelta,
	NoOpChangeRebaser,
} from "../testChange";
import { Commit, EditManager, SeqNumber } from "../../shared-tree-core";
import {
	TestEditManager,
	editManagerFactory,
	rebaseLocalEditsOverTrunkEdits,
	rebasePeerEditsOverTrunkEdits,
} from "./editManagerTestUtils";

const localSessionId: SessionId = "0";
const peer1: SessionId = "1";
const peer2: SessionId = "2";

// TODO:#4557: Change the number of steps back to 5 once the way these tests are run changes
const NUM_STEPS = 4;
const NUM_PEERS = 2;
const peers: SessionId[] = makeArray(NUM_PEERS, (i) => String(i + 1));

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
				const { manager } = editManagerFactory({});
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
				const { manager } = editManagerFactory({});
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
				const { manager } = editManagerFactory({});
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
				const { manager } = editManagerFactory({});
				manager.addSequencedChange(applyLocalCommit(manager, [], 1), brand(1), brand(0));
				manager.advanceMinimumSequenceNumber(brand(2));
				manager.addSequencedChange(applyLocalCommit(manager, [1], 2), brand(3), brand(2));
				checkChangeList(manager, [2]);
			});

			it("Evicts properly when the minimum sequence number advances past the trunk (and there are local commits)", () => {
				const { manager } = editManagerFactory({});
				manager.addSequencedChange(applyLocalCommit(manager, [], 1), brand(1), brand(0));
				const local = applyLocalCommit(manager, [1], 2);
				manager.advanceMinimumSequenceNumber(brand(2));
				manager.addSequencedChange(local, brand(3), brand(2));
				checkChangeList(manager, [2]);
			});

			it("Delays eviction of a branch base commit until the branch is disposed", () => {
				const { manager } = editManagerFactory({});
				manager.addSequencedChange(applyLocalCommit(manager, [], 1), brand(1), brand(0));
				const local = applyLocalCommit(manager, [1], 2);
				const fork = manager.localBranch.fork();
				manager.addSequencedChange(local, brand(2), brand(1));
				checkChangeList(manager, [1, 2]);
				manager.advanceMinimumSequenceNumber(brand(2));
				checkChangeList(manager, [2]);
				fork.dispose();
				checkChangeList(manager, []);
			});

			it("Evicts after the oldest branch rebases", () => {
				const { manager } = editManagerFactory({});
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
				checkChangeList(manager, [2]);
				fork1.rebaseOnto(manager.localBranch);
				checkChangeList(manager, [2]);
				fork2.rebaseOnto(manager.localBranch);
				checkChangeList(manager, []);
			});

			it("Evicts properly when changes come in batches having the same sequence number", () => {
				const { manager } = editManagerFactory({});
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

			// TODO:#4593: Add test to ensure that peer branches don't pass in incorrect repairDataStoreProviders when rebasing
		});

		it("Rebases anchors over local changes", () => {
			const { manager, anchors } = editManagerFactory({});
			const change = TestChange.mint([], 1);
			manager.localBranch.apply(change, mintRevisionTag());
			assert.deepEqual(anchors.rebases, [change]);
			assert.deepEqual(anchors.intentions, change.intentions);
		});

		it("Rebases anchors over sequenced changes", () => {
			const { manager, anchors } = editManagerFactory({});
			const change = TestChange.mint([], 1);
			manager.addSequencedChange(
				{
					change,
					revision: mintRevisionTag(),
					sessionId: peer1,
				},
				brand(1),
				brand(0),
			);
			assert.deepEqual(anchors.rebases, [change]);
			assert.deepEqual(anchors.intentions, change.intentions);
		});

		it("Updates local branch when loading from summary", () => {
			// This regression tests ensures that the local branch is rebased to the head of the trunk
			// when the trunk is modified by a summary load
			const { manager } = editManagerFactory({});
			const revision = mintRevisionTag();
			manager.loadSummaryData({
				trunk: [
					{
						change: TestChange.mint([0], [1]),
						revision,
						sessionId: "0",
						sequenceNumber: brand(1),
					},
				],
				branches: new Map(),
			});
			manager.addSequencedChange(
				{
					change: TestChange.mint([0, 1], [2]),
					revision: mintRevisionTag(),
					sessionId: "1",
				},
				brand(2),
				brand(1),
			);
			assert.equal(manager.localBranch.getHead(), manager.getTrunkHead());
		});

		describe("Reports correct max branch length", () => {
			it("When there are no branches", () => {
				const { manager } = editManagerFactory({ rebaser: new NoOpChangeRebaser() });
				assert.equal(manager.getLongestBranchLength(), 0);
			});
			it("When the local branch is longest", () => {
				const { manager } = editManagerFactory({ rebaser: new NoOpChangeRebaser() });
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
				const { manager } = editManagerFactory({ rebaser: new NoOpChangeRebaser() });
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
			for (const { rebasedEditCount, trunkEditCount } of scenarios) {
				it(`Rebase ${rebasedEditCount} local commits over ${trunkEditCount} trunk commits`, () => {
					const rebaser = new NoOpChangeRebaser();
					rebaseLocalEditsOverTrunkEdits(rebasedEditCount, trunkEditCount, rebaser);
					assert.equal(rebaser.rebasedCount, trunkEditCount * rebasedEditCount ** 2);
					assert.equal(rebaser.invertedCount, trunkEditCount * rebasedEditCount);
					assert.equal(
						rebaser.composedCount,
						trunkEditCount * (rebasedEditCount * 2 + 1),
					);
					assert.equal(rebaser.rebaseAnchorCallsCount, trunkEditCount + rebasedEditCount);
				});
			}
		});
		describe("Peer commit rebasing", () => {
			for (const { rebasedEditCount, trunkEditCount } of scenarios) {
				it(`Rebase ${rebasedEditCount} peer commits over ${trunkEditCount} trunk commits`, () => {
					const rebaser = new NoOpChangeRebaser();
					rebasePeerEditsOverTrunkEdits(rebasedEditCount, trunkEditCount, rebaser);
					assert.equal(
						rebaser.rebasedCount,
						trunkEditCount * rebasedEditCount +
							rebasedEditCount * (rebasedEditCount - 1),
					);

					assert.equal(rebaser.invertedCount, rebasedEditCount - 1);
					assert.equal(rebaser.composedCount, trunkEditCount + rebasedEditCount);
					assert.equal(rebaser.rebaseAnchorCallsCount, trunkEditCount + rebasedEditCount);
				});
			}
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
		const { manager, anchors } = editManagerFactory({ rebaser });
		/**
		 * An `EditManager` that is kept up to date with all sequenced edits.
		 * Used as a source of summary data to spin-up `joiners`.
		 * This `EditManager` never has local changes.
		 */
		const summarizer = editManagerFactory({ rebaser, sessionId: "Summarizer" }).manager;
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
						manager.changeFamily.intoDelta(manager.localBranch.getHead().change),
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
			// Anchors should be kept up to date with the known intentions
			assert.deepEqual(anchors.intentions, knownToLocal);
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
				const joiner = editManagerFactory({
					rebaser,
					sessionId: `Join${joiners.length}`,
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
	...args: Parameters<typeof editManager["addSequencedChange"]>
): Delta.Root {
	let delta: Delta.Root = emptyDelta;
	const offChange = editManager.localBranch.on("change", ({ change }) => {
		if (change !== undefined) {
			delta = editManager.changeFamily.intoDelta(change);
		}
	});
	editManager.addSequencedChange(...args);
	offChange();
	return delta;
}
