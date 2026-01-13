/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { GraphCommit, RevisionTag } from "../../core/index.js";
import { testIdCompressor } from "../utils.js";
import {
	type ChangeEnricherProvider,
	type ChangeEnricherCheckout,
	DefaultResubmitMachine,
} from "../../shared-tree-core/index.js";

export interface MockEnrichableChange {
	readonly inputContext: RevisionTag;
	readonly outputContext: RevisionTag;
	readonly updateCount: number;
	readonly rebased?: true;
}

export class MockChangeEnricherProvider
	implements ChangeEnricherProvider<MockEnrichableChange>
{
	// These counters are used to verify that the commit enricher does not perform unnecessary work
	public commitsEnriched = 0;
	public commitsApplied = 0;
	public checkoutsCreated = 0;

	public resetCounters(): void {
		this.commitsEnriched = 0;
		this.commitsApplied = 0;
		this.checkoutsCreated = 0;
	}

	public runEnrichmentBatch(
		firstCommit: GraphCommit<MockEnrichableChange>,
		callback: (enricher: ChangeEnricherCheckout<MockEnrichableChange>) => void,
	): void {
		const enricher = new MockChangeEnricher(
			this,
			firstCommit.parent?.revision ?? assert.fail(),
		);
		callback(enricher);
	}
}

export class MockChangeEnricher implements ChangeEnricherCheckout<MockEnrichableChange> {
	private context: RevisionTag;

	public constructor(
		private readonly provider: MockChangeEnricherProvider,
		startContext: RevisionTag,
	) {
		this.context = startContext;
		provider.checkoutsCreated += 1;
	}

	public getContext(): RevisionTag {
		return this.context;
	}

	public updateChangeEnrichments(change: MockEnrichableChange): MockEnrichableChange {
		assert.equal(change.inputContext, this.context);
		this.provider.commitsEnriched += 1;
		return {
			...change,
			updateCount: change.updateCount + 1,
		};
	}

	public applyTipChange(change: MockEnrichableChange, revision?: RevisionTag): void {
		assert.equal(change.inputContext, this.context);
		if (revision !== undefined) {
			assert.equal(revision, change.outputContext);
		}
		this.context = change.outputContext;
		this.provider.commitsApplied += 1;
	}
}

const revisionRoot = testIdCompressor.generateCompressedId();
const revision0 = testIdCompressor.generateCompressedId();
const revision1 = testIdCompressor.generateCompressedId();
const revision2 = testIdCompressor.generateCompressedId();
const revision3 = testIdCompressor.generateCompressedId();

const commit0: GraphCommit<MockEnrichableChange> = {
	change: {
		inputContext: revisionRoot,
		outputContext: revision0,
		updateCount: 0,
	},
	revision: revision0,
};

const commit1: GraphCommit<MockEnrichableChange> = {
	change: {
		inputContext: revision0,
		outputContext: revision1,
		updateCount: 0,
	},
	revision: revision1,
	parent: commit0,
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
			const provider = new MockChangeEnricherProvider();
			const machine = new DefaultResubmitMachine(provider);
			machine.onCommitSubmitted(commit1);
			machine.onCommitSubmitted(commit2);
			// Simulate the sequencing of commit 1
			machine.onSequencedCommitApplied(commit1.revision, true);

			provider.resetCounters();
			machine.getEnrichedCommit(commit2.revision, () => [commit2]);
			machine.onCommitSubmitted(commit2);

			// No new enrichment should be necessary
			assert.equal(provider.checkoutsCreated, 0);
			assert.equal(provider.commitsEnriched, 0);
			assert.equal(provider.commitsApplied, 0);
		});

		it("omits sequenced commits that were rebased", () => {
			const provider = new MockChangeEnricherProvider();
			const machine = new DefaultResubmitMachine(provider);
			machine.onCommitSubmitted(commit1);
			machine.onCommitSubmitted(commit2);
			// Simulate the sequencing of a peer commit. This would lead to the rebasing of commits 1 and 2.
			machine.onSequencedCommitApplied(revision0, false);
			// Simulate the sequencing of commit 1
			machine.onSequencedCommitApplied(commit1.revision, true);
			const rebased2: GraphCommit<MockEnrichableChange> = {
				...commit2,
				change: { ...commit2.change, rebased: true },
			};

			provider.resetCounters();
			const enriched2Resubmit = machine.getEnrichedCommit(rebased2.revision, () => [rebased2]);
			assert(enriched2Resubmit !== undefined);
			machine.onCommitSubmitted(enriched2Resubmit);

			// One enrichment should be necessary
			assert.equal(provider.checkoutsCreated, 1);
			assert.equal(provider.commitsEnriched, 1);
			assert.equal(provider.commitsApplied, 1);
		});
	});

	it("can resubmit a subset of commits (skipping the first)", () => {
		const provider = new MockChangeEnricherProvider();
		const machine = new DefaultResubmitMachine(provider);

		// Submit three commits in order
		machine.onCommitSubmitted(commit1);
		machine.onCommitSubmitted(commit2);
		machine.onCommitSubmitted(commit3);

		provider.resetCounters();

		// Prepare for resubmit, skipping the first commit

		// Only the provided commits should be resubmitted, in order
		assert.deepEqual(
			machine.getEnrichedCommit(commit2.revision, () => [commit2, commit3]),
			commit2,
		);

		machine.onCommitSubmitted(commit2);

		assert.deepEqual(
			machine.getEnrichedCommit(commit3.revision, () => assert.fail()),
			commit3,
		);
		machine.onCommitSubmitted(commit3);

		// No enrichment or checkout should be needed
		assert.equal(provider.checkoutsCreated, 0);
		assert.equal(provider.commitsEnriched, 0);
		assert.equal(provider.commitsApplied, 0);
	});

	describe("enriches commits for resubmit", () => {
		it("when the commits do not undergo rebasing", () => {
			const provider = new MockChangeEnricherProvider();
			const machine = new DefaultResubmitMachine(provider);
			machine.onCommitSubmitted(commit1);
			machine.onCommitSubmitted(commit2);

			provider.resetCounters();
			const enriched1 = machine.getEnrichedCommit(commit1.revision, () => [commit1, commit2]);
			assert.equal(enriched1, commit1);
			machine.onCommitSubmitted(commit1);
			const enriched2 = machine.getEnrichedCommit(commit2.revision, () => assert.fail());
			assert.equal(enriched2, commit2);
			machine.onCommitSubmitted(commit2);
			// No new enrichment should be necessary
			assert.equal(provider.checkoutsCreated, 0);
			assert.equal(provider.commitsEnriched, 0);
			assert.equal(provider.commitsApplied, 0);

			// Verify that the enricher can resubmit those commits again
			machine.getEnrichedCommit(commit1.revision, () => [commit1, commit2]);
			machine.onCommitSubmitted(commit1);
			machine.onCommitSubmitted(commit2);
		});

		for (const scenario of ["only", "and before"]) {
			it(`when the commits undergo rebasing at resubmit time ${scenario}`, () => {
				const provider = new MockChangeEnricherProvider();
				const machine = new DefaultResubmitMachine(provider);
				machine.onCommitSubmitted(commit1);

				if (scenario === "and before") {
					// Simulate the sequencing of a peer commit
					machine.onSequencedCommitApplied(revision0, false);
				}

				machine.onCommitSubmitted(commit2);

				// Simulate the sequencing of a peer commit as part of the resubmit phase
				machine.onSequencedCommitApplied(revision3, false);

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
				provider.resetCounters();
				const enriched1Resubmit = machine.getEnrichedCommit(rebased1.revision, () => [
					rebased1,
					rebased2,
				]);

				assert.deepEqual(enriched1Resubmit, {
					change: {
						inputContext: revision0,
						outputContext: revision1,
						updateCount: 1,
						rebased: true,
					},
					revision: revision1,
					parent: commit0,
				});

				machine.onCommitSubmitted(enriched1Resubmit);
				const enriched2Resubmit = machine.getEnrichedCommit(rebased2.revision, () =>
					assert.fail(),
				);

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
				machine.onCommitSubmitted(enriched2Resubmit);

				// Two enrichments should be necessary, which requires creating a new checkout
				assert.equal(provider.checkoutsCreated, 1);
				assert.equal(provider.commitsEnriched, 2);
				assert.equal(provider.commitsApplied, 2);

				// Verify that the enricher can resubmit those commits again
				assert.equal(
					machine.getEnrichedCommit(rebased1.revision, () => [rebased1, rebased2]),
					enriched1Resubmit,
				);
				machine.onCommitSubmitted(enriched1Resubmit);
				assert.equal(
					machine.getEnrichedCommit(rebased2.revision, () => assert.fail()),
					enriched2Resubmit,
				);
				machine.onCommitSubmitted(enriched2Resubmit);
			});
		}

		it("when the commits undergo rebasing before resubmit time", () => {
			const provider = new MockChangeEnricherProvider();
			const machine = new DefaultResubmitMachine(provider);
			machine.onCommitSubmitted(commit1);
			machine.onCommitSubmitted(commit2);

			// Simulate the sequencing of a peer commit
			machine.onSequencedCommitApplied(revision0, false);

			// This would lead to the rebasing of commits 1 and 2:
			const rebased1: GraphCommit<MockEnrichableChange> = {
				...commit1,
				parent: commit0,
				change: { ...commit1.change, rebased: true },
			};
			const rebased2: GraphCommit<MockEnrichableChange> = {
				...commit2,
				parent: rebased1,
				change: { ...commit2.change, rebased: true },
			};

			machine.onCommitSubmitted(commit3);

			provider.resetCounters();
			const enriched1Resubmit = machine.getEnrichedCommit(rebased1.revision, () => [
				rebased1,
				rebased2,
				commit3,
			]);

			assert.deepEqual(enriched1Resubmit, {
				change: {
					inputContext: revision0,
					outputContext: revision1,
					updateCount: 1,
					rebased: true,
				},
				revision: revision1,
				parent: commit0,
			});

			machine.onCommitSubmitted(enriched1Resubmit);
			const enriched2Resubmit = machine.getEnrichedCommit(rebased2.revision, () =>
				assert.fail(),
			);

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

			machine.onCommitSubmitted(enriched2Resubmit);
			const enriched3Resubmit = machine.getEnrichedCommit(commit3.revision, () =>
				assert.fail(),
			);

			// This commit did not undergo rebasing so its enrichments did not need updating
			assert.equal(enriched3Resubmit, commit3);
			machine.onCommitSubmitted(enriched3Resubmit);

			// Two enrichments should be necessary, which requires creating a new checkout
			assert.equal(provider.checkoutsCreated, 1);
			assert.equal(provider.commitsEnriched, 2);
			assert.equal(provider.commitsApplied, 2);

			// Verify that the enricher can resubmit those commits again
			assert.equal(
				machine.getEnrichedCommit(rebased1.revision, () => [rebased1, rebased2, commit3]),
				enriched1Resubmit,
			);
			machine.onCommitSubmitted(enriched1Resubmit);
			assert.equal(
				machine.getEnrichedCommit(rebased2.revision, () => assert.fail()),
				enriched2Resubmit,
			);
			machine.onCommitSubmitted(enriched2Resubmit);
			assert.equal(
				machine.getEnrichedCommit(commit3.revision, () => assert.fail()),
				enriched3Resubmit,
			);
			machine.onCommitSubmitted(enriched3Resubmit);
		});

		it("enriches only rebased commits when resubmitting a subset", () => {
			const provider = new MockChangeEnricherProvider();
			const machine = new DefaultResubmitMachine(provider);

			// Submit three commits in order
			machine.onCommitSubmitted(commit1);
			machine.onCommitSubmitted(commit2);
			// Simulate a peer commit that causes commit1 and commit2 to be rebased, but not commit3
			machine.onSequencedCommitApplied(revision0, false);

			const rebased2: GraphCommit<MockEnrichableChange> = {
				...commit2,
				change: { ...commit2.change, rebased: true },
			};

			machine.onCommitSubmitted(commit3);

			provider.resetCounters();

			// The rebased commit2 should be enriched
			const enriched2Resubmit = machine.getEnrichedCommit(rebased2.revision, () => [
				rebased2,
				commit3,
			]);

			assert.deepEqual(enriched2Resubmit, {
				change: {
					inputContext: revision1,
					outputContext: revision2,
					updateCount: 1,
					rebased: true,
				},
				revision: revision2,
				parent: commit1,
			});

			machine.onCommitSubmitted(enriched2Resubmit);

			// commit3 should not be enriched
			const enriched3Resubmit = machine.getEnrichedCommit(commit3.revision, () =>
				assert.fail(),
			);
			assert.deepEqual(enriched3Resubmit, commit3);
			machine.onCommitSubmitted(enriched3Resubmit);

			// Only one enrichment and one checkout should be needed
			assert.equal(provider.checkoutsCreated, 1);
			assert.equal(provider.commitsEnriched, 1);
			assert.equal(provider.commitsApplied, 1);
		});
	});
});
