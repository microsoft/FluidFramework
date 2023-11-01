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
import { OptionalChangeset, OptionalFieldChange } from "./defaultFieldChangeTypes";
import { makeOptionalFieldCodecFamily } from "./defaultFieldChangeCodecs";

type ChangeId = ChangeAtomId | "self";

interface IChildChangeMap<T> {
	set(id: ChangeId, childChange: T): void;
	get(id: ChangeId): T | undefined;
	delete(id: ChangeId): boolean;
	keys(): Iterable<ChangeId>;
	values(): Iterable<T>;
	entries(): Iterable<[ChangeId, T]>;
	readonly size: number;
}

/**
 * @returns true iff `maybeInverse` is an inverse of `original`. Note that this relationship is not symmetric.
 */
function isInverse(
	maybeInverse: RevisionInfo | undefined,
	original: RevisionInfo | undefined,
): boolean {
	return (
		(maybeInverse?.rollbackOf !== undefined &&
			maybeInverse?.rollbackOf === original?.revision) ||
		(maybeInverse?.revision !== undefined && maybeInverse?.revision === original?.rollbackOf)
	);
}

class ChildChangeMap<T> implements IChildChangeMap<T> {
	private readonly nestedMapData = new SizedNestedMap<
		ChangesetLocalId | "self",
		RevisionTag | undefined,
		T
	>();
	public set(id: ChangeId, childChange: T): void {
		if (id === "self") {
			this.nestedMapData.set("self", undefined, childChange);
		} else {
			this.nestedMapData.set(id.localId, id.revision, childChange);
		}
	}

	public get(id: ChangeId): T | undefined {
		return id === "self"
			? this.nestedMapData.tryGet(id, undefined)
			: this.nestedMapData.tryGet(id.localId, id.revision);
	}

	public has(id: ChangeId): boolean {
		return this.get(id) !== undefined;
	}

	public delete(id: ChangeId): boolean {
		return id === "self"
			? this.nestedMapData.delete("self", undefined)
			: this.nestedMapData.delete(id.localId, id.revision);
	}

	public keys(): Iterable<ChangeId> {
		const changeIds: ChangeId[] = [];
		for (const [localId, nestedMap] of this.nestedMapData) {
			if (localId === "self") {
				changeIds.push("self");
			} else {
				for (const [revisionTag, _] of nestedMap) {
					changeIds.push(
						revisionTag === undefined
							? { localId }
							: { localId, revision: revisionTag },
					);
				}
			}
		}

		return changeIds;
	}
	public values(): Iterable<T> {
		return this.nestedMapData.values();
	}
	public entries(): Iterable<[ChangeId, T]> {
		const entries: [ChangeId, T][] = [];
		for (const changeId of this.keys()) {
			if (changeId === "self") {
				const entry = this.nestedMapData.tryGet("self", undefined);
				assert(
					entry !== undefined,
					0x770 /* Entry should not be undefined when iterating keys. */,
				);
				entries.push(["self", entry]);
			} else {
				const entry = this.nestedMapData.tryGet(changeId.localId, changeId.revision);
				assert(
					entry !== undefined,
					0x771 /* Entry should not be undefined when iterating keys. */,
				);
				entries.push([changeId, entry]);
			}
		}

		return entries;
	}
	public get size(): number {
		return this.nestedMapData.size;
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
		const addChildChange = (id: ChangeId, ...changeList: TaggedChange<NodeChangeset>[]) => {
			const existingChanges = perChildChanges.get(id);
			if (existingChanges !== undefined) {
				existingChanges.push(...changeList);
			} else {
				perChildChanges.set(id, [...changeList]);
			}
		};

		const rename = (id: ChangeId, newId: ChangeId) => {
			const existingChanges = perChildChanges.get(id);
			assert(perChildChanges.get(newId) === undefined, "Cannot rename to existing id");
			if (existingChanges !== undefined) {
				perChildChanges.delete(id);
				perChildChanges.set(newId, existingChanges);
			}
		};

		// Maps revisions that we might see in the future which resurrect a node to the childId that we're
		// currently storing childChanges to that node under.
		// const pendingRessurectRevisions = new ChildChangeMap<ChangeId>();

		let currentActiveFieldChange: Mutable<OptionalFieldChange> | undefined;
		// Child changes are keyed on the ChangeAtomId of the first field change that deleted the node they affect.
		// However, since the node they affect can be revived by a later field change in the composition, we need to
		// track whether changes to the 'active' node in the field should be keyed on a ChangeAtomId that refers to
		// a previous deletion of that node, or whether it's currently 'unallocated' and should be keyed on whatever
		// first deletes it.
		// NOTE: This is the id of the change that *deletes* the currently active node, not the id of the change that inserts it.
		let currentActiveNodeId: ChangeAtomId | "firstToDelete" = "firstToDelete";
		let currentActiveFieldChangeId: ChangeAtomId | "start" | "end" = "start";
		const cumulativeFieldChanges: OptionalFieldChange[] = [];
		let currentChildNodeChanges: TaggedChange<NodeChangeset>[] = [];
		let index = 0;
		for (const { change, revision } of changes) {
			if (change.activeFieldChange !== "start") {
				currentActiveFieldChangeId = change.activeFieldChange;
			}
			const firstFieldChangeAtomId =
				change.fieldChanges[0] !== undefined
					? {
							revision: revision ?? change.fieldChanges[0].revision,
							localId: change.fieldChanges[0].id,
					  }
					: undefined;
			const { childChanges, fieldChanges } = change;

			// TODO: This needs to be a cursor that advances as we scan through `change`'s field changes.
			// Maybe not actually...
			if (childChanges !== undefined) {
				for (const [childId, childChange] of childChanges) {
					// if (childId !== "self") {
					// 	const fieldChangeInfo = revisionMetadata.tryGetInfo(
					// 		revision ?? childId.revision,
					// 	);
					// 	if (fieldChangeInfo?.rollbackOf !== undefined) {
					// 		pendingRessurectRevisions.set(
					// 			{ revision: fieldChangeInfo.rollbackOf, localId: childId.localId },
					// 			childId,
					// 		);
					// 	}
					// }

					const taggedChildChange = tagChange(childChange, revision);
					if (
						childId === "self" ||
						(firstFieldChangeAtomId !== undefined &&
							areEqualChangeAtomIds(childId, firstFieldChangeAtomId))
					) {
						// childChange refers to the node that existed at the start of `change`,
						// Thus in the composition, it should be referred to by whatever deletes that node in the future, which is what
						// currentChildNodeChanges tracks
						currentChildNodeChanges.push(taggedChildChange);
					} else {
						addChildChange(childId, taggedChildChange);
					}
				}
			}

			if (fieldChanges.length > 0) {
				for (const fieldChange of fieldChanges) {
					const fieldChangeInfo = revisionMetadata.tryGetInfo(
						revision ?? fieldChange.revision,
					);
					// TODO: wasEmpty computation is odd here.
					currentActiveFieldChange = {
						id: fieldChange.id,
						revision: fieldChangeInfo?.revision,
						wasEmpty: fieldChange.wasEmpty,
					};

					if (fieldChange.newContent !== undefined) {
						currentActiveFieldChange.newContent = { ...fieldChange.newContent };
					}

					let hasMatchingPriorInverse = false;
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

					// if (fieldChange.newContent !== undefined) {
					// 	if (hasMatchingPriorInverse) {
					// 		currentActiveFieldChange = undefined;
					// 	} else {
					// 		currentActiveFieldChange.newContent = {
					// 			...change.fieldChange.newContent,
					// 		};
					// 	}
					// } else {
					// 	if (hasMatchingPriorInverse) {
					// 		currentActiveFieldChange = undefined;
					// 	} else {
					// 		delete currentActiveFieldChange.newContent;
					// 	}
					// }

					// Node was changed by this revision: flush the current changes
					if (
						currentChildNodeChanges.length > 0 &&
						// TODO: review
						change.activeFieldChange !== "start"
					) {
						const id: ChangeAtomId =
							currentActiveNodeId === "firstToDelete"
								? {
										revision: revision ?? fieldChange.revision,
										localId: fieldChange.id,
								  }
								: currentActiveNodeId;
						addChildChange(id, ...currentChildNodeChanges);
						currentChildNodeChanges = [];
						// assert(firstFieldChangeAtomId !== undefined, "expected first field change");
						// addChildChange(firstFieldChangeAtomId, ...currentChildNodeChanges);
					}

					// if (priorInverse !== undefined) {
					// 	let maybeExisting = perChildChanges.get({
					// 		revision:
					// 			priorInverse.revision ??
					// 			// priorInverse?.change.fieldChange?.revision ??
					// 			fail("No revision associated with prior inverse"),
					// 		localId: priorInverse.id,
					// 	});
					// 	if (maybeExisting === undefined) {
					// 		currentChildNodeChanges = [];
					// 		pendingCurrentChildNodeFlush = true;
					// 	} else {
					// 		currentChildNodeChanges = maybeExisting;
					// 		pendingCurrentChildNodeFlush = false;
					// 	}
					// } else {
					// 	currentChildNodeChanges = [];
					// 	pendingCurrentChildNodeFlush = true;
					// }

					if (hasMatchingPriorInverse) {
						// Don't need to add this to the set of field changes, as it has instead cancelled out a prior change.
						//
						cumulativeFieldChanges.splice(priorInverseIndex, 1);
						if (priorInverseIndex > 0) {
							const activeNode = cumulativeFieldChanges[priorInverseIndex - 1];
							currentActiveFieldChangeId = {
								revision: activeNode.revision,
								localId: activeNode.id,
							};
						} else {
							currentActiveFieldChangeId = "start";
						}

						// Update changes
						// TODO: Conceptualizing as a 'rename to self' and flushing as 'renaming self to id of deletion'
						// seems conceptually cleaner here.
						const renamedChanges = perChildChanges.get({
							revision:
								priorInverse.revision ??
								fail("prior inverse should have been tagged with revision"),
							localId: priorInverse.id,
						});
						if (renamedChanges !== undefined) {
							currentChildNodeChanges.push(...renamedChanges);
							perChildChanges.delete({
								revision:
									priorInverse.revision ??
									fail("prior inverse should have been tagged with revision"),
								localId: priorInverse.id,
							});
						}
						// rename(
						// 	{
						// 		revision:
						// 			priorInverse.revision ??
						// 			fail("prior inverse should have been tagged with revision"),
						// 		localId: priorInverse.id,
						// 	},
						// 	{ revision: fieldChange.revision ?? revision, localId: fieldChange.id },
						// );
					} else {
						cumulativeFieldChanges.push(currentActiveFieldChange);
						// currentActiveFieldChangeId = {
						// 	revision: currentActiveFieldChange.revision,
						// 	localId: currentActiveFieldChange.id,
						// };
					}

					if (hasMatchingPriorInverse) {
						// Active node should be whatever existed immediately before the prior inverse, hence it was removed by the prior inverse.
						currentActiveNodeId = {
							revision:
								priorInverse.revision ??
								// priorInverse?.change.fieldChange?.revision ??
								fail("No revision associated with prior inverse"),
							localId: priorInverse.id,
						};
					} else if (
						fieldChange.newContent !== undefined &&
						"revert" in fieldChange.newContent
					) {
						// We're restoring a node which previously existed.
						// This is the ChangeAtomId for the revision which deleted the node we now recover.
						currentActiveNodeId = "firstToDelete"; // fieldChange.newContent.revert;
					} else {
						currentActiveNodeId = "firstToDelete";
					}

					if (fieldChange.newContent?.changes !== undefined) {
						currentChildNodeChanges.push(
							tagChange(fieldChange.newContent.changes, fieldChangeInfo?.revision),
						);
						assert(
							currentActiveFieldChange.newContent !== undefined,
							"Exepcted active content to be undefined",
						);
						delete currentActiveFieldChange.newContent.changes;
					}
				}
			}
			index++;
		}

		if (currentChildNodeChanges.length > 0) {
			if (currentActiveFieldChangeId !== "start" && currentActiveFieldChange !== undefined) {
				// TODO: Seems like currentActiveFieldChange might be wrong if we've ended in partial application of inverses... ?
				assert(
					currentActiveFieldChange.newContent !== undefined,
					0x772 /* after node must be defined to receive changes */,
				);
				currentActiveFieldChange.newContent.changes = composeChild(currentChildNodeChanges);
			} else {
				addChildChange("self", ...currentChildNodeChanges);
			}
		}

		const composed: OptionalChangeset = {
			fieldChanges: cumulativeFieldChanges,
			activeFieldChange: currentActiveFieldChangeId,
		};

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
		// Changes to the child that existed in this field before `change` was applied.
		let originalChildChanges: NodeChangeset | undefined;
		const inverseChildChanges = new ChildChangeMap<NodeChangeset>();
		if (change.childChanges !== undefined) {
			for (const [id, childChange] of change.childChanges) {
				if (id === "self" && change.fieldChanges.length > 0) {
					originalChildChanges = invertChild(childChange, 0);
				} else {
					inverseChildChanges.set(
						// This makes assumptions about how sandwich rebasing works
						id,
						invertChild(childChange, 0),
					);
				}
			}
		}

		const selfChanges = change.fieldChanges[0]?.newContent?.changes;
		if (selfChanges !== undefined) {
			inverseChildChanges.set("self", invertChild(selfChanges, 0));
		}

		const inverse: OptionalChangeset = {
			childChanges:
				inverseChildChanges.size > 0
					? Array.from(inverseChildChanges.entries())
					: undefined,
			fieldChanges: [],
			// TODO: This also makes assumptions about not inverting compositions
			activeFieldChange: change.fieldChanges.length > 0 ? "end" : "start",
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
					changes: originalChildChanges,
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
		const adderToRemover = new ChildChangeMap<ChangeId>();
		const removerToAdder = new ChildChangeMap<ChangeId>();
		{
			let currentNode: ChangeId = "self";
			// todo: obvious kludge here
			let fakeIds = 0;
			for (const fieldChange of over.fieldChanges) {
				const remover: ChangeId = {
					revision: fieldChange.revision ?? overTagged.revision,
					localId: fieldChange.id,
				};
				adderToRemover.set(currentNode, remover);
				removerToAdder.set(remover, currentNode);
				if (fieldChange.newContent !== undefined) {
					if ("revert" in fieldChange.newContent) {
						// Two options here: either revert via undo brings back the node which existed
						// in the start context of the change it's undoing, OR it only does so if no
						// intermediate field changes have happened.
						// For now, assume the first.

						const restoredNode: ChangeId = removerToAdder.get(
							fieldChange.newContent.revert,
						) ?? {
							revision: brand("made-up") as any,
							localId: brand(fakeIds++),
						};
						// adderToRemover.set(currentNode, restoredNode);
						// removerToAdder.set(restoredNode, currentNode);
						currentNode = restoredNode;
					} else {
						// this field change is a standard set.
						// adderToRemover.set(currentNode, remover);
						// removerToAdder.set(remover, currentNode);
						currentNode = remover;
					}
				} else {
					// this field change is a delete.
					// adderToRemover.set(currentNode, remover);
					// removerToAdder.set(remover, currentNode);
					currentNode = remover;
				}
			}
		}
		// Note: rebasing *over* composed changes is a near-term goal. Rebasing composed changes is not.
		// Generally, we only care about the first or last field change that we're rebasing over.
		let firstOverFieldChange = over.fieldChanges[0];
		const selfRemover = adderToRemover.get("self");
		if (selfRemover !== undefined && selfRemover !== "self") {
			firstOverFieldChange =
				over.fieldChanges.find(
					(change) =>
						(change.revision ?? overTagged.revision) === selfRemover.revision &&
						change.id === selfRemover.localId,
				) ?? firstOverFieldChange;
		}
		const finalOverFieldChange =
			over.activeFieldChange === "end"
				? over.fieldChanges[over.fieldChanges.length - 1]
				: over.activeFieldChange === "start"
				? undefined
				: over.fieldChanges.find((change) => {
						return (
							change.revision === (over.activeFieldChange as ChangeAtomId).revision &&
							change.id === (over.activeFieldChange as ChangeAtomId).localId
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
			let restoredRollbackChangeId: ChangeAtomId | undefined;
			let restoredUndoChangeId: ChangeAtomId | undefined;
			if (finalOverFieldChange !== undefined) {
				const overIntention = getIntention(
					finalOverFieldChange.revision ?? overTagged.revision,
					revisionMetadata,
				);

				if (finalOverFieldChange.newContent !== undefined) {
					const overContent = finalOverFieldChange.newContent;
					restoredRollbackChangeId = {
						revision: overIntention,
						localId: finalOverFieldChange.id,
					};
					if ("revert" in overContent) {
						restoredUndoChangeId = overContent.revert;
					}
				}
			}

			for (const [id, childChange] of change.childChanges) {
				if (id === "self") {
					// Rationale: when rebasing over a composition, changes to "self" should be rebased over the aggregate changes
					// to the first removal. This assumes the list is ordered, which needs review.
					// const overChildChange = overChildChanges.get(id) ?? over.childChanges?.[0][1];
					const overChildChange = overChildChanges.get(
						firstOverFieldChange !== undefined
							? {
									revision: firstOverFieldChange.revision ?? overTagged.revision,
									localId: firstOverFieldChange.id,
							  }
							: id,
					);
					if (
						finalOverFieldChange === undefined ||
						// TODO: Logic here seems wonky/wrong. The idea behind it is solid (comment inside the block), but implementation doesn't seem to quite track.
						(restoredUndoChangeId !== undefined &&
							firstOverFieldChange !== undefined &&
							areEqualChangeAtomIds(restoredUndoChangeId, {
								revision: firstOverFieldChange.revision,
								localId: firstOverFieldChange.id,
							}))
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
							perChildChanges.set(
								{
									// TODO: Document this choice. This isn't really the revision that deleted the node, but
									// the one that puts it back such that if we later ressurect it, the child changes will
									// apply to it... this matches what the previous code/format did, but it's not well-documented
									// why it's the right choice.
									// See the "can rebase a node replacement and a dependent edit to the new node" test case.
									// This might be making assumptions on sandwich rebasing a la rollback tags (which could be
									// an obstacle for postbase)
									revision: getIntention(
										firstOverFieldChange?.revision ?? overTagged.revision,
										revisionMetadata,
									),
									localId: firstOverFieldChange.id,
								},
								rebasedChild,
							);
						}
					}
				} else {
					if (
						(restoredRollbackChangeId !== undefined &&
							areEqualChangeIds(id, restoredRollbackChangeId)) ||
						(restoredUndoChangeId !== undefined &&
							areEqualChangeIds(id, restoredUndoChangeId))
					) {
						// childChange refers to changes to node being revived by `over`.
						const overChange = finalOverFieldChange?.newContent?.changes;
						const rebasedChild = rebaseChild(
							childChange,
							overChange,
							NodeExistenceState.Alive,
						);
						if (rebasedChild !== undefined) {
							perChildChanges.set("self", rebasedChild);
						}
					} else {
						// childChange refers to changes to node removed by some past revision. Rebase over any changes that
						// `over` has to that same revision.
						const overChange = overChildChanges.get(id);
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
			activeFieldChange: change.activeFieldChange,
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
		activeFieldChange: "end",
	}),

	clear: (wasEmpty: boolean, id: ChangesetLocalId): OptionalChangeset => ({
		fieldChanges: [{ id, wasEmpty }],
		activeFieldChange: "end",
	}),

	buildChildChange: (index: number, childChange: NodeChangeset): OptionalChangeset => {
		assert(index === 0, 0x404 /* Optional fields only support a single child node */);
		return {
			fieldChanges: [],
			childChanges: [["self", childChange]],
			activeFieldChange: "start",
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
	const [_, childChange] = change.childChanges?.find(([changeId]) => changeId === "self") ?? [];
	if (childChange === undefined && change.fieldChanges.length === 0) {
		return delta;
	}

	const mark: Mutable<Delta.Mark> = { count: 1 };
	delta.local = [mark];

	if (childChange !== undefined) {
		mark.fields = deltaFromChild(childChange);
	}

	if (change.fieldChanges.length === 0 || change.activeFieldChange === "start") {
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
		if (update.changes !== undefined) {
			const fields = deltaFromChild(update.changes);
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

function areEqualChangeIds(a: ChangeId, b: ChangeId): boolean {
	if (typeof a === "string" || typeof b === "string") {
		return a === b;
	}

	return areEqualChangeAtomIds(a, b);
}
