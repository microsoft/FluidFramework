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
import { fail, Mutable, IdAllocator, SizedNestedMap } from "../../util";
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
	RemovedTreesFromChild,
} from "../modular-schema";
import { nodeIdFromChangeAtom } from "../deltaUtils";
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

		let fieldChange: Mutable<OptionalFieldChange> | undefined;
		let currentChildNodeChanges: TaggedChange<NodeChangeset>[] = [];
		let index = 0;
		for (const { change, revision } of changes) {
			const fieldChangeInfo = revisionMetadata.tryGetInfo(
				revision ?? change.fieldChange?.revision,
			);
			const { childChanges } = change;
			if (childChanges !== undefined) {
				for (const [childId, childChange] of childChanges) {
					const taggedChildChange = tagChange(childChange, revision);
					if (childId === "self") {
						// childChange refers to the node that existed at the start of `change`,
						// Thus in the composition, it should be referred to by whatever deletes that node in the future, which is what
						// currentChildNodeChanges tracks
						currentChildNodeChanges.push(taggedChildChange);
					} else {
						addChildChange(childId, taggedChildChange);
					}
				}
			}

			if (change.fieldChange !== undefined) {
				if (fieldChange === undefined) {
					fieldChange = {
						id: change.fieldChange.id,
						revision: fieldChangeInfo?.revision,
						wasEmpty: change.fieldChange.wasEmpty,
					};
				} else {
					fieldChange.id = change.fieldChange.id;
					fieldChange.revision = fieldChangeInfo?.revision;
				}

				let hasMatchingPriorInverse = false;
				const maybePriorInverse = changes.findIndex((c) => {
					const cChangeInfo = revisionMetadata.tryGetInfo(
						// Change c may be a composite, in which case we need to look the revision of the fieldChange
						c.revision ?? c.change.fieldChange?.revision,
					);
					return (
						(cChangeInfo?.rollbackOf !== undefined &&
							cChangeInfo?.rollbackOf === fieldChangeInfo?.revision) ||
						(cChangeInfo?.revision !== undefined &&
							cChangeInfo?.revision === fieldChangeInfo?.rollbackOf)
					);
				});
				hasMatchingPriorInverse = maybePriorInverse !== -1 && maybePriorInverse < index;

				if (change.fieldChange.newContent !== undefined) {
					if (hasMatchingPriorInverse) {
						fieldChange = undefined;
					} else {
						fieldChange.newContent = { ...change.fieldChange.newContent };
					}
				} else {
					if (hasMatchingPriorInverse) {
						fieldChange = undefined;
					} else {
						delete fieldChange.newContent;
					}
				}

				// Node was changed by this revision: flush the current changes
				if (currentChildNodeChanges.length > 0) {
					addChildChange(
						{ revision, localId: change.fieldChange.id },
						...currentChildNodeChanges,
					);
					currentChildNodeChanges = [];
				}

				if (change.fieldChange.newContent?.changes !== undefined) {
					currentChildNodeChanges.push(
						tagChange(change.fieldChange.newContent.changes, fieldChangeInfo?.revision),
					);
				}
			}
			index++;
		}

		if (currentChildNodeChanges.length > 0) {
			if (fieldChange !== undefined) {
				assert(
					fieldChange.newContent !== undefined,
					0x772 /* after node must be defined to receive changes */,
				);
				fieldChange.newContent.changes = composeChild(currentChildNodeChanges);
			} else {
				addChildChange("self", ...currentChildNodeChanges);
			}
		}

		const composed: OptionalChangeset = {};

		if (fieldChange !== undefined) {
			composed.fieldChange = fieldChange;
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
		// Changes to the child that existed in this field before `change` was applied.
		let originalChildChanges: NodeChangeset | undefined;
		const inverseChildChanges = new ChildChangeMap<NodeChangeset>();
		if (change.childChanges !== undefined) {
			for (const [id, childChange] of change.childChanges) {
				if (id === "self" && change.fieldChange !== undefined) {
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

		const selfChanges = change.fieldChange?.newContent?.changes;
		if (selfChanges !== undefined) {
			inverseChildChanges.set("self", invertChild(selfChanges, 0));
		}

		const inverse: OptionalChangeset = {
			childChanges:
				inverseChildChanges.size > 0
					? Array.from(inverseChildChanges.entries())
					: undefined,
		};

		const { fieldChange } = change;
		if (fieldChange !== undefined) {
			// `change` replaces the node in the field
			inverse.fieldChange = {
				id: fieldChange.id,
				wasEmpty: fieldChange.newContent === undefined,
			};

			if (!fieldChange.wasEmpty) {
				assert(revision !== undefined, 0x592 /* Unable to revert to undefined revision */);
				inverse.fieldChange.newContent = {
					revert: { revision, localId: fieldChange.id },
					changes: originalChildChanges,
				};
			}
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
			if (over.fieldChange !== undefined) {
				const overIntention = getIntention(
					over.fieldChange.revision ?? overTagged.revision,
					revisionMetadata,
				);

				if (over.fieldChange.newContent !== undefined) {
					const overContent = over.fieldChange.newContent;
					restoredRollbackChangeId = {
						revision: overIntention,
						localId: over.fieldChange.id,
					};
					if ("revert" in overContent) {
						restoredUndoChangeId = overContent.revert;
					}
				}
			}

			for (const [id, childChange] of change.childChanges) {
				if (id === "self") {
					const overChildChange = overChildChanges.get(id);
					if (over.fieldChange !== undefined) {
						// `childChange` refers to the node existing in this field before rebasing, but
						// that node was removed by `over`.
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
										over.fieldChange?.revision ?? overTagged.revision,
										revisionMetadata,
									),
									localId: over.fieldChange.id,
								},
								rebasedChild,
							);
						}
					} else {
						// `over` didn't remove the node (its fieldChange is undefined)
						const rebasedChild = rebaseChild(
							childChange,
							overChildChange,
							NodeExistenceState.Alive,
						);
						if (rebasedChild !== undefined) {
							perChildChanges.set(id, rebasedChild);
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
						const overChange = over.fieldChange?.newContent?.changes;
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
		if (change.fieldChange !== undefined) {
			if (over.fieldChange !== undefined) {
				const wasEmpty = over.fieldChange.newContent === undefined;
				fieldChange = { ...change.fieldChange, wasEmpty };
			} else {
				fieldChange = change.fieldChange;
			}
		}

		const rebased: OptionalChangeset = {};
		if (fieldChange !== undefined) {
			rebased.fieldChange = fieldChange;
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
		fieldChange: {
			id,
			newContent: {
				set: jsonableTreeFromCursor(newContent),
				buildId: { localId: buildId },
			},
			wasEmpty,
		},
	}),

	clear: (wasEmpty: boolean, id: ChangesetLocalId): OptionalChangeset => ({
		fieldChange: { id, wasEmpty },
	}),

	buildChildChange: (index: number, childChange: NodeChangeset): OptionalChangeset => {
		assert(index === 0, 0x404 /* Optional fields only support a single child node */);
		return { childChanges: [["self", childChange]] };
	},
};

export function optionalFieldIntoDelta(
	{ change, revision }: TaggedChange<OptionalChangeset>,
	deltaFromChild: ToDelta,
): Delta.FieldChanges {
	const delta: Mutable<Delta.FieldChanges> = {};
	const [_, childChange] = change.childChanges?.find(([changeId]) => changeId === "self") ?? [];
	if (childChange === undefined && change.fieldChange === undefined) {
		return delta;
	}

	const mark: Mutable<Delta.Mark> = { count: 1 };
	delta.local = [mark];

	if (childChange !== undefined) {
		mark.fields = deltaFromChild(childChange);
	}

	if (change.fieldChange === undefined) {
		return delta;
	}

	if (!change.fieldChange.wasEmpty) {
		const detachId = {
			major: change.fieldChange.revision ?? revision,
			minor: change.fieldChange.id,
		};
		mark.detach = detachId;
	}

	const update = change.fieldChange.newContent;
	if (update === undefined) {
		// The field is being cleared
	} else {
		if (Object.prototype.hasOwnProperty.call(update, "set")) {
			const setUpdate = update as { set: JsonableTree; buildId: ChangeAtomId };
			const content = [singleTextCursor(setUpdate.set)];
			const buildId = makeDetachedNodeId(
				setUpdate.buildId.revision ?? change.fieldChange.revision ?? revision,
				setUpdate.buildId.localId,
			);
			mark.attach = buildId;
			delta.build = [{ id: buildId, trees: content }];
		} else {
			const changeId = (update as { revert: ChangeAtomId }).revert;
			mark.attach = makeDetachedNodeId(changeId.revision, changeId.localId);
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
	relevantRemovedTrees,

	isEmpty: (change: OptionalChangeset) =>
		change.childChanges === undefined && change.fieldChange === undefined,
};

function areEqualChangeIds(a: ChangeId, b: ChangeId): boolean {
	if (typeof a === "string" || typeof b === "string") {
		return a === b;
	}

	return areEqualChangeAtomIds(a, b);
}

function* relevantRemovedTrees(
	change: OptionalChangeset,
	removedTreesFromChild: RemovedTreesFromChild,
): Iterable<Delta.DetachedNodeId> {
	let removedNode: ChangeAtomId | undefined;
	let restoredNode: ChangeAtomId | undefined;
	const fieldChange = change.fieldChange;
	if (fieldChange !== undefined) {
		removedNode = { revision: fieldChange.revision, localId: fieldChange.id };
		const newContent = fieldChange.newContent;
		if (newContent !== undefined) {
			if (Object.prototype.hasOwnProperty.call(newContent, "revert")) {
				// This tree is being restored by this change, so it is a relevant removed tree.
				restoredNode = (newContent as { revert: ChangeAtomId }).revert;
				yield nodeIdFromChangeAtom(restoredNode);
			}
			if (newContent.changes !== undefined) {
				yield* removedTreesFromChild(newContent.changes);
			}
		}
	}
	if (change.childChanges !== undefined) {
		for (const [deletedBy, child] of change.childChanges) {
			if (
				deletedBy === "self" ||
				(removedNode !== undefined && areEqualChangeIds(deletedBy, removedNode))
			) {
				// This node is in the document at the time this change applies, so it isn't a relevant removed tree.
			} else {
				if (restoredNode !== undefined && areEqualChangeIds(deletedBy, restoredNode)) {
					// This tree is a relevant removed tree, but it is already included in the list
				} else {
					// This tree is being edited by this change, so it is a relevant removed tree.
					yield nodeIdFromChangeAtom(deletedBy);
				}
			}
			yield* removedTreesFromChild(child);
		}
	}
}
