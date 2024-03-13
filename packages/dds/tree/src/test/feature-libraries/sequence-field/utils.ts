/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "assert";
import { assert, unreachableCase } from "@fluidframework/core-utils";
import { SequenceField as SF } from "../../../feature-libraries/index.js";
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
} from "../../../core/index.js";
import { TestChange } from "../../testChange.js";
import {
	assertFieldChangesEqual,
	deepFreeze,
	defaultRevInfosFromChanges,
	defaultRevisionMetadataFromChanges,
} from "../../utils.js";
import {
	brand,
	fail,
	fakeIdAllocator,
	getOrAddEmptyToMap,
	IdAllocator,
	idAllocatorFromMaxId,
	Mutable,
} from "../../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { RebaseRevisionMetadata } from "../../../feature-libraries/modular-schema/index.js";
import {
	areInputCellsEmpty,
	cloneMark,
	getInputLength,
	isActiveReattach,
	isAttachAndDetachEffect,
	isDetach,
	isNewAttach,
	isTombstone,
	markEmptiesCells,
	splitMark,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/sequence-field/utils.js";
import {
	CellOrderingMethod,
	SequenceConfig,
	sequenceConfig,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/sequence-field/config.js";
import {
	CellId,
	Changeset,
	HasMarkFields,
	MarkListFactory,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/sequence-field/index.js";
// eslint-disable-next-line import/no-internal-modules
import { DetachedCellMark } from "../../../feature-libraries/sequence-field/helperTypes.js";
// eslint-disable-next-line import/no-internal-modules
import { rebaseRevisionMetadataFromInfo } from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
import { TestChangeset } from "./testEdits.js";

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
	return composeI(
		changes,
		(change1, change2) => TestChange.compose(change1, change2, false),
		revInfos,
	);
}

export function compose(
	changes: TaggedChange<TestChangeset>[],
	revInfos?: RevisionInfo[] | RevisionMetadataSource,
	childComposer?: (
		change1: TestChange | undefined,
		change2: TestChange | undefined,
	) => TestChange,
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
		(child1, child2) => {
			assert(
				child1 === undefined || child2 === undefined,
				"Should only have one child to compose",
			);
			return child1 ?? child2 ?? fail("One of the children should be defined");
		},
		revInfos,
	);
}

function composeI<T>(
	changes: TaggedChange<SF.Changeset<T>>[],
	composer: (change1: T | undefined, change2: T | undefined) => T,
	revInfos?: RevisionInfo[] | RevisionMetadataSource,
): SF.Changeset<T> {
	const updatedChanges = changes.map(({ change, revision, rollbackOf }) => ({
		change: purgeUnusedCellOrderingInfo(change),
		revision,
		rollbackOf,
	}));
	const idAllocator = continuingAllocator(updatedChanges);
	const metadata =
		revInfos !== undefined
			? Array.isArray(revInfos)
				? revisionMetadataSourceFromInfo(revInfos)
				: revInfos
			: defaultRevisionMetadataFromChanges(updatedChanges);

	let composed: SF.Changeset<T> = [];
	for (const change of updatedChanges) {
		composed = composePair(makeAnonChange(composed), change, composer, metadata, idAllocator);
	}

	return composed;
}

function composePair<T>(
	change1: TaggedChange<SF.Changeset<T>>,
	change2: TaggedChange<SF.Changeset<T>>,
	composer: (change1: T | undefined, change2: T | undefined) => T,
	metadata: RevisionMetadataSource,
	idAllocator: IdAllocator,
): SF.Changeset<T> {
	const moveEffects = SF.newCrossFieldTable();
	let composed = SF.compose(change1, change2, composer, idAllocator, moveEffects, metadata);

	if (moveEffects.isInvalidated) {
		resetCrossFieldTable(moveEffects);
		composed = SF.compose(change1, change2, composer, idAllocator, moveEffects, metadata);
	}
	return composed;
}

export interface RebaseConfig {
	readonly metadata?: RebaseRevisionMetadata;
	readonly childRebaser?: (
		child: TestChange | undefined,
		base: TestChange | undefined,
	) => TestChange | undefined;
}

export function rebase(
	change: TestChangeset,
	base: TaggedChange<TestChangeset>,
	config: RebaseConfig = {},
): TestChangeset {
	const cleanChange = purgeUnusedCellOrderingInfo(change);
	const cleanBase = { ...base, change: purgeUnusedCellOrderingInfo(base.change) };
	deepFreeze(cleanChange);
	deepFreeze(cleanBase);

	const metadata =
		config.metadata ??
		rebaseRevisionMetadataFromInfo(
			defaultRevInfosFromChanges([cleanBase, makeAnonChange(cleanChange)]),
			[cleanBase.revision],
		);

	const childRebaser = config.childRebaser ?? TestChange.rebase;

	const moveEffects = SF.newCrossFieldTable();
	const idAllocator = idAllocatorFromMaxId(getMaxId(cleanChange, cleanBase.change));
	let rebasedChange = SF.rebase(
		cleanChange,
		cleanBase,
		childRebaser,
		idAllocator,
		moveEffects,
		metadata,
	);
	if (moveEffects.isInvalidated) {
		moveEffects.reset();
		rebasedChange = SF.rebase(
			cleanChange,
			cleanBase,
			childRebaser,
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
			rebase(currChange.change, base, {
				metadata: rebaseRevisionMetadataFromInfo(revisionInfo, [base.revision]),
			}),
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
	return rebase(change, makeAnonChange(base), { metadata });
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
		true,
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
			true,
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
				delete detach.idOverride.id.lineage;
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

/**
 * Keeps track of the different ways detached nodes may be referred to.
 * Allows updating changesets so they refer to a detached node by the details
 * of the last detach that affected them.
 *
 * WARNING: this code consumes O(N) space and time for marks that affect N nodes.
 * This is code is currently meant for usage in tests.
 * It should be tested and made more efficient before production use.
 */
export class DetachedNodeTracker {
	// Maps the index for a node to its last characterization as a reattached node.
	private nodes: Map<number, CellId> = new Map();
	private readonly equivalences: { old: CellId; new: CellId }[] = [];

	public constructor() {}

	/**
	 * Updates the internals of this instance to account for `change` having been applied.
	 * @param change - The change that is being applied. Not mutated.
	 * Must be applicable (i.e., `isApplicable(change)` must be true).
	 */
	public apply(change: TaggedChange<Changeset<unknown>>): void {
		let index = 0;
		for (const mark of change.change) {
			const inputLength: number = getInputLength(mark);
			if (markEmptiesCells(mark)) {
				assert(isDetach(mark), 0x70d /* Only detach marks should empty cells */);
				const newNodes: Map<number, CellId> = new Map();
				const after = index + inputLength;
				for (const [k, v] of this.nodes) {
					if (k >= index) {
						if (k >= after) {
							newNodes.set(k - inputLength, v);
						} else {
							// The node is removed
							this.equivalences.push({
								old: v,
								new: {
									revision:
										change.rollbackOf ??
										mark.revision ??
										change.revision ??
										fail("Unable to track detached nodes"),
									localId: brand((mark.id as number) + (k - index)),
								},
							});
						}
					} else {
						newNodes.set(k, v);
					}
				}
				this.nodes = newNodes;
			}
			index += inputLength;
		}
		index = 0;
		for (const mark of change.change) {
			const inputLength: number = getInputLength(mark);
			if (isActiveReattach(mark)) {
				const newNodes: Map<number, CellId> = new Map();
				for (const [k, v] of this.nodes) {
					if (k >= index) {
						newNodes.set(k + inputLength, v);
					} else {
						newNodes.set(k, v);
					}
				}
				const detachEvent = mark.cellId ?? fail("Unable to track detached nodes");
				for (let i = 0; i < mark.count; ++i) {
					newNodes.set(index + i, {
						revision: detachEvent.revision,
						localId: brand((detachEvent.localId as number) + i),
					});
				}
				this.nodes = newNodes;
			}
			if (!markEmptiesCells(mark)) {
				index += inputLength;
			}
		}
	}

	/**
	 * Checks whether the given `change` is applicable based on previous changes.
	 * @param change - The change to verify the applicability of. Not mutated.
	 * @returns false iff `change`'s description of detached nodes is inconsistent with that of changes applied
	 * earlier. Returns true otherwise.
	 */
	public isApplicable(change: Changeset<unknown>): boolean {
		for (const mark of change) {
			if (isActiveReattach(mark)) {
				const detachEvent = mark.cellId ?? fail("Unable to track detached nodes");
				const revision = detachEvent.revision;
				for (let i = 0; i < mark.count; ++i) {
					const localId = brand<ChangesetLocalId>((detachEvent.localId as number) + i);
					const original: CellId = { revision, localId };
					const updated = this.getUpdatedDetach(original);
					for (const detached of this.nodes.values()) {
						if (
							updated.revision === detached.revision &&
							updated.localId === detached.localId
						) {
							// The new change is attempting to reattach nodes in a location that has already been
							// filled by a prior reattach.
							return false;
						}
					}
				}
			}
		}
		return true;
	}

	/**
	 * Creates an updated representation of the given `change` so that it refers to detached nodes using the revision
	 * that last detached them.
	 * @param change - The change to update. Not mutated.
	 * Must be applicable (i.e., `isApplicable(change)` must be true).
	 * @param genId - An ID allocator that produces ID unique within this changeset.
	 * @returns A change equivalent to `change` that refers to detached nodes using the revision that last detached
	 * them. May reuse parts of the input `change` structure.
	 */
	public update<T>(change: TaggedChange<Changeset<T>>): TaggedChange<Changeset<T>> {
		const factory = new MarkListFactory<T>();
		for (const mark of change.change) {
			const cloned = cloneMark(mark);
			if (areInputCellsEmpty(cloned) && !isNewAttach(cloned)) {
				let remainder = cloned;
				while (remainder.count > 1) {
					const [head, tail] = splitMark(remainder, 1);
					this.updateMark(head);
					factory.push(head);
					remainder = tail;
				}
				this.updateMark(remainder);
				factory.push(remainder);
			} else {
				factory.push(cloned);
			}
		}

		return {
			...change,
			change: factory.list,
		};
	}

	private updateMark(mark: HasMarkFields & DetachedCellMark): void {
		const detachEvent = mark.cellId;
		const original = { revision: detachEvent.revision, localId: detachEvent.localId };
		const updated = this.getUpdatedDetach(original);
		if (updated.revision !== original.revision || updated.localId !== original.localId) {
			mark.cellId = { ...updated };
		}
	}

	private getUpdatedDetach(detach: CellId): CellId {
		let curr = detach;
		for (const eq of this.equivalences) {
			if (curr.revision === eq.old.revision && curr.localId === eq.old.localId) {
				curr = eq.new;
			}
		}
		return curr;
	}
}

/**
 * Checks whether `branch` changeset is consistent with a `target` changeset that is may be rebased over.
 *
 * WARNING: this code consumes O(N) space and time for marks that affect N nodes.
 * This is code is currently meant for usage in tests.
 * It should be tested and made more efficient before production use.
 *
 * @param branch - The changeset that would be rebased over `target`.
 * @param target - The changeset that `branch` would be rebased over.
 * @returns false iff `branch`'s description of detached nodes is inconsistent with that of `target`.
 * Returns true otherwise.
 */
export function areRebasable(branch: Changeset<unknown>, target: Changeset<unknown>): boolean {
	const indexToReattach: Map<number, string[]> = new Map();
	const reattachToIndex: Map<string, number> = new Map();
	let index = 0;
	for (const mark of branch) {
		if (isActiveReattach(mark)) {
			const list = getOrAddEmptyToMap(indexToReattach, index);
			for (let i = 0; i < mark.count; ++i) {
				const detachEvent = mark.cellId ?? fail("Unable to track detached nodes");
				const entry: CellId = {
					...detachEvent,
					localId: brand((detachEvent.localId as number) + i),
				};
				const key = `${entry.revision}|${entry.localId}`;
				assert(
					!reattachToIndex.has(key),
					0x506 /* First changeset as inconsistent characterization of detached nodes */,
				);
				list.push(key);
				reattachToIndex.set(key, index);
			}
		}
		index += getInputLength(mark);
	}
	index = 0;
	let listIndex = 0;
	for (const mark of target) {
		if (isActiveReattach(mark)) {
			const list = getOrAddEmptyToMap(indexToReattach, index);
			for (let i = 0; i < mark.count; ++i) {
				const detachEvent = mark.cellId ?? fail("Unable to track detached nodes");
				const entry: CellId = {
					...detachEvent,
					localId: brand((detachEvent.localId as number) + i),
				};
				const key = `${entry.revision}|${entry.localId}`;
				const indexInA = reattachToIndex.get(key);
				if (indexInA !== undefined && indexInA !== index) {
					// change b tries to reattach the same content as change a but in a different location
					return false;
				}
				if (list.includes(key)) {
					while (list[listIndex] !== undefined && list[listIndex] !== key) {
						++listIndex;
					}
					if (list.slice(0, listIndex).includes(key)) {
						// change b tries to reattach the same content as change a but in a different order
						return false;
					}
				}
			}
		}
		const inputLength = getInputLength(mark);
		if (inputLength > 0) {
			listIndex = 0;
		}
		index += inputLength;
	}
	return true;
}

/**
 * Checks whether sequential changesets are consistent.
 *
 * WARNING: this code consumes O(N) space and time for marks that affect N nodes.
 * This is code is currently meant for usage in tests.
 * It should be tested and made more efficient before production use.
 *
 * @param changes - The changesets that would be composed together.
 * @returns false iff the changesets in `changes` are inconsistent/incompatible in their description of detached nodes.
 * Returns true otherwise.
 */
export function areComposable(changes: TaggedChange<Changeset<unknown>>[]): boolean {
	const tracker = new DetachedNodeTracker();
	for (const change of changes) {
		if (!tracker.isApplicable(change.change)) {
			return false;
		}
		tracker.apply(change);
	}
	return true;
}
