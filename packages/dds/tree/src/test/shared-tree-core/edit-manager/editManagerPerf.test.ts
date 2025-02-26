/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { SessionId } from "@fluidframework/id-compressor";

import type { TaggedChange } from "../../../core/index.js";
import { brand } from "../../../util/index.js";
import {
	ConstrainedTestChangeRebaser,
	NoOpChangeRebaser,
	TestChange,
	UnrebasableTestChangeRebaser,
} from "../../testChange.js";
import { mintRevisionTag } from "../../utils.js";

import { runUnitTestScenario } from "./editManagerScenario.js";
import {
	rebaseLocalEditsOverTrunkEdits,
	rebasePeerEditsOverTrunkEdits,
	testChangeEditManagerFactory,
} from "./editManagerTestUtils.js";

const peer1: SessionId = "1" as SessionId;
const peer2: SessionId = "2" as SessionId;

export function testPerf() {
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
					(change: TaggedChange<TestChange>, over: TaggedChange<TestChange>): boolean => {
						// This is the only rebase that should happen
						assert.deepEqual(change.change.intentions, [4]);
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
					(change: TaggedChange<TestChange>, over: TaggedChange<TestChange>): boolean => {
						// This is the only rebase that should happen
						assert.deepEqual(change.change.intentions, [4]);
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
						manager.addSequencedChanges(
							[
								{
									change: TestChange.emptyChange,
									revision: mintRevisionTag(),
								},
							],
							"peer" as SessionId,
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
							//     However, all but the last of these had their inverse already cached
							inverted: 1,
							// As part of rebasing the peer branch that contains the phase-1 edits,
							//   none of the peer edits need to be rebased,
							//   so we don't compose the changes they would need to rebase over.
							// As part of rebasing the local branch, we compose...
							//   - the phase-2 peer edit: 1
							// Note: this composition is only needed to bake the RevisionTag into the changeset.
							// Adding both terms:
							composed: 1,
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
						rebasePeerEditsOverTrunkEdits(P, T + 1, manager, () => TestChange.emptyChange);
						rebaser.rebasedCount = 0;
						rebaser.invertedCount = 0;
						rebaser.composedCount = 0;
						manager.addSequencedChanges(
							[
								{
									change: TestChange.emptyChange,
									revision: mintRevisionTag(),
								},
							],
							"peer" as SessionId,
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
							//       However, all but the last of these had their inverse already cached
							//   This adds up 1 invert.
							// As part of rebasing P+ to the tip of the trunk,
							//   we invert...
							//     - each of the phase-1 peer edits: P
							//       (these are based on commit Tc)
							//   This adds up P inverts.
							// Adding both terms:
							inverted: P + 1,
							// As part of rebasing the peer branch that contains the phase-1 edits, we compose...
							//   - the trunk edits: T
							//   then for the Ith local edit on the branch we compose...
							//     - the inverse of the local edit: 1
							//     - the previous composition: 1
							//     - the rebased version of the local edit: 1
							//   This adds up to 3 edits composed per edit on the branch, except for the last one which is not needed.
							// Summing for all P edit, this gives us: T + 3P - 3
							// As part of rebasing the local branch,
							//   we compose...
							//     - the phase-2 peer edit P+: 1
							//   This adds up 1 edit composed.
							// Note: this composition is only needed to bake the RevisionTag into the changeset.
							// Adding both terms:
							composed: T + 3 * P - 2,
						};
						assert.deepEqual(actual, expected);
					});
				}
			});
		});
	});
}
