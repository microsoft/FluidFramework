/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { makeAnonChange, RevisionTag, tagChange, TaggedChange } from "../../core";
import { fail } from "../../util";
import {
	CrossFieldManager,
	CrossFieldTarget,
	IdAllocator,
	RevisionMetadataSource,
} from "../modular-schema";
import {
	Changeset,
	HasChanges,
	HasRevisionTag,
	Mark,
	MarkList,
	InputSpanningMark,
	ObjectMark,
	Reattach,
	Skip,
} from "./format";
import { GapTracker, IndexTracker } from "./tracker";
import { MarkListFactory } from "./markListFactory";
import { MarkQueue } from "./markQueue";
import { getMoveEffect, getOrAddEffect, MoveEffectTable } from "./moveEffectTable";
import {
	getInputLength,
	getOutputLength,
	isAttach,
	isDetachMark,
	isReattach,
	isSkipMark,
	isActiveReattach,
	isConflicted,
	isConflictedDetach,
	isConflictedReattach,
	dequeueRelatedReattaches,
	isBlockedReattach,
	getOffsetAtRevision,
	isObjMark,
	cloneMark,
	isDeleteMark,
	isModify,
} from "./utils";

/**
 * @alpha
 */
export type NodeChangeComposer<TNodeChange> = (changes: TaggedChange<TNodeChange>[]) => TNodeChange;

/**
 * Composes a sequence of changesets into a single changeset.
 * @param changes - The changesets to be applied.
 * Parts of the input may be reused in the output, but the input is not mutated.
 * Each changeset in the list is assumed to be applicable after the previous one.
 * @returns A changeset that is equivalent to applying each of the given `changes` in order.
 *
 * WARNING! This implementation is incomplete:
 * - Tombstone information is ignored.
 * - Support for moves is not implemented.
 * - Support for slices is not implemented.
 */
export function compose<TNodeChange>(
	changes: TaggedChange<Changeset<TNodeChange>>[],
	composeChild: NodeChangeComposer<TNodeChange>,
	genId: IdAllocator,
	manager: CrossFieldManager,
	revisionMetadata: RevisionMetadataSource,
): Changeset<TNodeChange> {
	let composed: Changeset<TNodeChange> = [];
	for (const change of changes) {
		composed = composeMarkLists(
			composed,
			change.revision,
			change.change,
			composeChild,
			genId,
			manager as MoveEffectTable<TNodeChange>,
			revisionMetadata,
		);
	}
	return composed;
}

function composeMarkLists<TNodeChange>(
	baseMarkList: MarkList<TNodeChange>,
	newRev: RevisionTag | undefined,
	newMarkList: MarkList<TNodeChange>,
	composeChild: NodeChangeComposer<TNodeChange>,
	genId: IdAllocator,
	moveEffects: MoveEffectTable<TNodeChange>,
	revisionMetadata: RevisionMetadataSource,
): MarkList<TNodeChange> {
	const factory = new MarkListFactory<TNodeChange>(undefined, moveEffects);
	const queue = new ComposeQueue(
		undefined,
		baseMarkList,
		newRev,
		newMarkList,
		genId,
		moveEffects,
		revisionMetadata,
		(a, b) => composeChildChanges(a, b, newRev, composeChild),
	);
	while (!queue.isEmpty()) {
		const popped = queue.pop();
		if (popped.areInverses === true) {
			factory.pushOffset(getInputLength(popped.baseMark));
			continue;
		}
		const { baseMark, newMark } = popped;
		if (newMark === undefined) {
			assert(
				baseMark !== undefined,
				0x4db /* Non-empty queue should not return two undefined marks */,
			);
			factory.push(baseMark);
		} else if (baseMark === undefined) {
			factory.push(composeMark(newMark, newRev, composeChild));
		} else {
			// Past this point, we are guaranteed that `newMark` and `baseMark` have the same length and
			// start at the same location in the revision after the base changes.
			// They therefore refer to the same range for that revision.
			assert(
				!isAttach(newMark) || isConflictedReattach(newMark),
				0x4dc /* A new attach cannot be at the same position as a base mark */,
			);
			const composedMark = composeMarks(
				baseMark,
				newRev,
				newMark,
				composeChild,
				genId,
				moveEffects,
				revisionMetadata,
			);
			factory.push(composedMark);
		}
	}

	return amendComposeI(factory.list, composeChild, moveEffects);
}

/**
 * Composes two marks where `newMark` is based on the state produced by `baseMark`.
 * @param baseMark - The mark to compose with `newMark`.
 * Its output range should be the same as `newMark`'s input range.
 * @param newRev - The revision the new mark is part of.
 * @param newMark - The mark to compose with `baseMark`.
 * Its input range should be the same as `baseMark`'s output range.
 * @returns A mark that is equivalent to applying both `baseMark` and `newMark` successively.
 */
function composeMarks<TNodeChange>(
	baseMark: Mark<TNodeChange>,
	newRev: RevisionTag | undefined,
	newMark: InputSpanningMark<TNodeChange>,
	composeChild: NodeChangeComposer<TNodeChange>,
	genId: IdAllocator,
	moveEffects: MoveEffectTable<TNodeChange>,
	revisionMetadata: RevisionMetadataSource,
): Mark<TNodeChange> {
	if (isSkipMark(baseMark)) {
		return composeMark(newMark, newRev, composeChild);
	}
	if (isSkipMark(newMark)) {
		return baseMark;
	}

	const baseType = baseMark.type;
	const newType = newMark.type;
	if (
		(newType === "Delete" && newMark.changes !== undefined) ||
		(baseType === "Delete" && baseMark.changes !== undefined)
	) {
		// This should not occur yet because we discard all modifications to deleted subtrees
		// In the long run we want to preserve them.
		fail("TODO: support modifications to deleted subtree");
	}

	const newMarkRevision = isModify(newMark) ? newRev : newMark.revision ?? newRev;
	const newIntention = getIntention(newMarkRevision, revisionMetadata);
	const baseMarkRevision = isModify(baseMark) ? undefined : baseMark.revision;
	const baseIntention = getIntention(baseMarkRevision, revisionMetadata);

	switch (baseType) {
		case "Insert":
		case "Revive":
			switch (newType) {
				case "Modify": {
					return mergeInNewChildChanges(baseMark, newMark.changes, newRev, composeChild);
				}
				case "Delete": {
					// The insertion made by the base change is subsequently deleted.
					// TODO: preserve the insertions as conflicted.
					return 0;
				}
				case "MoveOut":
				case "ReturnFrom":
					// The insert has been moved by `newMark`.
					// We can represent net effect of the two marks as an insert at the move destination.
					getOrAddEffect(
						moveEffects,
						CrossFieldTarget.Destination,
						newMark.revision ?? newRev,
						newMark.id,
						true,
					).mark = mergeInNewChildChanges(
						baseMark,
						newMark.changes,
						newMark.revision ?? newRev,
						composeChild,
					);
					return 0;
				case "Revive": {
					assert(
						!isConflictedReattach(baseMark) && isConflicted(newMark),
						0x4dd /* Invalid mark overlap */,
					);
					return baseMark;
				}
				default:
					fail("Not implemented newType");
			}
		case "Modify": {
			switch (newType) {
				case "Modify": {
					return mergeInNewChildChanges(baseMark, newMark.changes, newRev, composeChild);
				}
				case "Delete": {
					// For now the deletion obliterates all other modifications.
					// In the long run we want to preserve them.
					return composeMark(newMark, newRev, composeChild);
				}
				case "MoveOut":
				case "ReturnFrom": {
					return composeWithBaseChildChanges(
						newMark,
						newRev,
						baseMark.changes,
						composeChild,
					);
				}
				default:
					fail("Not implemented newType");
			}
		}
		case "MoveIn": {
			switch (newType) {
				case "Delete": {
					getOrAddEffect(
						moveEffects,
						CrossFieldTarget.Source,
						baseMark.revision,
						baseMark.id,
						true,
					).mark = composeMark(newMark, newRev, composeChild);
					return 0;
				}
				case "MoveOut": {
					getOrAddEffect(
						moveEffects,
						CrossFieldTarget.Source,
						baseMark.revision,
						baseMark.id,
						true,
					).mark = composeMark(newMark, newRev, composeChild);
					getOrAddEffect(
						moveEffects,
						CrossFieldTarget.Destination,
						newMark.revision ?? newRev,
						newMark.id,
						true,
					);
					return 0;
				}
				case "ReturnFrom": {
					if (newMark.detachedBy === baseIntention) {
						getOrAddEffect(
							moveEffects,
							CrossFieldTarget.Source,
							baseMark.revision,
							baseMark.id,
							true,
						).shouldRemove = true;
						getOrAddEffect(
							moveEffects,
							CrossFieldTarget.Destination,
							newMark.revision ?? newRev,
							newMark.id,
							true,
						).shouldRemove = true;
						return 0;
					} else {
						getOrAddEffect(
							moveEffects,
							CrossFieldTarget.Source,
							baseMark.revision,
							baseMark.id,
							true,
						).mark = composeMark(newMark, newRev, composeChild);
						getOrAddEffect(
							moveEffects,
							CrossFieldTarget.Destination,
							newMark.revision ?? newRev,
							newMark.id,
							true,
						);
						return 0;
					}
				}
				default:
					fail("Not implemented newType");
			}
		}
		case "ReturnTo": {
			switch (newType) {
				case "Modify": {
					getOrAddEffect(
						moveEffects,
						CrossFieldTarget.Source,
						baseMark.revision,
						baseMark.id,
						true,
					).modifyAfter = newMark.changes;
					return baseMark;
				}
				case "Delete": {
					getOrAddEffect(
						moveEffects,
						CrossFieldTarget.Source,
						baseMark.revision,
						baseMark.id,
						true,
					).mark = composeMark(newMark, newRev, composeChild);
					return 0;
				}
				case "MoveOut": {
					if (baseMark.detachedBy === newIntention) {
						getOrAddEffect(
							moveEffects,
							CrossFieldTarget.Source,
							baseMark.revision,
							baseMark.id,
							true,
						).shouldRemove = true;
						getOrAddEffect(
							moveEffects,
							CrossFieldTarget.Destination,
							newMark.revision ?? newRev,
							newMark.id,
							true,
						).shouldRemove = true;
						return 0;
					} else {
						getOrAddEffect(
							moveEffects,
							CrossFieldTarget.Source,
							baseMark.revision,
							baseMark.id,
							true,
						).mark = composeMark(newMark, newRev, composeChild);
						getOrAddEffect(
							moveEffects,
							CrossFieldTarget.Destination,
							newMark.revision ?? newRev,
							newMark.id,
							true,
						);
						return 0;
					}
				}
				case "ReturnFrom": {
					if (
						baseMark.detachedBy === newIntention ||
						newMark.detachedBy === baseIntention
					) {
						getOrAddEffect(
							moveEffects,
							CrossFieldTarget.Source,
							baseMark.revision,
							baseMark.id,
							true,
						).shouldRemove = true;
						getOrAddEffect(
							moveEffects,
							CrossFieldTarget.Destination,
							newMark.revision ?? newRev,
							newMark.id,
							true,
						).shouldRemove = true;
						return 0;
					} else {
						if (newMark.changes !== undefined) {
							getOrAddEffect(
								moveEffects,
								CrossFieldTarget.Source,
								baseMark.revision,
								baseMark.id,
								true,
							).modifyAfter = newMark.changes;
						}
						getOrAddEffect(
							moveEffects,
							CrossFieldTarget.Source,
							baseMark.revision,
							baseMark.id,
							true,
						).mark = composeMark(newMark, newRev, composeChild);
						getOrAddEffect(
							moveEffects,
							CrossFieldTarget.Destination,
							newMark.revision ?? newRev,
							newMark.id,
							true,
						);
						return 0;
					}
				}
				default:
					fail("Not implemented newType");
			}
		}
		default:
			fail("Composing this baseType and this newType is not implemented");
	}
}

function composeChildChanges<TNodeChange>(
	baseChange: TNodeChange | undefined,
	newChange: TNodeChange | undefined,
	newRevision: RevisionTag | undefined,
	composeChild: NodeChangeComposer<TNodeChange>,
): TNodeChange | undefined {
	if (newChange === undefined) {
		return baseChange;
	} else if (baseChange === undefined) {
		return composeChild([tagChange(newChange, newRevision)]);
	} else {
		return composeChild([makeAnonChange(baseChange), tagChange(newChange, newRevision)]);
	}
}

function composeWithBaseChildChanges<
	TNodeChange,
	TMark extends Exclude<InputSpanningMark<TNodeChange>, Skip> &
		ObjectMark<TNodeChange> &
		HasChanges<TNodeChange> &
		HasRevisionTag,
>(
	newMark: TMark,
	newRevision: RevisionTag | undefined,
	baseChanges: TNodeChange | undefined,
	composeChild: NodeChangeComposer<TNodeChange>,
): TMark {
	const composedChanges = composeChildChanges(
		baseChanges,
		newMark.changes,
		newMark.revision ?? newRevision,
		composeChild,
	);

	const cloned = cloneMark(newMark);
	if (newRevision !== undefined && cloned.type !== "Modify") {
		cloned.revision = newRevision;
	}

	if (composedChanges !== undefined) {
		cloned.changes = composedChanges;
	} else {
		delete cloned.changes;
	}

	return cloned;
}

function mergeInNewChildChanges<TNodeChange, TMark extends HasChanges<TNodeChange>>(
	baseMark: TMark,
	newChanges: TNodeChange | undefined,
	newRevision: RevisionTag | undefined,
	composeChild: NodeChangeComposer<TNodeChange>,
): TMark {
	const composedChanges = composeChildChanges(
		baseMark.changes,
		newChanges,
		newRevision,
		composeChild,
	);
	if (composedChanges !== undefined) {
		baseMark.changes = composedChanges;
	} else {
		delete baseMark.changes;
	}
	return baseMark;
}

function composeMark<TNodeChange, TMark extends Mark<TNodeChange>>(
	mark: TMark,
	revision: RevisionTag | undefined,
	composeChild: NodeChangeComposer<TNodeChange>,
): TMark {
	if (isSkipMark(mark)) {
		return mark;
	}

	const cloned = cloneMark(mark);
	assert(!isSkipMark(cloned), 0x4de /* Cloned should be same type as input mark */);
	if (revision !== undefined && cloned.type !== "Modify" && cloned.revision === undefined) {
		cloned.revision = revision;
	}

	if (cloned.type !== "MoveIn" && cloned.type !== "ReturnTo" && cloned.changes !== undefined) {
		cloned.changes = composeChild([tagChange(cloned.changes, revision)]);
		return cloned;
	}

	return cloned;
}

export function amendCompose<TNodeChange>(
	marks: MarkList<TNodeChange>,
	composeChild: NodeChangeComposer<TNodeChange>,
	genId: IdAllocator,
	manager: CrossFieldManager,
): MarkList<TNodeChange> {
	return amendComposeI(marks, composeChild, manager as MoveEffectTable<TNodeChange>);
}

function amendComposeI<TNodeChange>(
	marks: MarkList<TNodeChange>,
	composeChild: NodeChangeComposer<TNodeChange>,
	moveEffects: MoveEffectTable<TNodeChange>,
): MarkList<TNodeChange> {
	const factory = new MarkListFactory<TNodeChange>(undefined, moveEffects);
	const queue = new MarkQueue(
		marks,
		undefined,
		moveEffects,
		true,
		() => fail("Should not generate IDs"),
		// TODO: Should pass in revision for new changes
		(a, b) => composeChildChanges(a, b, undefined, composeChild),
	);

	while (!queue.isEmpty()) {
		let mark = queue.dequeue();
		if (isObjMark(mark)) {
			switch (mark.type) {
				case "MoveOut":
				case "ReturnFrom": {
					const effect = getMoveEffect(
						moveEffects,
						CrossFieldTarget.Source,
						mark.revision,
						mark.id,
					);
					mark = effect.mark ?? mark;
					delete effect.mark;
					break;
				}
				case "MoveIn":
				case "ReturnTo": {
					const effect = getMoveEffect(
						moveEffects,
						CrossFieldTarget.Destination,
						mark.revision,
						mark.id,
					);
					mark = effect.mark ?? mark;
					delete effect.mark;
					break;
				}
				default:
					break;
			}
		}
		factory.push(mark);
	}

	return factory.list;
}

export class ComposeQueue<T> {
	private readonly baseMarks: MarkQueue<T>;
	private readonly newMarks: MarkQueue<T>;
	private readonly baseIndex: IndexTracker;
	private readonly baseGap: GapTracker;
	private readonly cancelledInserts: Set<RevisionTag> = new Set();

	public constructor(
		baseRevision: RevisionTag | undefined,
		baseMarks: Changeset<T>,
		private readonly newRevision: RevisionTag | undefined,
		newMarks: Changeset<T>,
		genId: IdAllocator,
		private readonly moveEffects: MoveEffectTable<T>,
		private readonly revisionMetadata: RevisionMetadataSource,
		composeChanges?: (a: T | undefined, b: T | undefined) => T | undefined,
	) {
		this.baseIndex = new IndexTracker(revisionMetadata.getIndex);
		this.baseGap = new GapTracker(revisionMetadata.getIndex);
		this.baseMarks = new MarkQueue(
			baseMarks,
			baseRevision,
			moveEffects,
			true,
			genId,
			composeChanges,
		);
		this.newMarks = new MarkQueue(
			newMarks,
			newRevision,
			moveEffects,
			true,
			genId,
			composeChanges,
		);

		// Detect all inserts in the new marks that will be cancelled by deletes in the base marks
		const deletes = new Set<RevisionTag>();
		for (const mark of baseMarks) {
			if (isDeleteMark(mark)) {
				const baseIntention = getIntention(mark.revision, revisionMetadata);
				if (baseIntention !== undefined) {
					deletes.add(baseIntention);
				}
			}
		}
		for (const mark of newMarks) {
			if (isObjMark(mark) && mark.type === "Insert") {
				const newRev = mark.revision ?? this.newRevision;
				const newIntention = getIntention(newRev, revisionMetadata);
				if (newIntention !== undefined && deletes.has(newIntention)) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					this.cancelledInserts.add(newRev!);
				}
			}
		}
	}

	public isEmpty(): boolean {
		return this.baseMarks.isEmpty() && this.newMarks.isEmpty();
	}

	public pop(): ComposeMarks<T> {
		const output = this.popImpl();
		if (output.baseMark !== undefined) {
			this.baseIndex.advance(output.baseMark);
			this.baseGap.advance(output.baseMark);
		}
		return output;
	}

	private popImpl(): ComposeMarks<T> {
		let baseMark = this.baseMarks.peek();
		let newMark = this.newMarks.peek();
		if (baseMark === undefined && newMark === undefined) {
			return {};
		} else if (baseMark === undefined) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const length = getInputLength(newMark!);
			return this.dequeueNew(length);
		} else if (newMark === undefined) {
			const length = getOutputLength(baseMark);
			return this.dequeueBase(length);
		} else if (isAttach(newMark)) {
			const newRev = newMark.revision ?? this.newRevision;
			if (
				isDetachMark(baseMark) &&
				areInverseRevisions(
					newRev,
					baseMark.revision ?? this.baseMarks.revision,
					this.revisionMetadata,
				)
			) {
				const baseMarkLength = getInputLength(baseMark);
				const newMarkLength = getOutputLength(newMark);
				// There is some change foo that is being cancelled out as part of a rebase sandwich.
				// The marks that make up this change (and its inverse) may be broken up differently between the base
				// changeset and the new changeset because either changeset may have been composed with other changes
				// whose marks may now be interleaved with the marks that represent foo/its inverse.
				// This means that the base and new marks may not be of the same length.
				// We do however know that the all of the marks for foo will appear in the base changeset and all of the
				// marks for the inverse of foo will appear in the new changeset, so we can be confident that whenever
				// we encounter such pairs of marks, they do line up such that they describe changes to the same first
				// cell. This means we can safely treat them as inverses of one another.
				if (newMarkLength < baseMarkLength) {
					baseMark = this.baseMarks.dequeueInput(newMarkLength);
					newMark = this.newMarks.dequeue();
				} else if (newMarkLength > baseMarkLength) {
					baseMark = this.baseMarks.dequeue();
					newMark = this.newMarks.dequeueOutput(baseMarkLength, true);
				} else {
					baseMark = this.baseMarks.dequeue();
					newMark = this.newMarks.dequeue();
				}
				return {
					baseMark,
					newMark,
					areInverses: true,
				};
			} else if (isActiveReattach(newMark) && isDetachMark(baseMark)) {
				const baseRev = baseMark.revision ?? this.baseMarks.revision;
				assert(
					baseRev !== undefined,
					0x4df /* Compose base mark should carry revision info */,
				);
				const areInverses =
					// The two changesets are inverses in a rebase sandwich
					areInverseRevisions(newRev, baseRev, this.revisionMetadata) ||
					// The new mark is an undo of the base one
					newMark.detachedBy === baseRev;
				if (areInverses) {
					const baseMarkLength = getInputLength(baseMark);
					const newMarkLength = getOutputLength(newMark);
					const baseIndex = this.baseIndex.getIndex(baseRev);
					if (baseIndex === newMark.detachIndex) {
						if (newMarkLength < baseMarkLength) {
							baseMark = this.baseMarks.dequeueInput(newMarkLength);
							newMark = this.newMarks.dequeue();
						} else if (newMarkLength > baseMarkLength) {
							baseMark = this.baseMarks.dequeue();
							newMark = this.newMarks.dequeueOutput(baseMarkLength, true);
						} else {
							baseMark = this.baseMarks.dequeue();
							newMark = this.newMarks.dequeue();
						}
						return {
							baseMark,
							newMark,
							areInverses: true,
						};
					} else if (newMark.detachIndex < baseIndex) {
						return {
							newMark:
								newMark.detachIndex + newMarkLength <= baseIndex
									? this.newMarks.dequeue()
									: this.newMarks.dequeueOutput(
											baseIndex - newMark.detachIndex,
											true,
									  ),
						};
					} else {
						return {
							baseMark:
								baseIndex + baseMarkLength <= newMark.detachIndex
									? this.baseMarks.dequeue()
									: this.baseMarks.dequeueInput(newMark.detachIndex - baseIndex),
						};
					}
				} else {
					const targetOffset = getOffsetAtRevision(newMark.lineage, baseRev);
					if (targetOffset === undefined) {
						// Let baseMark represent the detach of some content X and newMark represent a reattach of some
						// different content Y.
						// The fact that newMark's lineage does not include an entry the detach of X, despite being in the
						// gap where that detach is taking place, means that the detach of Y must have occurred
						// chronologically after the detach of content X by baseMark.
						// Since the set of changes being composed include both the detach for X (in the form of
						// baseMark) and the reattach for Y (in the form of newMark), then we know for sure that the
						// set of changes being composed must also include the detach for content Y that must have
						// occurred (chronologically) between them.
						// We also know that, during this iteration of compose, the detach for content Y will show up
						// in the base changeset because we're in the process of merging in its inverse.
						// If we had already encountered this base detach of content Y then we would have cancelled it
						// out with (or ordered it with respect to) newMark.
						// This later detach must therefore be present in the base changeset, and further to the right.
						// We'll keep returning all the base marks before that.
						return this.dequeueBase();
					} else {
						// The reattach is for a detach that occurred chronologically before the baseMark detach.
						// We rely on the lineage information to tell us where in relation to baseMark this earlier
						// detach was.
						const currentOffset = this.baseGap.getOffset(baseRev);
						const remainingOffset = targetOffset - currentOffset;
						assert(remainingOffset >= 0, 0x4e0 /* Overshot the target gap */);
						if (remainingOffset === 0) {
							return this.dequeueNew();
						}
						return {
							baseMark:
								remainingOffset < getInputLength(baseMark)
									? this.baseMarks.dequeueInput(remainingOffset)
									: this.baseMarks.dequeue(),
						};
					}
				}
			} else if (
				isReattach(newMark) &&
				isReattach(baseMark) &&
				areRelatedReattaches(baseMark, newMark)
			) {
				return dequeueRelatedReattaches(this.newMarks, this.baseMarks);
			} else if (
				newMark.type === "Insert" &&
				newRev !== undefined &&
				this.cancelledInserts.has(newRev)
			) {
				// We know the new insert is getting cancelled out so we need to delay returning it.
				// The base mark that cancels the insert must appear later in the base marks.
				return { baseMark: this.baseMarks.dequeue() };
			} else if (
				isDeleteMark(baseMark) &&
				baseMark.revision !== undefined &&
				this.revisionMetadata.getInfo(baseMark.revision).rollbackOf !== undefined
			) {
				// The base mark represents an insert being rolled back.
				// That insert was concurrent to and sequenced after the attach performed by newNark so
				// the delete should be ordered as the later insert would have been had the changes applied in
				// sequencing order. This means the delete should come first since right now we only support
				// the merge-left tiebreak policy.
				// TODO: support merge-right tiebreak policy.
				return { baseMark: this.baseMarks.dequeue() };
			}
			return this.dequeueNew();
		} else if (isDetachMark(baseMark) || isBlockedReattach(baseMark)) {
			return this.dequeueBase();
		} else if (isConflictedDetach(newMark)) {
			return this.dequeueNew();
		} else {
			// If we've reached this branch then `baseMark` and `newMark` start at the same location
			// in the document field at the revision after the base changes and before the new changes.
			// Despite that, it's not necessarily true that they affect the same range in that document
			// field because they may be of different lengths.
			// We perform any necessary splitting in order to end up with a pair of marks that do have the same length.
			const newMarkLength = getInputLength(newMark);
			const baseMarkLength = getOutputLength(baseMark);
			if (newMarkLength < baseMarkLength) {
				this.newMarks.dequeue();
				baseMark = this.baseMarks.dequeueOutput(newMarkLength);
			} else if (newMarkLength > baseMarkLength) {
				this.baseMarks.dequeue();
				newMark = this.newMarks.dequeueInput(baseMarkLength);
			} else {
				this.baseMarks.dequeue();
				this.newMarks.dequeue();
			}
			// Past this point, we are guaranteed that `newMark` and `baseMark` have the same length and
			// start at the same location in the revision after the base changes.
			// They therefore refer to the same range for that revision.
			return { baseMark, newMark };
		}
	}

	private dequeueBase(length: number = 0): ComposeMarks<T> {
		const baseMark = this.baseMarks.dequeue();

		if (baseMark !== undefined && isObjMark(baseMark)) {
			switch (baseMark.type) {
				case "MoveOut":
				case "ReturnFrom":
					{
						const effect = getMoveEffect(
							this.moveEffects,
							CrossFieldTarget.Source,
							baseMark.revision,
							baseMark.id,
						);

						const newMark = effect.mark;
						delete effect.mark;
						if (newMark !== undefined) {
							return { newMark };
						}
					}
					break;
				default:
					break;
			}
		}

		return { baseMark, newMark: length > 0 ? length : undefined };
	}

	private dequeueNew(length: number = 0): ComposeMarks<T> {
		const newMark = this.newMarks.dequeue();

		if (newMark !== undefined && isObjMark(newMark)) {
			switch (newMark.type) {
				case "MoveIn":
				case "ReturnTo":
					{
						const effect = getMoveEffect(
							this.moveEffects,
							CrossFieldTarget.Destination,
							newMark.revision ?? this.newRevision,
							newMark.id,
						);

						const baseMark = effect.mark;
						delete effect.mark;
						if (baseMark !== undefined) {
							return { baseMark };
						}
					}
					break;
				default:
					break;
			}
		}

		return {
			baseMark: length > 0 ? length : undefined,
			newMark,
		};
	}
}

type ComposeMarks<T> =
	| {
			baseMark: Mark<T>;
			newMark: Mark<T>;
			areInverses: true;
	  }
	| {
			baseMark?: Mark<T>;
			newMark?: Mark<T>;
			areInverses?: false;
	  };

/**
 * @returns true iff both reattaches target cells that were affected by the same detach.
 * The target cells may or may not overlap depending on detach index information.
 *
 * Only valid in the context of a compose (i.e., the output context of `baseMarks` is the input context of `newMark`).
 */
function areRelatedReattaches<T>(baseMark: Reattach<T>, newMark: Reattach<T>): boolean {
	const newEither = newMark.lastDetachedBy ?? newMark.detachedBy;
	const baseEither = baseMark.lastDetachedBy ?? baseMark.detachedBy;
	return newEither === baseEither;
}

function getIntention(
	rev: RevisionTag | undefined,
	revisionMetadata: RevisionMetadataSource,
): RevisionTag | undefined {
	return rev === undefined ? undefined : revisionMetadata.getInfo(rev).rollbackOf ?? rev;
}

function areInverseRevisions(
	rev1: RevisionTag | undefined,
	rev2: RevisionTag | undefined,
	revisionMetadata: RevisionMetadataSource,
): boolean {
	if (rev1 === undefined || rev2 === undefined) {
		return false;
	}
	const info1 = revisionMetadata.getInfo(rev1);
	const info2 = revisionMetadata.getInfo(rev2);
	return rev1 === info2.rollbackOf || rev2 === info1.rollbackOf;
}
