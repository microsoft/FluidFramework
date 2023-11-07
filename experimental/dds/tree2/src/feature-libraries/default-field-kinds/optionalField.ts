/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	Delta,
	ITreeCursor,
	TaggedChange,
	tagChange,
	ChangesetLocalId,
	ChangeAtomId,
	RevisionTag,
	JsonableTree,
	areEqualChangeAtomIds,
	makeDetachedNodeId,
} from "../../core";
import { fail, Mutable, IdAllocator, SizedNestedMap, brand } from "../../util";
import { singleTextCursor, jsonableTreeFromCursor } from "../treeTextCursor";
import {
	ToDelta,
	FieldChangeRebaser,
	NodeChangeComposer,
	NodeChangeInverter,
	NodeChangeRebaser,
	NodeChangeset,
	FieldEditor,
	CrossFieldManager,
	RevisionMetadataSource,
	getIntention,
	NodeExistenceState,
	FieldChangeHandler,
	RevisionInfo,
} from "../modular-schema";
import { ContentId, OptionalChangeset, OptionalFieldChange } from "./defaultFieldChangeTypes";
import { makeOptionalFieldCodecFamily } from "./defaultFieldChangeCodecs";

interface IChildChangeMap<T> {
	set(id: ContentId, childChange: T): void;
	get(id: ContentId): T | undefined;
	delete(id: ContentId): boolean;
	keys(): Iterable<ContentId>;
	values(): Iterable<T>;
	entries(): Iterable<[ContentId, T]>;
	readonly size: number;
}

/**
 * @returns true iff `maybeInverse` is an inverse of `original`. Note that this relationship is not symmetric.
 */
function isInverse(
	maybeInverse: Partial<RevisionInfo> | undefined,
	original: Partial<RevisionInfo> | undefined,
): boolean {
	return (
		(maybeInverse?.rollbackOf !== undefined &&
			maybeInverse?.rollbackOf === original?.revision) ||
		(maybeInverse?.revision !== undefined && maybeInverse?.revision === original?.rollbackOf)
	);
}

class ChildChangeMap<T> implements IChildChangeMap<T> {
	// TODO: this doesn't need to be sized. we just need isEmpty pretty sure.
	private readonly beforeMap = new SizedNestedMap<
		ChangesetLocalId | "this",
		RevisionTag | undefined,
		T
	>();
	private readonly afterMap = new SizedNestedMap<
		ChangesetLocalId | "this",
		RevisionTag | undefined,
		T
	>();

	private getMap(
		type: "before" | "after",
	): SizedNestedMap<ChangesetLocalId | "this", RevisionTag | undefined, T> {
		return type === "before" ? this.beforeMap : this.afterMap;
	}

	public set({ id, type }: ContentId, childChange: T): void {
		const map = this.getMap(type);
		if (id === "this") {
			map.set(id, undefined, childChange);
		} else {
			map.set(id.localId, id.revision, childChange);
		}
	}

	public get({ id, type }: ContentId): T | undefined {
		const map = this.getMap(type);
		return id === "this" ? map.tryGet(id, undefined) : map.tryGet(id.localId, id.revision);
	}

	public has(id: ContentId): boolean {
		return this.get(id) !== undefined;
	}

	public delete({ type, id }: ContentId): boolean {
		const map = this.getMap(type);
		return id === "this" ? map.delete(id, undefined) : map.delete(id.localId, id.revision);
	}

	public *keys(): Iterable<ContentId> {
		for (const [localId, nestedMap] of this.beforeMap) {
			if (localId === "this") {
				yield { type: "before", id: localId };
			} else {
				for (const [revisionTag, _] of nestedMap) {
					const id =
						revisionTag === undefined
							? { localId }
							: { localId, revision: revisionTag };
					yield { type: "before", id };
				}
			}
		}

		for (const [localId, nestedMap] of this.afterMap) {
			if (localId === "this") {
				yield { type: "after", id: localId };
			} else {
				for (const [revisionTag, _] of nestedMap) {
					const id =
						revisionTag === undefined
							? { localId }
							: { localId, revision: revisionTag };
					yield { type: "after", id };
				}
			}
		}
	}
	public *values(): Iterable<T> {
		yield* this.beforeMap.values();
		yield* this.afterMap.values();
	}
	public *entries(): Iterable<[ContentId, T]> {
		for (const changeId of this.keys()) {
			const value = this.get(changeId);
			assert(
				value !== undefined,
				0x770 /* Entry should not be undefined when iterating keys. */,
			);
			yield [changeId, value];
		}
	}
	public get size(): number {
		return this.beforeMap.size + this.afterMap.size;
	}
}

export const optionalChangeRebaser: FieldChangeRebaser<OptionalChangeset> = {
	compose: (
		changes: TaggedChange<OptionalChangeset>[],
		composeChild: NodeChangeComposer,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
		revisionMetadata: RevisionMetadataSource,
	): OptionalChangeset => {
		const perChildChanges = new ChildChangeMap<TaggedChange<NodeChangeset>[]>();
		const addChildChange = (id: ContentId, ...changeList: TaggedChange<NodeChangeset>[]) => {
			const existingChanges = perChildChanges.get(id);
			if (existingChanges !== undefined) {
				existingChanges.push(...changeList);
			} else {
				perChildChanges.set(id, [...changeList]);
			}
		};

		const rename = (id: ContentId, newId: ContentId) => {
			const existingChanges = perChildChanges.get(id);
			// TODO: It'd be great to have this assert for safety..
			// This can happen currently when we're rebasing a rollback sandwich, e.g. [Set A, child change 1, child change 2] over [Set B]:
			// compose(child change 1 inverse, compose(Set A inverse, Set B, Set A reapplication), child change 1 reapplication)
			// involves renaming the child change 1 inverse to 'after child change 1 reapplication', which we then map later again.
			// Sample test case: Rebase ["SetB,0","ChildChange79","ChildChange80"] over Delete
			// assert(perChildChanges.get(newId) === undefined, "Cannot rename to existing id");
			if (existingChanges !== undefined) {
				perChildChanges.delete(id);
				const newChangesArray = perChildChanges.get(newId);
				if (newChangesArray !== undefined) {
					newChangesArray.push(...existingChanges);
				} else {
					perChildChanges.set(newId, existingChanges);
				}
			}
		};

		const cumulativeFieldChanges: OptionalFieldChange[] = [];

		// TODO: would be great to not use this. maybe changes[0].revision ?? changes[0]?.change.fieldChanges[0]?.revision ?? fail()
		let currentActiveContentId: ContentId = { type: "before", id: "this" };
		let firstRemovalContentId: ContentId | undefined;
		for (const { change, revision } of changes) {
			if (change.firstRemovalContentId !== undefined) {
				rename(currentActiveContentId, change.firstRemovalContentId);
			}
			// const firstFieldChangeAtomId =
			// 	change.fieldChanges[0] !== undefined
			// 		? {
			// 				revision: revision ?? change.fieldChanges[0].revision,
			// 				localId: change.fieldChanges[0].id,
			// 		  }
			// 		: undefined;
			const { childChanges, fieldChanges } = change;
			let hasMatchingPriorInverse = false;
			if (fieldChanges.length > 0 || change.firstRemovalContentId !== undefined) {
				if (
					cumulativeFieldChanges.length === 0 &&
					change.firstRemovalContentId !== undefined
				) {
					firstRemovalContentId = change.firstRemovalContentId;
				}
				// Process field changes first: this may rename ContentIds for current child changes.
				for (const fieldChange of fieldChanges) {
					// Key idea: assume child content ids that we're going to process are already normalized.
					// So they should never refer to rollback revisions
					const fieldChangeInfo: Partial<RevisionInfo> = revisionMetadata.tryGetInfo(
						revision ?? fieldChange.revision,
					) ?? {
						revision: revision ?? fieldChange.revision,
					};

					const isRollback = fieldChangeInfo.rollbackOf !== undefined;
					const intention = fieldChangeInfo.rollbackOf ?? fieldChangeInfo.revision;
					const changeAtomId: ChangeAtomId = {
						localId: fieldChange.id,
						revision: intention,
					};
					rename(currentActiveContentId, {
						type: isRollback ? "after" : "before",
						id: changeAtomId,
					});

					currentActiveContentId = {
						type: isRollback ? "before" : "after",
						id: changeAtomId,
					};
					// TODO: wasEmpty computation is odd here, allegedly
					const activeFieldChange: Mutable<OptionalFieldChange> = {
						id: fieldChange.id,
						revision: fieldChangeInfo?.revision,
						wasEmpty: fieldChange.wasEmpty,
					};
					if (fieldChange.newContent !== undefined) {
						activeFieldChange.newContent = { ...fieldChange.newContent };
						if ("revert" in fieldChange.newContent) {
							// We're restoring a node which previously existed. Recover any child changes to that node.
							rename(
								{ type: "before", id: fieldChange.newContent.revert },
								currentActiveContentId,
							);
						}
					}

					const priorInverseIndex = cumulativeFieldChanges.findIndex((c) => {
						assert(
							c.revision !== undefined,
							"Expected revision to be set on composed field change component",
						);
						// Note: previous code looked directly on `changes`, which required a nested array check here.
						// This approach seems conceptually nicer.
						// return c.change.fieldChanges.some((fc) =>
						// 	isInverse(revisionMetadata.tryGetInfo(fc.revision), fieldChangeInfo),
						// );
						return isInverse(revisionMetadata.tryGetInfo(c.revision), fieldChangeInfo);
					});
					const priorInverse = cumulativeFieldChanges[priorInverseIndex];
					hasMatchingPriorInverse = priorInverse !== undefined;

					if (hasMatchingPriorInverse) {
						if (priorInverseIndex === 0 && firstRemovalContentId === undefined) {
							// First removal is identified by node that existed before the rollback, which is also node that
							// exists now
							firstRemovalContentId = currentActiveContentId;
						}
						// Don't need to add this to the set of field changes, as it has instead cancelled out a prior change.
						// However, first update child changes currently associated with the subsequent removal of the node
						// inserted by the inverse to be associated with this (original) insertion of that node.

						// if (priorInverseIndex + 1 < cumulativeFieldChanges.length) {
						// 	const subsequentFieldChange =
						// 		cumulativeFieldChanges[priorInverseIndex + 1];
						// 	rename(
						// 		{
						// 			type: "before",
						// 			id: {
						// 				localId: subsequentFieldChange.id,
						// 				revision: subsequentFieldChange.revision,
						// 			},
						// 		},
						// 		currentActiveContentId,
						// 	);
						// }

						cumulativeFieldChanges.splice(priorInverseIndex, 1);
					} else {
						cumulativeFieldChanges.push(activeFieldChange);
					}
				}

				if (hasMatchingPriorInverse) {
					// Maybe active content id is fine in this case.
					// currentActiveContentId =
				} else if (
					true
					// !areEqualContentIds(change.contentId, { type: "before", id: "this" }) &&
					// change.fieldChanges.length > 0
				) {
					rename(currentActiveContentId, change.contentId);
					currentActiveContentId = change.contentId;
				} else {
					throw new Error("When is this possible?");
				}
			} else {
				// currentActiveContentId = change.contentId; // { type: "after", id: "this" };
			}

			if (childChanges !== undefined) {
				for (const [childId, childChange] of childChanges) {
					if (areEqualContentIds(childId, { type: "after", id: "this" })) {
						// Something like this, but not quite right.
						addChildChange(currentActiveContentId, tagChange(childChange, revision));
					} else {
						addChildChange(childId, tagChange(childChange, revision));
					}
				}
			}
		}

		const composed: OptionalChangeset = {
			fieldChanges: cumulativeFieldChanges,
			contentId: currentActiveContentId,
		};

		if (!areEqualContentIds(currentActiveContentId, { type: "after", id: "this" })) {
			if (cumulativeFieldChanges.length > 0) {
				// Trailing child changes will have been put under 'after this', but should be normalized.
				rename({ type: "after", id: "this" }, currentActiveContentId);
			} else {
				// TODO: Maybe 'or are equal content id(currentActiveContentId, firstRemovalContentId)... but that seems already handled.
				// This case is to deal with the fact that composition of only child changes never hits the updated path to currentActiveContentId.
				// seems weird that we need it though.
				rename({ type: "before", id: "this" }, { type: "after", id: "this" });
			}
		}

		if (firstRemovalContentId !== undefined) {
			composed.firstRemovalContentId = firstRemovalContentId;
		}

		if (perChildChanges.size > 0) {
			composed.childChanges = Array.from(perChildChanges.entries(), ([id, changeList]) => [
				id,
				composeChild(changeList),
			]);
		}

		return composed;
	},

	amendCompose: () => fail("Not implemented"),

	invert: (
		{ revision, change }: TaggedChange<OptionalChangeset>,
		invertChild: NodeChangeInverter,
	): OptionalChangeset => {
		assert(change.fieldChanges.length < 2, "Only single field changes support inversion");
		const inverseChildChanges = new ChildChangeMap<NodeChangeset>();
		if (change.childChanges !== undefined) {
			for (const [{ type, id }, childChange] of change.childChanges) {
				const inverseType =
					change.fieldChanges.length === 0
						? "after"
						: type === "after"
						? "before"
						: "after";
				inverseChildChanges.set({ type: inverseType, id }, invertChild(childChange, 0));
			}
		}

		const inverse: OptionalChangeset = {
			childChanges:
				inverseChildChanges.size > 0
					? Array.from(inverseChildChanges.entries())
					: undefined,
			fieldChanges: [],
			// TODO: This also makes assumptions about not inverting compositions
			// TODO: this is a bit weird.
			contentId: { id: "this", type: "after" },
		};

		const { fieldChanges } = change;
		if (fieldChanges.length > 0) {
			const fieldChange = fieldChanges[0];
			// `change` replaces the node in the field
			const inverseFieldChange: OptionalFieldChange = {
				id: fieldChange.id,
				wasEmpty: fieldChange.newContent === undefined,
			};

			if (!fieldChange.wasEmpty) {
				assert(revision !== undefined, 0x592 /* Unable to revert to undefined revision */);
				inverseFieldChange.newContent = {
					revert: { revision, localId: fieldChange.id },
				};
			}
			inverse.fieldChanges.push(inverseFieldChange);
		}

		return inverse;
	},

	amendInvert: () => fail("Not implemented"),

	rebase: (
		change: OptionalChangeset,
		overTagged: TaggedChange<OptionalChangeset>,
		rebaseChild: NodeChangeRebaser,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
		revisionMetadata: RevisionMetadataSource,
		existenceState?: NodeExistenceState,
	): OptionalChangeset => {
		const over = overTagged.change;
		// TODO: This generally needs to be reworked to make sure the childId used for each child change is correct in the presence of revivals.
		// E.g. rather than use firstOverFieldChange, we need to figure out the last change in `fieldChanges` which removed the same node that existed
		// in the optional field in the start context of `change`.
		// This generally applies to ids other than 'self' as well

		// Maps ContentId in `change` to corresponding (updated) ContentId after having rebased over `over`.
		// Since multiple ContentIds may refer to the same node, we always update rebased changes to refer
		// to the most recent reincarnation of that node with respect to the order of fieldChanges being rebased over.
		const redirectTable = new ChildChangeMap<ContentId>();

		if (over.fieldChanges.length > 0) {
			// redirectTable.set("end", "end");
			const lastFieldChange = over.fieldChanges[over.fieldChanges.length - 1];
			if (
				lastFieldChange.newContent !== undefined &&
				"revert" in lastFieldChange.newContent
			) {
				redirectTable.set(
					{ type: "before", id: lastFieldChange.newContent.revert },
					{ type: "after", id: "this" },
				);
			}

			for (let i = over.fieldChanges.length - 2; i >= 0; i--) {
				let fieldChange1 = over.fieldChanges[i];
				let fieldChange2 = over.fieldChanges[i + 1];

				const removerContentId: ContentId = {
					type: "before",
					id: {
						revision: fieldChange2.revision ?? overTagged.revision,
						localId: fieldChange2.id,
					},
				};
				redirectTable.set(
					removerContentId,
					redirectTable.get(removerContentId) ?? removerContentId,
				);
				if (fieldChange1.newContent !== undefined && "revert" in fieldChange1.newContent) {
					// fieldChange1 revives a node that existed at some point in the past. Unify this ContentId with fieldChange2.
					redirectTable.set(
						{ type: "before", id: fieldChange1.newContent.revert },
						redirectTable.get(removerContentId) ?? removerContentId,
					);
				}
			}

			const firstFieldChange = over.fieldChanges[0];
			const firstRemoverContentId: ContentId = over.firstRemovalContentId ?? {
				type: "before",
				id: {
					revision: firstFieldChange.revision ?? overTagged.revision,
					localId: firstFieldChange.id,
				},
			};
			redirectTable.set(
				firstRemoverContentId,
				redirectTable.get(firstRemoverContentId) ?? firstRemoverContentId,
			);
			redirectTable.set(
				{ type: "before", id: "this" },
				redirectTable.get(firstRemoverContentId) ?? firstRemoverContentId,
			);
			// Note this makes assumptions we're not rebasing compositions, as otherwise there could be transient field changes.
			if (change.fieldChanges.length === 0) {
				redirectTable.set(
					{ type: "after", id: "this" },
					redirectTable.get(firstRemoverContentId) ?? firstRemoverContentId,
				);
			} else {
				redirectTable.set({ type: "after", id: "this" }, firstRemoverContentId);
			}
		} else {
			// can prob be unified with above cases
			// TODO: need to investigate if other scenarios are necessary.
			if (over.firstRemovalContentId !== undefined) {
				redirectTable.set({ type: "before", id: "this" }, over.firstRemovalContentId);
				if (change.fieldChanges.length === 0) {
					redirectTable.set({ type: "after", id: "this" }, over.firstRemovalContentId);
				}
			}
		}

		// Note: rebasing *over* composed changes is a near-term goal. Rebasing composed changes is not.
		// Generally, we only care about the first or last field change that we're rebasing over.
		let firstRemovalContentId: ContentId | undefined = over.firstRemovalContentId;
		if (firstRemovalContentId === undefined && over.fieldChanges.length > 0) {
			const firstChange = over.fieldChanges[0];
			const intention = getIntention(
				firstChange?.revision ?? overTagged.revision,
				revisionMetadata,
			);
			const isRollback = intention !== (firstChange?.revision ?? overTagged.revision);
			firstRemovalContentId = {
				type: isRollback ? "after" : "before",
				id: {
					revision: intention,
					localId: firstChange.id,
				},
			};
			firstRemovalContentId =
				redirectTable.get(firstRemovalContentId) ?? firstRemovalContentId;
		}

		const finalOverFieldChange = areEqualContentIds(over.contentId, {
			type: "after",
			id: "this",
		})
			? over.fieldChanges[over.fieldChanges.length - 1]
			: areEqualContentIds(over.contentId, {
					type: "before",
					id: "this",
			  }) ||
			  // TODO: Review this comment.
			  // Rationale here is weird. Note that the output content id isn't 'this', so the final field change doesn't align with the final content.
			  // That means that some rollback inverses have been cancelled at the end of the changeset.
			  // This assumes that both the rollback and its reapplication are being rebased over at once, and therefore there is no change to the field
			  // (only potential changes to children)
			  // This assumption seems to not be compatible with all the rebaser axioms, though.
			  over.contentId.type === "after"
			? undefined
			: over.fieldChanges.find((change) => {
					assert(over.contentId.type === "before", "TODO normalization here sucks");
					return (
						change.revision === (over.contentId.id as ChangeAtomId).revision &&
						change.id === (over.contentId.id as ChangeAtomId).localId
					);
			  });
		// assert(
		// 	over.fieldChanges.length === 0 || finalOverFieldChange !== undefined,
		// 	"Expected some field change to be active",
		// );
		assert(change.fieldChanges.length < 2, "rebasing composed changes is not implemented.");
		const perChildChanges = new ChildChangeMap<NodeChangeset>();
		if (change.childChanges !== undefined) {
			// TODO: (minor) early exits, better data structure choices, etc.
			const overChildChanges = new ChildChangeMap<NodeChangeset>();
			for (const [id, overChange] of over.childChanges ?? []) {
				overChildChanges.set(id, overChange);
			}

			// If we're rebasing over a fieldChange, track ChangeAtomId_s for cases where a previously existing
			// node was restored. In that case, when we construct our child id changes, they may apply to 'self' rather than
			// the pre-existing childId.
			let restoredRollbackChangeId: ContentId | undefined;
			let restoredUndoChangeId: ContentId | undefined;
			if (finalOverFieldChange !== undefined) {
				const overIntention = getIntention(
					finalOverFieldChange.revision ?? overTagged.revision,
					revisionMetadata,
				);

				if (finalOverFieldChange.newContent !== undefined) {
					const overContent = finalOverFieldChange.newContent;
					restoredRollbackChangeId = {
						type: "before",
						id: {
							revision: overIntention,
							localId: finalOverFieldChange.id,
						},
					};
					if ("revert" in overContent) {
						restoredUndoChangeId = { type: "before", id: overContent.revert };
					}
				}
			}

			for (const [id, childChange] of change.childChanges) {
				if (id.id === "this") {
					// Rationale: when rebasing over a composition, changes to "self" should be rebased over the aggregate changes
					// to the first removal. This assumes the list is ordered, which needs review.
					// const overChildChange = overChildChanges.get(id) ?? over.childChanges?.[0][1];
					const overChildChange = overChildChanges.get(
						// this should be equivalent to just "start" lol
						// redirectTable.get(id === "end" ? "start" : id) ?? id,
						redirectTable.get({ id: id.id, type: "before" }) ?? id,
						// firstOverFieldChange !== undefined
						// 	? {
						// 			revision: firstOverFieldChange.revision ?? overTagged.revision,
						// 			localId: firstOverFieldChange.id,
						// 	  }
						// 	: id,
					);
					if (
						finalOverFieldChange === undefined ||
						// TODO: Logic here seems wonky/wrong. The idea behind it is solid (comment inside the block), but implementation doesn't seem to quite track.
						(restoredUndoChangeId !== undefined &&
							firstRemovalContentId !== undefined &&
							areEqualContentIds(restoredUndoChangeId, firstRemovalContentId))
					) {
						// `over` never removed the node childChange refers to, or it is a composed change
						// which ends by reviving that node.
						const rebasedChild = rebaseChild(
							childChange,
							overChildChange,
							NodeExistenceState.Alive,
						);
						if (rebasedChild !== undefined) {
							perChildChanges.set(id, rebasedChild);
						}
					} else {
						// `over` removed the node childChange refers to
						const rebasedChild = rebaseChild(
							childChange,
							overChildChange,
							NodeExistenceState.Dead,
						);
						if (rebasedChild !== undefined) {
							assert(
								firstRemovalContentId !== undefined,
								"Expected defined firstRemovalContentId",
							);
							perChildChanges.set(
								firstRemovalContentId,
								// redirectTable.get(id === "end" ? "start" : id) ?? id,
								// {
								// 	// TODO TODO: Comment below is now less true, needs update.
								// 	// TODO: Document this choice. This isn't really the revision that deleted the node, but
								// 	// the one that puts it back such that if we later ressurect it, the child changes will
								// 	// apply to it... this matches what the previous code/format did, but it's not well-documented
								// 	// why it's the right choice.
								// 	// See the "can rebase a node replacement and a dependent edit to the new node" test case.
								// 	// This might be making assumptions on sandwich rebasing a la rollback tags (which could be
								// 	// an obstacle for postbase)
								// 	type: isRollback ? "after" : "before",

								// 	id: {
								// 		revision: intention,
								// 		localId: firstOverFieldChange.id,
								// 	},
								// },
								rebasedChild,
							);
						}
					}
				} else {
					const restoredRollbackTestId: ContentId = {
						type: "before",
						id: {
							revision: getIntention(id.id.revision, revisionMetadata),
							localId: id.id.localId,
						},
					};
					if (
						(restoredRollbackChangeId !== undefined &&
							areEqualContentIds(restoredRollbackTestId, restoredRollbackChangeId)) ||
						(restoredUndoChangeId !== undefined &&
							areEqualContentIds(id, restoredUndoChangeId))
					) {
						// childChange refers to changes to node being revived by `over`.
						const overChange = overChildChanges.get({ type: "after", id: "this" }); // finalOverFieldChange?.newContent?.changes;
						const rebasedChild = rebaseChild(
							childChange,
							overChange,
							NodeExistenceState.Alive,
						);
						if (rebasedChild !== undefined) {
							perChildChanges.set({ type: "after", id: "this" }, rebasedChild);
						}
					} else {
						// childChange refers to changes to node removed by some past revision. Rebase over any changes that
						// `over` has to that same revision.
						const overChange = overChildChanges.get(redirectTable.get(id) ?? id);
						const rebasedChild = rebaseChild(
							childChange,
							overChange,
							NodeExistenceState.Dead,
						);
						if (rebasedChild !== undefined) {
							perChildChanges.set(id, rebasedChild);
						}
					}
				}
			}
		}

		let fieldChange: OptionalFieldChange | undefined;
		if (change.fieldChanges.length > 0) {
			if (finalOverFieldChange !== undefined) {
				const wasEmpty = finalOverFieldChange.newContent === undefined;
				fieldChange = { ...change.fieldChanges[0], wasEmpty };
			} else {
				fieldChange = change.fieldChanges[0];
			}
		}

		const rebased: OptionalChangeset = {
			fieldChanges: [],
			// TODO: this makes assumptions about not rebasing compositions.
			contentId: change.contentId,
		};
		if (fieldChange !== undefined) {
			rebased.fieldChanges.push(fieldChange);
		}
		if (perChildChanges.size > 0) {
			rebased.childChanges = Array.from(perChildChanges.entries());
		}

		return rebased;
	},

	amendRebase: (
		change: OptionalChangeset,
		overTagged: TaggedChange<OptionalChangeset>,
		rebaseChild: NodeChangeRebaser,
	) => {
		const amended = { ...change };
		if (change.childChanges !== undefined) {
			const overChildChanges = new ChildChangeMap<NodeChangeset>();
			for (const [id, overChange] of overTagged?.change.childChanges ?? []) {
				overChildChanges.set(id, overChange);
			}

			const childChanges: typeof change.childChanges = [];
			for (const [id, childChange] of change.childChanges) {
				const rebasedChange = rebaseChild(childChange, overChildChanges.get(id));
				if (rebasedChange !== undefined) {
					childChanges.push([id, rebasedChange]);
				}
			}

			amended.childChanges = childChanges;
		}
		return amended;
	},
};

export interface OptionalFieldEditor extends FieldEditor<OptionalChangeset> {
	/**
	 * Creates a change which replaces the field with `newContent`
	 * @param newContent - the new content for the field
	 * @param wasEmpty - whether the field is empty when creating this change
	 * @param changeId - the ID associated with the replacement of the current content.
	 * @param buildId - the ID associated with the creation of the `newContent`.
	 */
	set(
		newContent: ITreeCursor,
		wasEmpty: boolean,
		changeId: ChangesetLocalId,
		buildId: ChangesetLocalId,
	): OptionalChangeset;

	/**
	 * Creates a change which clears the field's contents (if any).
	 * @param wasEmpty - whether the field is empty when creating this change
	 * @param changeId - the ID associated with the change.
	 */
	clear(wasEmpty: boolean, changeId: ChangesetLocalId): OptionalChangeset;
}

export const optionalFieldEditor: OptionalFieldEditor = {
	set: (
		newContent: ITreeCursor,
		wasEmpty: boolean,
		id: ChangesetLocalId,
		buildId: ChangesetLocalId,
	): OptionalChangeset => ({
		fieldChanges: [
			{
				id,
				newContent: {
					set: jsonableTreeFromCursor(newContent),
					buildId: { localId: buildId },
				},
				wasEmpty,
			},
		],
		contentId: { id: "this", type: "after" },
	}),

	clear: (wasEmpty: boolean, id: ChangesetLocalId): OptionalChangeset => ({
		fieldChanges: [{ id, wasEmpty }],
		contentId: { id: "this", type: "after" },
	}),

	buildChildChange: (index: number, childChange: NodeChangeset): OptionalChangeset => {
		assert(index === 0, 0x404 /* Optional fields only support a single child node */);
		return {
			fieldChanges: [],
			childChanges: [[{ id: "this", type: "after" }, childChange]],
			contentId: { id: "this", type: "after" },
		};
	},
};

export function optionalFieldIntoDelta(
	{ change, revision }: TaggedChange<OptionalChangeset>,
	deltaFromChild: ToDelta,
): Delta.FieldChanges {
	// TODO: If childChanges contains evidence of changes to transient nodes, we need to figure out what to do with them
	// (can they ever need to be created? how do we distinguish?)

	// TODO: Seems like you need a concept of 'muted': what happens if we try to `intoDelta` the changeset
	// [B^-1, A^-1, T, A] where T, A, and B are all "set"s of the optional field?
	// The delta generated should clear the node set by B and set the contents to what A did, but if we cancel out A and A^-1, we risk losing that info.
	// We *should* know that the contents of the set of B^-1 are correct.
	// Maybe instead of 'muting', we just specially track the set index in the optional field that's the active node!

	const delta: Mutable<Delta.FieldChanges> = {};
	const [_, childChange] =
		change.childChanges?.find(
			([changeId]) =>
				areEqualContentIds(changeId, { id: "this", type: "after" }) ||
				// TODO: review if this second clause is necessary
				(areEqualContentIds(changeId, { id: "this", type: "before" }) &&
					change.fieldChanges.length === 0),
			// changeId === "start" || (changeId === "end" && change.fieldChanges.length === 0),
		) ?? [];
	if (childChange === undefined && change.fieldChanges.length === 0) {
		return delta;
	}

	const mark: Mutable<Delta.Mark> = { count: 1 };
	delta.local = [mark];

	if (childChange !== undefined) {
		mark.fields = deltaFromChild(childChange);
	}

	if (
		change.fieldChanges.length === 0 ||
		areEqualContentIds(change.contentId, { id: "this", type: "before" })
	) {
		return delta;
	}

	const finalFieldChange = change.fieldChanges[change.fieldChanges.length - 1];
	if (!change.fieldChanges[0].wasEmpty) {
		const detachId = {
			major: finalFieldChange.revision ?? revision,
			minor: finalFieldChange.id,
		};
		mark.detach = detachId;
	}

	const update = finalFieldChange.newContent;
	if (update === undefined) {
		// The field is being cleared
	} else {
		if (Object.prototype.hasOwnProperty.call(update, "set")) {
			const setUpdate = update as { set: JsonableTree; buildId: ChangeAtomId };
			const content = [singleTextCursor(setUpdate.set)];
			const buildId = makeDetachedNodeId(
				setUpdate.buildId.revision ?? finalFieldChange.revision ?? revision,
				setUpdate.buildId.localId,
			);
			mark.attach = buildId;
			delta.build = [{ id: buildId, trees: content }];
		} else {
			const changeId = (update as { revert: ChangeAtomId }).revert;
			const restoreId = {
				major: changeId.revision,
				minor: changeId.localId,
			};
			mark.attach = restoreId;
		}
		const childChanges = change.childChanges?.find(([id]) =>
			areEqualContentIds(id, { type: "after", id: "this" }),
		)?.[1];
		// TODO: why is this global?
		if (childChanges !== undefined) {
			const fields = deltaFromChild(childChanges);
			delta.global = [{ id: mark.attach, fields }];
		}
	}
	return delta;
}

export const optionalChangeHandler: FieldChangeHandler<OptionalChangeset, OptionalFieldEditor> = {
	rebaser: optionalChangeRebaser,
	codecsFactory: makeOptionalFieldCodecFamily,
	editor: optionalFieldEditor,

	intoDelta: optionalFieldIntoDelta,
	isEmpty: (change: OptionalChangeset) =>
		change.childChanges === undefined && change.fieldChanges.length === 0,
};

// Note: assumes normalization! Two content ids might be semantically equivalent (e.g. 'after fieldChange 1' and 'before fieldChange 2'), but won't be counted as equal here.
function areEqualContentIds(a: ContentId, b: ContentId): boolean {
	if (a.type !== b.type) {
		return false;
	}

	if (typeof a.id === "string" || typeof b.id === "string") {
		return a.id === b.id;
	}

	return areEqualChangeAtomIds(a.id, b.id);
}

// Ideas:
// - Write strict 'isNormalized' function which we can assert on post-composition.
