/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ChangesetLocalId, IdAllocator, SequenceField as SF } from "../../../feature-libraries";
import { Delta, TaggedChange, makeAnonChange, tagChange } from "../../../core";
import { TestChange } from "../../testChange";
import { assertFieldChangesEqual, deepFreeze, fakeRepair } from "../../utils";
import { brand, fail } from "../../../util";
import { TestChangeset } from "./testEdits";

export function composeAnonChanges(changes: TestChangeset[]): TestChangeset {
	return compose(changes.map(makeAnonChange));
}

export function composeNoVerify(changes: TaggedChange<TestChangeset>[]): TestChangeset {
	return composeI(changes, (childChanges) => TestChange.compose(childChanges, false));
}

export function compose(changes: TaggedChange<TestChangeset>[]): TestChangeset {
	return composeI(changes, TestChange.compose);
}

export function composeAnonChangesShallow<T>(changes: SF.Changeset<T>[]): SF.Changeset<T> {
	return shallowCompose(changes.map(makeAnonChange));
}

export function shallowCompose<T>(changes: TaggedChange<SF.Changeset<T>>[]): SF.Changeset<T> {
	return composeI(changes, (children) => {
		assert(children.length === 1, "Should only have one child to compose");
		return children[0].change;
	});
}

function composeI<T>(
	changes: TaggedChange<SF.Changeset<T>>[],
	composer: (childChanges: TaggedChange<T>[]) => T,
): SF.Changeset<T> {
	const moveEffects = SF.newCrossFieldTable();
	const idAllocator = continuingAllocator(changes);
	const composed = SF.compose(changes, composer, idAllocator, moveEffects);

	if (moveEffects.isInvalidated) {
		resetCrossFieldTable(moveEffects);
		SF.amendCompose(composed, composer, idAllocator, moveEffects);
		// assert(!moveEffects.isInvalidated, "Compose should not need more than one amend pass");
	}
	return composed;
}

export function rebase(change: TestChangeset, base: TaggedChange<TestChangeset>): TestChangeset {
	deepFreeze(change);
	deepFreeze(base);

	const moveEffects = SF.newCrossFieldTable();
	const idAllocator = idAllocatorFromMaxId(getMaxId(change, base.change));
	let rebasedChange = SF.rebase(change, base, TestChange.rebase, idAllocator, moveEffects);
	if (moveEffects.isInvalidated) {
		moveEffects.reset();
		rebasedChange = SF.amendRebase(rebasedChange, base, idAllocator, moveEffects);
		// assert(!moveEffects.isInvalidated, "Rebase should not need more than one amend pass");
	}
	return rebasedChange;
}

export function rebaseTagged(
	change: TaggedChange<TestChangeset>,
	...baseChanges: TaggedChange<TestChangeset>[]
): TaggedChange<TestChangeset> {
	let currChange = change;
	for (const base of baseChanges) {
		currChange = tagChange(rebase(currChange.change, base), currChange.revision);
	}

	return currChange;
}

function resetCrossFieldTable(table: SF.CrossFieldTable) {
	table.isInvalidated = false;
	table.srcQueries.clear();
	table.dstQueries.clear();
}

export function invert(change: TaggedChange<TestChangeset>): TestChangeset {
	const table = SF.newCrossFieldTable();
	let inverted = SF.invert(
		change,
		TestChange.invert,
		() => fail("Sequence fields should not generate IDs during invert"),
		table,
	);

	if (table.isInvalidated) {
		table.isInvalidated = false;
		table.srcQueries.clear();
		table.dstQueries.clear();
		inverted = SF.amendInvert(
			inverted,
			change.revision,
			() => fail("Sequence fields should not generate IDs during invert"),
			table,
		);
		assert(!table.isInvalidated, "Invert should not need more than one amend pass");
	}

	return inverted;
}

export function checkDeltaEquality(actual: TestChangeset, expected: TestChangeset) {
	assertFieldChangesEqual(toDelta(actual), toDelta(expected));
}

export function toDelta(change: TestChangeset): Delta.FieldChanges {
	return SF.sequenceFieldToDelta(change, TestChange.toDelta, fakeRepair);
}

export function getMaxId(...changes: SF.Changeset<unknown>[]): ChangesetLocalId | undefined {
	let max: ChangesetLocalId | undefined;
	for (const change of changes) {
		for (const mark of change) {
			if (SF.isMoveMark(mark)) {
				max = max === undefined ? mark.id : brand(Math.max(max, mark.id));
			}
		}
	}

	return max;
}

export function getMaxIdTagged(
	changes: TaggedChange<SF.Changeset<unknown>>[],
): ChangesetLocalId | undefined {
	return getMaxId(...changes.map((c) => c.change));
}

export function continuingAllocator(changes: TaggedChange<SF.Changeset<unknown>>[]): IdAllocator {
	return idAllocatorFromMaxId(getMaxIdTagged(changes));
}

export function normalizeMoveIds(change: SF.Changeset<unknown>): void {
	let nextId = 0;
	const mappings = new Map<SF.MoveId, SF.MoveId>();
	for (const mark of change) {
		if (SF.isMoveMark(mark)) {
			let newId = mappings.get(mark.id);
			if (newId === undefined) {
				newId = brand(nextId++);
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				mappings.set(mark.id, newId!);
			}
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			mark.id = newId!;
		}
	}
}

export function idAllocatorFromMaxId(maxId: ChangesetLocalId | undefined = undefined): IdAllocator {
	let currId = maxId ?? -1;
	return () => {
		return brand(++currId);
	};
}
