/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { describeStress, StressMode } from "@fluid-private/stochastic-test-utils";
import type { SessionId } from "@fluidframework/id-compressor";

import type { ChangeFamily, ChangeFamilyEditor, RevisionTag } from "../../../core/index.js";
import type {
	Commit,
	EditManager,
	SharedTreeBranch,
} from "../../../shared-tree-core/index.js";
import { brand, makeArray } from "../../../util/index.js";
import { NoOpChangeRebaser, TestChange } from "../../testChange.js";
import { mintRevisionTag } from "../../utils.js";

import { buildScenario, runUnitTestScenario } from "./editManagerScenario.js";
import { checkChangeList, testChangeEditManagerFactory } from "./editManagerTestUtils.js";

const localSessionId: SessionId = "0" as SessionId;
const peer1: SessionId = "1" as SessionId;
const peer2: SessionId = "2" as SessionId;

export function testCorrectness() {
	describe("Correctness", () => {
		describe("Unit Tests", () => {
			runUnitTestScenario(
				"Can handle non-concurrent local changes being sequenced immediately",
				[
					{ seq: 1, type: "Push" },
					{ seq: 1, type: "Ack" },
					{ seq: 2, type: "Push" },
					{ seq: 2, type: "Ack" },
					{ seq: 3, type: "Push" },
					{ seq: 3, type: "Ack" },
				],
			);

			runUnitTestScenario("Can handle non-concurrent local changes being sequenced later", [
				{ seq: 1, type: "Push" },
				{ seq: 2, type: "Push" },
				{ seq: 3, type: "Push" },
				{ seq: 1, type: "Ack" },
				{ seq: 2, type: "Ack" },
				{ seq: 3, type: "Ack" },
			]);

			runUnitTestScenario(
				"Can handle non-concurrent local changes partially sequenced later",
				[
					{ seq: 1, type: "Push" },
					{ seq: 2, type: "Push" },
					{ seq: 1, type: "Ack" },
					{ seq: 3, type: "Push" },
					{ seq: 2, type: "Ack" },
					{ seq: 3, type: "Ack" },
				],
			);

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
				{
					seq: 1,
					type: "Pull",
					ref: 0,
					from: peer1,
					expectedDelta: [-5, -4, -3, 1, 3, 4, 5],
				},
				{
					seq: 2,
					type: "Pull",
					ref: 1,
					from: peer1,
					expectedDelta: [-5, -4, -3, 2, 3, 4, 5],
				},
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
				it("Evicts trunk commits according to a provided minimum sequence number", () => {
					const { manager } = testChangeEditManagerFactory({});
					const trimmedCommits = trackTrimmed(manager.localBranch);
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					for (let i = 1; i <= 10; ++i) {
						const commit = applyLocalCommit(manager);
						expectedTrimmedRevisions.add(commit.revision);
						manager.addSequencedChanges([commit], commit.sessionId, brand(i), brand(i - 1));
					}

					assert.equal(manager.getTrunkChanges().length, 10);
					manager.advanceMinimumSequenceNumber(brand(5));
					assert.equal(manager.getTrunkChanges().length, 5);
					manager.advanceMinimumSequenceNumber(brand(10));
					assert.equal(manager.getTrunkChanges().length, 0);
					for (let i = 11; i <= 20; ++i) {
						const commit = applyLocalCommit(manager);
						expectedTrimmedRevisions.add(commit.revision);
						manager.addSequencedChanges([commit], commit.sessionId, brand(i), brand(i - 1));
					}

					assert.equal(manager.getTrunkChanges().length, 10);
					manager.advanceMinimumSequenceNumber(brand(15));
					assert.equal(manager.getTrunkChanges().length, 5);
					manager.advanceMinimumSequenceNumber(brand(20));
					assert.equal(manager.getTrunkChanges().length, 0);

					assert.deepEqual(trimmedCommits, expectedTrimmedRevisions);
				});

				it("Evicts trunk commits at exactly the minimum sequence number", () => {
					const { manager } = testChangeEditManagerFactory({});
					const trimmedCommits = trackTrimmed(manager.localBranch);
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					const commit1 = applyLocalCommit(manager);
					expectedTrimmedRevisions.add(commit1.revision);
					manager.addSequencedChanges([commit1], commit1.sessionId, brand(1), brand(0));
					assert.equal(manager.getTrunkChanges().length, 1);
					const commit2 = applyLocalCommit(manager);
					expectedTrimmedRevisions.add(commit2.revision);
					manager.addSequencedChanges([commit2], commit2.sessionId, brand(2), brand(1));
					assert.equal(manager.getTrunkChanges().length, 2);
					manager.advanceMinimumSequenceNumber(brand(1));
					assert.equal(manager.getTrunkChanges().length, 1);
					const commit3 = applyLocalCommit(manager);
					expectedTrimmedRevisions.add(commit3.revision);
					manager.addSequencedChanges([commit3], commit3.sessionId, brand(3), brand(2));
					assert.equal(manager.getTrunkChanges().length, 2);
					manager.advanceMinimumSequenceNumber(brand(3));
					assert.equal(manager.getTrunkChanges().length, 0);

					assert.deepEqual(trimmedCommits, expectedTrimmedRevisions);
				});

				it("Rebases peer branches", () => {
					// This is a regression test that ensures peer branches are rebased up to at least the new tail of the trunk after trunk commits are evicted.
					const { manager } = testChangeEditManagerFactory({});
					const trimmedCommits = trackTrimmed(manager.localBranch);
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					// First, we receive a commit from a peer ("1").
					const peerCommit1 = peerCommit(peer1, [], 1);
					expectedTrimmedRevisions.add(peerCommit1.revision);
					manager.addSequencedChanges(
						[peerCommit1],
						peerCommit1.sessionId,
						brand(1),
						brand(0),
					);
					// We then submit and ack a local commit ("2").
					// This prevents an upcoming rebase of the peer branch from hitting an eager fast-path that keeps the branch caught up to the head of the trunk.
					const commit1 = applyLocalCommit(manager, [1], 2);
					expectedTrimmedRevisions.add(commit1.revision);
					manager.addSequencedChanges([commit1], commit1.sessionId, brand(2), brand(1));
					// We receive a second commit from the peer ("3").
					// Based on the ref seq number, we know that the peer is lagging "behind" by two commits,
					// i.e. it has sent a second op without receiving its first op ("1") or the local op ("2") that we applied just above.
					const peerCommit2 = peerCommit(peer1, [1], 3);
					expectedTrimmedRevisions.add(peerCommit2.revision);
					manager.addSequencedChanges(
						[peerCommit2],
						peerCommit2.sessionId,
						brand(3),
						brand(0),
					);
					// Our trunk should have all the commits we've sequenced so far.
					checkChangeList(manager, [1, 2, 3]);
					// Suppose that the peer catches up, and we are informed of the new minimum sequence number via some means (e.g. an op).
					manager.advanceMinimumSequenceNumber(brand(3));
					// Eviction ocurred, so we now expect the trunk to be fully evicted.
					checkChangeList(manager, []);
					// We also expect our copy of the peer's local branch to be updated even though we have not received any new commits from that peer since commit "3".
					// We can check this by receiving another commit from our peer.
					// We'll fail when trying to rebase if the branch was not already updated and is referencing evicted commits.
					const peerCommit3 = peerCommit(peer1, [1, 2, 3], 4);
					manager.addSequencedChanges(
						[peerCommit3],
						peerCommit3.sessionId,
						brand(4),
						brand(3),
					);
					checkChangeList(manager, [4]);

					assert.deepEqual(trimmedCommits, expectedTrimmedRevisions);
				});

				it("Evicts properly when the minimum sequence number advances past the trunk (and there are no local commits)", () => {
					const { manager } = testChangeEditManagerFactory({});
					const trimmedCommits = trackTrimmed(manager.localBranch);
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					const commit1 = applyLocalCommit(manager, [], 1);
					expectedTrimmedRevisions.add(commit1.revision);
					manager.addSequencedChanges([commit1], commit1.sessionId, brand(1), brand(0));
					manager.advanceMinimumSequenceNumber(brand(2));
					const managerCommit1 = applyLocalCommit(manager, [1], 2);
					manager.addSequencedChanges(
						[managerCommit1],
						managerCommit1.sessionId,
						brand(3),
						brand(2),
					);
					checkChangeList(manager, [2]);

					assert.deepEqual(trimmedCommits, expectedTrimmedRevisions);
				});

				it("Evicts properly when the minimum sequence number advances past the trunk (and there are local commits)", () => {
					const { manager } = testChangeEditManagerFactory({});
					const trimmedCommits = trackTrimmed(manager.localBranch);
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					const commit1 = applyLocalCommit(manager, [], 1);
					expectedTrimmedRevisions.add(commit1.revision);
					manager.addSequencedChanges([commit1], commit1.sessionId, brand(1), brand(0));
					const local = applyLocalCommit(manager, [1], 2);
					manager.advanceMinimumSequenceNumber(brand(2));
					manager.addSequencedChanges([local], local.sessionId, brand(3), brand(2));
					checkChangeList(manager, [2]);

					assert.deepEqual(trimmedCommits, expectedTrimmedRevisions);
				});

				it("Delays eviction of a branch base commit until the branch is disposed", () => {
					const { manager } = testChangeEditManagerFactory({});
					const trimmedCommits = trackTrimmed(manager.localBranch);
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					const commit1 = applyLocalCommit(manager, [], 1);
					expectedTrimmedRevisions.add(commit1.revision);
					manager.addSequencedChanges([commit1], commit1.sessionId, brand(1), brand(0));
					const local = applyLocalCommit(manager, [1], 2);
					const fork = manager.localBranch.fork();
					manager.addSequencedChanges([local], local.sessionId, brand(2), brand(1));
					expectedTrimmedRevisions.add(local.revision);
					checkChangeList(manager, [1, 2]);
					manager.advanceMinimumSequenceNumber(brand(2));
					checkChangeList(manager, [2]);
					fork.dispose();
					checkChangeList(manager, []);

					assert.deepEqual(trimmedCommits, expectedTrimmedRevisions);
				});

				it("Evicts after the oldest branch rebases (fast-forward)", () => {
					const { manager } = testChangeEditManagerFactory({});
					const trimmedCommits = trackTrimmed(manager.localBranch);
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					const local1 = applyLocalCommit(manager, [], 1);
					const fork1 = manager.localBranch.fork();
					expectedTrimmedRevisions.add(local1.revision);
					manager.addSequencedChanges([local1], local1.sessionId, brand(1), brand(0));
					const local2 = applyLocalCommit(manager, [1], 2);
					const fork2 = manager.localBranch.fork();
					manager.addSequencedChanges([local2], local2.sessionId, brand(2), brand(1));
					checkChangeList(manager, [1, 2]);

					// The code above defines the following relationships between commits:
					//   (r)─(1)─(2) <- local
					//     |   └─(2) <- fork2
					//     └─(1)  <- fork1

					// However, commits 1 and 2 are sequenced as-is (i.e., without rebasing), which leads to those commits becoming part of the trunk.
					// This leads to fork1 and fork2 being fast-forwarded onto the trunk:
					//   (r)─(1)─(2)
					//         |   └─ <- fork2
					//         └─ <- fork1

					manager.advanceMinimumSequenceNumber(brand(2));
					// Advancing the minimum sequence number does not evict any commits because fork1 branches off of the trunk at commit 1.
					checkChangeList(manager, [1, 2]);

					fork1.rebaseOnto(fork2);
					// Rebasing fork1 onto fork2 leads to the following configuration:
					//   (r)─(1)─(2) <- local
					//             └─ <- fork1 & fork2
					// This allows the eviction of commit 1.
					//   (r)─(2) <- local
					//         └─ <- fork1 & fork2
					checkChangeList(manager, [2]);

					fork1.rebaseOnto(manager.localBranch);
					fork2.rebaseOnto(manager.localBranch);
					// Rebasing the forks onto the local branch has no effect because they were already at the tip.
					checkChangeList(manager, [2]);

					assert.deepEqual(trimmedCommits, expectedTrimmedRevisions);
				});

				it("Evicts after the oldest branch rebases (no fast-forward)", () => {
					const { manager } = testChangeEditManagerFactory({});
					const trimmedCommits = trackTrimmed(manager.localBranch);
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					const local1 = applyLocalCommit(manager, [], 2);
					const fork1 = manager.localBranch.fork();
					const peerCommit1 = peerCommit(peer1, [], 1);
					expectedTrimmedRevisions.add(peerCommit1.revision);
					manager.addSequencedChanges(
						[peerCommit1],
						peerCommit1.sessionId,
						brand(1),
						brand(0),
					);
					expectedTrimmedRevisions.add(local1.revision);
					manager.addSequencedChanges([local1], local1.sessionId, brand(2), brand(0));
					const local2 = applyLocalCommit(manager, [1, 2], 4);
					const fork2 = manager.localBranch.fork();
					const peerCommit2 = peerCommit(peer1, [1, 2], 3);
					expectedTrimmedRevisions.add(peerCommit2.revision);
					manager.addSequencedChanges(
						[peerCommit2],
						peerCommit2.sessionId,
						brand(3),
						brand(2),
					);
					manager.addSequencedChanges([local2], local2.sessionId, brand(4), brand(2));
					checkChangeList(manager, [1, 2, 3, 4]);

					// The code above defines the following relationships between commits:
					//   (r)─(1)─(2')─(3)─(4') <- local
					//     |        └─(4) <- fork2
					//     └─(2)          <- fork1
					// The peer commits (1 and 3) prevent the forks from being fast-forwarded onto the trunk.

					manager.advanceMinimumSequenceNumber(brand(4));
					// Advancing the minimum sequence number does not evict any commits because fork1 branches off of the trunk before commit 1.
					checkChangeList(manager, [1, 2, 3, 4]);

					fork1.rebaseOnto(manager.localBranch);
					// Rebasing fork1 onto the local branch leads to the following configuration:
					//   (r)─(1)─(2')─(3)─(4') <- local
					//              |        └─ <- fork1
					//              └─(4) <- fork2
					// This allows commit 1 to be evicted:
					//   (r)─(2')─(3)─(4') <- local
					//          |        └─ <- fork1
					//          └─(4) <- fork2
					checkChangeList(manager, [2, 3, 4]);

					fork2.rebaseOnto(manager.localBranch);
					// Rebasing fork2 onto the local branch leads to the following configuration:
					//   (r)─(2')─(3)─(4') <- local
					//                   └─ <- fork1 & fork2
					// This allows commit 2' & 3 to be evicted:
					//   (r)─(4') <- local
					//          └─ <- fork1 & fork2
					checkChangeList(manager, [4]);

					assert.deepEqual(trimmedCommits, expectedTrimmedRevisions);
				});

				it("Evicts properly when changes come in batches having the same sequence number", () => {
					const { manager } = testChangeEditManagerFactory({});
					const trimmedCommits = trackTrimmed(manager.localBranch);
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					const peerCommit1 = peerCommit(peer1, [], 1);
					expectedTrimmedRevisions.add(peerCommit1.revision);
					const peerCommit2 = peerCommit(peer1, [1], 2);
					expectedTrimmedRevisions.add(peerCommit2.revision);
					const peerCommit3 = peerCommit(peer1, [1, 2], 3);
					expectedTrimmedRevisions.add(peerCommit3.revision);
					manager.addSequencedChanges(
						[peerCommit1],
						peerCommit1.sessionId,
						brand(1),
						brand(0),
					);
					manager.addSequencedChanges(
						[peerCommit2],
						peerCommit2.sessionId,
						brand(1),
						brand(0),
					);
					manager.addSequencedChanges(
						[peerCommit3],
						peerCommit3.sessionId,
						brand(1),
						brand(0),
					);
					checkChangeList(manager, [1, 2, 3]);
					manager.advanceMinimumSequenceNumber(brand(2));
					checkChangeList(manager, []);
					const peerCommit4 = peerCommit(peer1, [1, 2, 3], 4);
					expectedTrimmedRevisions.add(peerCommit4.revision);
					manager.addSequencedChanges(
						[peerCommit4],
						peerCommit4.sessionId,
						brand(4),
						brand(1),
					);
					const peerCommit5 = peerCommit(peer1, [1, 2, 3, 4], 5);
					expectedTrimmedRevisions.add(peerCommit5.revision);
					manager.addSequencedChanges(
						[peerCommit5],
						peerCommit5.sessionId,
						brand(4),
						brand(1),
					);
					const peerCommit6 = peerCommit(peer2, [1, 2, 3, 4, 5], 6);
					manager.addSequencedChanges(
						[peerCommit6],
						peerCommit6.sessionId,
						brand(5),
						brand(4),
					);
					const peerCommit7 = peerCommit(peer2, [1, 2, 3, 4, 5, 6], 7);
					manager.addSequencedChanges(
						[peerCommit7],
						peerCommit7.sessionId,
						brand(5),
						brand(4),
					);
					const peerCommit8 = peerCommit(peer2, [1, 2, 3, 4, 5, 6, 7], 8);
					manager.addSequencedChanges(
						[peerCommit8],
						peerCommit8.sessionId,
						brand(5),
						brand(4),
					);
					checkChangeList(manager, [4, 5, 6, 7, 8]);
					manager.advanceMinimumSequenceNumber(brand(4));
					checkChangeList(manager, [6, 7, 8]);

					assert.deepEqual(trimmedCommits, expectedTrimmedRevisions);
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
					peerLocalBranches: new Map(),
				});
				manager.addSequencedChanges(
					[
						{
							change: TestChange.mint([0, 1], [2]),
							revision: mintRevisionTag(),
						},
					],
					"1" as SessionId,
					brand(2),
					brand(1),
				);
				assert.equal(manager.localBranch.getHead(), manager.getTrunkHead());
			});

			describe("fast-forwarding", () => {
				it("supports fast-forwarding of local commits onto the trunk", () => {
					const { manager } = testChangeEditManagerFactory({});
					const local1 = applyLocalCommit(manager, [], 1);
					const local2 = applyLocalCommit(manager, [1], 2);
					const [commit1, commit2] = manager.getLocalCommits();

					manager.addSequencedChanges([local1], local1.sessionId, brand(1), brand(0));
					assert.deepEqual([commit1], manager.getTrunkCommits());
					assert.deepEqual([commit2], manager.getLocalCommits());

					const local3 = applyLocalCommit(manager, [1, 2], 3);
					const [_, commit3] = manager.getLocalCommits();

					manager.addSequencedChanges([local2], local2.sessionId, brand(2), brand(0));
					manager.addSequencedChanges([local3], local3.sessionId, brand(3), brand(1));
					assert.deepEqual([commit1, commit2, commit3], manager.getTrunkCommits());
					assert.deepEqual([], manager.getLocalCommits());
				});

				it("nested local branches do not prevent and are not perturbed by fast-forwarding", () => {
					const { manager } = testChangeEditManagerFactory({});
					const forkA = manager.localBranch.fork();
					const local1 = applyLocalCommit(manager, [], 1);
					const forkB = manager.localBranch.fork();
					const local2 = applyLocalCommit(manager, [1], 2);
					const forkC = manager.localBranch.fork();
					const local3 = applyLocalCommit(manager, [1, 2], 3);
					const forkD = manager.localBranch.fork();
					const [commit1, commit2, commit3] = manager.getLocalCommits();

					// The code above defines the following relationships between commits:
					//   (r) <- forkA
					//     └─(1) <- forkB
					//         └─(2) <- forkC
					//             └─(3) <- forkD & local

					manager.addSequencedChanges([local1], local1.sessionId, brand(1), brand(0));
					manager.addSequencedChanges([local2], local2.sessionId, brand(2), brand(0));
					manager.addSequencedChanges([local3], local3.sessionId, brand(3), brand(0));

					// Because of fast-forwarding, we should now be in the following state:
					//   (r)─(1)─(2)─(3) <- local
					//     |   |   |   └─ <- forkD
					//     |   |   └─ <- forkC
					//     |   └─ <- forkB
					//     └─ <- forkA

					assert.deepEqual([commit1, commit2, commit3], manager.getTrunkCommits());
					assert.deepEqual([], manager.getLocalCommits());

					assert.equal(forkA.getHead(), commit1.parent);
					assert.equal(forkB.getHead(), commit1);
					assert.equal(forkC.getHead(), commit2);
					assert.equal(forkD.getHead(), commit3);

					// Test the disposal of the forks in an order that exercises different cases:
					// A fork with earlier and later forks
					forkB.dispose();
					// A fork with later but no earlier forks
					forkA.dispose();
					// A fork with earlier but no later forks
					forkD.dispose();
					// A fork with no earlier and no later forks
					forkC.dispose();
				});

				it("local branches with commits that branch off of the trunk head are retained ", () => {
					// This is a regression test for the following scenario:
					//   (r) <- trunk
					//    |└─(1)─(2) <- local
					//    └─(3) <- fork
					//
					// Fast-forwarding commits (1) and (2) should not advance the sequence number associated with the fork branch.
					// If it did, then (r) would be dropped when the sequence number is advanced to 2 and the fork would become disconnected from the graph.
					// This would cause it to error thereafter when trying to rebase onto or merge with the local branch.
					const { manager } = testChangeEditManagerFactory({});
					const fork = manager.localBranch.fork();
					const forkCommit = applyBranchCommit(fork);
					const commit1 = applyLocalCommit(manager);
					manager.addSequencedChanges([commit1], commit1.sessionId, brand(1), brand(0));
					const commit2 = applyLocalCommit(manager);
					manager.addSequencedChanges([commit2], commit2.sessionId, brand(2), brand(1));
					manager.advanceMinimumSequenceNumber(brand(2));
					manager.localBranch.merge(fork);
					assert.equal(manager.localBranch.getHead().revision, forkCommit.revision);
				});
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
					manager.localBranch.apply({
						change: TestChange.emptyChange,
						revision: sequencedLocalChange,
					});
					const revision1 = mintRevisionTag();
					manager.localBranch.apply({ change: TestChange.emptyChange, revision: revision1 });
					const revision2 = mintRevisionTag();
					manager.localBranch.apply({ change: TestChange.emptyChange, revision: revision2 });
					const commit1 = {
						change: TestChange.emptyChange,
						revision: mintRevisionTag(),
						sessionId: peer1,
					};
					manager.addSequencedChanges(
						[
							{
								change: TestChange.emptyChange,
								revision: mintRevisionTag(),
							},
						],
						peer1,
						brand(1),
						brand(0),
					);
					manager.addSequencedChanges(
						[
							{
								change: TestChange.emptyChange,
								revision: sequencedLocalChange,
							},
						],
						manager.localSessionId,
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
					manager.localBranch.apply({
						change: TestChange.emptyChange,
						revision: sequencedLocalChange,
					});
					const revision1 = mintRevisionTag();
					manager.localBranch.apply({ change: TestChange.emptyChange, revision: revision1 });
					manager.addSequencedChanges(
						[
							{
								change: TestChange.emptyChange,
								revision: sequencedLocalChange,
							},
						],
						manager.localSessionId,
						brand(1),
						brand(0),
					);
					manager.addSequencedChanges(
						[
							{
								change: TestChange.emptyChange,
								revision: mintRevisionTag(),
							},
						],
						peer1,
						brand(2),
						brand(0),
					);
					manager.addSequencedChanges(
						[
							{
								change: TestChange.emptyChange,
								revision: mintRevisionTag(),
							},
						],
						peer1,
						brand(3),
						brand(0),
					);
					assert.equal(manager.getLongestBranchLength(), 2);
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
		describeStress("Combinatorial exhaustive", function ({ stressMode }) {
			const NUM_STEPS = stressMode !== StressMode.Short ? 5 : 4;
			const NUM_PEERS = stressMode !== StressMode.Short ? 3 : 2;
			if (stressMode !== StressMode.Short) {
				this.timeout(60_000);
			}

			const peers: SessionId[] = makeArray(NUM_PEERS, (i) => String(i + 1) as SessionId);
			const meta = {
				peerRefs: makeArray(NUM_PEERS, () => 0),
				seq: 0,
				inFlight: 0,
			};
			it(`for ${NUM_PEERS} peers and ${NUM_STEPS} steps`, () => {
				for (const scenario of buildScenario([], meta, peers, NUM_STEPS)) {
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
	});
}

function applyLocalCommit(
	manager: EditManager<
		ChangeFamilyEditor,
		TestChange,
		ChangeFamily<ChangeFamilyEditor, TestChange>
	>,
	inputContext: readonly number[] = [],
	intention: number | number[] = [],
): Commit<TestChange> {
	return applyBranchCommit(manager.localBranch, inputContext, intention);
}

function applyBranchCommit(
	branch: SharedTreeBranch<ChangeFamilyEditor, TestChange>,
	inputContext: readonly number[] = [],
	intention: number | number[] = [],
): Commit<TestChange> {
	const revision = mintRevisionTag();
	branch.apply({
		change: TestChange.mint(inputContext, intention),
		revision,
	});
	const commit = branch.getHead();
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

function trackTrimmed(
	branch: SharedTreeBranch<ChangeFamilyEditor, TestChange>,
): ReadonlySet<RevisionTag> {
	const trimmedCommits = new Set<RevisionTag>();
	branch.events.on("ancestryTrimmed", (trimmedRevisions) => {
		trimmedRevisions.forEach((revision) => trimmedCommits.add(revision));
	});
	return trimmedCommits;
}
