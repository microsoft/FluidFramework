/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { describeStress, StressMode } from "@fluid-private/stochastic-test-utils";
import type { SessionId } from "@fluidframework/id-compressor";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	type ChangeFamilyEditor,
	CommitKind,
	type GraphCommit,
	type RevisionTag,
} from "../../../core/index.js";
import type {
	Commit,
	EditManager,
	SharedTreeBranch,
} from "../../../shared-tree-core/index.js";
import { brand, makeArray } from "../../../util/index.js";
import type { TestChangeFamily } from "../../testChange.js";
import { NoOpChangeRebaser, TestChange } from "../../testChange.js";
import { mintRevisionTag } from "../../utils.js";

import { buildScenario, runUnitTestScenario } from "./editManagerScenario.js";
import {
	checkChangeList,
	testChangeEditManagerFactory,
	type TestEditManager,
} from "./editManagerTestUtils.js";

const localSessionId: SessionId = "0" as SessionId;
const peer1: SessionId = "1" as SessionId;
const peer2: SessionId = "2" as SessionId;

/**
 * A {@link Commit} that is also usable as a {@link GraphCommit}.
 * @remarks
 * {@link Commit} declares `customMetadata` optionally, but these commits are handed to
 * `addSequencedChanges`, which requires the `GraphCommit` shape where the property is always present.
 */
type SequencedTestCommit = GraphCommit<TestChange> & { readonly sessionId: SessionId };

export function testCorrectness(): void {
	describe("Rebasing Correctness", () => {
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

			runUnitTestScenario("can handle changes that are bunched and have same seq", [
				{ seq: 1, type: "Push" },
				{ seq: 1, type: "Ack" },
				{ seq: 2, type: "Push" },
				{ seq: 2, type: "Ack" },
				{ seq: 3, type: "Pull", ref: 1, from: peer1 },
				{ seq: 4, type: "Push" },
				{ seq: 4, type: "Push" },
				{ seq: 4, type: "Ack" },
				{ seq: 4, type: "Ack" },
				{ seq: 6, type: "Pull", ref: 2, from: peer1 },
				{ seq: 6, type: "Pull", ref: 2, from: peer1 },
			]);

			describe("Trunk eviction", () => {
				it("Evicts trunk commits according to a provided minimum sequence number", () => {
					const { manager } = testChangeEditManagerFactory({});
					const trimmedCommits = trackTrimmed(manager.getLocalBranch("main"));
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					for (let i = 1; i <= 10; ++i) {
						const commit = applyLocalCommit(manager);
						expectedTrimmedRevisions.add(commit.revision);
						manager.addSequencedChanges(
							[commit],
							commit.sessionId,
							brand(i),
							brand(i - 1),
							"main",
						);
					}

					assert.equal(manager.getTrunkChanges("main").length, 10);
					manager.advanceMinimumSequenceNumber(brand(5));
					assert.equal(manager.getTrunkChanges("main").length, 5);
					manager.advanceMinimumSequenceNumber(brand(10));
					assert.equal(manager.getTrunkChanges("main").length, 0);
					for (let i = 11; i <= 20; ++i) {
						const commit = applyLocalCommit(manager);
						expectedTrimmedRevisions.add(commit.revision);
						manager.addSequencedChanges(
							[commit],
							commit.sessionId,
							brand(i),
							brand(i - 1),
							"main",
						);
					}

					assert.equal(manager.getTrunkChanges("main").length, 10);
					manager.advanceMinimumSequenceNumber(brand(15));
					assert.equal(manager.getTrunkChanges("main").length, 5);
					manager.advanceMinimumSequenceNumber(brand(20));
					assert.equal(manager.getTrunkChanges("main").length, 0);

					assert.deepEqual(trimmedCommits, expectedTrimmedRevisions);
				});

				it("Evicts trunk commits at exactly the minimum sequence number", () => {
					const { manager } = testChangeEditManagerFactory({});
					const trimmedCommits = trackTrimmed(manager.getLocalBranch("main"));
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					const commit1 = applyLocalCommit(manager);
					expectedTrimmedRevisions.add(commit1.revision);
					manager.addSequencedChanges(
						[commit1],
						commit1.sessionId,
						brand(1),
						brand(0),
						"main",
					);
					assert.equal(manager.getTrunkChanges("main").length, 1);
					const commit2 = applyLocalCommit(manager);
					expectedTrimmedRevisions.add(commit2.revision);
					manager.addSequencedChanges(
						[commit2],
						commit2.sessionId,
						brand(2),
						brand(1),
						"main",
					);
					assert.equal(manager.getTrunkChanges("main").length, 2);
					manager.advanceMinimumSequenceNumber(brand(1));
					assert.equal(manager.getTrunkChanges("main").length, 1);
					const commit3 = applyLocalCommit(manager);
					expectedTrimmedRevisions.add(commit3.revision);
					manager.addSequencedChanges(
						[commit3],
						commit3.sessionId,
						brand(3),
						brand(2),
						"main",
					);
					assert.equal(manager.getTrunkChanges("main").length, 2);
					manager.advanceMinimumSequenceNumber(brand(3));
					assert.equal(manager.getTrunkChanges("main").length, 0);

					assert.deepEqual(trimmedCommits, expectedTrimmedRevisions);
				});

				it("Rebases peer branches", () => {
					// This is a regression test that ensures peer branches are rebased up to at least the new tail of the trunk after trunk commits are evicted.
					const { manager } = testChangeEditManagerFactory({});
					const trimmedCommits = trackTrimmed(manager.getLocalBranch("main"));
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					// First, we receive a commit from a peer ("1").
					const peerCommit1 = peerCommit(peer1, [], 1);
					expectedTrimmedRevisions.add(peerCommit1.revision);
					manager.addSequencedChanges(
						[peerCommit1],
						peerCommit1.sessionId,
						brand(1),
						brand(0),
						"main",
					);
					// We then submit and ack a local commit ("2").
					// This prevents an upcoming rebase of the peer branch from hitting an eager fast-path that keeps the branch caught up to the head of the trunk.
					const commit1 = applyLocalCommit(manager, [1], 2);
					expectedTrimmedRevisions.add(commit1.revision);
					manager.addSequencedChanges(
						[commit1],
						commit1.sessionId,
						brand(2),
						brand(1),
						"main",
					);
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
						"main",
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
						"main",
					);
					checkChangeList(manager, [4]);

					assert.deepEqual(trimmedCommits, expectedTrimmedRevisions);
				});

				it("Evicts properly when the minimum sequence number advances past the trunk (and there are no local commits)", () => {
					const { manager } = testChangeEditManagerFactory({});
					const trimmedCommits = trackTrimmed(manager.getLocalBranch("main"));
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					const commit1 = applyLocalCommit(manager, [], 1);
					expectedTrimmedRevisions.add(commit1.revision);
					manager.addSequencedChanges(
						[commit1],
						commit1.sessionId,
						brand(1),
						brand(0),
						"main",
					);
					manager.advanceMinimumSequenceNumber(brand(2));
					const managerCommit1 = applyLocalCommit(manager, [1], 2);
					manager.addSequencedChanges(
						[managerCommit1],
						managerCommit1.sessionId,
						brand(3),
						brand(2),
						"main",
					);
					checkChangeList(manager, [2]);

					assert.deepEqual(trimmedCommits, expectedTrimmedRevisions);
				});

				it("Evicts properly when the minimum sequence number advances past the trunk (and there are local commits)", () => {
					const { manager } = testChangeEditManagerFactory({});
					const trimmedCommits = trackTrimmed(manager.getLocalBranch("main"));
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					const commit1 = applyLocalCommit(manager, [], 1);
					expectedTrimmedRevisions.add(commit1.revision);
					manager.addSequencedChanges(
						[commit1],
						commit1.sessionId,
						brand(1),
						brand(0),
						"main",
					);
					const local = applyLocalCommit(manager, [1], 2);
					manager.advanceMinimumSequenceNumber(brand(2));
					manager.addSequencedChanges([local], local.sessionId, brand(3), brand(2), "main");
					checkChangeList(manager, [2]);

					assert.deepEqual(trimmedCommits, expectedTrimmedRevisions);
				});

				it("Delays eviction of a branch base commit until the branch is disposed", () => {
					const { manager } = testChangeEditManagerFactory({});
					const trimmedCommits = trackTrimmed(manager.getLocalBranch("main"));
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					const commit1 = applyLocalCommit(manager, [], 1);
					expectedTrimmedRevisions.add(commit1.revision);
					manager.addSequencedChanges(
						[commit1],
						commit1.sessionId,
						brand(1),
						brand(0),
						"main",
					);
					const local = applyLocalCommit(manager, [1], 2);
					const fork = manager.getLocalBranch("main").fork();
					manager.addSequencedChanges([local], local.sessionId, brand(2), brand(1), "main");
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
					const trimmedCommits = trackTrimmed(manager.getLocalBranch("main"));
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					const local1 = applyLocalCommit(manager, [], 1);
					const fork1 = manager.getLocalBranch("main").fork();
					expectedTrimmedRevisions.add(local1.revision);
					manager.addSequencedChanges([local1], local1.sessionId, brand(1), brand(0), "main");
					const local2 = applyLocalCommit(manager, [1], 2);
					const fork2 = manager.getLocalBranch("main").fork();
					manager.addSequencedChanges([local2], local2.sessionId, brand(2), brand(1), "main");
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

					fork1.rebaseOnto(manager.getLocalBranch("main"));
					fork2.rebaseOnto(manager.getLocalBranch("main"));
					// Rebasing the forks onto the local branch has no effect because they were already at the tip.
					checkChangeList(manager, [2]);

					assert.deepEqual(trimmedCommits, expectedTrimmedRevisions);
				});

				it("Evicts after the oldest branch rebases (no fast-forward)", () => {
					const { manager } = testChangeEditManagerFactory({});
					const trimmedCommits = trackTrimmed(manager.getLocalBranch("main"));
					const expectedTrimmedRevisions = new Set<RevisionTag>();
					const local1 = applyLocalCommit(manager, [], 2);
					const fork1 = manager.getLocalBranch("main").fork();
					const peerCommit1 = peerCommit(peer1, [], 1);
					expectedTrimmedRevisions.add(peerCommit1.revision);
					manager.addSequencedChanges(
						[peerCommit1],
						peerCommit1.sessionId,
						brand(1),
						brand(0),
						"main",
					);
					expectedTrimmedRevisions.add(local1.revision);
					manager.addSequencedChanges([local1], local1.sessionId, brand(2), brand(0), "main");
					const local2 = applyLocalCommit(manager, [1, 2], 4);
					const fork2 = manager.getLocalBranch("main").fork();
					const peerCommit2 = peerCommit(peer1, [1, 2], 3);
					expectedTrimmedRevisions.add(peerCommit2.revision);
					manager.addSequencedChanges(
						[peerCommit2],
						peerCommit2.sessionId,
						brand(3),
						brand(2),
						"main",
					);
					manager.addSequencedChanges([local2], local2.sessionId, brand(4), brand(2), "main");
					checkChangeList(manager, [1, 2, 3, 4]);

					// The code above defines the following relationships between commits:
					//   (r)─(1)─(2')─(3)─(4') <- local
					//     |        └─(4) <- fork2
					//     └─(2)          <- fork1
					// The peer commits (1 and 3) prevent the forks from being fast-forwarded onto the trunk.

					manager.advanceMinimumSequenceNumber(brand(4));
					// Advancing the minimum sequence number does not evict any commits because fork1 branches off of the trunk before commit 1.
					checkChangeList(manager, [1, 2, 3, 4]);

					fork1.rebaseOnto(manager.getLocalBranch("main"));
					// Rebasing fork1 onto the local branch leads to the following configuration:
					//   (r)─(1)─(2')─(3)─(4') <- local
					//              |        └─ <- fork1
					//              └─(4) <- fork2
					// This allows commit 1 to be evicted:
					//   (r)─(2')─(3)─(4') <- local
					//          |        └─ <- fork1
					//          └─(4) <- fork2
					checkChangeList(manager, [2, 3, 4]);

					fork2.rebaseOnto(manager.getLocalBranch("main"));
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
					const trimmedCommits = trackTrimmed(manager.getLocalBranch("main"));
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
						"main",
					);
					manager.addSequencedChanges(
						[peerCommit2],
						peerCommit2.sessionId,
						brand(1),
						brand(0),
						"main",
					);
					manager.addSequencedChanges(
						[peerCommit3],
						peerCommit3.sessionId,
						brand(1),
						brand(0),
						"main",
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
						"main",
					);
					const peerCommit5 = peerCommit(peer1, [1, 2, 3, 4], 5);
					expectedTrimmedRevisions.add(peerCommit5.revision);
					manager.addSequencedChanges(
						[peerCommit5],
						peerCommit5.sessionId,
						brand(4),
						brand(1),
						"main",
					);
					const peerCommit6 = peerCommit(peer2, [1, 2, 3, 4, 5], 6);
					manager.addSequencedChanges(
						[peerCommit6],
						peerCommit6.sessionId,
						brand(5),
						brand(4),
						"main",
					);
					const peerCommit7 = peerCommit(peer2, [1, 2, 3, 4, 5, 6], 7);
					manager.addSequencedChanges(
						[peerCommit7],
						peerCommit7.sessionId,
						brand(5),
						brand(4),
						"main",
					);
					const peerCommit8 = peerCommit(peer2, [1, 2, 3, 4, 5, 6, 7], 8);
					manager.addSequencedChanges(
						[peerCommit8],
						peerCommit8.sessionId,
						brand(5),
						brand(4),
						"main",
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
					main: {
						trunk: [
							{
								change: TestChange.mint([0], [1]),
								revision,
								sessionId: "0" as SessionId,
								sequenceNumber: brand(1),
								customMetadata: undefined,
							},
						],
						peerLocalBranches: new Map(),
					},
				});
				manager.addSequencedChanges(
					[
						{
							change: TestChange.mint([0, 1], [2]),
							revision: mintRevisionTag(),
							customMetadata: undefined,
						},
					],
					"1" as SessionId,
					brand(2),
					brand(1),
					"main",
				);
				assert.equal(manager.getLocalBranch("main").getHead(), manager.getTrunkHead("main"));
			});

			describe("Retains history", () => {
				const retentionPolicies = [
					[false, 0],
					[0, 0],
					[1, 1],
					[3, 3],
					[true, Number.POSITIVE_INFINITY],
					[Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
				] as const;
				const batchedRetentionPolicies = [
					...retentionPolicies,
					[2, 2],
					[5, 5],
					[6, 6],
					[10, 10],
				] as const;

				/**
				 * Sequences `count` commits from {@link peer1}, each building on the last.
				 * @param startSequenceNumber - the sequence number of the first commit to sequence.
				 * @param startIntention - the intention of the first commit to sequence.
				 */
				function sequencePeerCommits(
					manager: EditManager<ChangeFamilyEditor, TestChange>,
					count: number,
					startSequenceNumber: number,
					startIntention: number,
					sessionId: SessionId = peer1,
				): void {
					for (let i = 0; i < count; i += 1) {
						const intention = startIntention + i;
						manager.addSequencedChanges(
							[
								{
									change: TestChange.mint(
										makeArray(intention - 1, (j) => j + 1),
										[intention],
									),
									revision: mintRevisionTag(),
									customMetadata: undefined,
								},
							],
							sessionId,
							brand(startSequenceNumber + i),
							brand(startSequenceNumber + i - 1),
							"main",
						);
					}
				}

				function setupForkWithRetainedHistory(
					historyRetention: boolean | number,
					baseSequenceNumber: number,
					totalCommitCount: number,
					sessionId: SessionId,
				): {
					manager: EditManager<ChangeFamilyEditor, TestChange>;
					fork: SharedTreeBranch<ChangeFamilyEditor, TestChange, never>;
					baseRevision: RevisionTag;
				} {
					const { manager } = testChangeEditManagerFactory({ historyRetention });
					sequencePeerCommits(manager, baseSequenceNumber, 1, 1);
					const fork = manager.getLocalBranch("main").fork();
					const base = fork.getHead();
					const baseRevision = base.revision;
					sequencePeerCommits(
						manager,
						totalCommitCount - baseSequenceNumber,
						baseSequenceNumber + 1,
						baseSequenceNumber + 1,
						sessionId,
					);
					manager.advanceMinimumSequenceNumber(brand(totalCommitCount));
					assert(manager.getTrunkCommits("main").includes(base));
					return { manager, fork, baseRevision };
				}

				function maxCountFromPolicy(policy: boolean | number): number {
					if (policy === false) {
						return 0;
					}
					if (policy === true) {
						return Number.POSITIVE_INFINITY;
					}
					return policy;
				}

				function setup({
					commitCount,
					startingPolicy,
					retainedByMsn,
					retainedByFork,
				}: {
					commitCount: number;
					startingPolicy: number | boolean;
					retainedByMsn: number;
					retainedByFork: number;
				}): TestEditManager {
					const { manager } = testChangeEditManagerFactory({
						historyRetention: startingPolicy,
					});
					if (retainedByFork > 0) {
						const forkFrom = retainedByFork - 1;
						sequencePeerCommits(manager, commitCount - forkFrom, 1, 1);
						const fork = manager.getLocalBranch("main").fork();
						sequencePeerCommits(manager, forkFrom, commitCount - forkFrom + 1, 1);
						assert(fork.getHead() === manager.getTrunkCommits("main").at(-retainedByFork));
					} else {
						sequencePeerCommits(manager, commitCount, 1, 1);
					}
					manager.advanceMinimumSequenceNumber(brand(commitCount - retainedByMsn));
					assert.equal(
						manager.getTrunkCommits("main").length,
						Math.min(
							commitCount,
							Math.max(maxCountFromPolicy(startingPolicy), retainedByMsn, retainedByFork),
						),
						"Setup must retain the history required by the initial policy, MSN, and fork",
					);
					return manager;
				}

				describe("getHistoryRetention", () => {
					it("returns false by default", () => {
						const { manager } = testChangeEditManagerFactory({});
						assert.equal(manager.getHistoryRetention(), false);
					});
				});

				describe("setHistoryRetention", () => {
					describe("Updates the policy when passed valid policy values", () => {
						for (const policy of [false, 0, 1, 3, true, Number.MAX_SAFE_INTEGER] as const) {
							it(`${policy}`, () => {
								const { manager } = testChangeEditManagerFactory({});

								manager.setHistoryRetention(policy);
								assert.equal(manager.getHistoryRetention(), policy);
							});
						}
					});

					describe("Throws when passed invalid policy values", () => {
						for (const policy of [
							-1,
							1.5,
							Number.NaN,
							Infinity,
							-Infinity,
							Number.MAX_SAFE_INTEGER + 1,
						]) {
							it(`${policy}`, () => {
								const message =
									"historyRetention must be a boolean or a nonnegative safe integer";
								const { manager } = testChangeEditManagerFactory({ historyRetention: 3 });
								assert.throws(
									() => manager.setHistoryRetention(policy),
									validateAssertionError(message),
								);
								assert.equal(manager.getHistoryRetention(), 3);
							});
						}
					});

					it("trims sequenced history without discarding pending local commits", () => {
						const { manager } = testChangeEditManagerFactory({ historyRetention: 2 });
						sequencePeerCommits(manager, 5, 1, 1);
						manager.advanceMinimumSequenceNumber(brand(5));
						applyLocalCommit(manager, [1, 2, 3, 4, 5], 6);
						applyLocalCommit(manager, [1, 2, 3, 4, 5, 6], 7);
						const expectedLocalCommits = [...manager.getLocalCommits("main")];
						const expected = [manager.getTrunkHead("main")];

						manager.setHistoryRetention(1);
						assert.deepEqual(manager.getTrunkCommits("main"), expected);
						assert.deepEqual(manager.getLocalCommits("main"), expectedLocalCommits);
					});

					// The remaining tests in this describe block are annotated with an expression of the form "W >= X >= Y >= Z".
					// These describe the family of scenarios being covered by the annotated test.
					// Each symbol corresponds to a factor that may influence the retained commit count:
					// P: The retention policy is forcing some commits to be retained
					// F: A local fork is forcing some sequenced commits to be retained
					// M: The minimum sequence number is forcing some sequenced commits to be retained
					// 0: There cannot be fewer than 0 retained sequenced commits

					// The relative position of each symbol indicates the relationships between the number of sequenced commits that a given factor mandates.
					// For example, "P > F > M > 0" represents a scenario where the retention policy (P) mandates more to be retained than the presence of a local fork (F),
					// which in turn mandates more to be retained than the minimum sequence number (M), which in turn mandates more to be retained than 0.

					// Since we are looking at scenarios where the retention policy (P) is being changed, there are two values for P: the original value (P1) and the new value (P2).

					describe("P1 > 0 >= P2/M/F", () => {
						const policy1 = 5;
						for (const policy2 of [0, false] as const) {
							it(`trims all ${policy1} commits when retention is reduced from ${policy1} to ${policy2}`, () => {
								const manager = setup({
									commitCount: policy1,
									startingPolicy: policy1,
									retainedByMsn: 0,
									retainedByFork: 0,
								});

								manager.setHistoryRetention(policy2);
								assert.deepEqual(manager.getTrunkCommits("main"), []);
							});
						}
					});

					describe("P1 > P2 > 0 >= M/F", () => {
						const policy1 = 5;
						for (const policy2 of [4, 3, 1] as const) {
							it(`trims ${policy1 - policy2} commits when retention is reduced from ${policy1} to ${policy2}`, () => {
								const manager = setup({
									commitCount: policy1,
									startingPolicy: policy1,
									retainedByMsn: 0,
									retainedByFork: 0,
								});
								const expected = manager.getTrunkCommits("main").slice(policy1 - policy2);

								manager.setHistoryRetention(policy2);
								assert.deepEqual(manager.getTrunkCommits("main"), expected);
							});
						}
					});

					describe("P1 > P2 >= M/F > 0", () => {
						const policy1 = 5;
						const mf = 2; // The number of commits that must be retained due to correctness retention factor
						for (const policy2 of [4, 3, 2] as const) {
							describe(`trims ${policy1 - policy2} commits when retention is reduced from ${policy1} to ${policy2}`, () => {
								for (const correctnessRetentionFactor of ["MSN", "local fork"] as const) {
									it(`with ${correctnessRetentionFactor} requiring ${mf} commits to be retained`, () => {
										const manager = setup({
											commitCount: policy1,
											startingPolicy: policy1,
											retainedByMsn: correctnessRetentionFactor === "MSN" ? mf : 0,
											retainedByFork: correctnessRetentionFactor === "local fork" ? mf : 0,
										});
										const expected = manager.getTrunkCommits("main").slice(policy1 - policy2);

										manager.setHistoryRetention(policy2);
										assert.deepEqual(manager.getTrunkCommits("main"), expected);
									});
								}
							});
						}
					});

					describe("P1 > M/F > P2 >= 0", () => {
						const policy1 = 5;
						const mf = 3; // The number of commits that must be retained due to correctness retention factor
						for (const policy2 of [2, 1, 0, false] as const) {
							describe(`trims ${policy1 - mf} commits when retention is reduced from ${policy1} to ${policy2}`, () => {
								for (const correctnessRetentionFactor of ["MSN", "local fork"] as const) {
									it(`with ${correctnessRetentionFactor} requiring ${mf} commits to be retained`, () => {
										const manager = setup({
											commitCount: policy1,
											startingPolicy: policy1,
											retainedByMsn: correctnessRetentionFactor === "MSN" ? mf : 0,
											retainedByFork: correctnessRetentionFactor === "local fork" ? mf : 0,
										});
										const expected = manager.getTrunkCommits("main").slice(policy1 - mf);

										manager.setHistoryRetention(policy2);
										assert.deepEqual(manager.getTrunkCommits("main"), expected);
									});
								}
							});
						}
					});

					describe("M/F > P1 > P2 >= 0", () => {
						const mf = 10; // The number of commits that must be retained due to correctness retention factor
						const policy1 = 5;
						for (const policy2 of [4, 1, 0, false] as const) {
							describe(`trims no commits when retention is reduced from ${policy1} to ${policy2}`, () => {
								for (const correctnessRetentionFactor of ["MSN", "local fork"] as const) {
									it(`with ${correctnessRetentionFactor} requiring ${mf} commits to be retained`, () => {
										const manager = setup({
											commitCount: mf,
											startingPolicy: policy1,
											retainedByMsn: correctnessRetentionFactor === "MSN" ? mf : 0,
											retainedByFork: correctnessRetentionFactor === "local fork" ? mf : 0,
										});
										const expected = manager.getTrunkCommits("main");

										manager.setHistoryRetention(policy2);
										assert.deepEqual(manager.getTrunkCommits("main"), expected);
									});
								}
							});
						}
					});

					// Increasing retention preserves available history, but cannot recover trimmed commits.
					// Start with more commits than the initial requirements to exercise this limit.

					// the policy after the change is greater than 0 and the policy before the change is 0/false
					// Example P2 = 3: [P1 = M = F = 0] -------- [P2 = 3] --> required commit count
					// Original 10: A B C D E F G H I J
					// Before:      x x x x x x x x x x   (0 retained)
					// After:       x x x x x x x x x x   (0 retained; P2 cannot recover trimmed commits)
					describe("P2 > 0 >= P1/M/F", () => {
						for (const policy1 of [0, false] as const) {
							for (const policy2 of [1, 3, true, Number.MAX_SAFE_INTEGER] as const) {
								it(`does not recover trimmed commits when retention increases from ${policy1} to ${policy2}`, () => {
									const manager = setup({
										commitCount: 10,
										startingPolicy: policy1,
										retainedByMsn: 0,
										retainedByFork: 0,
									});

									manager.setHistoryRetention(policy2);
									assert.deepEqual(manager.getTrunkCommits("main"), []);
								});
							}
						}
					});

					// Example P2 = 5: [M = F = 0] ---- [P1 = 3] ---- [P2 = 5] --> required commit count
					// Original 10: A B C D E F G H I J
					// Before:      x x x x x x x H I J   (3 retained by P1)
					// After:       x x x x x x x H I J   (only 3 available, although P2 requests 5)
					describe("P2 > P1 > 0 >= M/F", () => {
						const policy1 = 3;
						for (const policy2 of [4, 5, true, Number.MAX_SAFE_INTEGER] as const) {
							it(`preserves only ${policy1} commits when retention increases from ${policy1} to ${policy2}`, () => {
								const manager = setup({
									commitCount: 10,
									startingPolicy: policy1,
									retainedByMsn: 0,
									retainedByFork: 0,
								});
								const expected = manager.getTrunkCommits("main");

								manager.setHistoryRetention(policy2);
								assert.deepEqual(manager.getTrunkCommits("main"), expected);
							});
						}
					});

					// Example P2 = 5: [0] ---- [mf = 2] ---- [P1 = 3] ---- [P2 = 5] --> required commit count
					// Original 10: A B C D E F G H I J
					// Before:      x x x x x x x H I J   (P1 keeps 3; MSN 8 or a fork at I requires I-J)
					// After:       x x x x x x x H I J   (only 3 available, although P2 requests 5)
					describe("P2 > P1 > M/F > 0", () => {
						const policy1 = 3;
						const mf = 2; // Commits with sequence numbers greater than MSN cannot be trimmed yet because collaboration still needs them
						for (const policy2 of [4, 5, true, Number.MAX_SAFE_INTEGER] as const) {
							describe(`preserves only ${policy1} commits when retention increases from ${policy1} to ${policy2}`, () => {
								for (const correctnessRetentionFactor of ["MSN", "local fork"] as const) {
									it(`with ${correctnessRetentionFactor} requiring ${mf} commits to be retained`, () => {
										const manager = setup({
											commitCount: 10,
											startingPolicy: policy1,
											retainedByMsn: correctnessRetentionFactor === "MSN" ? mf : 0,
											retainedByFork: correctnessRetentionFactor === "local fork" ? mf : 0,
										});
										const expected = manager.getTrunkCommits("main");

										manager.setHistoryRetention(policy2);
										assert.deepEqual(manager.getTrunkCommits("main"), expected);
									});
								}
							});
						}
					});

					// Example P2 = 5: [0] ---- [P1 = 1] ---- [mf = 3] ---- [P2 = 5] --> required commit count
					// Original 10: A B C D E F G H I J
					// Before:      x x x x x x x H I J   (MSN 7 or a fork at H keeps 3 despite P1 = 1)
					// After:       x x x x x x x H I J   (only 3 available, although P2 requests 5)
					describe("P2 > M/F > P1 > 0", () => {
						const policy1 = 1;
						const mf = 3;
						for (const policy2 of [4, 5, true, Number.MAX_SAFE_INTEGER] as const) {
							describe(`preserves only ${mf} commits when retention increases from ${policy1} to ${policy2}`, () => {
								for (const correctnessRetentionFactor of ["MSN", "local fork"] as const) {
									it(`with ${correctnessRetentionFactor} requiring ${mf} commits to be retained`, () => {
										const manager = setup({
											commitCount: 10,
											startingPolicy: policy1,
											retainedByMsn: correctnessRetentionFactor === "MSN" ? mf : 0,
											retainedByFork: correctnessRetentionFactor === "local fork" ? mf : 0,
										});
										const expected = manager.getTrunkCommits("main");

										manager.setHistoryRetention(policy2);
										assert.deepEqual(manager.getTrunkCommits("main"), expected);
									});
								}
							});
						}
					});

					// Example P2 = 3: [0] ---- [P1 = 1] ---- [P2 = 3] ---- [mf = 5] --> required commit count
					// Original 10: A B C D E F G H I J
					// Before:      x x x x x F G H I J   (MSN 5 or a fork at F keeps 5)
					// After:       x x x x x F G H I J   (mf still exceeds P2)
					describe("M/F > P2 > P1 > 0", () => {
						const policy1 = 1;
						const mf = 5;
						for (const policy2 of [2, 3, 4] as const) {
							describe(`preserves all ${mf} required commits when retention increases from ${policy1} to ${policy2}`, () => {
								for (const correctnessRetentionFactor of ["MSN", "local fork"] as const) {
									it(`with ${correctnessRetentionFactor} requiring ${mf} commits to be retained`, () => {
										const manager = setup({
											commitCount: 10,
											startingPolicy: policy1,
											retainedByMsn: correctnessRetentionFactor === "MSN" ? mf : 0,
											retainedByFork: correctnessRetentionFactor === "local fork" ? mf : 0,
										});
										const expected = manager.getTrunkCommits("main");

										manager.setHistoryRetention(policy2);
										assert.deepEqual(manager.getTrunkCommits("main"), expected);
									});
								}
							});
						}
					});

					// Example P2 = 3: [P1 = 0] ---- [P2 = 3] ---- [mf = 5] --> required commit count
					// Original 10: A B C D E F G H I J
					// Before:      x x x x x F G H I J   (MSN 5 or a fork at F keeps 5; P1 is 0/false)
					// After:       x x x x x F G H I J   (mf still exceeds P2)
					describe("M/F > P2 > 0 >= P1", () => {
						const mf = 5;
						for (const policy1 of [0, false] as const) {
							for (const policy2 of [1, 3, 4] as const) {
								describe(`preserves all ${mf} required commits when retention increases from ${policy1} to ${policy2}`, () => {
									for (const correctnessRetentionFactor of ["MSN", "local fork"] as const) {
										it(`with ${correctnessRetentionFactor} requiring ${mf} commits to be retained`, () => {
											const manager = setup({
												commitCount: 10,
												startingPolicy: policy1,
												retainedByMsn: correctnessRetentionFactor === "MSN" ? mf : 0,
												retainedByFork: correctnessRetentionFactor === "local fork" ? mf : 0,
											});
											const expected = manager.getTrunkCommits("main");

											manager.setHistoryRetention(policy2);
											assert.deepEqual(manager.getTrunkCommits("main"), expected);
										});
									}
								});
							}
						}
					});
				});

				describe("advanceMinimumSequenceNumber", () => {
					// P: Commit count required by the retention policy.
					// F: Commit count required by a local fork, including its base commit.
					// M1/M2: Commit counts required before/after advancing the minimum sequence number (MSN).
					// K = Math.max(P, F). Advancing MSN decreases M, while P and F stay fixed.
					const policyAndForkRequirements = [
						[3, 0],
						[false, 3],
						[0, 3],
						[3, 3],
						[3, 1],
						[1, 3],
					] as const;
					const policyAndForkRequirementsIncludingZero = [
						...policyAndForkRequirements,
						[false, 0],
						[0, 0],
					] as const;

					// Example MSN 3 -> 5: [0] ---- [K = 3] ---- [M2 = 5] ---- [M1 = 7] --> required commit count
					// Original 10: A B C D E F G H I J
					// Before:      x x x D E F G H I J   (M1 keeps 7)
					// After:       x x x x x F G H I J   (M2 keeps 5; policy/forks require only 3)
					// With P = F = 0, MSN still retains the same five commits.
					//
					// Example MSN 3 -> 7: [0] ---- [M2 = K = 3] ---- [M1 = 7] --> required commit count
					// Original 10: A B C D E F G H I J
					// Before:      x x x D E F G H I J   (M1 keeps 7)
					// After:       x x x x x x x H I J   (MSN and policy/forks both require 3)
					// Example MSN 3 -> 10 with P = F = 0: M2 = K = 0.
					// Original 10: A B C D E F G H I J
					// Before:      x x x D E F G H I J   (M1 keeps 7)
					// After:       x x x x x x x x x x   (no factor requires any history)
					describe("M1 > M2 >= K >= 0", () => {
						const commitCount = 10;
						const retainedByInitialMsn = 7;

						for (const [policy, retainedByFork] of policyAndForkRequirementsIncludingZero) {
							const retainedByPolicyOrFork = Math.max(
								maxCountFromPolicy(policy),
								retainedByFork,
							);

							for (const retainedByNextMsn of [5, retainedByPolicyOrFork]) {
								it(`retains ${retainedByNextMsn} commits with policy ${policy} and fork ${retainedByFork}`, () => {
									const manager = setup({
										commitCount,
										startingPolicy: policy,
										retainedByMsn: retainedByInitialMsn,
										retainedByFork,
									});
									const retained = manager.getTrunkCommits("main");
									const expected = retained.slice(retained.length - retainedByNextMsn);

									manager.advanceMinimumSequenceNumber(brand(commitCount - retainedByNextMsn));

									assert.deepEqual(manager.getTrunkCommits("main"), expected);
								});
							}
						}
					});

					// Example MSN 3 -> 8: [0] ---- [M2 = 2] ---- [K = 3] ---- [M1 = 7] --> required commit count
					// Original 10: A B C D E F G H I J
					// Before:      x x x D E F G H I J   (M1 keeps 7)
					// After:       x x x x x x x H I J   (K keeps 3, although M2 requires only 2)
					// With M2 = 0 (MSN 10), K still keeps H-J.
					describe("M1 > K > M2 >= 0", () => {
						const commitCount = 10;
						const retainedByInitialMsn = 7;

						for (const [policy, retainedByFork] of policyAndForkRequirements) {
							for (const retainedByNextMsn of [2, 0]) {
								it(`trims to the policy/fork requirement with policy ${policy}, fork ${retainedByFork}, and MSN requirement ${retainedByNextMsn}`, () => {
									const retainedByPolicyOrFork = Math.max(
										maxCountFromPolicy(policy),
										retainedByFork,
									);
									const manager = setup({
										commitCount,
										startingPolicy: policy,
										retainedByMsn: retainedByInitialMsn,
										retainedByFork,
									});
									const retained = manager.getTrunkCommits("main");
									assert.equal(retained.length, retainedByInitialMsn);
									const expected = retained.slice(retained.length - retainedByPolicyOrFork);

									manager.advanceMinimumSequenceNumber(brand(commitCount - retainedByNextMsn));

									assert.deepEqual(manager.getTrunkCommits("main"), expected);
								});
							}
						}
					});

					// Example MSN 7 -> 8: [0] ---- [M2 = 2] ---- [M1 = K = 3] --> required commit count
					// Original 10: A B C D E F G H I J
					// Before:      x x x x x x x H I J   (M1 and K both require 3)
					// After:       x x x x x x x H I J   (K still requires all 3)
					// With M2 = 0 (MSN 10), K still keeps H-J unchanged.
					describe("M1 = K > M2 >= 0", () => {
						const commitCount = 10;
						const retainedByInitialMsn = 3;

						for (const [policy, retainedByFork] of policyAndForkRequirements) {
							for (const retainedByNextMsn of [2, 0]) {
								it(`preserves history with policy ${policy}, fork ${retainedByFork}, and MSN requirement ${retainedByNextMsn}`, () => {
									const retainedByPolicyOrFork = Math.max(
										maxCountFromPolicy(policy),
										retainedByFork,
									);
									const manager = setup({
										commitCount,
										startingPolicy: policy,
										retainedByMsn: retainedByInitialMsn,
										retainedByFork,
									});
									const expected = [...manager.getTrunkCommits("main")];
									assert.equal(expected.length, retainedByPolicyOrFork);

									manager.advanceMinimumSequenceNumber(brand(commitCount - retainedByNextMsn));

									assert.deepEqual(manager.getTrunkCommits("main"), expected);
								});
							}
						}
					});

					// Example MSN 8 -> 9: [0] ---- [M2 = 1] ---- [M1 = 2] ---- [K = 3] --> required commit count
					// Original 10: A B C D E F G H I J
					// Before:      x x x x x x x H I J   (K keeps 3 despite M1 requiring only 2)
					// After:       x x x x x x x H I J   (K still requires all 3)
					// With M2 = 0 (MSN 10), K still keeps H-J unchanged.
					describe("K > M1 > M2 >= 0", () => {
						const commitCount = 10;
						const retainedByInitialMsn = 2;

						for (const [policy, retainedByFork] of policyAndForkRequirements) {
							for (const retainedByNextMsn of [1, 0]) {
								it(`preserves history with policy ${policy}, fork ${retainedByFork}, and MSN requirement ${retainedByNextMsn}`, () => {
									const retainedByPolicyOrFork = Math.max(
										maxCountFromPolicy(policy),
										retainedByFork,
									);
									assert(retainedByPolicyOrFork > retainedByInitialMsn);
									assert(retainedByInitialMsn > retainedByNextMsn);
									assert(retainedByNextMsn >= 0);
									const manager = setup({
										commitCount,
										startingPolicy: policy,
										retainedByMsn: retainedByInitialMsn,
										retainedByFork,
									});
									const expected = [...manager.getTrunkCommits("main")];
									assert.equal(expected.length, retainedByPolicyOrFork);

									manager.advanceMinimumSequenceNumber(brand(commitCount - retainedByNextMsn));

									assert.deepEqual(manager.getTrunkCommits("main"), expected);
								});
							}
						}
					});
				});

				describe("addSequencedChanges", () => {
					function testSequencingCases(
						policy: boolean | number,
						requiredBefore: number,
						newCommitCount: number,
					): void {
						const commitCount = 10;
						const policyCount = maxCountFromPolicy(policy);
						const requiredAfter = requiredBefore + newCommitCount;
						const factors =
							requiredBefore === 0
								? (["MSN"] as const)
								: (["MSN", "equal MSN/fork", "fork"] as const);

						for (const factor of factors) {
							for (const isLocal of [false, true]) {
								it(`policy ${policy}, C1 ${requiredBefore}, C2 ${requiredAfter}, required by ${factor}, ${isLocal ? "local" : "remote"} commits`, () => {
									const { manager } = testChangeEditManagerFactory({
										historyRetention: policy,
									});
									const retainedByMsn =
										factor === "fork" ? requiredBefore - 1 : requiredBefore;
									const retainedByFork = factor === "MSN" ? 0 : requiredBefore;
									const commitsBeforeFork =
										retainedByFork === 0 ? commitCount : commitCount - retainedByFork + 1;
									sequencePeerCommits(manager, commitsBeforeFork, 1, 1);
									const fork =
										retainedByFork === 0 ? undefined : manager.getLocalBranch("main").fork();
									sequencePeerCommits(
										manager,
										commitCount - commitsBeforeFork,
										commitsBeforeFork + 1,
										commitsBeforeFork + 1,
									);
									manager.advanceMinimumSequenceNumber(brand(commitCount - retainedByMsn));
									const retained = manager.getTrunkCommits("main");
									assert.equal(
										retained.length,
										Math.min(commitCount, Math.max(policyCount, requiredBefore)),
									);
									if (fork !== undefined) {
										assert.equal(fork.getHead(), retained.at(-retainedByFork));
									}
									const commits = makeArray(newCommitCount, (i) => {
										const intention = commitCount + i + 1;
										const context = makeArray(intention - 1, (j) => j + 1);
										return isLocal
											? applyLocalCommit(manager, context, intention)
											: {
													change: TestChange.mint(context, [intention]),
													revision: mintRevisionTag(),
													customMetadata: undefined,
												};
									});
									const availableRevisions = [...retained, ...commits].map(
										(commit) => commit.revision,
									);
									const expectedCount = Math.min(
										availableRevisions.length,
										Math.max(policyCount, requiredAfter),
									);
									const expected = availableRevisions.slice(
										availableRevisions.length - expectedCount,
									);

									manager.addSequencedChanges(
										commits,
										isLocal ? manager.localSessionId : peer1,
										brand(commitCount + 1),
										brand(commitCount),
										"main",
									);

									assert.deepEqual(
										manager.getTrunkCommits("main").map((commit) => commit.revision),
										expected,
									);
									if (fork !== undefined) {
										assert(manager.getTrunkCommits("main").includes(fork.getHead()));
									}
								});
							}
						}
					}

					// Example: [C1 = 1] ---- [C2 = 3] ---- [P = 5]; add N = 2 commits K-L.
					// Original 10: A B C D E F G H I J
					// Before:      x x x x x F G H I J   (P keeps 5; correctness requires J)
					// After:       x x x x x x x H I J K L   (P still keeps 5)
					//
					// Example: [C1 = 3] ---- [C2 = P = 5]; add N = 2 commits K-L.
					// Original 10: A B C D E F G H I J
					// Before:      x x x x x F G H I J   (P keeps 5; correctness requires H-J)
					// After:       x x x x x x x H I J K L   (policy and correctness both require 5)
					describe("P >= C2 > C1 >= 0", () => {
						for (const [requiredBefore, newCommitCount] of [
							[1, 2],
							[3, 2],
							[0, 2],
							[0, 5],
						] as const) {
							assert(5 >= requiredBefore + newCommitCount);
							testSequencingCases(5, requiredBefore, newCommitCount);
						}
					});

					// Example: [C1 = 3] ---- [P = 5] ---- [C2 = 6]; add N = 3 commits K-M.
					// Original 10: A B C D E F G H I J
					// Before:      x x x x x F G H I J   (P keeps 5; correctness requires H-J)
					// After:       x x x x x x x H I J K L M   (C2 keeps 6 despite P = 5)
					describe("C2 > P > C1 >= 0", () => {
						for (const [requiredBefore, newCommitCount] of [
							[3, 3],
							[0, 6],
						] as const) {
							assert(requiredBefore + newCommitCount > 5);
							assert(5 > requiredBefore);
							testSequencingCases(5, requiredBefore, newCommitCount);
						}
					});

					// Example: [C1 = P = 5] ---- [C2 = 7]; add N = 2 commits K-L.
					// Original 10: A B C D E F G H I J
					// Before:      x x x x x F G H I J   (policy and correctness both require 5)
					// After:       x x x x x F G H I J K L   (C2 keeps all old and new commits)
					describe("C2 > C1 = P >= 0", () => {
						testSequencingCases(5, 5, 2);
						for (const policy of [false, 0] as const) {
							testSequencingCases(policy, 0, 2);
						}
					});

					// Example: [P = 5] ---- [C1 = 7] ---- [C2 = 9]; add N = 2 commits K-L.
					// Original 10: A B C D E F G H I J
					// Before:      x x x D E F G H I J   (C1 keeps 7 despite P = 5)
					// After:       x x x D E F G H I J K L   (C2 keeps all old and new commits)
					describe("C2 > C1 > P >= 0", () => {
						testSequencingCases(5, 7, 2);
						for (const policy of [false, 0] as const) {
							testSequencingCases(policy, 1, 2);
						}
					});
				});

				describe("branch.apply", () => {
					it("does not count or discard unsequenced local commits", () => {
						const { manager } = testChangeEditManagerFactory({ historyRetention: 2 });
						sequencePeerCommits(manager, 5, 1, 1);
						manager.advanceMinimumSequenceNumber(brand(5));
						const expected = manager.getTrunkCommits("main");
						assert.equal(expected.length, 2);

						applyLocalCommit(manager, [1, 2, 3, 4, 5], 6);
						assert.deepEqual(manager.getTrunkCommits("main"), expected);
						assert.deepEqual(manager.getLocalCommits("main"), [
							manager.getLocalBranch("main").getHead(),
						]);
					});
				});

				describe("summary roundtripping", () => {
					for (const [historyRetention, retentionLimit] of retentionPolicies) {
						for (const isLocal of [false, true]) {
							for (const count of [1, 3, 5]) {
								it(`roundtrips history after sequencing ${count} ${isLocal ? "local" : "remote"} commits with retention ${historyRetention} without another MSN update`, () => {
									const { manager } = testChangeEditManagerFactory({
										historyRetention,
									});
									sequencePeerCommits(manager, 5, 1, 1);
									manager.advanceMinimumSequenceNumber(brand(5));
									const retained = manager.getTrunkCommits("main");
									const commits = makeArray(count, (i) => {
										const context = makeArray(5 + i, (j) => j + 1);
										return isLocal
											? applyLocalCommit(manager, context, 6 + i)
											: {
													change: TestChange.mint(context, [6 + i]),
													revision: mintRevisionTag(),
													customMetadata: undefined,
												};
									});
									const expected = [...retained, ...commits]
										.slice(-Math.max(retentionLimit, count))
										.map((commit) => commit.revision);
									manager.addSequencedChanges(
										commits,
										isLocal ? manager.localSessionId : peer1,
										brand(6),
										brand(5),
										"main",
									);
									const loaded = testChangeEditManagerFactory({
										historyRetention,
									}).manager;

									const summary = structuredClone(manager.getSummaryData());
									assert.deepEqual(
										summary.main.trunk.map((commit) => commit.revision),
										expected,
									);
									loaded.loadSummaryData(summary);
									assert.deepEqual(
										loaded.getTrunkCommits("main").map((commit) => commit.revision),
										expected,
									);
								});
							}
						}
					}

					for (const [initialHistoryRetention, historyRetention, expectedCount] of [
						[true, false, 0],
						[true, 0, 0],
						[true, 3, 3],
						[false, 3, 0],
						[0, 3, 0],
						[5, 1, 1],
						[3, 5, 3],
						[3, true, 3],
						[3, Number.MAX_SAFE_INTEGER, 3],
					] as const) {
						it(`roundtrips history after changing retention from ${initialHistoryRetention} to ${historyRetention}`, () => {
							const { manager } = testChangeEditManagerFactory({
								historyRetention: initialHistoryRetention,
							});
							sequencePeerCommits(manager, 5, 1, 1);
							const revisions = manager
								.getTrunkCommits("main")
								.map((commit) => commit.revision);
							manager.advanceMinimumSequenceNumber(brand(5));
							manager.setHistoryRetention(historyRetention);
							const expected = expectedCount === 0 ? [] : revisions.slice(-expectedCount);
							const loaded = testChangeEditManagerFactory({ historyRetention }).manager;

							const summary = structuredClone(manager.getSummaryData());
							assert.deepEqual(
								summary.main.trunk.map((commit) => commit.revision),
								expected,
							);
							loaded.loadSummaryData(summary);
							assert.deepEqual(
								loaded.getTrunkCommits("main").map((commit) => commit.revision),
								expected,
							);
						});
					}

					for (const [historyRetention, retentionLimit] of batchedRetentionPolicies) {
						it(`roundtrips retained batched commits with retention ${historyRetention} across sequence-number gaps`, () => {
							const { manager } = testChangeEditManagerFactory({ historyRetention });
							sequencePeerCommits(manager, 1, 1, 1);
							const commits = makeArray(5, (i) => ({
								change: TestChange.mint(
									makeArray(i + 1, (j) => j + 1),
									[i + 2],
								),
								revision: mintRevisionTag(),
								customMetadata: undefined,
							}));
							manager.addSequencedChanges(commits, peer1, brand(10), brand(1), "main");
							const revisions = manager
								.getTrunkCommits("main")
								.map((commit) => commit.revision);
							assert.equal(revisions.length, 6);
							const expected = revisions.slice(6 - Math.min(retentionLimit, 6));
							manager.advanceMinimumSequenceNumber(brand(10));
							const loaded = testChangeEditManagerFactory({ historyRetention }).manager;

							const summary = structuredClone(manager.getSummaryData());
							assert.deepEqual(
								summary.main.trunk.map((commit) => commit.revision),
								expected,
							);
							loaded.loadSummaryData(summary);
							assert.deepEqual(
								loaded.getTrunkCommits("main").map((commit) => commit.revision),
								expected,
							);
							assert.deepEqual(loaded.getSummaryData().main.trunk, summary.main.trunk);
						});
					}

					for (const historyRetention of [true, Number.MAX_SAFE_INTEGER]) {
						it(`roundtrips the whole trunk with retention ${historyRetention}`, () => {
							const { manager } = testChangeEditManagerFactory({ historyRetention });
							sequencePeerCommits(manager, 5, 1, 1);
							// Move the collaboration window past every commit sequenced above.
							manager.advanceMinimumSequenceNumber(brand(5));
							const expected = manager.getTrunkCommits("main");
							const loaded = testChangeEditManagerFactory({ historyRetention }).manager;

							const summary = structuredClone(manager.getSummaryData());
							assert.equal(summary.main.trunk.length, 5);
							loaded.loadSummaryData(summary);
							assert.deepEqual(loaded.getTrunkCommits("main"), expected);
						});
					}

					for (const [historyRetention] of retentionPolicies) {
						for (const disposeFork of [false, true]) {
							it(`roundtrips history ${disposeFork ? "after disposing" : "pinned by"} a local fork with retention ${historyRetention}`, () => {
								const { manager, fork } = setupForkWithRetainedHistory(
									historyRetention,
									2,
									10,
									peer1,
								);
								if (disposeFork) {
									fork.dispose();
								}
								const retained = manager
									.getTrunkCommits("main")
									.map((commit) => commit.revision);
								const loaded = testChangeEditManagerFactory({ historyRetention }).manager;

								const summary = structuredClone(manager.getSummaryData());
								assert.deepEqual(
									summary.main.trunk.map((commit) => commit.revision),
									retained,
								);
								loaded.loadSummaryData(summary);
								assert.deepEqual(
									loaded.getTrunkCommits("main").map((commit) => commit.revision),
									retained,
								);
							});
						}
					}

					for (const baseSequenceNumber of [1, 2]) {
						for (const historyRetention of [false, 0, 1, 3, 20] as const) {
							it(`keeps peer base ${baseSequenceNumber} in the main trunk, not the peer branch, with retention ${historyRetention}`, () => {
								const expectedCount = Number(historyRetention);
								const totalCommitCount = Math.max(10, expectedCount + baseSequenceNumber);
								const { manager, baseRevision: peerBaseRevision } =
									setupForkWithRetainedHistory(
										historyRetention,
										baseSequenceNumber,
										totalCommitCount,
										peer2,
									);
								const expected = manager
									.getTrunkCommits("main")
									.map((commit) => commit.revision);
								const loaded = testChangeEditManagerFactory({ historyRetention }).manager;

								const summary = structuredClone(manager.getSummaryData());
								assert.equal(
									summary.main.peerLocalBranches.get(peer1)?.base,
									peerBaseRevision,
								);
								assert.deepEqual(summary.main.peerLocalBranches.get(peer1)?.commits, []);
								assert.equal(summary.main.trunk[0]?.revision, peerBaseRevision);
								assert.equal(
									summary.main.trunk.length,
									totalCommitCount - baseSequenceNumber + 1,
								);
								assert.deepEqual(
									summary.main.trunk.map((commit) => commit.revision),
									expected,
								);

								loaded.loadSummaryData(summary);
								assert.deepEqual(
									loaded.getTrunkCommits("main").map((commit) => commit.revision),
									expected,
								);
							});

							it(`roundtrips history after releasing peer base ${baseSequenceNumber} with retention ${historyRetention}`, () => {
								const expectedCount = Number(historyRetention);
								const totalCommitCount = Math.max(10, expectedCount + baseSequenceNumber);
								const { manager, fork } = setupForkWithRetainedHistory(
									historyRetention,
									baseSequenceNumber,
									totalCommitCount,
									peer2,
								);
								fork.dispose();
								const expected = manager
									.getTrunkCommits("main")
									.map((commit) => commit.revision);
								const reloaded = testChangeEditManagerFactory({ historyRetention }).manager;

								const trimmedSummary = structuredClone(manager.getSummaryData());
								assert.equal(trimmedSummary.main.trunk.length, expectedCount);
								assert.deepEqual(
									trimmedSummary.main.trunk.map((commit) => commit.revision),
									expected,
								);
								reloaded.loadSummaryData(trimmedSummary);
								assert.deepEqual(
									reloaded.getTrunkCommits("main").map((commit) => commit.revision),
									expected,
								);
							});
						}
					}

					for (const [historyRetention, retentionLimit] of [
						[3, 3],
						[true, Number.POSITIVE_INFINITY],
						[Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
					] as const) {
						for (const generationCount of [2, 3]) {
							it(`roundtrips history with retention ${historyRetention} across ${generationCount} generations`, () => {
								let manager = testChangeEditManagerFactory({ historyRetention }).manager;
								const revisions: RevisionTag[] = [];
								for (let generation = 0; generation < generationCount; generation++) {
									sequencePeerCommits(manager, 5, generation * 5 + 1, generation * 5 + 1);
									revisions.push(
										...manager
											.getTrunkCommits("main")
											.slice(-5)
											.map((commit) => commit.revision),
									);
									manager.advanceMinimumSequenceNumber(brand(generation * 5 + 5));
									if (generation < generationCount - 1) {
										const initialSummary = structuredClone(manager.getSummaryData());
										manager = testChangeEditManagerFactory({ historyRetention }).manager;
										manager.loadSummaryData(initialSummary);
									}
								}
								const expected = revisions.slice(-retentionLimit);
								const loaded = testChangeEditManagerFactory({ historyRetention }).manager;

								const summary = structuredClone(manager.getSummaryData());
								assert.deepEqual(
									summary.main.trunk.map((commit) => commit.revision),
									expected,
								);
								loaded.loadSummaryData(summary);
								assert.deepEqual(
									loaded.getTrunkCommits("main").map((commit) => commit.revision),
									expected,
								);
							});
						}
					}
				});
			});

			describe("fast-forwarding", () => {
				it("supports fast-forwarding of local commits onto the trunk", () => {
					const { manager } = testChangeEditManagerFactory({});
					const local1 = applyLocalCommit(manager, [], 1);
					const local2 = applyLocalCommit(manager, [1], 2);
					const [commit1, commit2] = manager.getLocalCommits("main");

					manager.addSequencedChanges([local1], local1.sessionId, brand(1), brand(0), "main");
					assert.deepEqual([commit1], manager.getTrunkCommits("main"));
					assert.deepEqual([commit2], manager.getLocalCommits("main"));

					const local3 = applyLocalCommit(manager, [1, 2], 3);
					const [_, commit3] = manager.getLocalCommits("main");

					manager.addSequencedChanges([local2], local2.sessionId, brand(2), brand(0), "main");
					manager.addSequencedChanges([local3], local3.sessionId, brand(3), brand(1), "main");
					assert.deepEqual([commit1, commit2, commit3], manager.getTrunkCommits("main"));
					assert.deepEqual([], manager.getLocalCommits("main"));
				});

				it("nested local branches do not prevent and are not perturbed by fast-forwarding", () => {
					const { manager } = testChangeEditManagerFactory({});
					const forkA = manager.getLocalBranch("main").fork();
					const local1 = applyLocalCommit(manager, [], 1);
					const forkB = manager.getLocalBranch("main").fork();
					const local2 = applyLocalCommit(manager, [1], 2);
					const forkC = manager.getLocalBranch("main").fork();
					const local3 = applyLocalCommit(manager, [1, 2], 3);
					const forkD = manager.getLocalBranch("main").fork();
					const [commit1, commit2, commit3] = manager.getLocalCommits("main");

					// The code above defines the following relationships between commits:
					//   (r) <- forkA
					//     └─(1) <- forkB
					//         └─(2) <- forkC
					//             └─(3) <- forkD & local

					manager.addSequencedChanges([local1], local1.sessionId, brand(1), brand(0), "main");
					manager.addSequencedChanges([local2], local2.sessionId, brand(2), brand(0), "main");
					manager.addSequencedChanges([local3], local3.sessionId, brand(3), brand(0), "main");

					// Because of fast-forwarding, we should now be in the following state:
					//   (r)─(1)─(2)─(3) <- local
					//     |   |   |   └─ <- forkD
					//     |   |   └─ <- forkC
					//     |   └─ <- forkB
					//     └─ <- forkA

					assert.deepEqual([commit1, commit2, commit3], manager.getTrunkCommits("main"));
					assert.deepEqual([], manager.getLocalCommits("main"));

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
					const fork = manager.getLocalBranch("main").fork();
					const forkCommit = applyBranchCommit(fork);
					const commit1 = applyLocalCommit(manager);
					manager.addSequencedChanges(
						[commit1],
						commit1.sessionId,
						brand(1),
						brand(0),
						"main",
					);
					const commit2 = applyLocalCommit(manager);
					manager.addSequencedChanges(
						[commit2],
						commit2.sessionId,
						brand(2),
						brand(1),
						"main",
					);
					manager.advanceMinimumSequenceNumber(brand(2));
					manager.getLocalBranch("main").merge(fork);
					assert.equal(manager.getLocalBranch("main").getHead().revision, forkCommit.revision);
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
					manager.getLocalBranch("main").apply(
						{
							change: TestChange.emptyChange,
							revision: sequencedLocalChange,
						},
						CommitKind.Default,
						undefined,
					);
					const revision1 = mintRevisionTag();
					manager
						.getLocalBranch("main")
						.apply(
							{ change: TestChange.emptyChange, revision: revision1 },
							CommitKind.Default,
							undefined,
						);
					const revision2 = mintRevisionTag();
					manager
						.getLocalBranch("main")
						.apply(
							{ change: TestChange.emptyChange, revision: revision2 },
							CommitKind.Default,
							undefined,
						);
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
								customMetadata: undefined,
							},
						],
						peer1,
						brand(1),
						brand(0),
						"main",
					);
					manager.addSequencedChanges(
						[
							{
								change: TestChange.emptyChange,
								revision: sequencedLocalChange,
								customMetadata: undefined,
							},
						],
						manager.localSessionId,
						brand(2),
						brand(0),
						"main",
					);
					assert.equal(manager.getLongestBranchLength(), 2);
				});
				it("When a peer branch is longest", () => {
					const { manager } = testChangeEditManagerFactory({
						rebaser: new NoOpChangeRebaser(),
					});
					const sequencedLocalChange = mintRevisionTag();
					manager.getLocalBranch("main").apply(
						{
							change: TestChange.emptyChange,
							revision: sequencedLocalChange,
						},
						CommitKind.Default,
						undefined,
					);
					const revision1 = mintRevisionTag();
					manager
						.getLocalBranch("main")
						.apply(
							{ change: TestChange.emptyChange, revision: revision1 },
							CommitKind.Default,
							undefined,
						);
					manager.addSequencedChanges(
						[
							{
								change: TestChange.emptyChange,
								revision: sequencedLocalChange,
								customMetadata: undefined,
							},
						],
						manager.localSessionId,
						brand(1),
						brand(0),
						"main",
					);
					manager.addSequencedChanges(
						[
							{
								change: TestChange.emptyChange,
								revision: mintRevisionTag(),
								customMetadata: undefined,
							},
						],
						peer1,
						brand(2),
						brand(0),
						"main",
					);
					manager.addSequencedChanges(
						[
							{
								change: TestChange.emptyChange,
								revision: mintRevisionTag(),
								customMetadata: undefined,
							},
						],
						peer1,
						brand(3),
						brand(0),
						"main",
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
			const NUM_STEPS = stressMode === StressMode.Short ? 4 : 5;
			const NUM_PEERS = stressMode === StressMode.Short ? 2 : 3;
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
	describe("Eventing Correctness", () => {
		it("the main branch should not emit a sequencing event for local commits that are not yet sequenced", () => {
			// Setup
			const { manager } = testChangeEditManagerFactory({});
			const main = manager.getLocalBranch("main");
			const emitted: GraphCommit<TestChange>[] = [];
			main.events.on("commitSequenced", (commit) => {
				emitted.push(commit);
			});

			// Act
			applyLocalCommit(manager);

			// Verify
			assert.deepStrictEqual(emitted, []);
		});
		it("the main branch should not emit a sequencing event for sequenced commits from peers", () => {
			// Setup
			const { manager } = testChangeEditManagerFactory({});
			const main = manager.getLocalBranch("main");
			const emitted: GraphCommit<TestChange>[] = [];
			main.events.on("commitSequenced", (commit) => {
				emitted.push(commit);
			});

			// Act
			const peerCommit1 = peerCommit();
			manager.addSequencedChanges(
				[peerCommit1],
				peerCommit1.sessionId,
				brand(1),
				brand(0),
				"main",
			);

			// Verify
			assert.deepStrictEqual(emitted, []);
		});
		it("the main branch should emit a sequencing event for commits that are sequenced without being rebased", () => {
			// Setup
			const { manager } = testChangeEditManagerFactory({});
			const main = manager.getLocalBranch("main");
			const emitted: GraphCommit<TestChange>[] = [];
			main.events.on("commitSequenced", (commit) => {
				emitted.push(commit);
			});
			applyLocalCommit(manager);
			const localCommit = main.getHead();

			// Act
			manager.addSequencedChanges(
				[localCommit],
				manager.localSessionId,
				brand(1),
				brand(0),
				"main",
			);

			// Verify
			assert.deepStrictEqual(emitted, [localCommit]);
		});
		it("the main branch should emit a sequencing event for commits that are sequenced after being rebased", () => {
			// Setup
			const { manager } = testChangeEditManagerFactory({});
			const main = manager.getLocalBranch("main");
			const emitted: GraphCommit<TestChange>[] = [];
			main.events.on("commitSequenced", (commit) => {
				emitted.push(commit);
			});

			applyLocalCommit(manager);
			const localCommitV1 = main.getHead();

			const peerCommit1 = peerCommit();
			manager.addSequencedChanges(
				[peerCommit1],
				peerCommit1.sessionId,
				brand(1),
				brand(0),
				"main",
			);

			const localCommitV2 = main.getHead();

			// Self-check: the local commit should have been rebased onto the peer commit
			assert.equal(localCommitV1.revision, localCommitV2.revision);
			assert.notEqual(localCommitV1, localCommitV2);

			// Act
			manager.addSequencedChanges(
				[localCommitV1],
				manager.localSessionId,
				brand(1),
				brand(0),
				"main",
			);

			// Verify
			// The rebased version of the local commit should be emitted, not the original version
			assert.deepStrictEqual(emitted, [localCommitV2]);
		});
		it("a fork that does not have the sequenced commit should not emit a sequencing event", () => {
			// Setup
			const { manager } = testChangeEditManagerFactory({});
			const main = manager.getLocalBranch("main");
			const fork = main.fork();
			const emittedOnFork: GraphCommit<TestChange>[] = [];
			fork.events.on("commitSequenced", (commit) => {
				emittedOnFork.push(commit);
			});

			// note: the fork is created before this commit is applied, so it will not have that commit
			applyLocalCommit(manager);

			// Act
			const mainCommit = main.getHead();
			manager.addSequencedChanges(
				[mainCommit],
				manager.localSessionId,
				brand(1),
				brand(0),
				"main",
			);

			// Verify
			assert.deepStrictEqual(emittedOnFork, []);
		});
		it("a fork that has a different version of the sequenced commit should not emit a sequencing event", () => {
			const { manager } = testChangeEditManagerFactory({});
			const main = manager.getLocalBranch("main");

			// note: the fork is created after this commit is applied, so it will have that commit
			applyLocalCommit(manager);
			const localCommitV1 = main.getHead();

			const fork = main.fork();
			const emittedOnFork: GraphCommit<TestChange>[] = [];
			fork.events.on("commitSequenced", (commit) => {
				emittedOnFork.push(commit);
			});

			const peerCommit1 = peerCommit();
			manager.addSequencedChanges(
				[peerCommit1],
				peerCommit1.sessionId,
				brand(1),
				brand(0),
				"main",
			);

			// Self-check: the fork and main branches should have different versions of the local commit
			const localCommitV2 = main.getHead();
			assert.equal(localCommitV1.revision, localCommitV2.revision);
			assert.equal(fork.getHead(), localCommitV1);

			// Act
			manager.addSequencedChanges(
				[localCommitV2],
				manager.localSessionId,
				brand(2),
				brand(0),
				"main",
			);

			// Verify
			assert.deepStrictEqual(emittedOnFork, []);
		});
		it("a fork that has the same version of the sequenced commit should emit a sequencing event", () => {
			const { manager } = testChangeEditManagerFactory({});
			const main = manager.getLocalBranch("main");

			// note: the fork is created after this commit is applied, so it will have commit A
			applyLocalCommit(manager);
			const localCommitA = main.getHead();

			const fork = main.fork();
			const emittedOnFork: GraphCommit<TestChange>[] = [];
			fork.events.on("commitSequenced", (commit) => {
				emittedOnFork.push(commit);
			});

			// note: the fork is created before this commit is applied, so it will not have commit B yet
			applyLocalCommit(manager);
			const localCommitB = main.getHead();

			// Act
			manager.addSequencedChanges(
				[localCommitA],
				manager.localSessionId,
				brand(1),
				brand(0),
				"main",
			);

			// Verify
			assert.deepStrictEqual(emittedOnFork, [localCommitA]);

			// Setup
			// Make the fork acquire commit B by rebasing it onto the main branch
			fork.rebaseOnto(main);

			// Act
			emittedOnFork.length = 0;
			manager.addSequencedChanges(
				[localCommitB],
				manager.localSessionId,
				brand(2),
				brand(0),
				"main",
			);

			// Verify
			assert.deepStrictEqual(emittedOnFork, [localCommitB]);
		});
	});
}

function applyLocalCommit(
	manager: EditManager<ChangeFamilyEditor, TestChange>,
	inputContext: readonly number[] = [],
	intention: number | number[] = [],
): SequencedTestCommit {
	return applyBranchCommit(manager.getLocalBranch("main"), inputContext, intention);
}

function applyBranchCommit(
	branch: SharedTreeBranch<ChangeFamilyEditor, TestChange, TestChangeFamily>,
	inputContext: readonly number[] = [],
	intention: number | number[] = [],
): SequencedTestCommit {
	const revision = mintRevisionTag();
	branch.apply(
		{
			change: TestChange.mint(inputContext, intention),
			revision,
		},
		CommitKind.Default,
		undefined,
	);
	const commit = branch.getHead();
	return {
		change: commit.change,
		revision: commit.revision,
		sessionId: localSessionId,
		customMetadata: commit.customMetadata,
	};
}

function peerCommit(
	peer: typeof peer1 | typeof peer2 = peer1,
	inputContext: readonly number[] = [],
	intention: number | number[] = [],
): SequencedTestCommit {
	return {
		change: TestChange.mint(inputContext, intention),
		revision: mintRevisionTag(),
		sessionId: peer,
		customMetadata: undefined,
	};
}

function trackTrimmed(
	branch: SharedTreeBranch<ChangeFamilyEditor, TestChange, TestChangeFamily>,
): ReadonlySet<RevisionTag> {
	const trimmedCommits = new Set<RevisionTag>();
	branch.events.on("ancestryTrimmed", (trimmedRevisions) => {
		for (const revision of trimmedRevisions) {
			trimmedCommits.add(revision);
		}
	});
	return trimmedCommits;
}
