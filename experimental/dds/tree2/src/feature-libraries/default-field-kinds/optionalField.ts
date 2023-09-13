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
} from "../../core";
import { fail, IdAllocator, Mutable } from "../../util";
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

export const optionalChangeRebaser: FieldChangeRebaser<OptionalChangeset> = {
	compose: (
		changes: TaggedChange<OptionalChangeset>[],
		composeChild: NodeChangeComposer,
	): OptionalChangeset => {
		let fieldChange: Mutable<OptionalFieldChange> | undefined;
		const origNodeChange: TaggedChange<NodeChangeset>[] = [];
		const newNodeChanges: TaggedChange<NodeChangeset>[] = [];
		for (const { change, revision } of changes) {
			if (change.deletedBy === undefined && change.childChange !== undefined) {
				const taggedChange = tagChange(change.childChange, revision);
				if (fieldChange === undefined) {
					origNodeChange.push(taggedChange);
				} else {
					newNodeChanges.push(taggedChange);
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

				// The previous changes applied to a different value, so we discard them.
				// TODO: Represent muted changes
				newNodeChanges.length = 0;

				if (change.fieldChange.newContent?.changes !== undefined) {
					newNodeChanges.push(tagChange(change.fieldChange.newContent.changes, revision));
				}
			}
		}

		const composed: OptionalChangeset = {};
		if (fieldChange !== undefined) {
			if (newNodeChanges.length > 0) {
				assert(
					fieldChange.newContent !== undefined,
					0x5c4 /* Shouldn't have new node changes if there is no new node */,
				);
				fieldChange.newContent.changes = composeChild(newNodeChanges);
			}
			composed.fieldChange = fieldChange;
		}

		if (origNodeChange.length > 0) {
			composed.childChange = composeChild(origNodeChange);
		}

		return composed;
	},

	amendCompose: () => fail("Not implemented"),

	invert: (
		{ revision, change }: TaggedChange<OptionalChangeset>,
		invertChild: NodeChangeInverter,
		reviver: NodeReviver,
	): OptionalChangeset => {
		const inverse: OptionalChangeset = {};

		const fieldChange = change.fieldChange;
		if (fieldChange !== undefined) {
			inverse.fieldChange = {
				id: fieldChange.id,
				wasEmpty: fieldChange.newContent === undefined,
			};
			if (fieldChange.newContent?.changes !== undefined) {
				// The node inserted by change will be the node deleted by inverse
				// Move the inverted changes to the child change field
				inverse.childChange = invertChild(fieldChange.newContent.changes, 0);
			}

			if (!fieldChange.wasEmpty) {
				assert(revision !== undefined, 0x592 /* Unable to revert to undefined revision */);
				inverse.fieldChange.newContent = {
					revert: reviver(revision, 0, 1)[0],
					changeId: { revision, localId: fieldChange.id },
				};
				if (change.childChange !== undefined) {
					if (change.deletedBy === undefined) {
						inverse.fieldChange.newContent.changes = invertChild(change.childChange, 0);
					} else {
						// We currently drop the muted changes in the inverse.
						// TODO: produce muted inverse changes so that a retroactive undo of revision
						// `change.deletedBy` would be able to pick up and unmute those changes.
					}
				}
			}
		} else {
			if (change.childChange !== undefined && change.deletedBy === undefined) {
				inverse.childChange = invertChild(change.childChange, 0);
			} else {
				// Drop the muted changes if deletedBy is set to avoid
				// applying muted changes on undo
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
	): OptionalChangeset => {
		const over = overTagged.change;
		if (change.fieldChange !== undefined) {
			if (over.fieldChange !== undefined) {
				const wasEmpty = over.fieldChange.newContent === undefined;

				// TODO: Handle rebasing child changes over `over.childChange`.
				return {
					...change,
					fieldChange: { ...change.fieldChange, wasEmpty },
				};
			}

			const rebasedChange = { ...change };
			const overChildChange =
				change.deletedBy === over.deletedBy ? over.childChange : undefined;
			const rebasedChildChange = rebaseChild(change.childChange, overChildChange);
			if (rebasedChildChange !== undefined) {
				rebasedChange.childChange = rebasedChildChange;
			} else {
				delete rebasedChange.childChange;
			}

			return rebasedChange;
		}

		if (change.childChange !== undefined) {
			if (over.fieldChange !== undefined) {
				const overIntention = getIntention(
					over.fieldChange.revision ?? overTagged.revision,
					revisionMetadata,
				);
				if (change.deletedBy === undefined) {
					// `change.childChange` refers to the node being deleted by `over`.
					return {
						childChange: rebaseChild(
							change.childChange,
							over.deletedBy === undefined ? undefined : over.childChange,
							NodeExistenceState.Dead,
						),
						deletedBy: {
							revision: overIntention,
							localId: over.fieldChange.id,
						},
					};
				} else if (over.fieldChange.newContent !== undefined) {
					const overContent = over.fieldChange.newContent;
					const rebasingOverRollback =
						overIntention === change.deletedBy.revision &&
						over.fieldChange.id === change.deletedBy.localId;
					const rebasingOverUndo =
						"revert" in overContent &&
						overContent.changeId.revision === change.deletedBy.revision &&
						overContent.changeId.localId === change.deletedBy.localId;
					if (rebasingOverRollback || rebasingOverUndo) {
						// Over is reviving the node that change.childChange is referring to.
						// Rebase change.childChange and remove deletedBy
						// because we revived the node that childChange refers to
						return {
							childChange: rebaseChild(
								change.childChange,
								overContent.changes,
								NodeExistenceState.Alive,
							),
						};
					}
				}
			}
		}

		{
			const rebasedChange = { ...change };

			let overChildChange: NodeChangeset | undefined;
			if (change.deletedBy === undefined && over.deletedBy === undefined) {
				overChildChange = over.childChange;
			}

			const rebasedChildChange = rebaseChild(change.childChange, overChildChange);
			if (rebasedChildChange !== undefined) {
				rebasedChange.childChange = rebasedChildChange;
			} else {
				delete rebasedChange.childChange;
			}

			return rebasedChange;
		}
	},

	amendRebase: (
		change: OptionalChangeset,
		overTagged: TaggedChange<OptionalChangeset>,
		rebaseChild: NodeChangeRebaser,
	) => {
		const amendedChildChange = rebaseChild(change.childChange, overTagged.change.childChange);
		const amended = { ...change };
		if (amendedChildChange !== undefined) {
			amended.childChange = amendedChildChange;
		} else {
			delete amended.childChange;
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
		return { childChange };
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
	if (change.fieldChange === undefined) {
		if (change.deletedBy === undefined && change.childChange !== undefined) {
			return [deltaFromChild(change.childChange)];
		}
		return [];
	}

	const deleteDelta = deltaForDelete(
		!change.fieldChange.wasEmpty,
		change.deletedBy === undefined ? change.childChange : undefined,
		deltaFromChild,
	);

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
		change.childChange === undefined && change.fieldChange === undefined,
};
