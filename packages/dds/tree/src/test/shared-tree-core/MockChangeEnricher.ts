/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { RevisionTag, TaggedChange } from "../../core/index.js";
import { disposeSymbol } from "../../util/index.js";
import { ChangeEnricherMutableCheckout } from "../../shared-tree-core/index.js";

export interface MockEnrichableChange {
	readonly inputContext: RevisionTag;
	readonly outputContext: RevisionTag;
	readonly updateCount: number;
	readonly rebased?: true;
}

export class MockChangeEnricher implements ChangeEnricherMutableCheckout<MockEnrichableChange> {
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

export function inverter(
	{ revision, change }: TaggedChange<MockEnrichableChange>,
	isRollback: boolean,
): MockEnrichableChange {
	assert.equal(isRollback, true);
	assert.equal(revision, change.outputContext);
	return {
		inputContext: change.outputContext,
		outputContext: change.inputContext,
		updateCount: 0,
	};
}
