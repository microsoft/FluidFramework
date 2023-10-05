/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	Delta,
	ITreeCursor,
	TaggedChange,
	ITreeCursorSynchronous,
	tagChange,
	ChangesetLocalId,
	ChangeAtomId,
	RevisionTag,
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
	NodeReviver,
	CrossFieldManager,
	RevisionMetadataSource,
	getIntention,
	NodeExistenceState,
	FieldChangeHandler,
} from "../modular-schema";
import { populateChildModifications } from "../deltaUtils";
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
		for (const { change, revision } of changes) {
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
						revision: change.fieldChange.revision ?? revision,
						wasEmpty: change.fieldChange.wasEmpty,
					};
				} else {
					fieldChange.id = change.fieldChange.id;
					fieldChange.revision = change.fieldChange.revision ?? revision;
				}

				if (change.fieldChange.newContent !== undefined) {
					fieldChange.newContent = { ...change.fieldChange.newContent };
				} else {
					delete fieldChange.newContent;
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
						tagChange(change.fieldChange.newContent.changes, revision),
					);
				}
			}
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
		reviver: NodeReviver,
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
					revert: reviver(revision, 0, 1)[0],
					changeId: { revision, localId: fieldChange.id },
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
						restoredUndoChangeId = overContent.changeId;
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
	 * @param id - the ID associated with the change.
	 */
	set(
		newContent: ITreeCursor | undefined,
		wasEmpty: boolean,
		id: ChangesetLocalId,
	): OptionalChangeset;
}

export const optionalFieldEditor: OptionalFieldEditor = {
	set: (
		newContent: ITreeCursor | undefined,
		wasEmpty: boolean,
		id: ChangesetLocalId,
	): OptionalChangeset => ({
		fieldChange: {
			id,
			newContent:
				newContent === undefined
					? undefined
					: {
							set: jsonableTreeFromCursor(newContent),
					  },
			wasEmpty,
		},
	}),

	buildChildChange: (index: number, childChange: NodeChangeset): OptionalChangeset => {
		assert(index === 0, 0x404 /* Optional fields only support a single child node */);
		return { childChanges: [["self", childChange]] };
	},
};

function deltaFromInsertAndChange(
	insertedContent: ITreeCursorSynchronous | undefined,
	nodeChange: NodeChangeset | undefined,
	deltaFromNode: ToDelta,
): Delta.Mark[] {
	if (insertedContent !== undefined) {
		const insert: Mutable<Delta.Insert> = {
			type: Delta.MarkType.Insert,
			content: [insertedContent],
		};
		if (nodeChange !== undefined) {
			const nodeDelta = deltaFromNode(nodeChange);
			populateChildModifications(nodeDelta, insert);
		}
		return [insert];
	}

	if (nodeChange !== undefined) {
		return [deltaFromNode(nodeChange)];
	}

	return [];
}

function deltaForDelete(
	nodeExists: boolean,
	nodeChange: NodeChangeset | undefined,
	deltaFromNode: ToDelta,
): Delta.Mark[] {
	if (!nodeExists) {
		return [];
	}

	const deleteDelta: Mutable<Delta.Delete> = { type: Delta.MarkType.Delete, count: 1 };
	if (nodeChange !== undefined) {
		const modify = deltaFromNode(nodeChange);
		deleteDelta.fields = modify.fields;
	}
	return [deleteDelta];
}

export function optionalFieldIntoDelta(change: OptionalChangeset, deltaFromChild: ToDelta) {
	const [_, childChange] = change.childChanges?.find(([id]) => id === "self") ?? [];
	if (change.fieldChange === undefined) {
		return childChange !== undefined ? [deltaFromChild(childChange)] : [];
	}

	const deleteDelta = deltaForDelete(!change.fieldChange.wasEmpty, childChange, deltaFromChild);

	const update = change.fieldChange?.newContent;
	let content: ITreeCursorSynchronous | undefined;
	if (update === undefined) {
		content = undefined;
	} else if ("set" in update) {
		content = singleTextCursor(update.set);
	} else {
		content = update.revert;
	}

	const insertDelta = deltaFromInsertAndChange(content, update?.changes, deltaFromChild);

	return [...deleteDelta, ...insertDelta];
}

export const optionalChangeHandler: FieldChangeHandler<OptionalChangeset, OptionalFieldEditor> = {
	rebaser: optionalChangeRebaser,
	codecsFactory: makeOptionalFieldCodecFamily,
	editor: optionalFieldEditor,

	intoDelta: ({ change }: TaggedChange<OptionalChangeset>, deltaFromChild: ToDelta) =>
		optionalFieldIntoDelta(change, deltaFromChild),
	isEmpty: (change: OptionalChangeset) =>
		change.childChanges === undefined && change.fieldChange === undefined,
};

function areEqualChangeIds(a: ChangeId, b: ChangeId): boolean {
	if (typeof a === "string" || typeof b === "string") {
		return a === b;
	}

	return a.revision === b.revision && a.localId === b.localId;
}
