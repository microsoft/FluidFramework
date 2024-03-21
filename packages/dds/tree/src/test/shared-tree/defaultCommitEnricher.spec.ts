/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { GraphCommit, RevisionTag, TaggedChange } from "../../core/index.js";
import {
	ChangeEnricherCheckout,
	DefaultCommitEnricher,
	// eslint-disable-next-line import/no-internal-modules
} from "../../shared-tree/defaultCommitEnricher.js";
import { disposeSymbol } from "../../util/index.js";
import { testIdCompressor } from "../utils.js";

interface TestChange {
	readonly inputContext: RevisionTag;
	readonly outputContext: RevisionTag;
	readonly updateCount: number;
	readonly rebased?: true;
}

class TestChangeEnricher implements ChangeEnricherCheckout<TestChange> {
	public isDisposed = false;

	// These counters are used to verify that the commit enricher does not perform unnecessary work
	public static commitsEnriched = 0;
	public static commitsApplied = 0;
	public static checkoutsCreated = 0;

	public static resetCounters(): void {
		TestChangeEnricher.commitsEnriched = 0;
		TestChangeEnricher.commitsApplied = 0;
		TestChangeEnricher.checkoutsCreated = 0;
	}

	public constructor(public context: RevisionTag) {
		TestChangeEnricher.checkoutsCreated += 1;
	}

	public updateChangeEnrichments(change: TestChange, revision: RevisionTag): TestChange {
		assert.equal(this.isDisposed, false);
		assert.equal(change.inputContext, this.context);
		assert.equal(revision, change.outputContext);
		TestChangeEnricher.commitsEnriched += 1;
		return {
			...change,
			updateCount: change.updateCount + 1,
		};
	}

	public applyTipChange(change: TestChange, revision?: RevisionTag): void {
		assert.equal(this.isDisposed, false);
		assert.equal(change.inputContext, this.context);
		if (revision !== undefined) {
			assert.equal(revision, change.outputContext);
		}
		this.context = change.outputContext;
		TestChangeEnricher.commitsApplied += 1;
	}

	public [disposeSymbol](): void {
		assert.equal(this.isDisposed, false);
		this.isDisposed = true;
	}
}

function inverter({ revision, change }: TaggedChange<TestChange>, isRollback: boolean): TestChange {
	assert.equal(isRollback, true);
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

const commit1: GraphCommit<TestChange> = {
	change: {
		inputContext: revision0,
		outputContext: revision1,
		updateCount: 0,
	},
	revision: revision1,
};
const commit2: GraphCommit<TestChange> = {
	change: {
		inputContext: revision1,
		outputContext: revision2,
		updateCount: 0,
	},
	revision: revision2,
	parent: commit1,
};
const commit3: GraphCommit<TestChange> = {
	change: {
		inputContext: revision2,
		outputContext: revision3,
		updateCount: 0,
	},
	revision: revision3,
	parent: commit2,
};

describe("DefaultCommitEnricher", () => {
	it("enriches commits for first submit", () => {
		let currentRevision = revision0;
		const factory = () => new TestChangeEnricher(currentRevision);
		const enricher = new DefaultCommitEnricher(inverter, factory);
		currentRevision = revision1;
		const enriched1 = enricher.enrichCommit(commit1, false);
		assert.deepEqual(enriched1, {
			change: {
				inputContext: revision0,
				outputContext: revision1,
				updateCount: 1,
			},
			revision: revision1,
		});
		currentRevision = revision2;
		const enriched2 = enricher.enrichCommit(commit2, false);
		assert.deepEqual(enriched2, {
			change: {
				inputContext: revision1,
				outputContext: revision2,
				updateCount: 1,
			},
			revision: revision2,
			parent: commit1,
		});
	});

	describe("omits already sequenced commits from resubmit phase", () => {
		it("omits sequenced commits that were not rebased", () => {
			let currentRevision = revision0;
			const factory = () => new TestChangeEnricher(currentRevision);
			const enricher = new DefaultCommitEnricher(inverter, factory);
			currentRevision = revision1;
			enricher.enrichCommit(commit1, false);
			currentRevision = revision2;
			enricher.enrichCommit(commit2, false);
			// Simulate the sequencing of commit 1
			enricher.onSequencedCommitApplied(true);

			TestChangeEnricher.resetCounters();
			assert.equal(enricher.isInResubmitPhase, false);
			enricher.startResubmitPhase([commit2]);
			assert.equal(enricher.isInResubmitPhase, true);
			enricher.enrichCommit(commit2, true);
			assert.equal(enricher.isInResubmitPhase, false);
			// No new enrichment should be necessary
			assert.equal(TestChangeEnricher.checkoutsCreated, 0);
			assert.equal(TestChangeEnricher.commitsEnriched, 0);
			assert.equal(TestChangeEnricher.commitsApplied, 0);
		});

		it("omits sequenced commits that were rebased", () => {
			let currentRevision = revision0;
			const factory = () => new TestChangeEnricher(currentRevision);
			const enricher = new DefaultCommitEnricher(inverter, factory);
			currentRevision = revision1;
			enricher.enrichCommit(commit1, false);
			currentRevision = revision2;
			enricher.enrichCommit(commit2, false);
			// Simulate the sequencing of a peer commit. This would lead to the rebasing of commits 1 and 2.
			enricher.onSequencedCommitApplied(false);
			// Simulate the sequencing of commit 1
			enricher.onSequencedCommitApplied(true);
			const rebased2: GraphCommit<TestChange> = {
				...commit2,
				change: { ...commit2.change, rebased: true },
			};

			TestChangeEnricher.resetCounters();
			assert.equal(enricher.isInResubmitPhase, false);
			enricher.startResubmitPhase([rebased2]);
			assert.equal(enricher.isInResubmitPhase, true);
			enricher.enrichCommit(rebased2, true);
			assert.equal(enricher.isInResubmitPhase, false);
			// One enrichment should be necessary
			assert.equal(TestChangeEnricher.checkoutsCreated, 1);
			assert.equal(TestChangeEnricher.commitsEnriched, 1);
			assert.equal(TestChangeEnricher.commitsApplied, 1);
		});

		it("tolerates empty resubmit", () => {
			let currentRevision = revision0;
			const factory = () => new TestChangeEnricher(currentRevision);
			const enricher = new DefaultCommitEnricher(inverter, factory);
			currentRevision = revision1;
			enricher.enrichCommit(commit1, false);
			currentRevision = revision2;
			enricher.enrichCommit(commit2, false);
			// Simulate the sequencing of commit 1
			enricher.onSequencedCommitApplied(true);
			// Simulate the sequencing of a peer commit. This would lead to the rebasing of commit 2.
			enricher.onSequencedCommitApplied(false);
			// Simulate the sequencing of commit2
			enricher.onSequencedCommitApplied(true);

			TestChangeEnricher.resetCounters();
			assert.equal(enricher.isInResubmitPhase, false);
			enricher.startResubmitPhase([]);
			assert.equal(enricher.isInResubmitPhase, false);
			// No new enrichment should be necessary
			assert.equal(TestChangeEnricher.checkoutsCreated, 0);
			assert.equal(TestChangeEnricher.commitsEnriched, 0);
			assert.equal(TestChangeEnricher.commitsApplied, 0);
		});
	});

	describe("enriches commits for resubmit", () => {
		it("when the commits do not undergo rebasing", () => {
			let currentRevision = revision0;
			const factory = () => new TestChangeEnricher(currentRevision);
			const enricher = new DefaultCommitEnricher(inverter, factory);
			currentRevision = revision1;
			const enriched1 = enricher.enrichCommit(commit1, false);
			currentRevision = revision2;
			const enriched2 = enricher.enrichCommit(commit2, false);

			TestChangeEnricher.resetCounters();
			assert.equal(enricher.isInResubmitPhase, false);
			enricher.startResubmitPhase([commit1, commit2]);
			assert.equal(enricher.isInResubmitPhase, true);
			const enriched1Resubmit = enricher.enrichCommit(commit1, true);
			assert.equal(enricher.isInResubmitPhase, true);
			const enriched2Resubmit = enricher.enrichCommit(commit2, true);
			assert.equal(enricher.isInResubmitPhase, false);
			assert.equal(enriched1Resubmit, enriched1);
			assert.equal(enriched2Resubmit, enriched2);
			// No new enrichment should be necessary
			assert.equal(TestChangeEnricher.checkoutsCreated, 0);
			assert.equal(TestChangeEnricher.commitsEnriched, 0);
			assert.equal(TestChangeEnricher.commitsApplied, 0);

			// Verify that the enricher can resubmit those commits again
			enricher.startResubmitPhase([commit1, commit2]);
			assert.equal(enricher.isInResubmitPhase, true);
			assert.equal(enricher.enrichCommit(commit1, true), enriched1Resubmit);
			assert.equal(enricher.isInResubmitPhase, true);
			assert.equal(enricher.enrichCommit(commit2, true), enriched2Resubmit);
			assert.equal(enricher.isInResubmitPhase, false);
		});

		for (const scenario of ["only", "and before"]) {
			it(`when the commits undergo rebasing at resubmit time ${scenario}`, () => {
				let currentRevision = revision0;
				const factory = () => new TestChangeEnricher(currentRevision);
				const enricher = new DefaultCommitEnricher(inverter, factory);
				currentRevision = revision1;
				enricher.enrichCommit(commit1, false);

				if (scenario === "and before") {
					// Simulate the sequencing of a peer commit
					enricher.onSequencedCommitApplied(false);
				}

				currentRevision = revision2;
				enricher.enrichCommit(commit2, false);

				// Simulate the sequencing of a peer commit as part of the resubmit phase
				enricher.onSequencedCommitApplied(false);

				// This would lead to the rebasing of commits 1 and 2:
				const rebased1: GraphCommit<TestChange> = {
					...commit1,
					change: { ...commit1.change, rebased: true },
				};
				const rebased2: GraphCommit<TestChange> = {
					...commit2,
					parent: rebased1,
					change: { ...commit2.change, rebased: true },
				};
				TestChangeEnricher.resetCounters();
				assert.equal(enricher.isInResubmitPhase, false);
				enricher.startResubmitPhase([rebased1, rebased2]);
				assert.equal(enricher.isInResubmitPhase, true);
				const enriched1Resubmit = enricher.enrichCommit(rebased1, true);
				assert.equal(enricher.isInResubmitPhase, true);
				const enriched2Resubmit = enricher.enrichCommit(rebased2, true);
				assert.equal(enricher.isInResubmitPhase, false);
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
				assert.equal(TestChangeEnricher.checkoutsCreated, 1);
				assert.equal(TestChangeEnricher.commitsEnriched, 2);
				assert.equal(TestChangeEnricher.commitsApplied, 3);

				// Verify that the enricher can resubmit those commits again
				enricher.startResubmitPhase([rebased1, rebased2]);
				assert.equal(enricher.isInResubmitPhase, true);
				assert.equal(enricher.enrichCommit(rebased1, true), enriched1Resubmit);
				assert.equal(enricher.isInResubmitPhase, true);
				assert.equal(enricher.enrichCommit(rebased2, true), enriched2Resubmit);
				assert.equal(enricher.isInResubmitPhase, false);
			});
		}

		it("when the commits undergo rebasing before resubmit time", () => {
			let currentRevision = revision0;
			const factory = () => new TestChangeEnricher(currentRevision);
			const enricher = new DefaultCommitEnricher(inverter, factory);
			currentRevision = revision1;
			enricher.enrichCommit(commit1, false);
			currentRevision = revision2;
			enricher.enrichCommit(commit2, false);

			// Simulate the sequencing of a peer commit
			enricher.onSequencedCommitApplied(false);

			// This would lead to the rebasing of commits 1 and 2:
			const rebased1: GraphCommit<TestChange> = {
				...commit1,
				change: { ...commit1.change, rebased: true },
			};
			const rebased2: GraphCommit<TestChange> = {
				...commit2,
				parent: rebased1,
				change: { ...commit2.change, rebased: true },
			};

			currentRevision = revision3;
			const enriched3 = enricher.enrichCommit(commit3, false);

			TestChangeEnricher.resetCounters();
			assert.equal(enricher.isInResubmitPhase, false);
			enricher.startResubmitPhase([rebased1, rebased2, commit3]);
			assert.equal(enricher.isInResubmitPhase, true);
			const enriched1Resubmit = enricher.enrichCommit(rebased1, true);
			assert.equal(enricher.isInResubmitPhase, true);
			const enriched2Resubmit = enricher.enrichCommit(rebased2, true);
			assert.equal(enricher.isInResubmitPhase, true);
			const enriched3Resubmit = enricher.enrichCommit(commit3, true);
			assert.equal(enricher.isInResubmitPhase, false);
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
			assert.equal(enriched3Resubmit, enriched3);
			// Two enrichments should be necessary, which requires creating a new checkout and rewinding the state
			assert.equal(TestChangeEnricher.checkoutsCreated, 1);
			assert.equal(TestChangeEnricher.commitsEnriched, 2);
			// Three rollbacks should applied to rewind the state, and one rebased change should be applied
			assert.equal(TestChangeEnricher.commitsApplied, 4);

			// Verify that the enricher can resubmit those commits again
			enricher.startResubmitPhase([rebased1, rebased2, commit3]);
			assert.equal(enricher.isInResubmitPhase, true);
			assert.equal(enricher.enrichCommit(rebased1, true), enriched1Resubmit);
			assert.equal(enricher.isInResubmitPhase, true);
			assert.equal(enricher.enrichCommit(rebased2, true), enriched2Resubmit);
			assert.equal(enricher.isInResubmitPhase, true);
			assert.equal(enricher.enrichCommit(commit3, true), enriched3Resubmit);
			assert.equal(enricher.isInResubmitPhase, false);
		});
	});
});
