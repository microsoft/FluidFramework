/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { GraphCommit } from "../../../dist/core/index.js";
import { RevisionTag, TaggedChange } from "../../core/index.js";
import {
	ChangeEnricherCheckout,
	DefaultCommitEnricher,
} from "../../shared-tree/defaultCommitEnricher.js";
import { disposeSymbol } from "../../util/index.js";
import { testIdCompressor } from "../utils.js";

interface TestChange {
	readonly inputContext: RevisionTag;
	readonly outputContext: RevisionTag;
	readonly updateCount: number;
}

class TestChangeEnricher implements ChangeEnricherCheckout<TestChange> {
	public isDisposed = false;

	public constructor(public context: RevisionTag) {}

	public updateChangeEnrichments(change: TestChange, revision: RevisionTag): TestChange {
		assert.equal(this.isDisposed, false);
		assert.equal(change.inputContext, this.context);
		assert.equal(revision, change.outputContext);
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

describe("DefaultCommitEnricher", () => {
	it("enriches changes for first submit", () => {
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

	describe("enriches changes for resubmit", () => {
		it("by reusing the originals when there has been no concurrent changes", () => {
			let currentRevision = revision0;
			const factory = () => new TestChangeEnricher(currentRevision);
			const enricher = new DefaultCommitEnricher(inverter, factory);
			currentRevision = revision1;
			const enriched1 = enricher.enrichCommit(commit1, false);
			currentRevision = revision2;
			const enriched2 = enricher.enrichCommit(commit2, false);
			assert.equal(enricher.isInResubmitPhase, false);
			enricher.startResubmitPhase([commit1, commit2]);
			assert.equal(enricher.isInResubmitPhase, true);
			const enriched1Resubmit = enricher.enrichCommit(commit1, true);
			const enriched2Resubmit = enricher.enrichCommit(commit2, true);
			assert.equal(enricher.isInResubmitPhase, false);
			assert.equal(enriched1Resubmit, enriched1);
			assert.equal(enriched2Resubmit, enriched2);
		});
	});
});
