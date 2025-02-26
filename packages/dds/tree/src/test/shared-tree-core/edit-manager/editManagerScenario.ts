/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { unreachableCase } from "@fluidframework/core-utils/internal";
import type { SessionId } from "@fluidframework/id-compressor";

import {
	type ChangeFamilyEditor,
	type ChangeRebaser,
	emptyDelta,
} from "../../../core/index.js";
import type { Commit, EditManager, SeqNumber } from "../../../shared-tree-core/index.js";
import { brand, clone } from "../../../util/index.js";
import { TestChange, type TestChangeFamily, asDelta } from "../../testChange.js";
import { mintRevisionTag } from "../../utils.js";

import {
	addSequencedChanges,
	checkChangeList,
	testChangeEditManagerFactory,
} from "./editManagerTestUtils.js";
export type TestEditManager = EditManager<ChangeFamilyEditor, TestChange, TestChangeFamily>;

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

type TestCommit = Commit<TestChange> & {
	seqNumber: SeqNumber;
	refNumber: SeqNumber;
};

const localSessionId: SessionId = "0" as SessionId;

export function* buildScenario(
	scenario: UnitTestScenarioStep[],
	meta: ScenarioBuilderState,
	peers: readonly SessionId[],
	stepCount: number,
): Generator<readonly UnitTestScenarioStep[]> {
	if (scenario.length >= stepCount) {
		yield scenario;
	} else {
		// Push
		meta.inFlight += 1;
		scenario.push({ type: "Push" });
		for (const built of buildScenario(scenario, meta, peers, stepCount)) {
			yield built;
		}
		scenario.pop();
		meta.inFlight -= 1;

		// Ack (if there are any local changes)
		if (meta.inFlight > 0) {
			meta.inFlight -= 1;
			meta.seq += 1;
			scenario.push({ type: "Ack", seq: meta.seq });
			for (const built of buildScenario(scenario, meta, peers, stepCount)) {
				yield built;
			}
			scenario.pop();
			meta.seq -= 1;
			meta.inFlight += 1;
		}

		// Pull
		meta.seq += 1;
		for (let iPeer = 0; iPeer < peers.length; ++iPeer) {
			const prevRef = meta.peerRefs[iPeer];
			for (let ref = prevRef; ref < meta.seq; ++ref) {
				meta.peerRefs[iPeer] = ref;
				scenario.push({ type: "Pull", seq: meta.seq, ref, from: peers[iPeer] });
				for (const built of buildScenario(scenario, meta, peers, stepCount)) {
					yield built;
				}
				scenario.pop();
			}
			meta.peerRefs[iPeer] = prevRef;
		}
		meta.seq -= 1;
	}
}

export function runUnitTestScenario(
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
			summarizer.addSequencedChanges(
				[commit],
				commit.sessionId,
				commit.seqNumber,
				commit.refNumber,
			);
			for (const j of joiners) {
				j.addSequencedChanges([commit], commit.sessionId, commit.seqNumber, commit.refNumber);
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
								.filter((s): s is UnitTestPullStep => s.type === "Pull" && s.from === peer)
								.find((s) => s.seq > sequenceNumber)?.ref ?? Number.POSITIVE_INFINITY,
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
					manager.localBranch.apply({ change: changeset, revision });
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
					const delta = addSequencedChanges(
						manager,
						[commit],
						commit.sessionId,
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
						s.type === "Pull" && s.seq > step.ref && s.seq < step.seq && s.from === step.from;
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
					const delta = addSequencedChanges(
						manager,
						[commit],
						commit.sessionId,
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
