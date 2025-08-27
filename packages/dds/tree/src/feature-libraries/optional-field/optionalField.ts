/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	type ChangeAtomId,
	type ChangesetLocalId,
	type DeltaFieldChanges,
	type DeltaMark,
	type RevisionTag,
	areEqualChangeAtomIdOpts,
	makeChangeAtomId,
	replaceAtomRevisions,
} from "../../core/index.js";
import type { IdAllocator, Mutable } from "../../util/index.js";
import { nodeIdFromChangeAtom } from "../deltaUtils.js";
import {
	type FieldChangeHandler,
	type FieldChangeRebaser,
	type FieldEditor,
	type NodeChangeComposer,
	type NodeChangePruner,
	type NodeChangeRebaser,
	type NodeId,
	type ToDelta,
	type NestedChangesIndices,
	type RebaseNodeManager,
	type ComposeNodeManager,
	type InvertNodeManager,
	type CrossFieldKeyRange,
	CrossFieldTarget,
} from "../modular-schema/index.js";

import type { OptionalChangeset, Replace } from "./optionalFieldChangeTypes.js";
import { makeOptionalFieldCodecFamily } from "./optionalFieldCodecs.js";

const useCompatMode: boolean = true;

export const optionalChangeRebaser: FieldChangeRebaser<OptionalChangeset> = {
	compose,
	invert: (
		change: OptionalChangeset,
		isRollback: boolean,
		genId: IdAllocator<ChangesetLocalId>,
		revision: RevisionTag | undefined,
		nodeManager: InvertNodeManager,
	): OptionalChangeset => {
		const inverted: Mutable<OptionalChangeset> = {};
		const detachId = getEffectiveDetachId(change);

		if (detachId !== undefined) {
			const attachIdForInverse = isRollback
				? detachId
				: makeChangeAtomId(detachId.localId, revision);

			nodeManager.invertDetach(detachId, 1, change.childChange, attachIdForInverse);

			inverted.valueReplace = {
				isEmpty: change.valueReplace?.src === undefined,
				dst: makeChangeAtomId(genId.allocate(), revision),
				src: attachIdForInverse,
			};
		}

		if (change.valueReplace?.src !== undefined) {
			const attachEntry = nodeManager.invertAttach(change.valueReplace.src, 1);
			const detachIdForInverse = invertAttachId(
				change.valueReplace.src,
				revision,
				isRollback,
				attachEntry.value?.detachId,
			);

			if (attachEntry.value?.nodeChange !== undefined) {
				inverted.childChange = attachEntry.value.nodeChange;
			}

			// TODO: Use nodeDetach instead of valueReplace if not supporting older client versions.
			// inverted.nodeDetach = detachIdForInverse;
			if (inverted.valueReplace !== undefined) {
				(inverted.valueReplace as Mutable<Replace>).dst = detachIdForInverse;
			} else {
				inverted.valueReplace = { isEmpty: false, dst: detachIdForInverse };
			}
		} else if (detachId === undefined && change.childChange !== undefined) {
			// This change does not affect which node is in the field, so its child change should remain here.
			inverted.childChange = change.childChange;
		}

		return inverted;
	},

	rebase: (
		newChange: OptionalChangeset,
		overChange: OptionalChangeset,
		rebaseChild: NodeChangeRebaser,
		_genId: IdAllocator,
		nodeManager: RebaseNodeManager,
	): OptionalChangeset => {
		const rebased: Mutable<OptionalChangeset> = {};

		const rebasedChild = rebaseChild(newChange.childChange, overChange.childChange);
		const overDetach = getEffectiveDetachId(overChange);
		if (overDetach !== undefined) {
			nodeManager.rebaseOverDetach(overDetach, 1, newChange.nodeDetach, rebasedChild);
		}

		const overAttach = overChange.valueReplace?.src;
		if (overAttach !== undefined) {
			const movedChangeEntry = nodeManager.getNewChangesForBaseAttach(overAttach, 1).value;

			if (movedChangeEntry?.nodeChange !== undefined) {
				rebased.childChange = movedChangeEntry.nodeChange;
			}

			if (movedChangeEntry?.detachId !== undefined) {
				rebased.nodeDetach = movedChangeEntry.detachId;
			}
		} else if (overDetach === undefined) {
			// `overChange` did not change which node is in the field.
			if (rebasedChild !== undefined) {
				rebased.childChange = rebasedChild;
			}

			if (newChange.nodeDetach !== undefined) {
				rebased.nodeDetach = newChange.nodeDetach;
			}
		}

		if (newChange.valueReplace !== undefined) {
			const isEmpty =
				overDetach !== undefined || overChange.valueReplace !== undefined
					? overChange.valueReplace?.src === undefined
					: newChange.valueReplace.isEmpty;

			rebased.valueReplace = { ...newChange.valueReplace, isEmpty };
		}

		const detachId = getEffectiveDetachId(newChange);
		if (detachId !== undefined) {
			nodeManager.removeDetach(detachId, 1);
		}

		const rebasedDetachId = getEffectiveDetachId(rebased);
		if (rebasedDetachId !== undefined) {
			nodeManager.addDetach(rebasedDetachId, 1);
		}

		assert(
			!useCompatMode ||
				rebased.nodeDetach === undefined ||
				areEqualChangeAtomIdOpts(rebased.nodeDetach, rebased.valueReplace?.src),
			"When supporting older clients, nodeDetach should only be used for pins",
		);
		return rebased;
	},

	prune: (change: OptionalChangeset, pruneChild: NodeChangePruner): OptionalChangeset => {
		const prunedChange: Mutable<OptionalChangeset> = { ...change };

		delete prunedChange.childChange;
		if (change.childChange !== undefined) {
			const childChange = pruneChild(change.childChange);
			if (childChange !== undefined) {
				prunedChange.childChange = childChange;
			}
		}

		return prunedChange;
	},

	replaceRevisions: (
		change: OptionalChangeset,
		oldRevisions: Set<RevisionTag | undefined>,
		newRevision: RevisionTag | undefined,
	): OptionalChangeset => {
		const updated: Mutable<OptionalChangeset> = {};

		if (change.childChange !== undefined) {
			updated.childChange = replaceAtomRevisions(
				change.childChange,
				oldRevisions,
				newRevision,
			);
		}

		if (change.valueReplace !== undefined) {
			updated.valueReplace = replaceReplaceRevisions(
				change.valueReplace,
				oldRevisions,
				newRevision,
			);
		}

		if (change.nodeDetach !== undefined) {
			updated.nodeDetach = replaceAtomRevisions(change.nodeDetach, oldRevisions, newRevision);
		}

		return updated;
	},
};

function compose(
	change1: OptionalChangeset,
	change2: OptionalChangeset,
	composeChild: NodeChangeComposer,
	_genId: IdAllocator,
	nodeManager: ComposeNodeManager,
): OptionalChangeset {
	const detachId2 = getEffectiveDetachId(change2);
	if (change1.valueReplace?.src !== undefined && detachId2 !== undefined) {
		nodeManager.composeAttachDetach(change1.valueReplace.src, detachId2, 1);
	}

	const composedDetach = composeNodeDetaches(change1, change2, nodeManager);
	const composedReplace = composeReplaces(change1, change2);
	if (useCompatMode && composedReplace !== undefined && composedDetach !== undefined) {
		(composedReplace as Mutable<Replace>).dst = composedDetach;
	}

	const composedChildChange = getComposedChildChanges(
		change1,
		change2,
		nodeManager,
		composeChild,
	);

	sendNewChildChanges(change1, change2, nodeManager);

	if (
		change1.nodeDetach !== undefined &&
		areEqualChangeAtomIdOpts(change1.nodeDetach, change2.valueReplace?.src)
	) {
		nodeManager.composeDetachAttach(change1.nodeDetach, change1.nodeDetach, 1, false);
		return makeChangeset(undefined, undefined, composedChildChange);
	}

	return makeChangeset(
		composedReplace,
		useCompatMode ? undefined : composedDetach,
		composedChildChange,
	);
}

function composeNodeDetaches(
	change1: OptionalChangeset,
	change2: OptionalChangeset,
	nodeManager: ComposeNodeManager,
): ChangeAtomId | undefined {
	const detach1 = getEffectiveDetachId(change1);
	if (detach1 !== undefined) {
		const newDetachId = nodeManager.getNewChangesForBaseDetach(detach1, 1).value?.detachId;
		if (newDetachId !== undefined) {
			return newDetachId;
		}
	}

	if (change1.nodeDetach !== undefined) {
		return change1.nodeDetach;
	}

	return detach1 !== undefined || change1.valueReplace?.isEmpty === true
		? undefined
		: change2.nodeDetach;
}

function composeReplaces(
	change1: OptionalChangeset,
	change2: OptionalChangeset,
): Replace | undefined {
	const firstReplace = change1.valueReplace ?? change2.valueReplace;
	if (firstReplace === undefined) {
		return undefined;
	}

	const isEmpty = change1.nodeDetach !== undefined ? false : firstReplace.isEmpty;
	const replace: Mutable<Replace> = { isEmpty, dst: firstReplace.dst };
	if (change2.valueReplace?.src !== undefined) {
		replace.src = change2.valueReplace.src;
	} else if (
		getEffectiveDetachId(change2) === undefined &&
		change1.valueReplace?.src !== undefined
	) {
		replace.src = change1.valueReplace.src;
	}

	return replace;
}

/**
 * Informs the node manager of any child changes in `change2` that may need to be represented somewhere else in the input context of the composed changeset.
 * See {@link ComposeNodeManager.sendNewChangesToBaseSourceLocation} for motivation.
 * @param change1 - The first change to compose. Conceptually applies before `change2`.
 * @param change2 - The second change to compose. Conceptually applies after `change1`.
 * @param nodeManager - The node manager that needs to be informed of the child changes.
 */
function sendNewChildChanges(
	change1: OptionalChangeset,
	change2: OptionalChangeset,
	nodeManager: ComposeNodeManager,
): void {
	if (change2.childChange !== undefined && change1.valueReplace?.src !== undefined) {
		// The presence of new child implies that there is some node present in the field in the input context of change2.
		// The fact that the change1 has a shallow effect implies that this node was attached by change1.
		nodeManager.sendNewChangesToBaseSourceLocation(
			change1.valueReplace.src,
			change2.childChange,
		);
	}
}

/**
 * Computes the child changes that should be included in the composed changeset.
 * @param change1 - The first change to compose. Conceptually applies before `change2`.
 * @param change2 - The second change to compose. Conceptually applies after `change1`.
 * @param nodeManager - The node manager. Provides information about potential child changes from `change2`.
 * @param composeChild - The delegate to compose child changes.
 * @returns The composed child changes (if any) for the node (if any) present in the field in the input context of `change1`.
 */
function getComposedChildChanges(
	change1: OptionalChangeset,
	change2: OptionalChangeset,
	nodeManager: ComposeNodeManager,
	composeChild: NodeChangeComposer,
): NodeId | undefined {
	const detachId1 = getEffectiveDetachId(change1);

	// We need to determine what the child changes are in change2 for the node (if any) that resides in the field in the input context of change1.
	const childChangesFromChange2: NodeId | undefined =
		// If such a node did exist, the changes for it in change2 would come from wherever change1 sends that node.
		// Note: in both branches of this ternary, we are leveraging the fact querying for changes of a non-existent node safely yields undefined
		detachId1 !== undefined
			? nodeManager.getNewChangesForBaseDetach(detachId1, 1).value?.nodeChange
			: change1.valueReplace?.src !== undefined
				? undefined
				: change2.childChange;

	let composedChildChange: NodeId | undefined;
	if (change1.childChange !== undefined || childChangesFromChange2 !== undefined) {
		composedChildChange = composeChild(change1.childChange, childChangesFromChange2);
	}
	return composedChildChange;
}

function makeChangeset(
	replace: Replace | undefined,
	detachId: ChangeAtomId | undefined,
	childChange: NodeId | undefined,
): OptionalChangeset {
	const changeset: Mutable<OptionalChangeset> = {};
	if (replace !== undefined) {
		changeset.valueReplace = replace;
	}

	if (detachId !== undefined) {
		changeset.nodeDetach = detachId;
	}

	if (childChange !== undefined) {
		changeset.childChange = childChange;
	}
	return changeset;
}

function replaceReplaceRevisions(
	replace: Replace,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): Replace {
	const updated: Mutable<Replace> = {
		...replace,
		dst: replaceAtomRevisions(replace.dst, oldRevisions, newRevision),
	};

	if (replace.src !== undefined) {
		updated.src = replaceAtomRevisions(replace.src, oldRevisions, newRevision);
	}

	return updated;
}

function getEffectiveDetachId(change: OptionalChangeset): ChangeAtomId | undefined {
	if (change.nodeDetach !== undefined) {
		return change.nodeDetach;
	}

	return change.valueReplace?.isEmpty === false ? change.valueReplace.dst : undefined;
}

export interface OptionalFieldEditor extends FieldEditor<OptionalChangeset> {
	/**
	 * Creates a change which will replace the content already in the field (if any at the time the change applies)
	 * with new content.
	 * The content in the field will be moved to the `ids.detach` register.
	 * The content in the `ids.detach` register will be moved to into the field.
	 * @param wasEmpty - whether the field is empty when creating this change
	 * @param ids - the "fill" and "detach" ids associated with the change.
	 */
	set(
		wasEmpty: boolean,
		ids: {
			fill: ChangeAtomId;
			detach: ChangeAtomId;
			detachNode?: ChangeAtomId;
		},
	): OptionalChangeset;

	/**
	 * Creates a change which clears the field's contents (if any).
	 * @param wasEmpty - whether the field is empty when creating this change
	 * @param detachId - the ID of the register that existing field content (if any) will be moved to.
	 */
	clear(wasEmpty: boolean, detachId: ChangeAtomId): OptionalChangeset;
}

export const optionalFieldEditor: OptionalFieldEditor = {
	set: (
		wasEmpty: boolean,
		ids: {
			fill: ChangeAtomId;
			// Should be interpreted as a set of an empty field if undefined.
			detach: ChangeAtomId;
			detachNode?: ChangeAtomId;
		},
	): OptionalChangeset => ({
		valueReplace: {
			isEmpty: wasEmpty,
			src: ids.fill,
			dst: ids.detach,
		},
		nodeDetach: ids.detachNode,
	}),

	clear: (wasEmpty: boolean, detachId: ChangeAtomId): OptionalChangeset => ({
		valueReplace: {
			isEmpty: wasEmpty,
			dst: detachId,
		},
	}),

	buildChildChanges: (changes: Iterable<[number, NodeId]>): OptionalChangeset => {
		const childChanges: NodeId[] = Array.from(changes, ([index, child]) => {
			assert(index === 0, 0x404 /* Optional fields only support a single child node */);
			return child;
		});
		assert(
			childChanges.length <= 1,
			0xabd /* Optional fields only support a single child node */,
		);

		const childChange = childChanges[0];
		return childChange !== undefined ? { childChange } : {};
	},
};

export function optionalFieldIntoDelta(
	change: OptionalChangeset,
	deltaFromChild: ToDelta,
): DeltaFieldChanges {
	let markIsANoop = true;
	const mark: Mutable<DeltaMark> = { count: 1 };
	const detachId = getEffectiveDetachId(change);
	const attachId = change.valueReplace?.src;
	if (detachId !== undefined && !areEqualChangeAtomIdOpts(detachId, attachId)) {
		mark.detach = nodeIdFromChangeAtom(detachId);
		markIsANoop = false;
	}

	if (attachId !== undefined && !areEqualChangeAtomIdOpts(attachId, detachId)) {
		mark.attach = nodeIdFromChangeAtom(attachId);
		markIsANoop = false;
	}

	if (change.childChange !== undefined) {
		mark.fields = deltaFromChild(change.childChange);
		markIsANoop = false;
	}

	return !markIsANoop ? [mark] : [];
}

export const optionalChangeHandler: FieldChangeHandler<
	OptionalChangeset,
	OptionalFieldEditor
> = {
	rebaser: optionalChangeRebaser,
	codecsFactory: makeOptionalFieldCodecFamily,
	editor: optionalFieldEditor,

	intoDelta: optionalFieldIntoDelta,

	isEmpty: (change: OptionalChangeset) =>
		change.childChange === undefined &&
		change.valueReplace === undefined &&
		change.nodeDetach === undefined,

	getNestedChanges,

	createEmpty: () => ({}),
	getCrossFieldKeys,
};

function getCrossFieldKeys(change: OptionalChangeset): CrossFieldKeyRange[] {
	const keys: CrossFieldKeyRange[] = [];
	if (change.valueReplace?.src !== undefined) {
		keys.push({
			key: { ...change.valueReplace.src, target: CrossFieldTarget.Destination },
			count: 1,
		});
	}

	const detachId = getEffectiveDetachId(change);

	if (detachId !== undefined) {
		keys.push({ key: { ...detachId, target: CrossFieldTarget.Source }, count: 1 });
	}

	return keys;
}

function getNestedChanges(change: OptionalChangeset): NestedChangesIndices {
	if (change.childChange === undefined) {
		return [];
	}

	return [[change.childChange, 0]];
}

function invertAttachId(
	attachId: ChangeAtomId,
	revision: RevisionTag | undefined,
	isRollback: boolean,
	detachId: ChangeAtomId | undefined,
): ChangeAtomId {
	if (!isRollback) {
		return makeChangeAtomId(attachId.localId, revision);
	}

	return detachId ?? attachId;
}
