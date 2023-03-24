/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { fail } from "../../util";
import { RevisionTag, TaggedChange } from "../../core";
import {
	CrossFieldManager,
	CrossFieldTarget,
	IdAllocator,
	RevisionMetadataSource,
} from "../modular-schema";
import {
	getInputLength,
	getOutputLength,
	isAttach,
	isDetachMark,
	isModify,
	isConflicted,
	isConflictedReattach,
	isReattach,
	isNewAttach,
	isSkipMark,
	isAttachInGap,
	isActiveReattach,
	isObjMark,
	isSkipLikeReattach,
	isConflictedDetach,
	dequeueRelatedReattaches,
	isSkipLikeDetach,
	getOffsetAtRevision,
	cloneMark,
} from "./utils";
import {
	Attach,
	Changeset,
	LineageEvent,
	Mark,
	MarkList,
	Reattach,
	CellSpanningMark,
	CanConflict,
	ReturnFrom,
	Conflicted,
	Detach,
	NewAttach,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import { ComposeQueue } from "./compose";
import {
	getMoveEffect,
	getOrAddEffect,
	MoveEffect,
	MoveEffectTable,
	PairedMarkUpdate,
} from "./moveEffectTable";
import { MarkQueue } from "./markQueue";

/**
 * Rebases `change` over `base` assuming they both apply to the same initial state.
 * @param change - The changeset to rebase.
 * @param base - The changeset to rebase over.
 * @returns A changeset that performs the changes in `change` but does so assuming `base` has been applied first.
 *
 * WARNING! This implementation is incomplete:
 * - Some marks that affect existing content are removed instead of marked as conflicted when rebased over the deletion
 * of that content. This prevents us from then reinstating the mark when rebasing over the revive.
 * - Tombs are not added when rebasing an insert over a gap that is immediately left of deleted content.
 * This prevents us from being able to accurately track the position of the insert.
 * - Tiebreak ordering is not respected.
 * - Support for moves is not implemented.
 * - Support for slices is not implemented.
 */
export function rebase<TNodeChange>(
	change: Changeset<TNodeChange>,
	base: TaggedChange<Changeset<TNodeChange>>,
	rebaseChild: NodeChangeRebaser<TNodeChange>,
	genId: IdAllocator,
	manager: CrossFieldManager,
	revisionMetadata: RevisionMetadataSource,
): Changeset<TNodeChange> {
	const baseInfo =
		base.revision === undefined ? undefined : revisionMetadata.getInfo(base.revision);
	const baseIntention = baseInfo?.rollbackOf ?? base.revision;
	return rebaseMarkList(
		change,
		base.change,
		base.revision,
		baseIntention,
		rebaseChild,
		genId,
		manager as MoveEffectTable<TNodeChange>,
	);
}

export type NodeChangeRebaser<TNodeChange> = (
	change: TNodeChange | undefined,
	baseChange: TNodeChange | undefined,
) => TNodeChange | undefined;

function rebaseMarkList<TNodeChange>(
	currMarkList: MarkList<TNodeChange>,
	baseMarkList: MarkList<TNodeChange>,
	baseRevision: RevisionTag | undefined,
	baseIntention: RevisionTag | undefined,
	rebaseChild: NodeChangeRebaser<TNodeChange>,
	genId: IdAllocator,
	moveEffects: CrossFieldManager<MoveEffect<TNodeChange>>,
): MarkList<TNodeChange> {
	const factory = new MarkListFactory<TNodeChange>(undefined, moveEffects, true);
	const queue = new RebaseQueue(
		baseRevision,
		baseIntention,
		baseMarkList,
		currMarkList,
		genId,
		moveEffects,
	);

	// Each attach mark in `currMarkList` should have a lineage event added for `baseRevision` if a node adjacent to
	// the attach position was detached by `baseMarkList`.
	// At the time we process an attach we don't know whether the following node will be detached, so we record attach
	// marks which should have their lineage updated if we encounter a detach.
	const lineageRequests: LineageRequest<TNodeChange>[] = [];
	let baseDetachOffset = 0;
	// The index of (i.e., number of nodes to the left of) the base mark in the input context of the base change.
	// This assumes the base changeset is not composite (and asserts if it is).
	let baseInputIndex = 0;
	while (!queue.isEmpty()) {
		const { baseMark, newMark: currMark } = queue.pop();
		if (isObjMark(baseMark) && baseMark.type !== "Modify" && baseMark.revision !== undefined) {
			// TODO support rebasing over composite changeset
			assert(
				baseMark.revision === baseRevision,
				0x4f3 /* Unable to keep track of the base input offset in composite changeset */,
			);
		}
		if (baseMark === undefined) {
			assert(
				currMark !== undefined,
				0x4f4 /* Non-empty queue should return at least one mark */,
			);
			if (isAttach(currMark)) {
				handleCurrAttach(
					currMark,
					factory,
					lineageRequests,
					baseDetachOffset,
					baseIntention,
				);
			} else {
				if (baseDetachOffset > 0 && baseIntention !== undefined) {
					updateLineage(lineageRequests, baseIntention);
					baseDetachOffset = 0;
				}
				factory.push(cloneMark(currMark));
			}
		} else if (currMark === undefined) {
			// TODO: Do we need to handle rebasing over baseMark's changes in this case?
			if (isDetachMark(baseMark)) {
				const detachLength = getInputLength(baseMark);
				baseDetachOffset += detachLength;
				baseInputIndex += detachLength;
			} else if (isAttach(baseMark)) {
				if (baseMark.type === "MoveIn" || baseMark.type === "ReturnTo") {
					const effect = getMoveEffect(
						moveEffects,
						CrossFieldTarget.Destination,
						baseMark.revision ?? baseRevision,
						baseMark.id,
					);
					if (effect.movedMark !== undefined) {
						factory.push(effect.movedMark);
						delete effect.movedMark;
					} else {
						factory.pushOffset(getOutputLength(baseMark));
					}
				} else {
					factory.pushOffset(getOutputLength(baseMark));
				}
			}
		} else {
			assert(
				!isNewAttach(baseMark) && !isNewAttach(currMark),
				0x4f5 /* A new attach cannot be at the same position as another mark */,
			);
			assert(
				getInputLength(baseMark) === getInputLength(currMark),
				0x4f6 /* The two marks should be the same size */,
			);

			const rebasedMark = rebaseMark(
				currMark,
				baseMark,
				baseRevision,
				baseIntention,
				baseInputIndex,
				rebaseChild,
				moveEffects,
			);
			factory.push(rebasedMark);

			const detachLength = getInputLength(baseMark);
			baseInputIndex += detachLength;
			if (isDetachMark(baseMark)) {
				baseDetachOffset += detachLength;
			} else {
				if (baseDetachOffset > 0 && baseIntention !== undefined) {
					updateLineage(lineageRequests, baseIntention);
				}

				lineageRequests.length = 0;
				baseDetachOffset = 0;
			}
		}
	}

	if (baseDetachOffset > 0 && baseIntention !== undefined) {
		updateLineage(lineageRequests, baseIntention);
	}

	return factory.list;
}

class RebaseQueue<T> {
	private reattachOffset: number = 0;
	private readonly baseMarks: MarkQueue<T>;
	private readonly newMarks: MarkQueue<T>;

	public constructor(
		baseRevision: RevisionTag | undefined,
		private readonly baseIntention: RevisionTag | undefined,
		baseMarks: Changeset<T>,
		newMarks: Changeset<T>,
		genId: IdAllocator,
		moveEffects: MoveEffectTable<T>,
	) {
		this.baseMarks = new MarkQueue(baseMarks, baseRevision, moveEffects, false, genId);
		this.newMarks = new MarkQueue(newMarks, undefined, moveEffects, true, genId);
	}

	public isEmpty(): boolean {
		return this.baseMarks.isEmpty() && this.newMarks.isEmpty();
	}

	public pop(): RebaseMarks<T> {
		const baseMark = this.baseMarks.peek();
		const newMark = this.newMarks.peek();

		if (baseMark === undefined && newMark === undefined) {
			return {};
		} else if (baseMark === undefined) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const length = getInputLength(newMark!);
			return {
				baseMark: length > 0 ? length : undefined,
				newMark: this.newMarks.tryDequeue(),
			};
		} else if (newMark === undefined) {
			const length = getInputLength(baseMark);
			return {
				baseMark: this.baseMarks.tryDequeue(),
				newMark: length > 0 ? length : undefined,
			};
		} else if (isAttach(baseMark) && isAttach(newMark)) {
			if (
				isReattach(baseMark) &&
				isReattach(newMark) &&
				areRelatedReattaches(baseMark, newMark)
			) {
				return dequeueRelatedReattaches(this.newMarks, this.baseMarks);
			}
			if (isReattach(baseMark)) {
				const offset = getOffsetAtRevision(
					newMark.lineage,
					baseMark.lastDetachedBy ?? baseMark.detachedBy,
				);
				if (offset !== undefined) {
					// WARNING: the offset is based on the first node detached whereas the detachIndex is based on the
					// first node in the field.
					// The comparison below is the only valid one we can make at the moment.
					// TODO: find a way to make the lineage and detachIndex info more comparable so we can correctly
					// handle scenarios where either all or some fraction of newMark should come first.
					if (offset >= baseMark.detachIndex + baseMark.count) {
						return {
							baseMark: this.baseMarks.dequeue(),
						};
					}
				}
			}
			if (isReattach(newMark)) {
				const offset = getOffsetAtRevision(
					baseMark.lineage,
					newMark.lastDetachedBy ?? newMark.detachedBy,
				);
				if (offset !== undefined) {
					// WARNING: the offset is based on the first node detached whereas the detachIndex is based on the
					// first node in the field.
					// The comparison below is the only valid one we can make at the moment.
					// TODO: find a way to make the lineage and detachIndex info more comparable so we can correctly
					// handle scenarios where either all or some fraction of baseMark should come first.
					if (offset >= newMark.detachIndex + newMark.count) {
						return {
							newMark: this.newMarks.dequeue(),
						};
					}
				}
			}
			const reattachOffset = getOffsetAtRevision(newMark.lineage, this.baseIntention);
			if (reattachOffset !== undefined) {
				const offset = reattachOffset - this.reattachOffset;
				if (offset === 0) {
					return { newMark: this.newMarks.dequeue() };
				} else if (offset >= getOutputLength(baseMark)) {
					this.reattachOffset += getOutputLength(baseMark);
					return { baseMark: this.baseMarks.dequeue() };
				} else {
					const splitBaseMark = this.baseMarks.dequeueOutput(offset);
					this.reattachOffset += offset;
					return { baseMark: splitBaseMark };
				}
			} else if (
				isAttachAfterBaseAttach(newMark, baseMark) ||
				isConflictedReattach(newMark)
			) {
				return { baseMark: this.baseMarks.dequeue() };
			} else {
				return { newMark: this.newMarks.dequeue() };
			}
		} else if (isAttachInGap(newMark)) {
			return { newMark: this.newMarks.dequeue() };
		} else if (
			// The `isNewAttach(baseMark)` bit is needed because of the way sandwich rebasing makes
			// the rebased local new attaches relevant to later local changes.
			(isNewAttach(baseMark) || isActiveReattach(baseMark)) &&
			isConflictedDetach(newMark) &&
			// TODO: support muting/unmuting other detach mark types
			newMark.type === "ReturnFrom" &&
			isBaseAttachRelatedToConflictedDetach(baseMark, newMark, this.baseMarks.revision)
		) {
			assert(
				newMark.detachIndex !== undefined,
				0x4f7 /* A conflicted ReturnFrom should have a detachIndex */,
			);
			const newMarkLength = newMark.count;
			const baseMarkLength = getOutputLength(baseMark);
			if (isNewAttach(baseMark) || newMark.detachIndex === baseMark.detachIndex) {
				if (newMarkLength < baseMarkLength) {
					return {
						baseMark: this.baseMarks.dequeueOutput(newMarkLength),
						newMark: this.newMarks.dequeue(),
					};
				} else if (newMarkLength > baseMarkLength) {
					return {
						baseMark: this.baseMarks.dequeue(),
						newMark: this.newMarks.dequeueInput(baseMarkLength),
					};
				} else {
					return { baseMark: this.baseMarks.dequeue(), newMark: this.newMarks.dequeue() };
				}
			} else if (newMark.detachIndex < baseMark.detachIndex) {
				if (newMark.detachIndex + newMarkLength <= baseMark.detachIndex) {
					return { newMark: this.newMarks.dequeue() };
				}
				return {
					newMark: this.newMarks.dequeueInput(baseMark.detachIndex - newMark.detachIndex),
				};
			} else {
				if (baseMark.detachIndex + baseMarkLength <= newMark.detachIndex) {
					return { baseMark: this.baseMarks.dequeue() };
				}
				return {
					baseMark: this.baseMarks.dequeueOutput(
						newMark.detachIndex - baseMark.detachIndex,
					),
				};
			}
		}

		// TODO: Handle case where `baseMarks` has adjacent or nested inverse reattaches from multiple revisions
		this.reattachOffset = 0;
		if (isAttachInGap(baseMark)) {
			return { baseMark: this.baseMarks.dequeue() };
		} else {
			this.reattachOffset = 0;
			const newMarkLength = getInputLength(newMark);
			const baseMarkLength = getInputLength(baseMark);
			if (newMarkLength < baseMarkLength) {
				return {
					baseMark: this.baseMarks.dequeueInput(newMarkLength),
					newMark: this.newMarks.dequeue(),
				};
			} else if (newMarkLength > baseMarkLength) {
				return {
					baseMark: this.baseMarks.dequeue(),
					newMark: this.newMarks.dequeueInput(baseMarkLength),
				};
			} else {
				return {
					baseMark: this.baseMarks.dequeue(),
					newMark: this.newMarks.dequeue(),
				};
			}
		}
	}
}

/**
 * Represents the marks rebasing should process next.
 * If `baseMark` and `newMark` are both defined, then they are `SizedMark`s covering the same range of nodes.
 */
interface RebaseMarks<T> {
	baseMark?: Mark<T>;
	newMark?: Mark<T>;
}

function rebaseMark<TNodeChange>(
	currMark: CellSpanningMark<TNodeChange>,
	baseMark: CellSpanningMark<TNodeChange>,
	baseRevision: RevisionTag | undefined,
	baseIntention: RevisionTag | undefined,
	baseInputOffset: number,
	rebaseChild: NodeChangeRebaser<TNodeChange>,
	moveEffects: MoveEffectTable<TNodeChange>,
): CellSpanningMark<TNodeChange> {
	if (isSkipMark(baseMark) || isSkipLikeReattach(baseMark) || isSkipLikeDetach(baseMark)) {
		// TODO: Rebase currMark's changes over baseMark's changes.
		if (isObjMark(currMark) && currMark.type === "Modify") {
			const childChange = rebaseChild(currMark.changes, undefined);
			return childChange !== undefined ? { ...currMark, changes: childChange } : 1;
		}
		return cloneMark(currMark);
	}
	const baseType = baseMark.type;
	switch (baseType) {
		case "Delete": {
			if (isReattach(currMark)) {
				// TODO: add `addedBy: RevisionTag` to inverses of attaches so we can detect when
				// baseMark.addedBy === currMark.conflictsWith, which indicates the deletion is the undo of the
				// reattach that conflicts with currMark. When that's the case, the mark should no longer be
				// marked as conflicted.
				// See skipped test: Revive ↷ [Revive, undo(Revive)] => Revive
				if (currMark.isIntention || currMark.conflictsWith === baseIntention) {
					const reattach = {
						...cloneMark(currMark as Reattach<TNodeChange>),
						// Update the characterization of the deleted content
						detachIndex: baseInputOffset,
					};
					if (currMark.isIntention) {
						reattach.detachedBy = baseIntention;
					} else if (baseIntention !== reattach.detachedBy) {
						reattach.lastDetachedBy = baseIntention;
					}
					delete reattach.conflictsWith;

					// TODO: Rebase reattach's changes over delete's changes.
					return reattach;
				}
				// The reattach mark remains conflicted because the deletion was performed by a different change.
				// After this, the only way for the reattach to recover from the conflict is for the nodes to be
				// revived and for the original deletion (currMark.detachedBy) to be re-applied.
				// TODO: Rebase reattach's changes over delete's changes.
				return {
					...cloneMark(currMark),
					lastDetachedBy: baseIntention,
					detachIndex: baseInputOffset,
				};
			}
			if (
				isObjMark(currMark) &&
				(currMark.type === "MoveOut" || currMark.type === "ReturnFrom")
			) {
				getOrAddEffect(
					moveEffects,
					CrossFieldTarget.Destination,
					currMark.revision,
					currMark.id,
				).shouldRemove = true;
			}

			// TODO: Represent muted change, and rebase currMark's changes over baseMark's changes.
			return 0;
		}
		case "Revive":
		case "ReturnTo": {
			assert(
				isDetachMark(currMark) || isReattach(currMark),
				0x4f8 /* Only a detach or a reattach can overlap with a non-inert reattach */,
			);
			const currMarkType = currMark.type;
			switch (currMarkType) {
				case "Delete":
				case "MoveOut":
				case "ReturnFrom": {
					assert(
						currMarkType === "ReturnFrom",
						0x4f9 /* TODO: support conflict management for other detach marks */,
					);
					assert(
						isConflicted(currMark) && currMark.conflictsWith === baseIntention,
						0x4fa /* Invalid reattach mark overlap */,
					);
					// The nodes that currMark aims to detach are being reattached by baseMark
					const newCurrMark: ReturnFrom<TNodeChange> = cloneMark(currMark);
					delete newCurrMark.conflictsWith;
					delete newCurrMark.detachIndex;
					getOrAddEffect(
						moveEffects,
						CrossFieldTarget.Destination,
						newCurrMark.revision,
						newCurrMark.id,
					).pairedMarkStatus = PairedMarkUpdate.Reactivated;

					// TODO: Rebase currMark's changes over baseMark's changes.
					return newCurrMark;
				}
				case "Revive":
				case "ReturnTo": {
					if (currMark.isIntention) {
						// Past this point, currMark must be a reattach.
						assert(
							isActiveReattach(currMark),
							0x4fb /* Invalid reattach mark overlap */,
						);
						// The nodes that currMark aims to reattach are being reattached by baseMark
						// TODO: Rebase currMark's changes over baseMark's changes.
						return {
							...cloneMark(currMark),
							conflictsWith: baseIntention,
						};
					}

					if (isActiveReattach(currMark)) {
						// The nodes that currMark aims to reattach are being reattached by baseMark
						if (currMarkType === "ReturnTo") {
							getOrAddEffect(
								moveEffects,
								CrossFieldTarget.Source,
								currMark.revision,
								currMark.id,
							).pairedMarkStatus = PairedMarkUpdate.Deactivated;
						}

						// TODO: Rebase currMark's changes over baseMark's changes.
						return {
							...cloneMark(currMark),
							conflictsWith: baseIntention,
						};
					}
					assert(
						!isSkipLikeReattach(currMark),
						0x4fc /* Unsupported reattach mark overlap */,
					);
					// The nodes that currMark aims to reattach and were detached by `currMark.lastDetachedBy`
					// are being reattached by baseMark.
					assert(
						currMark.lastDetachedBy === baseMark.detachedBy,
						0x4fd /* Invalid revive mark overlap */,
					);
					const revive = cloneMark(currMark);
					delete revive.lastDetachedBy;

					// TODO: Rebase currMark's changes over baseMark's changes.
					return revive;
				}
				default:
					unreachableCase(currMarkType);
			}
		}
		case "Modify": {
			if (isSkipMark(currMark)) {
				const child = rebaseChild(undefined, baseMark.changes);
				return child !== undefined
					? {
							type: "Modify",
							changes: child,
					  }
					: 1;
			}
			if (isModify(currMark)) {
				const child = rebaseChild(currMark.changes, baseMark.changes);
				return child !== undefined
					? {
							...cloneMark(currMark),
							changes: child,
					  }
					: 1;
			}

			// TODO: Rebase currMark's changes over baseMark's changes.
			return cloneMark(currMark);
		}
		case "MoveOut":
		case "ReturnFrom": {
			if (!isSkipMark(currMark)) {
				const newCurrMark = cloneMark(currMark);
				if (newCurrMark.type === "ReturnFrom") {
					// The nodes that currMark aims to detach are being detached by baseMark
					newCurrMark.conflictsWith = baseIntention;
					newCurrMark.detachIndex = baseInputOffset;
					getOrAddEffect(
						moveEffects,
						CrossFieldTarget.Destination,
						newCurrMark.revision,
						newCurrMark.id,
					).pairedMarkStatus = PairedMarkUpdate.Deactivated;

					// TODO: Rebase newCurrMark's changes over baseMark's changes.
					return newCurrMark;
				} else if (newCurrMark.type === "ReturnTo") {
					assert(
						isSkipLikeReattach(newCurrMark),
						0x4fe /* Only a skip-like reattach can overlap with a ReturnFrom */,
					);
					// The already populated cells that currMark aimed to reattach content into
					// are having their contents detached by baseMark.
					// This makes it possible for currMark to be active again.
					if (newCurrMark.isIntention) {
						newCurrMark.detachedBy = baseIntention;
					} else if (baseIntention !== newCurrMark.detachedBy) {
						newCurrMark.lastDetachedBy = baseIntention;
					}
					newCurrMark.detachIndex = baseInputOffset;
					delete (newCurrMark as CanConflict).conflictsWith;
					const effect = getOrAddEffect(
						moveEffects,
						CrossFieldTarget.Source,
						newCurrMark.revision,
						newCurrMark.id,
					);
					effect.detacher = baseIntention;
					effect.pairedMarkStatus = PairedMarkUpdate.Reactivated;

					// TODO: Rebase newCurrMark's changes over baseMark's changes.
					return newCurrMark;
				} else if (newCurrMark.type === "Revive" && !newCurrMark.isIntention) {
					assert(
						isSkipLikeReattach(newCurrMark),
						0x4ff /* Only a skip-like reattach can overlap with a ReturnFrom */,
					);
					// The already populated cells that currMark aimed to revive content into
					// are having their contents detached by baseMark.
					// The revive mark remains conflicted because the detach was performed by a different change than
					// the change the revive aims to revert.
					// After this, the only way for the reattach to to recover from the conflict is for the nodes to be
					// returned and for the original deletion (currMark.detachedBy) to be re-applied.
					// Update the characterization of the deleted content
					newCurrMark.lastDetachedBy = baseIntention;
					newCurrMark.detachIndex = baseInputOffset;

					// TODO: Rebase newCurrMark's changes over baseMark's changes.
					return newCurrMark;
				}
			}

			// TODO: Rebase currMark's changes over baseMark's changes.
			// Note that even if currMark is a skip mark,
			// it could become a modify mark after rebasing its (empty) changes over baseMark's changes.
			if (!isSkipMark(currMark)) {
				getOrAddEffect(
					moveEffects,
					CrossFieldTarget.Destination,
					baseMark.revision ?? baseRevision,
					baseMark.id,
				).movedMark = cloneMark(currMark);
			}
			return 0;
		}
		default:
			fail(`Unsupported mark type: ${baseType}`);
	}
}

export function amendRebase<TNodeChange>(
	rebasedMarks: MarkList<TNodeChange>,
	baseMarks: TaggedChange<MarkList<TNodeChange>>,
	rebaseChild: NodeChangeRebaser<TNodeChange>,
	genId: IdAllocator,
	crossFieldManager: CrossFieldManager,
	revisionMetadata: RevisionMetadataSource,
): Changeset<TNodeChange> {
	return amendRebaseI(
		baseMarks.revision,
		baseMarks.change,
		rebasedMarks,
		rebaseChild,
		crossFieldManager as MoveEffectTable<TNodeChange>,
		revisionMetadata,
	);
}

function amendRebaseI<TNodeChange>(
	baseRevision: RevisionTag | undefined,
	baseMarks: MarkList<TNodeChange>,
	rebasedMarks: MarkList<TNodeChange>,
	rebaseChild: NodeChangeRebaser<TNodeChange>,
	moveEffects: CrossFieldManager<MoveEffect<TNodeChange>>,
	revisionMetadata: RevisionMetadataSource,
): Changeset<TNodeChange> {
	// Is it correct to use ComposeQueue here?
	// If we used a special AmendRebaseQueue, we could ignore any base marks which don't have associated move-ins
	const queue = new ComposeQueue<TNodeChange>(
		baseRevision,
		baseMarks,
		undefined,
		rebasedMarks,
		() => fail("Should not generate new IDs when applying move effects"),
		moveEffects,
		revisionMetadata,
	);
	const factory = new MarkListFactory<TNodeChange>(undefined, moveEffects);

	while (!queue.isEmpty()) {
		const { baseMark, newMark } = queue.pop();
		if (isObjMark(baseMark) && (baseMark.type === "MoveIn" || baseMark.type === "ReturnTo")) {
			const effect = getMoveEffect(
				moveEffects,
				CrossFieldTarget.Destination,
				baseMark.revision ?? baseRevision,
				baseMark.id,
			);
			if (effect.movedMark !== undefined) {
				factory.push(effect.movedMark);
				factory.pushOffset(-getInputLength(effect.movedMark));
				delete effect.movedMark;
			}
		}

		if (newMark !== undefined) {
			let rebasedMark = newMark;

			// TODO: Handle all pairings of base and new mark types.
			if (baseMark !== undefined && isModify(baseMark)) {
				if (isSkipMark(newMark)) {
					const childChange = rebaseChild(undefined, baseMark.changes);
					if (childChange !== undefined) {
						rebasedMark = { type: "Modify", changes: childChange };
					}
				} else {
					switch (newMark.type) {
						case "Modify": {
							const childChange = rebaseChild(newMark.changes, baseMark.changes);
							if (childChange === undefined) {
								rebasedMark = 1;
							} else {
								newMark.changes = childChange;
							}
						}
						default:
							break;
					}
				}
			}
			factory.push(rebasedMark);
		}
	}

	// We may have discovered new mergeable marks while applying move effects, as we may have moved a MoveOut next to another MoveOut.
	// A second pass through MarkListFactory will handle any remaining merges.
	const factory2 = new MarkListFactory<TNodeChange>(undefined, moveEffects);
	for (const mark of factory.list) {
		factory2.push(mark);
	}
	return factory2.list;
}

function handleCurrAttach<T>(
	currMark: Attach<T>,
	factory: MarkListFactory<T>,
	lineageRequests: LineageRequest<T>[],
	offset: number,
	baseIntention: RevisionTag | undefined,
) {
	const rebasedMark = cloneMark(currMark);

	// If the changeset we are rebasing over has the same intention as an event in rebasedMark's lineage,
	// we assume that the base changeset is the inverse of the changeset in the lineage, so we remove the lineage event.
	// TODO: Handle cases where the base changeset is a composition of multiple revisions.
	// TODO: Don't remove the lineage event in cases where the event isn't actually inverted by the base changeset,
	// e.g., if the inverse of the lineage event is muted after rebasing.
	if (baseIntention !== undefined) {
		tryRemoveLineageEvent(rebasedMark, baseIntention);
	}
	factory.pushContent(rebasedMark);
	lineageRequests.push({ mark: rebasedMark, offset });
}

function isAttachAfterBaseAttach<T>(currMark: Attach<T>, baseMark: Attach<T>): boolean {
	const lineageCmp = compareLineages(currMark.lineage, baseMark.lineage);
	if (lineageCmp < 0) {
		return false;
	} else if (lineageCmp > 0) {
		return true;
	}

	// TODO: Handle tiebreaking, including support for the following scenario
	// Staring state: a b
	// A1) Delete a b
	// A2) Insert c
	// B) Insert x between a and b
	// Instead of using B's tiebreak policy, we should first consider the relative positions of a, b, and c if A1 were undone.
	// The best outcome seems to be that c is positioned relative to ab according to A2's tiebreak policy.
	return false;
}

function compareLineages(
	lineage1: LineageEvent[] | undefined,
	lineage2: LineageEvent[] | undefined,
): number {
	if (lineage1 === undefined || lineage2 === undefined) {
		return 0;
	}

	const lineage1Offsets = new Map<RevisionTag, number>();
	for (const event of lineage1) {
		lineage1Offsets.set(event.revision, event.offset);
	}

	for (let i = lineage2.length - 1; i >= 0; i--) {
		const event2 = lineage2[i];
		const offset1 = lineage1Offsets.get(event2.revision);
		if (offset1 !== undefined) {
			const offset2 = event2.offset;
			if (offset1 < offset2) {
				return -1;
			} else if (offset1 > offset2) {
				return 1;
			}
		}
	}
	return 0;
}

interface LineageRequest<T> {
	mark: Attach<T>;
	offset: number;
}

function updateLineage<T>(requests: LineageRequest<T>[], revision: RevisionTag) {
	for (const request of requests) {
		const mark = request.mark;
		if (mark.lineage === undefined) {
			mark.lineage = [];
		}

		mark.lineage.push({ revision, offset: request.offset });
	}
}

function tryRemoveLineageEvent<T>(mark: Attach<T>, revisionToRemove: RevisionTag) {
	if (mark.lineage === undefined) {
		return;
	}
	const index = mark.lineage.findIndex((event) => event.revision === revisionToRemove);
	if (index >= 0) {
		mark.lineage.splice(index, 1);
		if (mark.lineage.length === 0) {
			delete mark.lineage;
		}
	}
}

/**
 * @returns true iff both reattaches target cells that were affected by the same detach.
 * The target cells may or may not overlap depending on detach index information.
 *
 * Only valid in the context of a rebase (i.e., both marks have the same input context).
 */
function areRelatedReattaches<T>(baseMark: Reattach<T>, newMark: Reattach<T>): boolean {
	const baseReference = baseMark.lastDetachedBy ?? baseMark.detachedBy;
	const newReference = newMark.lastDetachedBy ?? newMark.detachedBy;
	return baseReference === newReference;
}

/**
 * @returns true iff `baseMark` attaches nodes in cells whose contents were detached by the same change
 * that conflicts with `newMark`.
 * The target cells may or may not overlap depending on detach index information.
 */
function isBaseAttachRelatedToConflictedDetach<T>(
	baseMark: NewAttach<T> | Reattach<T>,
	newMark: Detach<T> & Conflicted,
	baseRevision: RevisionTag | undefined,
): boolean {
	return (
		(isActiveReattach(baseMark) && baseMark.detachedBy === newMark.conflictsWith) ||
		(baseMark.revision ?? baseRevision) === newMark.conflictsWith
	);
}
