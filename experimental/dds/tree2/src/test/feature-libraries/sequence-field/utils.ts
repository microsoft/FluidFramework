/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	MemoizedIdRangeAllocator,
	RevisionInfo,
	revisionMetadataSourceFromInfo,
	SequenceField as SF,
} from "../../../feature-libraries";
import { ChangesetLocalId, Delta, TaggedChange, makeAnonChange, tagChange } from "../../../core";
import { TestChange } from "../../testChange";
import {
	assertMarkListEqual,
	deepFreeze,
	defaultRevisionMetadataFromChanges,
	fakeTaggedRepair as fakeRepair,
} from "../../utils";
import { brand, fail, IdAllocator, idAllocatorFromMaxId } from "../../../util";
import { TestChangeset } from "./testEdits";

export function composeAnonChanges(changes: TestChangeset[]): TestChangeset {
	return compose(changes.map(makeAnonChange));
}

export function composeNoVerify(
	changes: TaggedChange<TestChangeset>[],
	revInfos?: RevisionInfo[],
): TestChangeset {
	return composeI(changes, (childChanges) => TestChange.compose(childChanges, false), revInfos);
}

export function compose(
	changes: TaggedChange<TestChangeset>[],
	revInfos?: RevisionInfo[],
): TestChangeset {
	return composeI(changes, TestChange.compose, revInfos);
}

export function composeAnonChangesShallow<T>(changes: SF.Changeset<T>[]): SF.Changeset<T> {
	return shallowCompose(changes.map(makeAnonChange));
}

export function shallowCompose<T>(
	changes: TaggedChange<SF.Changeset<T>>[],
	revInfos?: RevisionInfo[],
): SF.Changeset<T> {
	return composeI(
		changes,
		(children) => {
			assert(children.length === 1, "Should only have one child to compose");
			return children[0].change;
		},
		revInfos,
	);
}

function composeI<T>(
	changes: TaggedChange<SF.Changeset<T>>[],
	composer: (childChanges: TaggedChange<T>[]) => T,
	revInfos?: RevisionInfo[],
): SF.Changeset<T> {
	const moveEffects = SF.newCrossFieldTable();
	const idAllocator = continuingAllocator(changes);
	let composed = SF.compose(
		changes,
		composer,
		idAllocator,
		moveEffects,
		revInfos !== undefined
			? revisionMetadataSourceFromInfo(revInfos)
			: defaultRevisionMetadataFromChanges(changes),
	);

	if (moveEffects.isInvalidated) {
		resetCrossFieldTable(moveEffects);
		composed = SF.amendCompose(composed, composer, idAllocator, moveEffects);
		assert(!moveEffects.isInvalidated, "Compose should not need more than one amend pass");
	}
	return composed;
}

export function rebase(change: TestChangeset, base: TaggedChange<TestChangeset>): TestChangeset {
	deepFreeze(change);
	deepFreeze(base);

	const metadata = defaultRevisionMetadataFromChanges([base, makeAnonChange(change)]);
	const moveEffects = SF.newCrossFieldTable();
	const idAllocator = idAllocatorFromMaxId(getMaxId(change, base.change));
	let rebasedChange = SF.rebase(
		change,
		base,
		TestChange.rebase,
		idAllocator,
		moveEffects,
		metadata,
	);
	if (moveEffects.isInvalidated) {
		moveEffects.reset();
		rebasedChange = SF.amendRebase(
			rebasedChange,
			base,
			(a, b) => a,
			idAllocator,
			moveEffects,
			metadata,
		);
		assert(!moveEffects.isInvalidated, "Rebase should not need more than one amend pass");
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
		fakeRepair,
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
			fakeRepair,
			() => fail("Sequence fields should not generate IDs during invert"),
			table,
		);
		assert(!table.isInvalidated, "Invert should not need more than one amend pass");
	}

	return inverted;
}

export function checkDeltaEquality(actual: TestChangeset, expected: TestChangeset) {
	assertMarkListEqual(toDelta(actual), toDelta(expected));
}

export function toDelta(change: TestChangeset): Delta.MarkList {
	return SF.sequenceFieldToDelta(
		makeAnonChange(change),
		TestChange.toDelta,
		MemoizedIdRangeAllocator.fromNextId(),
	);
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

export function withoutLineage<T>(changeset: SF.Changeset<T>): SF.Changeset<T> {
	const factory = new SF.MarkListFactory<T>();
	for (const mark of changeset) {
		if (mark.cellId?.lineage === undefined) {
			factory.push(mark);
		} else {
			const cloned = SF.cloneMark(mark);
			assert(cloned.cellId !== undefined, "Should have cell ID");
			delete cloned.cellId.lineage;
			factory.push(cloned);
		}
	}

	return factory.list;
}
