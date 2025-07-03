/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { GraphCommit, RevisionTag, TaggedChange } from "../../core/index.js";
import { testIdCompressor } from "../utils.js";
import {
	type ChangeEnricherMutableCheckout,
	DefaultResubmitMachine,
} from "../../shared-tree-core/index.js";
import { disposeSymbol } from "../../util/index.js";

export interface MockEnrichableChange {
	readonly inputContext: RevisionTag;
	readonly outputContext: RevisionTag;
	readonly updateCount: number;
	readonly rebased?: true;
}

export class MockChangeEnricher
	implements ChangeEnricherMutableCheckout<MockEnrichableChange>
{
	public isDisposed = false;
	public isReadonly;
	public contextOverride?: RevisionTag;
	private readonly getContext: () => RevisionTag;

	// These counters are used to verify that the commit enricher does not perform unnecessary work
	public static commitsEnriched = 0;
	public static commitsApplied = 0;
	public static checkoutsCreated = 0;

	public static resetCounters(): void {
		MockChangeEnricher.commitsEnriched = 0;
		MockChangeEnricher.commitsApplied = 0;
		MockChangeEnricher.checkoutsCreated = 0;
	}

	public constructor(getContext: () => RevisionTag, isReadonly: boolean = true) {
		this.getContext = getContext;
		this.isReadonly = isReadonly;
		MockChangeEnricher.checkoutsCreated += 1;
	}

	public get context(): RevisionTag {
		return this.contextOverride ?? this.getContext();
	}

	public fork(): MockChangeEnricher {
		assert.equal(this.isDisposed, false);
		const fixedContext = this.context;
		return new MockChangeEnricher(() => fixedContext, false);
	}

	public updateChangeEnrichments(change: MockEnrichableChange): MockEnrichableChange {
		assert.equal(this.isDisposed, false);
		assert.equal(change.inputContext, this.context);
		MockChangeEnricher.commitsEnriched += 1;
		return {
			...change,
			updateCount: change.updateCount + 1,
		};
	}

	public applyTipChange(change: MockEnrichableChange, revision?: RevisionTag): void {
		assert.equal(this.isDisposed, false);
		assert.equal(this.isReadonly, false);
		assert.equal(change.inputContext, this.context);
		if (revision !== undefined) {
			assert.equal(revision, change.outputContext);
		}
		this.contextOverride = change.outputContext;
		MockChangeEnricher.commitsApplied += 1;
	}

	public [disposeSymbol](): void {
		assert.equal(this.isDisposed, false);
		this.isDisposed = true;
	}
}

export function inverter({
	revision,
	change,
}: TaggedChange<MockEnrichableChange>): MockEnrichableChange {
	assert.equal(revision, change.outputContext);
	return {
		inputContext: change.outputContext,
		outputContext: change.inputContext,
		updateCount: 0,
	};
}

const revision0 = testIdCompressor.generateCompressedId();
const revision1 = testIdCompressor.generateCompressedId();
const revision2 = testIdCompressor.generateCompressedId();
const revision3 = testIdCompressor.generateCompressedId();

const commit1: GraphCommit<MockEnrichableChange> = {
	change: {
		inputContext: revision0,
		outputContext: revision1,
		updateCount: 0,
	},
	revision: revision1,
};
const commit2: GraphCommit<MockEnrichableChange> = {
	change: {
		inputContext: revision1,
		outputContext: revision2,
		updateCount: 0,
	},
	revision: revision2,
	parent: commit1,
};
const commit3: GraphCommit<MockEnrichableChange> = {
	change: {
		inputContext: revision2,
		outputContext: revision3,
		updateCount: 0,
	},
	revision: revision3,
	parent: commit2,
};

describe("DefaultResubmitMachine", () => {
	describe("omits already sequenced commits from resubmit phase", () => {
		it("omits sequenced commits that were not rebased", () => {
			let currentRevision = revision0;
			const changeEnricher = new MockChangeEnricher(() => currentRevision);
			const machine = new DefaultResubmitMachine(inverter, changeEnricher);
			machine.onCommitSubmitted(commit1);
			currentRevision = revision1;
			machine.onCommitSubmitted(commit2);
			currentRevision = revision2;
			// Simulate the sequencing of commit 1
			machine.onSequencedCommitApplied(true);

			MockChangeEnricher.resetCounters();
			assert.equal(machine.isInResubmitPhase, false);
			machine.prepareForResubmit([commit2]);
			assert.equal(machine.isInResubmitPhase, true);
			machine.onCommitSubmitted(commit2);
			assert.equal(machine.isInResubmitPhase, false);
			// No new enrichment should be necessary
			assert.equal(MockChangeEnricher.checkoutsCreated, 0);
			assert.equal(MockChangeEnricher.commitsEnriched, 0);
			assert.equal(MockChangeEnricher.commitsApplied, 0);
		});

		it("omits sequenced commits that were rebased", () => {
			let currentRevision = revision0;
			const changeEnricher = new MockChangeEnricher(() => currentRevision);
			const machine = new DefaultResubmitMachine(inverter, changeEnricher);
			machine.onCommitSubmitted(commit1);
			currentRevision = revision1;
			machine.onCommitSubmitted(commit2);
			currentRevision = revision2;
			// Simulate the sequencing of a peer commit. This would lead to the rebasing of commits 1 and 2.
			machine.onSequencedCommitApplied(false);
			// Simulate the sequencing of commit 1
			machine.onSequencedCommitApplied(true);
			const rebased2: GraphCommit<MockEnrichableChange> = {
				...commit2,
				change: { ...commit2.change, rebased: true },
			};

			MockChangeEnricher.resetCounters();
			assert.equal(machine.isInResubmitPhase, false);
			machine.prepareForResubmit([rebased2]);
			assert.equal(machine.isInResubmitPhase, true);
			const enriched2Resubmit = machine.peekNextCommit();
			machine.onCommitSubmitted(enriched2Resubmit);
			assert.equal(machine.isInResubmitPhase, false);
			// One enrichment should be necessary
			assert.equal(MockChangeEnricher.checkoutsCreated, 1);
			assert.equal(MockChangeEnricher.commitsEnriched, 1);
			assert.equal(MockChangeEnricher.commitsApplied, 1);
		});

		it("tolerates empty resubmit", () => {
			let currentRevision = revision0;
			const changeEnricher = new MockChangeEnricher(() => currentRevision);
			const machine = new DefaultResubmitMachine(inverter, changeEnricher);
			machine.onCommitSubmitted(commit1);
			currentRevision = revision1;
			machine.onCommitSubmitted(commit2);
			currentRevision = revision2;
			// Simulate the sequencing of commit 1
			machine.onSequencedCommitApplied(true);
			// Simulate the sequencing of a peer commit. This would lead to the rebasing of commit 2.
			machine.onSequencedCommitApplied(false);
			// Simulate the sequencing of commit2
			machine.onSequencedCommitApplied(true);

			MockChangeEnricher.resetCounters();
			assert.equal(machine.isInResubmitPhase, false);
			machine.prepareForResubmit([]);
			assert.equal(machine.isInResubmitPhase, false);
			// No new enrichment should be necessary
			assert.equal(MockChangeEnricher.checkoutsCreated, 0);
			assert.equal(MockChangeEnricher.commitsEnriched, 0);
			assert.equal(MockChangeEnricher.commitsApplied, 0);
		});
	});

	describe("enriches commits for resubmit", () => {
		it("when the commits do not undergo rebasing", () => {
			let currentRevision = revision0;
			const changeEnricher = new MockChangeEnricher(() => currentRevision);
			const machine = new DefaultResubmitMachine(inverter, changeEnricher);
			const enriched1 = machine.onCommitSubmitted(commit1);
			currentRevision = revision1;
			const enriched2 = machine.onCommitSubmitted(commit2);
			currentRevision = revision2;

			MockChangeEnricher.resetCounters();
			assert.equal(machine.isInResubmitPhase, false);
			machine.prepareForResubmit([commit1, commit2]);
			assert.equal(machine.isInResubmitPhase, true);
			const enriched1Resubmit = machine.onCommitSubmitted(commit1);
			assert.equal(machine.isInResubmitPhase, true);
			const enriched2Resubmit = machine.onCommitSubmitted(commit2);
			assert.equal(machine.isInResubmitPhase, false);
			assert.equal(enriched1Resubmit, enriched1);
			assert.equal(enriched2Resubmit, enriched2);
			// No new enrichment should be necessary
			assert.equal(MockChangeEnricher.checkoutsCreated, 0);
			assert.equal(MockChangeEnricher.commitsEnriched, 0);
			assert.equal(MockChangeEnricher.commitsApplied, 0);

			// Verify that the enricher can resubmit those commits again
			machine.prepareForResubmit([commit1, commit2]);
			assert.equal(machine.isInResubmitPhase, true);
			assert.equal(machine.onCommitSubmitted(commit1), enriched1Resubmit);
			assert.equal(machine.isInResubmitPhase, true);
			assert.equal(machine.onCommitSubmitted(commit2), enriched2Resubmit);
			assert.equal(machine.isInResubmitPhase, false);
		});

		for (const scenario of ["only", "and before"]) {
			it(`when the commits undergo rebasing at resubmit time ${scenario}`, () => {
				let currentRevision = revision0;
				const changeEnricher = new MockChangeEnricher(() => currentRevision);
				const machine = new DefaultResubmitMachine(inverter, changeEnricher);
				machine.onCommitSubmitted(commit1);
				currentRevision = revision1;

				if (scenario === "and before") {
					// Simulate the sequencing of a peer commit
					machine.onSequencedCommitApplied(false);
				}

				machine.onCommitSubmitted(commit2);
				currentRevision = revision2;

				// Simulate the sequencing of a peer commit as part of the resubmit phase
				machine.onSequencedCommitApplied(false);

				// This would lead to the rebasing of commits 1 and 2:
				const rebased1: GraphCommit<MockEnrichableChange> = {
					...commit1,
					change: { ...commit1.change, rebased: true },
				};
				const rebased2: GraphCommit<MockEnrichableChange> = {
					...commit2,
					parent: rebased1,
					change: { ...commit2.change, rebased: true },
				};
				MockChangeEnricher.resetCounters();
				assert.equal(machine.isInResubmitPhase, false);
				machine.prepareForResubmit([rebased1, rebased2]);
				assert.equal(machine.isInResubmitPhase, true);
				const enriched1Resubmit = machine.peekNextCommit();
				machine.onCommitSubmitted(enriched1Resubmit);
				assert.equal(machine.isInResubmitPhase, true);
				const enriched2Resubmit = machine.peekNextCommit();
				machine.onCommitSubmitted(enriched2Resubmit);
				assert.equal(machine.isInResubmitPhase, false);
				assert.deepEqual(enriched1Resubmit, {
					change: {
						inputContext: revision0,
						outputContext: revision1,
						updateCount: 1,
						rebased: true,
					},
					revision: revision1,
				});
				assert.deepEqual(enriched2Resubmit, {
					change: {
						inputContext: revision1,
						outputContext: revision2,
						updateCount: 1,
						rebased: true,
					},
					revision: revision2,
					parent: rebased1,
				});
				// Two enrichments should be necessary, which requires creating a new checkout and rewinding the state
				assert.equal(MockChangeEnricher.checkoutsCreated, 1);
				assert.equal(MockChangeEnricher.commitsEnriched, 2);
				assert.equal(MockChangeEnricher.commitsApplied, 3);

				// Verify that the enricher can resubmit those commits again
				machine.prepareForResubmit([rebased1, rebased2]);
				assert.equal(machine.isInResubmitPhase, true);
				assert.equal(machine.peekNextCommit(), enriched1Resubmit);
				machine.onCommitSubmitted(enriched1Resubmit);
				assert.equal(machine.isInResubmitPhase, true);
				assert.equal(machine.peekNextCommit(), enriched2Resubmit);
				machine.onCommitSubmitted(enriched2Resubmit);
				assert.equal(machine.isInResubmitPhase, false);
			});
		}

		it("when the commits undergo rebasing before resubmit time", () => {
			let currentRevision = revision0;
			const changeEnricher = new MockChangeEnricher(() => currentRevision);
			const machine = new DefaultResubmitMachine(inverter, changeEnricher);
			machine.onCommitSubmitted(commit1);
			currentRevision = revision1;
			machine.onCommitSubmitted(commit2);
			currentRevision = revision2;

			// Simulate the sequencing of a peer commit
			machine.onSequencedCommitApplied(false);

			// This would lead to the rebasing of commits 1 and 2:
			const rebased1: GraphCommit<MockEnrichableChange> = {
				...commit1,
				change: { ...commit1.change, rebased: true },
			};
			const rebased2: GraphCommit<MockEnrichableChange> = {
				...commit2,
				parent: rebased1,
				change: { ...commit2.change, rebased: true },
			};

			machine.onCommitSubmitted(commit3);
			currentRevision = revision3;

			MockChangeEnricher.resetCounters();
			assert.equal(machine.isInResubmitPhase, false);
			machine.prepareForResubmit([rebased1, rebased2, commit3]);
			assert.equal(machine.isInResubmitPhase, true);
			const enriched1Resubmit = machine.peekNextCommit();
			machine.onCommitSubmitted(enriched1Resubmit);
			assert.equal(machine.isInResubmitPhase, true);
			const enriched2Resubmit = machine.peekNextCommit();
			machine.onCommitSubmitted(enriched2Resubmit);
			assert.equal(machine.isInResubmitPhase, true);
			const enriched3Resubmit = machine.peekNextCommit();
			machine.onCommitSubmitted(enriched3Resubmit);
			assert.equal(machine.isInResubmitPhase, false);
			assert.deepEqual(enriched1Resubmit, {
				change: {
					inputContext: revision0,
					outputContext: revision1,
					updateCount: 1,
					rebased: true,
				},
				revision: revision1,
			});
			assert.deepEqual(enriched2Resubmit, {
				change: {
					inputContext: revision1,
					outputContext: revision2,
					updateCount: 1,
					rebased: true,
				},
				revision: revision2,
				parent: rebased1,
			});
			// This commit did not undergo rebasing so its enrichments did not need updating
			assert.equal(enriched3Resubmit, commit3);
			// Two enrichments should be necessary, which requires creating a new checkout and rewinding the state
			assert.equal(MockChangeEnricher.checkoutsCreated, 1);
			assert.equal(MockChangeEnricher.commitsEnriched, 2);
			// Three rollbacks should applied to rewind the state, and one rebased change should be applied
			assert.equal(MockChangeEnricher.commitsApplied, 4);

			// Verify that the enricher can resubmit those commits again
			machine.prepareForResubmit([rebased1, rebased2, commit3]);
			assert.equal(machine.isInResubmitPhase, true);
			assert.equal(machine.peekNextCommit(), enriched1Resubmit);
			machine.onCommitSubmitted(enriched1Resubmit);
			assert.equal(machine.isInResubmitPhase, true);
			assert.equal(machine.peekNextCommit(), enriched2Resubmit);
			machine.onCommitSubmitted(enriched2Resubmit);
			assert.equal(machine.isInResubmitPhase, true);
			assert.equal(machine.peekNextCommit(), enriched3Resubmit);
			machine.onCommitSubmitted(enriched3Resubmit);
			assert.equal(machine.isInResubmitPhase, false);
		});
	});
});
