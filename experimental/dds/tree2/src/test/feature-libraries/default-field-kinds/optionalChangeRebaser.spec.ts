/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { CrossFieldManager, NodeChangeset, singleTextCursor } from "../../../feature-libraries";
import {
	ChangesetLocalId,
	Delta,
	makeAnonChange,
	mintRevisionTag,
	RevisionTag,
	tagChange,
	TaggedChange,
	tagRollbackInverse,
	TreeSchemaIdentifier,
} from "../../../core";
// TODO: Throughout this file, we use TestChange as the child change type.
// This is the same approach used in sequenceChangeRebaser.spec.ts, but it requires casting in this file
// since OptionalChangeset is not generic over the child changeset type.
// Search this file for "as any" and "as NodeChangeset"
import { TestChange } from "../../testChange";
import { deepFreeze, defaultRevisionMetadataFromChanges, isDeltaVisible } from "../../utils";
import { brand, idAllocatorFromMaxId } from "../../../util";
import {
	optionalChangeRebaser,
	optionalFieldEditor,
	optionalFieldIntoDelta,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/default-field-kinds/optionalField";
// eslint-disable-next-line import/no-internal-modules
import { OptionalChangeset } from "../../../feature-libraries/default-field-kinds/defaultFieldChangeTypes";

const type: TreeSchemaIdentifier = brand("Node");
const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();
const tag4: RevisionTag = mintRevisionTag();
const tag5: RevisionTag = mintRevisionTag();
const tag6: RevisionTag = mintRevisionTag();

const OptionalChange = {
	set(value: string | undefined, wasEmpty: boolean, id: ChangesetLocalId = brand(0)) {
		return optionalFieldEditor.set(
			value !== undefined ? singleTextCursor({ type, value }) : undefined,
			wasEmpty,
			id,
		);
	},

	buildChildChange(childChange: TestChange) {
		return optionalFieldEditor.buildChildChange(0, childChange as NodeChangeset);
	},
};

const failCrossFieldManager: CrossFieldManager = {
	get: () => assert.fail("Should not query CrossFieldManager"),
	set: () => assert.fail("Should not modify CrossFieldManager"),
};

function toDelta(change: OptionalChangeset): Delta.MarkList {
	return optionalFieldIntoDelta(change, TestChange.toDelta as any);
}

function getMaxId(...changes: OptionalChangeset[]): ChangesetLocalId | undefined {
	let max: ChangesetLocalId | undefined;
	const ingest = (candidate: ChangesetLocalId | undefined) => {
		if (max === undefined || (candidate !== undefined && candidate > max)) {
			max = candidate;
		}
	};

	for (const change of changes) {
		ingest(change.fieldChange?.id);
		// Child changes do not need to be ingested for this test file, as TestChange (which is used as a child)
		// doesn't have any `ChangesetLocalId`s.
	}

	return max;
}

function invert(change: TaggedChange<OptionalChangeset>): OptionalChangeset {
	return optionalChangeRebaser.invert(
		change,
		TestChange.invert as any,
		// Note: content here is arbitrary. If adding or changing this test suite, this NodeReviver implementation
		// may need to be changed.
		() => [singleTextCursor({ type, value: "revived" })],
		() => assert.fail("Optional fields should not generate IDs during invert"),
		failCrossFieldManager,
	);
}

function rebase(
	change: OptionalChangeset,
	base: TaggedChange<OptionalChangeset>,
): OptionalChangeset {
	deepFreeze(change);
	deepFreeze(base);

	const metadata = defaultRevisionMetadataFromChanges([base, makeAnonChange(change)]);
	const moveEffects = failCrossFieldManager;
	const idAllocator = idAllocatorFromMaxId(getMaxId(change, base.change));
	return optionalChangeRebaser.rebase(
		change,
		base,
		TestChange.rebase as any,
		idAllocator,
		moveEffects,
		metadata,
		undefined,
	);
}

function rebaseTagged(
	change: TaggedChange<OptionalChangeset>,
	...baseChanges: TaggedChange<OptionalChangeset>[]
): TaggedChange<OptionalChangeset> {
	let currChange = change;
	for (const base of baseChanges) {
		currChange = tagChange(rebase(currChange.change, base), currChange.revision);
	}

	return currChange;
}

function compose(changes: TaggedChange<OptionalChangeset>[]): OptionalChangeset {
	const moveEffects = failCrossFieldManager;
	const idAllocator = idAllocatorFromMaxId(getMaxId(...changes.map((c) => c.change)));
	return optionalChangeRebaser.compose(
		changes,
		TestChange.compose as any,
		idAllocator,
		moveEffects,
		defaultRevisionMetadataFromChanges(changes),
	);
}

const testChanges: [string, OptionalChangeset][] = [
	// TODO:AB#4622: This set of edits should be extended to ones with changes to previous content in the field.
	// If certain types of changes can only be made in some state (e.g. the current format with "wasEmpty"),
	// we could also consider running multiple exhaustive test suites for meaningfully different starting states.
	// E.g. in the current format, changes A and B cannot disagree on 'wasEmpty' if they share the same base commit.
	["SetA", OptionalChange.set("A", false)],
	["SetB", OptionalChange.set("B", false)],
	["SetUndefined", OptionalChange.set(undefined, false)],
	["ChangeChild", OptionalChange.buildChildChange(TestChange.mint([], 1))],
];
deepFreeze(testChanges);

describe("OptionalField - Rebaser Axioms", () => {
	/**
	 * This test simulates rebasing over an do-inverse pair.
	 */
	describe("A ↷ [B, B⁻¹] === A", () => {
		for (const [name1, untaggedChange1] of testChanges) {
			for (const [name2, untaggedChange2] of testChanges) {
				it(`(${name1} ↷ ${name2}) ↷ ${name2}⁻¹ => ${name1}`, () => {
					const change1 = tagChange(untaggedChange1, tag5);
					const change2 = tagChange(untaggedChange2, tag3);
					const inv = tagRollbackInverse(invert(change2), tag4, tag3);
					const r1 = rebaseTagged(change1, change2);
					const r2 = rebaseTagged(r1, inv);
					assert.deepEqual(r2.change, change1.change);
				});
			}
		}
	});

	/**
	 * This test simulates rebasing over an do-undo pair.
	 * It is different from the above in two ways:
	 * - The undo(B) changeset bears a different RevisionTag than B
	 * - The inverse produced by undo(B) is not a rollback
	 */
	describe("A ↷ [B, undo(B)] => A", () => {
		for (const [name1, untaggedChange1] of testChanges) {
			for (const [name2, untaggedChange2] of testChanges) {
				const title = `${name1} ↷ [${name2}, undo(${name2})] => ${name1}`;
				it(title, () => {
					const change1 = tagChange(untaggedChange1, tag5);
					const change2 = tagChange(untaggedChange2, tag3);
					const inv = tagChange(invert(change2), tag4);
					const r1 = rebaseTagged(change1, change2);
					const r2 = rebaseTagged(r1, inv);
					assert.deepEqual(r2.change, change1.change);
				});
			}
		}
	});

	/**
	 * This test simulates sandwich rebasing:
	 * a change is first rebased over the inverse of a change it took for granted
	 * then rebased over the updated version of that change (the same as the original in our case).
	 *
	 * The first rebase (A ↷ B) is purely for the purpose of manufacturing a change to which we can
	 * apply the inverse of some change.
	 */
	describe("(A ↷ B) ↷ [B⁻¹, B] === A ↷ B", () => {
		for (const [name1, untaggedChange1] of testChanges) {
			for (const [name2, untaggedChange2] of testChanges) {
				const title = `${name1} ↷ [${name2}, ${name2}⁻¹, ${name2}] => ${name1} ↷ ${name2}`;
				it(title, () => {
					const change1 = tagChange(untaggedChange1, tag6);
					const change2 = tagChange(untaggedChange2, tag3);
					const inverse2 = tagRollbackInverse(invert(change2), tag4, change2.revision);
					const r1 = rebaseTagged(change1, change2);
					const r2 = rebaseTagged(r1, inverse2);
					const r3 = rebaseTagged(r2, change2);
					assert.deepEqual(r3.change, r1.change);
				});
			}
		}
	});

	describe("A ○ A⁻¹ === ε", () => {
		for (const [name, change] of testChanges) {
			if (["SetA", "SetB", "SetUndefined"].includes(name)) {
				// TODO:AB#4622: OptionalChangeset should obey group axioms, but the current compose implementation does not
				// cancel changes from inverses, and in some cases the representation isn't sufficient for doing so.
				// Set operations fail to satisfy this test because they generate explicit deltas which set the trait to be
				// the previous value, rather than noops.
				continue;
			}

			it(`${name} ○ ${name}⁻¹ === ε`, () => {
				const taggedChange = tagChange(change, tag1);
				const inv = invert(taggedChange);
				const changes = [
					taggedChange,
					tagRollbackInverse(inv, tag2, taggedChange.revision),
				];
				const actual = compose(changes);
				const delta = toDelta(actual);
				assert.equal(isDeltaVisible(delta), false);
			});
		}
	});

	describe("A⁻¹ ○ A === ε", () => {
		for (const [name, change] of testChanges) {
			if (["SetA", "SetB", "SetUndefined"].includes(name)) {
				// TODO:AB#4622: OptionalChangeset should obey group axioms, but the current compose implementation does not
				// cancel changes from inverses, and in some cases the representation isn't sufficient for doing so.
				// Set operations fail to satisfy this test because they generate explicit deltas which set the trait to be
				// the previous value, rather than noops.
				continue;
			}
			it(`${name}⁻¹ ○ ${name} === ε`, () => {
				const taggedChange = tagChange(change, tag1);
				const inv = tagRollbackInverse(invert(taggedChange), tag2, taggedChange.revision);
				const changes = [inv, taggedChange];
				const actual = compose(changes);
				const delta = toDelta(actual);
				assert.equal(isDeltaVisible(delta), false);
			});
		}
	});
});
