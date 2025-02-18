/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "node:assert";

import { assert } from "@fluidframework/core-utils/internal";
import { createAlwaysFinalizedIdCompressor } from "@fluidframework/id-compressor/internal/test-utils";

import {
	type ChangeAtomId,
	type ChangeAtomIdMap,
	type ChangeAtomIdRangeMap,
	type ChangesetLocalId,
	type DeltaFieldChanges,
	type RevisionInfo,
	type RevisionMetadataSource,
	type RevisionTag,
	type TaggedChange,
	makeAnonChange,
	mapTaggedChange,
	newChangeAtomIdRangeMap,
	revisionMetadataSourceFromInfo,
	tagChange,
	tagRollbackInverse,
} from "../../../core/index.js";
import { SequenceField as SF } from "../../../feature-libraries/index.js";
import {
	CrossFieldTarget,
	setInCrossFieldMap,
	type InvertNodeManager,
	type NodeId,
	type RebaseRevisionMetadata,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";
// eslint-disable-next-line import/no-internal-modules
import { rebaseRevisionMetadataFromInfo } from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
// eslint-disable-next-line import/no-internal-modules
import type { DetachedCellMark } from "../../../feature-libraries/sequence-field/helperTypes.js";
import {
	type CellId,
	type Changeset,
	type HasMarkFields,
	MarkListFactory,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/sequence-field/index.js";
import {
	areInputCellsEmpty,
	cloneMark,
	extractMarkEffect,
	getInputLength,
	isActiveReattach,
	isDetach,
	isNewAttach,
	isTombstone,
	markEmptiesCells,
	omitMarkEffect,
	splitMark,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/sequence-field/utils.js";
import {
	type IdAllocator,
	type Mutable,
	type RangeQueryResult,
	brand,
	fail,
	fakeIdAllocator,
	getOrAddEmptyToMap,
	idAllocatorFromMaxId,
	setInNestedMap,
	tryGetFromNestedMap,
} from "../../../util/index.js";
import {
	assertFieldChangesEqual,
	assertIsSessionId,
	defaultRevInfosFromChanges,
	defaultRevisionMetadataFromChanges,
} from "../../utils.js";

import { ChangesetWrapper } from "../../changesetWrapper.js";
import { TestNodeId } from "../../testNodeId.js";
import { deepFreeze } from "@fluidframework/test-runtime-utils/internal";
import {
	type MarkEffect,
	NoopMarkType,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/sequence-field/types.js";
import type {
	ComposeNodeManager,
	DetachedNodeEntry,
	RebaseNodeManager,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/crossFieldQueries.js";

export function assertWrappedChangesetsEqual(
	actual: WrappedChange,
	expected: WrappedChange,
	ignoreMoveIds: boolean = false,
): void {
	ChangesetWrapper.assertEqual(actual, expected, (lhs, rhs) =>
		assertChangesetsEqual(lhs, rhs, ignoreMoveIds),
	);
}

export function assertChangesetsEqual(
	actual: SF.Changeset,
	expected: SF.Changeset,
	ignoreMoveIds: boolean = false,
): void {
	if (ignoreMoveIds) {
		const normalizedActual = normalizeMoveIds(actual);
		const normalizedExpected = normalizeMoveIds(expected);
		strict.deepEqual(normalizedActual, normalizedExpected);
	} else {
		strict.deepEqual(actual, expected);
	}
}

function normalizeMoveIds(change: SF.Changeset): SF.Changeset {
	const idAllocator = idAllocatorFromMaxId();
	const revisionAllocator = createAlwaysFinalizedIdCompressor(
		assertIsSessionId("00000000-0000-4000-b000-000000000000"),
	);
	const normalRevision = revisionAllocator.generateCompressedId();

	// We have to keep the normalization of sources and destinations separate because we want to be able to normalize
	// [{ MoveOut self: foo }, { MoveOut self: foo }]
	// in a way that is equivalent to normalizing
	// [{ MoveOut self: foo, finalEndpoint: bar }, { MoveOut self: bar, finalEndpoint: foo }]
	// Doing so requires that we differentiate when a move ID is referring to a source endpoint,
	// from when it is referring to a destination endpoint.
	const normalSrcAtoms: ChangeAtomIdMap<ChangeAtomId> = new Map();
	const normalDstAtoms: ChangeAtomIdMap<ChangeAtomId> = new Map();

	function normalizeAtom(atom: ChangeAtomId, target: CrossFieldTarget): ChangeAtomId {
		const normalAtoms = target === CrossFieldTarget.Source ? normalSrcAtoms : normalDstAtoms;
		const normal = tryGetFromNestedMap(normalAtoms, atom.revision, atom.localId);
		if (normal === undefined) {
			const newId: ChangesetLocalId = brand(idAllocator.allocate());
			const newAtom: ChangeAtomId = { revision: normalRevision, localId: newId };
			setInNestedMap(normalAtoms, atom.revision, atom.localId, newAtom);
			return newAtom;
		}
		return normal;
	}

	function normalizeMark(mark: SF.Mark): SF.Mark {
		const effect = extractMarkEffect(mark);
		const nonEffect = omitMarkEffect(mark);
		return {
			...nonEffect,
			...normalizeEffect(effect),
		};
	}

	function normalizeEffect<TEffect extends MarkEffect>(effect: TEffect): TEffect {
		switch (effect.type) {
			case "Rename":
			case NoopMarkType:
				return effect;
			case "Insert": {
				const atom = normalizeAtom(
					{ revision: effect.revision, localId: effect.id },
					CrossFieldTarget.Source,
				);
				return {
					...effect,
					id: atom.localId,
					revision: atom.revision,
				};
			}
			case "Remove": {
				const effectId = { revision: effect.revision, localId: effect.id };
				const atom = normalizeAtom(effectId, CrossFieldTarget.Destination);
				const normalized: Mutable<SF.Remove> = { ...effect };
				if (normalized.idOverride === undefined) {
					// Use the idOverride so we don't normalize the output cell ID
					normalized.idOverride = effectId;
				}
				normalized.id = atom.localId;
				normalized.revision = atom.revision;
				return normalized as TEffect;
			}
			default:
				fail(`Unexpected mark type: ${(effect as SF.Mark).type}`);
		}
	}
	const output = new MarkListFactory();

	for (const mark of change) {
		let nextMark: SF.Mark | undefined = mark;
		while (nextMark !== undefined) {
			let currMark: SF.Mark = nextMark;
			nextMark = undefined;
			if (currMark.count > 1) {
				[currMark, nextMark] = splitMark(currMark, 1);
			}
			output.push(normalizeMark(currMark));
		}
	}
	return output.list;
}

export function composeDeep(
	changes: TaggedChange<WrappedChange>[],
	revisionMetadata?: RevisionMetadataSource,
): WrappedChange {
	const metadata = revisionMetadata ?? defaultRevisionMetadataFromChanges(changes);

	return changes.length === 0
		? ChangesetWrapper.create([])
		: changes.reduce((change1, change2) =>
				makeAnonChange(
					ChangesetWrapper.compose(change1, change2, (c1, c2, composeChild) =>
						composePair(c1.change, c2.change, composeChild, metadata, idAllocatorFromMaxId()),
					),
				),
			).change;
}

export function composeNoVerify(
	changes: TaggedChange<SF.Changeset>[],
	revInfos?: RevisionInfo[],
): SF.Changeset {
	return composeI(changes, (id1, id2) => TestNodeId.composeChild(id1, id2, false), revInfos);
}

export function composeShallow(changes: TaggedChange<SF.Changeset>[]): SF.Changeset {
	return composeI(
		changes,
		(id1, id2) => id1 ?? id2 ?? fail("Should not compose two undefined IDs"),
	);
}

export function compose(
	changes: TaggedChange<SF.Changeset>[],
	revInfos?: RevisionInfo[] | RevisionMetadataSource,
	childComposer?: (change1: NodeId | undefined, change2: NodeId | undefined) => NodeId,
): SF.Changeset {
	return composeI(changes, childComposer ?? TestNodeId.composeChild, revInfos);
}

export function pruneDeep(change: WrappedChange): WrappedChange {
	return ChangesetWrapper.prune(change, (c, childPruner) => prune(c, childPruner));
}

export function prune(
	change: SF.Changeset,
	childPruner?: (child: NodeId) => NodeId | undefined,
): SF.Changeset {
	return SF.sequenceFieldChangeRebaser.prune(
		change,
		childPruner ?? ((child: NodeId) => child),
	);
}

export function shallowCompose(
	changes: TaggedChange<SF.Changeset>[],
	revInfos?: RevisionInfo[],
): SF.Changeset {
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

function composeI(
	taggedChanges: TaggedChange<SF.Changeset>[],
	composer: (change1: NodeId | undefined, change2: NodeId | undefined) => NodeId,
	revInfos?: RevisionInfo[] | RevisionMetadataSource,
): SF.Changeset {
	const changes = taggedChanges.map(({ change }) => change);
	const idAllocator = continuingAllocator(changes);
	const metadata =
		revInfos !== undefined
			? Array.isArray(revInfos)
				? revisionMetadataSourceFromInfo(revInfos)
				: revInfos
			: defaultRevisionMetadataFromChanges(taggedChanges);

	let composed: SF.Changeset = [];
	for (const change of changes) {
		composed = composePair(composed, change, composer, metadata, idAllocator);
	}

	return composed;
}

function composePair(
	change1: SF.Changeset,
	change2: SF.Changeset,
	composer: (change1: NodeId | undefined, change2: NodeId | undefined) => NodeId,
	metadata: RevisionMetadataSource,
	idAllocator: IdAllocator,
): SF.Changeset {
	const moveEffects = newComposeManager();
	let composed = SF.compose(change1, change2, composer, idAllocator, moveEffects, metadata);

	if (moveEffects.isInvalidated) {
		composed = SF.compose(change1, change2, composer, idAllocator, moveEffects, metadata);
	}
	return composed;
}

export interface RebaseConfig {
	readonly metadata?: RebaseRevisionMetadata;
	readonly childRebaser?: (
		child: NodeId | undefined,
		base: NodeId | undefined,
	) => NodeId | undefined;
}

export function rebase(
	change: TaggedChange<SF.Changeset>,
	base: TaggedChange<SF.Changeset>,
	config: RebaseConfig = {},
): SF.Changeset {
	deepFreeze(change);
	deepFreeze(base);

	const metadata =
		config.metadata ??
		rebaseRevisionMetadataFromInfo(
			defaultRevInfosFromChanges([base, change]),
			change.revision,
			[base.revision],
		);

	const childRebaser = config.childRebaser ?? TestNodeId.rebaseChild;

	const moveEffects = newRebaseManager();
	const idAllocator = idAllocatorFromMaxId(getMaxId(change.change, base.change));
	let rebasedChange = SF.rebase(
		change.change,
		base.change,
		childRebaser,
		idAllocator,
		moveEffects,
		metadata,
	);
	if (moveEffects.isInvalidated) {
		rebasedChange = SF.rebase(
			change.change,
			base.change,
			childRebaser,
			idAllocator,
			moveEffects,
			metadata,
		);
	}
	return rebasedChange;
}

export function rebaseTagged(
	change: TaggedChange<SF.Changeset>,
	baseChange: TaggedChange<SF.Changeset>,
): TaggedChange<SF.Changeset> {
	return rebaseOverChanges(change, [baseChange]);
}

export function rebaseOverChanges(
	change: TaggedChange<SF.Changeset>,
	baseChanges: TaggedChange<SF.Changeset>[],
	revInfos?: RevisionInfo[],
): TaggedChange<SF.Changeset> {
	let currChange = change;
	const revisionInfo = revInfos ?? defaultRevInfosFromChanges([...baseChanges, change]);
	for (const base of baseChanges) {
		currChange = tagChange(
			rebase(currChange, base, {
				metadata: rebaseRevisionMetadataFromInfo(revisionInfo, change.revision, [
					base.revision,
				]),
			}),
			currChange.revision,
		);
	}

	return currChange;
}

export function rebaseOverComposition(
	change: SF.Changeset,
	base: SF.Changeset,
	metadata: RebaseRevisionMetadata,
): SF.Changeset {
	return rebase(makeAnonChange(change), makeAnonChange(base), { metadata });
}

export type WrappedChange = ChangesetWrapper<SF.Changeset>;

export function rebaseDeepTagged(
	change: TaggedChange<WrappedChange>,
	base: TaggedChange<WrappedChange>,
	metadata?: RebaseRevisionMetadata,
): TaggedChange<WrappedChange> {
	return mapTaggedChange(
		change,
		ChangesetWrapper.rebase(change, base, (c, b, childRebaser) =>
			rebase(c, b, { childRebaser, metadata }),
		),
	);
}

export function invertDeep(
	change: TaggedChange<WrappedChange>,
	revision: RevisionTag | undefined,
): WrappedChange {
	return ChangesetWrapper.invert(change, (c) => invert(c, revision), revision);
}

export function invert(
	change: TaggedChange<SF.Changeset>,
	revision: RevisionTag | undefined,
	isRollback = true,
): SF.Changeset {
	deepFreeze(change.change);
	const table = newInvertManager();
	let inverted = SF.invert(
		change.change,
		isRollback,
		// Sequence fields should not generate IDs during invert
		fakeIdAllocator,
		revision,
		table,
	);

	if (table.isInvalidated) {
		inverted = SF.invert(
			change.change,
			isRollback,
			// Sequence fields should not generate IDs during invert
			fakeIdAllocator,
			revision,
			table,
		);
	}

	return inverted;
}

export function checkDeltaEquality(actual: SF.Changeset, expected: SF.Changeset) {
	assertFieldChangesEqual(toDelta(actual), toDelta(expected));
}

export function toDelta(change: SF.Changeset): DeltaFieldChanges {
	deepFreeze(change);
	return SF.sequenceFieldToDelta(change, TestNodeId.deltaFromChild);
}

export function toDeltaWrapped(change: WrappedChange) {
	return ChangesetWrapper.toDelta(change, (c, deltaFromChild) =>
		SF.sequenceFieldToDelta(c, deltaFromChild),
	);
}

export function getMaxId(...changes: SF.Changeset[]): ChangesetLocalId | undefined {
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
	changes: TaggedChange<SF.Changeset>[],
): ChangesetLocalId | undefined {
	return getMaxId(...changes.map((c) => c.change));
}

export function continuingAllocator(changes: SF.Changeset[]): IdAllocator {
	return idAllocatorFromMaxId(getMaxId(...changes));
}

export function withoutTombstonesDeep(changeset: WrappedChange): WrappedChange {
	return { ...changeset, fieldChange: withoutTombstones(changeset.fieldChange) };
}

export function withoutTombstones(changeset: SF.Changeset): SF.Changeset {
	const factory = new SF.MarkListFactory();
	for (const mark of changeset) {
		if (!isTombstone(mark)) {
			factory.push(mark);
		}
	}

	return factory.list;
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
	public apply(change: TaggedChange<Changeset>): void {
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
	public isApplicable(change: Changeset): boolean {
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
	public update(change: TaggedChange<Changeset>): TaggedChange<Changeset> {
		const factory = new MarkListFactory();
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
export function areRebasable(branch: Changeset, target: Changeset): boolean {
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
export function areComposable(changes: TaggedChange<Changeset>[]): boolean {
	const tracker = new DetachedNodeTracker();
	for (const change of changes) {
		if (!tracker.isApplicable(change.change)) {
			return false;
		}
		tracker.apply(change);
	}
	return true;
}

export function tagChangeInline(
	change: Changeset,
	revision: RevisionTag,
	rollbackOf?: RevisionTag,
): TaggedChange<Changeset> {
	const inlined = inlineRevision(change, revision);
	return rollbackOf !== undefined
		? tagRollbackInverse(inlined, revision, rollbackOf)
		: tagChange(inlined, revision);
}

export function inlineRevision(change: Changeset, revision: RevisionTag): Changeset {
	return SF.sequenceFieldChangeRebaser.replaceRevisions(
		change,
		new Set([undefined]),
		revision,
	);
}

function newInvertManager(): TestInvertManager {
	const manager: TestInvertManager = {
		...newTestNodeManager(),

		invertDetach(
			detachId: ChangeAtomId,
			count: number,
			nodeChanges: NodeId | undefined,
		): void {
			this.isInvalidated = true;
		},

		invertAttach(
			attachId: ChangeAtomId,
			count: number,
		): RangeQueryResult<ChangeAtomId, DetachedNodeEntry> {
			throw new Error("Function not implemented.");
		},
	};

	return manager;
}

function newComposeManager(): TestComposeManager {
	const manager: TestComposeManager = {
		...newTestNodeManager(),

		getNewChangesForBaseDetach(
			baseDetachId: ChangeAtomId,
			count: number,
		): RangeQueryResult<ChangeAtomId, NodeId> {
			return this.nodeChangeTable.getFirst(baseDetachId, count);
		},

		composeBaseAttach(
			baseAttachId: ChangeAtomId,
			newDetachId: ChangeAtomId | undefined,
			count: number,
			newChanges: NodeId,
		): void {
			setInCrossFieldMap(this.nodeChangeTable, baseAttachId, count, newChanges);
			this.isInvalidated = true;
		},

		composeDetachAttach(baseDetachId, count): void {},
	};

	return manager;
}

function newRebaseManager(): TestRebaseManager {
	const manager: TestRebaseManager = {
		...newTestNodeManager(),

		getNewChangesForBaseAttach(
			baseAttachId: ChangeAtomId,
			count: number,
		): RangeQueryResult<ChangeAtomId, DetachedNodeEntry> {
			throw new Error("Function not implemented.");
		},

		rebaseOverDetach(
			baseDetachId: ChangeAtomId,
			count: number,
			nodeChange: NodeId | undefined,
			fieldData: unknown,
		): void {
			this.isInvalidated = true;
		},
	};
	return manager;
}

interface TestInvertManager extends InvertNodeManager, TestNodeManager {}

interface TestComposeManager extends ComposeNodeManager, TestNodeManager {}

interface TestRebaseManager extends RebaseNodeManager, TestNodeManager {}

interface TestNodeManager {
	isInvalidated: boolean;
	nodeChangeTable: ChangeAtomIdRangeMap<NodeId>;
}

function newTestNodeManager(): TestNodeManager {
	return { isInvalidated: false, nodeChangeTable: newChangeAtomIdRangeMap() };
}
