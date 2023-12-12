/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { SequenceField as SF } from "../../../feature-libraries";
import {
	ChangesetLocalId,
	DeltaFieldChanges,
	RevisionInfo,
	RevisionMetadataSource,
	RevisionTag,
	TaggedChange,
	makeAnonChange,
	revisionMetadataSourceFromInfo,
	tagChange,
} from "../../../core";
import { TestChange } from "../../testChange";
import {
	assertFieldChangesEqual,
	deepFreeze,
	defaultRevInfosFromChanges,
	defaultRevisionMetadataFromChanges,
} from "../../utils";
import { brand, fakeIdAllocator, IdAllocator, idAllocatorFromMaxId } from "../../../util";
// eslint-disable-next-line import/no-internal-modules
import { RebaseRevisionMetadata } from "../../../feature-libraries/modular-schema";
// eslint-disable-next-line import/no-internal-modules
import { rebaseRevisionMetadataFromInfo } from "../../../feature-libraries/modular-schema/modularChangeFamily";
import { TestChangeset } from "./testEdits";

export function composeNoVerify(
	changes: TaggedChange<TestChangeset>[],
	revInfos?: RevisionInfo[],
): TestChangeset {
	return composeI(changes, (childChanges) => TestChange.compose(childChanges, false), revInfos);
}

export function compose(
	changes: TaggedChange<TestChangeset>[],
	revInfos?: RevisionInfo[] | RevisionMetadataSource,
	childComposer?: (childChanges: TaggedChange<TestChange>[]) => TestChange,
): TestChangeset {
	return composeI(changes, childComposer ?? TestChange.compose, revInfos);
}

export function prune(
	change: TestChangeset,
	childPruner?: (child: TestChange) => TestChange | undefined,
): TestChangeset {
	return SF.sequenceFieldChangeRebaser.prune(
		change,
		childPruner ?? ((child: TestChange) => (TestChange.isEmpty(child) ? undefined : child)),
	);
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
	revInfos?: RevisionInfo[] | RevisionMetadataSource,
): SF.Changeset<T> {
	const moveEffects = SF.newCrossFieldTable();
	const idAllocator = continuingAllocator(changes);
	let composed = SF.compose(
		changes,
		composer,
		idAllocator,
		moveEffects,
		revInfos !== undefined
			? Array.isArray(revInfos)
				? revisionMetadataSourceFromInfo(revInfos)
				: revInfos
			: defaultRevisionMetadataFromChanges(changes),
	);

	if (moveEffects.isInvalidated) {
		resetCrossFieldTable(moveEffects);
		composed = SF.amendCompose(composed, composer, idAllocator, moveEffects);
		assert(!moveEffects.isInvalidated, "Compose should not need more than one amend pass");
	}
	return composed;
}

export function rebase(
	change: TestChangeset,
	base: TaggedChange<TestChangeset>,
	revisionMetadata?: RebaseRevisionMetadata,
): TestChangeset {
	deepFreeze(change);
	deepFreeze(base);

	const metadata =
		revisionMetadata ??
		rebaseRevisionMetadataFromInfo(defaultRevInfosFromChanges([base, makeAnonChange(change)]), [
			base.revision,
		]);

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
		rebasedChange = SF.rebase(
			change,
			base,
			TestChange.rebase,
			idAllocator,
			moveEffects,
			metadata,
		);
	}
	return rebasedChange;
}

export function rebaseTagged(
	change: TaggedChange<TestChangeset>,
	baseChange: TaggedChange<TestChangeset>,
): TaggedChange<TestChangeset> {
	return rebaseOverChanges(change, [baseChange]);
}

export function rebaseOverChanges(
	change: TaggedChange<TestChangeset>,
	baseChanges: TaggedChange<TestChangeset>[],
	revInfos?: RevisionInfo[],
): TaggedChange<TestChangeset> {
	let currChange = change;
	const revisionInfo = revInfos ?? defaultRevInfosFromChanges(baseChanges);
	for (const base of baseChanges) {
		currChange = tagChange(
			rebase(
				currChange.change,
				base,
				rebaseRevisionMetadataFromInfo(revisionInfo, [base.revision]),
			),
			currChange.revision,
		);
	}

	return currChange;
}

export function rebaseOverComposition(
	change: TestChangeset,
	base: TestChangeset,
	metadata: RebaseRevisionMetadata,
): TestChangeset {
	return rebase(change, makeAnonChange(base), metadata);
}

function resetCrossFieldTable(table: SF.CrossFieldTable) {
	table.isInvalidated = false;
	table.srcQueries.clear();
	table.dstQueries.clear();
}

export function invert(change: TaggedChange<TestChangeset>): TestChangeset {
	const table = SF.newCrossFieldTable();
	const revisionMetadata = defaultRevisionMetadataFromChanges([change]);
	let inverted = SF.invert(
		change,
		TestChange.invert,
		// Sequence fields should not generate IDs during invert
		fakeIdAllocator,
		table,
		revisionMetadata,
	);

	if (table.isInvalidated) {
		table.isInvalidated = false;
		table.srcQueries.clear();
		table.dstQueries.clear();
		inverted = SF.invert(
			change,
			TestChange.invert,
			// Sequence fields should not generate IDs during invert
			fakeIdAllocator,
			table,
			revisionMetadata,
		);
	}

	return inverted;
}

export function checkDeltaEquality(actual: TestChangeset, expected: TestChangeset) {
	assertFieldChangesEqual(toDelta(actual), toDelta(expected));
}

export function toDelta(change: TestChangeset, revision?: RevisionTag): DeltaFieldChanges {
	deepFreeze(change);
	return SF.sequenceFieldToDelta(tagChange(change, revision), (childChange) =>
		TestChange.toDelta(tagChange(childChange, revision)),
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
		if (mark.cellId?.lineage === undefined && mark.cellId?.adjacentCells === undefined) {
			factory.push(mark);
		} else {
			const cloned = SF.cloneMark(mark);
			assert(cloned.cellId !== undefined, "Should have cell ID");
			delete cloned.cellId.lineage;
			delete cloned.cellId.adjacentCells;
			factory.push(cloned);
		}
	}

	return factory.list;
}

export function withNormalizedLineage<T>(changeset: SF.Changeset<T>): SF.Changeset<T> {
	const factory = new SF.MarkListFactory<T>();
	for (const mark of changeset) {
		if (mark.cellId?.lineage === undefined) {
			factory.push(mark);
		} else {
			const cloned = SF.cloneMark(mark);
			assert(cloned.cellId?.lineage !== undefined, "Cloned should have lineage");
			cloned.cellId.lineage = normalizedLineage(cloned.cellId.lineage);
			factory.push(cloned);
		}
	}

	return factory.list;
}

function normalizedLineage(lineage: SF.LineageEvent[]): SF.LineageEvent[] {
	const normalized = lineage.flatMap((event) => {
		const events: SF.LineageEvent[] = [];
		for (let i = 0; i < event.count; i++) {
			const id: ChangesetLocalId = brand(event.id + i);
			const offset = i <= event.offset ? 0 : 1;
			events.push({ revision: event.revision, count: 1, id, offset });
		}

		return events;
	});

	normalized.sort((a, b) => {
		const cmpRevision = cmp(a.revision, b.revision);
		if (cmpRevision !== 0) {
			return cmpRevision;
		}

		return cmp(a.id, b.id);
	});

	return normalized;
}

function cmp(a: any, b: any): number {
	if (a === b) {
		return 0;
	}

	return a > b ? 1 : -1;
}
