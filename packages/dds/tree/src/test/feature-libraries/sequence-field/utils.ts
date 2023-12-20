/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "assert";
import { assert, unreachableCase } from "@fluidframework/core-utils";
import { ChangesetLocalId, SequenceField as SF } from "../../../feature-libraries";
import {
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
import { brand, fakeIdAllocator, IdAllocator, idAllocatorFromMaxId, Mutable } from "../../../util";
// eslint-disable-next-line import/no-internal-modules
import { RebaseRevisionMetadata } from "../../../feature-libraries/modular-schema";
import {
	isAttachAndDetachEffect,
	isDetach,
	isTombstone,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/sequence-field/utils";
import {
	CellOrderingMethod,
	SequenceConfig,
	sequenceConfig,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/sequence-field/config";
// eslint-disable-next-line import/no-internal-modules
import { rebaseRevisionMetadataFromInfo } from "../../../feature-libraries/modular-schema/modularChangeFamily";
import { TestChangeset } from "./testEdits";

export function assertChangesetsEqual<T>(actual: SF.Changeset<T>, expected: SF.Changeset<T>): void {
	const updatedExpected = purgeUnusedCellOrderingInfo(expected);
	strict.deepEqual(actual, updatedExpected);
}

export function purgeUnusedCellOrderingInfo<T>(change: SF.Changeset<T>): SF.Changeset<T> {
	switch (sequenceConfig.cellOrdering) {
		case CellOrderingMethod.Tombstone:
			return withoutLineage(change);
		case CellOrderingMethod.Lineage:
			return withoutTombstones(change);
		default:
			unreachableCase(sequenceConfig.cellOrdering);
	}
}

export function skipOnLineageMethod(config: SequenceConfig, title: string, fn: () => void): void {
	if (config.cellOrdering === CellOrderingMethod.Lineage) {
		it.skip(title, fn);
	} else {
		it(title, fn);
	}
}

export function onlyOnLineageMethod(config: SequenceConfig, title: string, fn: () => void): void {
	if (config.cellOrdering === CellOrderingMethod.Lineage) {
		it(title, fn);
	} else {
		it.skip(title, fn);
	}
}

export function skipOnTombstoneMethod(config: SequenceConfig, title: string, fn: () => void): void {
	if (config.cellOrdering === CellOrderingMethod.Tombstone) {
		it.skip(title, fn);
	} else {
		it(title, fn);
	}
}

export function onlyOnTombstoneMethod(config: SequenceConfig, title: string, fn: () => void): void {
	if (config.cellOrdering === CellOrderingMethod.Tombstone) {
		it(title, fn);
	} else {
		it.skip(title, fn);
	}
}

export function describeForBothConfigs(title: string, fn: (config: SequenceConfig) => void): void {
	describe(title, () => {
		for (const method of [CellOrderingMethod.Tombstone, CellOrderingMethod.Lineage]) {
			describe(`${method}-based cell ordering`, () => {
				withOrderingMethod(method, fn);
			});
		}
	});
}

export function withOrderingMethod(
	method: CellOrderingMethod,
	fn: (config: SequenceConfig) => void,
) {
	const priorMethod = sequenceConfig.cellOrdering;
	const mutableConfig = sequenceConfig as Mutable<SequenceConfig>;
	mutableConfig.cellOrdering = method;
	try {
		// It's important that return a new object here rather `sequenceConfig` because `fn` may keep a reference to it
		// (e.g., a lambda's closure) while it may be mutated between the time that reference it taken and the time the
		// config is read.
		// Most notably, this is the case when using `describeForBothConfigs` which mutates `sequenceConfig` but does
		// not run the tests within it immediately.
		fn({ ...sequenceConfig });
	} finally {
		mutableConfig.cellOrdering = priorMethod;
	}
}

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
	const updatedChanges = changes.map(({ change, revision, rollbackOf }) => ({
		change: purgeUnusedCellOrderingInfo(change),
		revision,
		rollbackOf,
	}));
	const moveEffects = SF.newCrossFieldTable();
	const idAllocator = continuingAllocator(changes);
	let composed = SF.compose(
		updatedChanges,
		composer,
		idAllocator,
		moveEffects,
		revInfos !== undefined
			? Array.isArray(revInfos)
				? revisionMetadataSourceFromInfo(revInfos)
				: revInfos
			: defaultRevisionMetadataFromChanges(updatedChanges),
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
	const cleanChange = purgeUnusedCellOrderingInfo(change);
	const cleanBase = { ...base, change: purgeUnusedCellOrderingInfo(base.change) };
	deepFreeze(cleanChange);
	deepFreeze(cleanBase);

	const metadata =
		revisionMetadata ??
		rebaseRevisionMetadataFromInfo(
			defaultRevInfosFromChanges([cleanBase, makeAnonChange(cleanChange)]),
			[cleanBase.revision],
		);

	const moveEffects = SF.newCrossFieldTable();
	const idAllocator = idAllocatorFromMaxId(getMaxId(cleanChange, cleanBase.change));
	let rebasedChange = SF.rebase(
		cleanChange,
		cleanBase,
		TestChange.rebase,
		idAllocator,
		moveEffects,
		metadata,
	);
	if (moveEffects.isInvalidated) {
		moveEffects.reset();
		rebasedChange = SF.rebase(
			cleanChange,
			cleanBase,
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
	const cleanChange = { ...change, change: purgeUnusedCellOrderingInfo(change.change) };
	deepFreeze(cleanChange);
	const table = SF.newCrossFieldTable();
	const revisionMetadata = defaultRevisionMetadataFromChanges([cleanChange]);
	let inverted = SF.invert(
		cleanChange,
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
			cleanChange,
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
		const cloned = SF.cloneMark(mark);
		if (cloned.cellId !== undefined) {
			delete cloned.cellId.lineage;
			delete cloned.cellId.adjacentCells;
		}
		if (isDetach(cloned) || isAttachAndDetachEffect(cloned)) {
			const detach = isAttachAndDetachEffect(cloned) ? cloned.detach : cloned;
			if (detach.idOverride !== undefined) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				delete detach.idOverride.id.lineage;
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				delete detach.idOverride.id.adjacentCells;
			}
		}
		factory.push(cloned);
	}

	return factory.list;
}

export function withoutTombstones<T>(changeset: SF.Changeset<T>): SF.Changeset<T> {
	const factory = new SF.MarkListFactory<T>();
	for (const mark of changeset) {
		if (!isTombstone(mark)) {
			factory.push(mark);
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
