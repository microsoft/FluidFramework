/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	CommitKind,
	makeAnonChange,
	mapTaggedChange,
	tagChange,
	tagRollbackInverse,
	type DeltaFieldMap,
	type RevisionMetadataSource,
	type RevisionTag,
	type TaggedChange,
} from "../../../core/index.js";
import { intoDelta } from "../../../feature-libraries/index.js";
import {
	TreeBeta,
	type SharedTreeChange,
	type TreeCheckout,
} from "../../../shared-tree/index.js";
import {
	SharedTreeChangeFamily,
	// eslint-disable-next-line import-x/no-internal-modules -- Exercise the production change family directly.
} from "../../../shared-tree/sharedTreeChangeFamily.js";
import {
	assertModularChangesetsEqual,
	// eslint-disable-next-line import-x/no-internal-modules -- Reuse the modular changeset assertion helper.
} from "../../feature-libraries/modular-schema/modularChangesetUtil.js";
import {
	defaultRevisionMetadataFromChanges,
	jsonTreeFromCheckout,
	validateViewConsistency,
} from "../../utils.js";

/**
 * Bind algebraic operations to the production SharedTree family.
 * All inputs and outputs retain the complete SharedTree envelope.
 */
export class SharedTreeAxiomAdapter {
	public constructor(
		private readonly family: SharedTreeChangeFamily,
		private readonly mintRevision: () => RevisionTag,
	) {}

	public empty(): TaggedChange<SharedTreeChange> {
		return tagChange(SharedTreeChangeFamily.emptyChange, this.mintRevision());
	}

	public compose(
		changes: readonly TaggedChange<SharedTreeChange>[],
	): TaggedChange<SharedTreeChange> {
		return makeAnonChange(this.family.compose([...changes]));
	}

	public invert(
		change: TaggedChange<SharedTreeChange>,
		isRollback: boolean,
	): TaggedChange<SharedTreeChange> {
		assert(change.revision !== undefined, "Inversion requires an authored revision");
		const revision = this.mintRevision();
		const inverse = this.family.invert(change, isRollback, revision);
		return isRollback
			? tagRollbackInverse(inverse, revision, change.revision)
			: tagChange(inverse, revision);
	}

	public rebase(
		change: TaggedChange<SharedTreeChange>,
		base: TaggedChange<SharedTreeChange>,
		metadata: RevisionMetadataSource,
	): TaggedChange<SharedTreeChange> {
		return mapTaggedChange(change, this.family.rebase(change, base, metadata));
	}

	public rebaseOverComposition(
		change: TaggedChange<SharedTreeChange>,
		bases: readonly TaggedChange<SharedTreeChange>[],
		metadata: RevisionMetadataSource,
	): TaggedChange<SharedTreeChange> {
		return this.rebase(change, this.compose(bases), metadata);
	}

	/**
	 * Use the original path to retain revision order and rollback relationships after composition.
	 */
	public rebaseOverSingles(
		change: TaggedChange<SharedTreeChange>,
		bases: readonly TaggedChange<SharedTreeChange>[],
		metadata: RevisionMetadataSource,
	): TaggedChange<SharedTreeChange> {
		let result = change;
		for (const base of bases) {
			result = this.rebase(result, base, metadata);
		}
		return result;
	}
}

/**
 * Compare tags and ordered envelope entries, normalizing only corresponding data payloads.
 */
export function assertSharedTreeChangesEqual(
	actual: TaggedChange<SharedTreeChange>,
	expected: TaggedChange<SharedTreeChange>,
): void {
	assert.equal(actual.revision, expected.revision);
	assert.equal(actual.rollbackOf, expected.rollbackOf);
	assert.equal(actual.change.changes.length, expected.change.changes.length);
	for (let index = 0; index < actual.change.changes.length; index++) {
		const a = actual.change.changes[index];
		const b = expected.change.changes[index];
		assert.equal(a.type, b.type);
		if (a.type === "data" && b.type === "data") {
			assertModularChangesetsEqual(a.innerChange, b.innerChange);
		} else {
			assert.deepEqual(a, b);
		}
	}
}

function assertFieldsHaveNoEffects(fields: DeltaFieldMap | undefined): void {
	for (const field of fields?.values() ?? []) {
		for (const mark of field.marks) {
			assert.equal(mark.attach, undefined, "Unexpected attachment");
			assert.equal(mark.detach, undefined, "Unexpected detachment");
			assertFieldsHaveNoEffects(mark.fields);
		}
	}
}

/**
 * Assert absence of data application effects, including detached-root effects.
 * This is not structural emptiness or an assertion about future rebasing intentions.
 * Schema changes are deliberately unsupported, not silently ignored.
 */
export function assertSharedTreeChangeHasNoEffects(
	change: TaggedChange<SharedTreeChange>,
): void {
	for (const entry of change.change.changes) {
		assert(entry.type === "data", "Effect emptiness requires a data-only change");
		const delta = intoDelta(mapTaggedChange(change, entry.innerChange));
		try {
			assertFieldsHaveNoEffects(delta.fields);
			for (const effects of [delta.build, delta.destroy, delta.refreshers, delta.rename]) {
				assert.equal(effects?.length ?? 0, 0, "Unexpected detached-root effect");
			}
			for (const global of delta.global ?? []) {
				assertFieldsHaveNoEffects(global.fields);
			}
		} finally {
			for (const { trees } of [...(delta.build ?? []), ...(delta.refreshers ?? [])]) {
				trees.referenceRemoved();
			}
		}
	}
}

/**
 * Replay both paths on isolated checkouts and compare visible content and stored schema.
 * Complements changeset assertions; does not establish detached-content or identity equivalence.
 */
export function assertSharedTreeReplayEqual(
	initial: TreeCheckout,
	actual: readonly TaggedChange<SharedTreeChange>[],
	expected: readonly TaggedChange<SharedTreeChange>[],
	applicationRevision: RevisionTag,
): void {
	const left = initial.fork();
	try {
		const right = initial.fork();
		try {
			for (const [checkout, path] of [
				[left, actual],
				[right, expected],
			] as const) {
				assert(path.filter((change) => change.revision === undefined).length <= 1);
				for (const change of path) {
					checkout.mainBranch.apply(
						change.revision === undefined
							? tagChange(change.change, applicationRevision)
							: change,
						CommitKind.Default,
						undefined,
					);
				}
			}
			validateViewConsistency(left, right);
		} finally {
			right.dispose();
		}
	} finally {
		left.dispose();
	}
}

/**
 * Compare one concurrent edit rebased over a history, with and without composing that history.
 */
export function verifySharedTreeRebaseOverComposition(
	adapter: SharedTreeAxiomAdapter,
	change: TaggedChange<SharedTreeChange>,
	bases: readonly TaggedChange<SharedTreeChange>[],
): TaggedChange<SharedTreeChange> {
	const metadata = defaultRevisionMetadataFromChanges([...bases, change]);
	const overSingles = adapter.rebaseOverSingles(change, bases, metadata);
	const overComposed = adapter.rebaseOverComposition(change, bases, metadata);
	assertSharedTreeChangesEqual(overSingles, overComposed);
	return overComposed;
}
