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
	Multiplicity,
	type RevisionReplacer,
	type RevisionTag,
	areEqualChangeAtomIdOpts,
	forbiddenFieldKindIdentifier,
	makeChangeAtomId,
} from "../../core/index.js";
import type { IdAllocator, Mutable } from "../../util/index.js";
import { nodeIdFromChangeAtom } from "../deltaUtils.js";
import {
	optionalIdentifier,
	identifierFieldIdentifier,
	requiredIdentifier,
} from "../fieldKindIdentifiers.js";
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
	NodeMoveType,
	type RebaseVersion,
	type RebaseRevisionMetadata,
	FlexFieldKind,
} from "../modular-schema/index.js";

import type { OptionalChangeset, Replace } from "./optionalFieldChangeTypes.js";
import { makeOptionalFieldCodecFamily } from "./optionalFieldCodecs.js";

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

			// TODO: Always use nodeDetach instead of valueReplace if not supporting older client versions.
			if (isPin(change)) {
				inverted.nodeDetach = detachIdForInverse;
			} else if (inverted.valueReplace === undefined) {
				inverted.valueReplace = { isEmpty: false, dst: detachIdForInverse };
			} else {
				(inverted.valueReplace as Mutable<Replace>).dst = detachIdForInverse;
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
		_metadata: RebaseRevisionMetadata,
		rebaseVersion: RebaseVersion,
	): OptionalChangeset => {
		const rebased: Mutable<OptionalChangeset> = {};

		const rebasedChild = rebaseChild(newChange.childChange, overChange.childChange);
		const overDetach = getEffectiveDetachId(overChange);

		// Note that composition ignores rebase version, and so will create node detaches even when we are supporting collaboration with older clients.
		// Therefore, in rebase version 1 we must rebase node detach as if it were a clear, matching the behavior of older clients.
		const hasNodeDetachTreatedAsClear =
			newChange.nodeDetach !== undefined && rebaseVersion < 2 && !isPin(newChange);

		if (overDetach !== undefined) {
			const nodeDetach = hasNodeDetachTreatedAsClear ? undefined : newChange.nodeDetach;
			nodeManager.rebaseOverDetach(overDetach, 1, nodeDetach, rebasedChild);
		}

		const overAttach = overChange.valueReplace?.src;
		if (overAttach !== undefined) {
			const movedChangeEntry = nodeManager.getNewChangesForBaseAttach(overAttach, 1).value;

			if (movedChangeEntry?.nodeChange !== undefined) {
				rebased.childChange = movedChangeEntry.nodeChange;
			}

			if (movedChangeEntry?.detachId !== undefined) {
				rebased.nodeDetach = movedChangeEntry.detachId;
				if (newChange.valueReplace !== undefined) {
					// Now that the rebased change has a node detach,
					// the detach from the value replace no longer takes effect.
					nodeManager.removeDetach(newChange.valueReplace.dst, 1);
				}
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

		if (hasNodeDetachTreatedAsClear && overDetach !== undefined) {
			// In order to emulate the rebasing behavior of older clients,
			// we convert the node detach to a clear.
			const valueReplace: Mutable<Replace> = {
				dst: newChange.nodeDetach,
				isEmpty: overAttach === undefined,
			};

			if (newChange.valueReplace?.src !== undefined) {
				valueReplace.src = newChange.valueReplace.src;
			}

			rebased.valueReplace = valueReplace;
		} else if (newChange.valueReplace !== undefined) {
			const isEmpty =
				overDetach !== undefined || overAttach !== undefined
					? overAttach === undefined
					: newChange.valueReplace.isEmpty;

			rebased.valueReplace = { ...newChange.valueReplace, isEmpty };
		}

		const detachId = getEffectiveDetachId(newChange);
		const rebasedDetachId = getEffectiveDetachId(rebased);

		if (!areEqualChangeAtomIdOpts(detachId, rebasedDetachId)) {
			if (detachId !== undefined) {
				nodeManager.removeDetach(detachId, 1);
			}
			if (rebasedDetachId !== undefined) {
				nodeManager.addDetach(rebasedDetachId, 1);
			}
		}
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
		replacer: RevisionReplacer,
	): OptionalChangeset => {
		const updated: Mutable<OptionalChangeset> = {};

		const valueReplace = replaceReplaceRevisions(change.valueReplace, replacer);

		if (change.childChange !== undefined) {
			updated.childChange = replacer.getUpdatedAtomId(change.childChange);
		}

		if (valueReplace !== undefined) {
			updated.valueReplace = valueReplace;
		}

		if (change.nodeDetach !== undefined) {
			updated.nodeDetach = replacer.getUpdatedAtomId(change.nodeDetach);
		}

		return updated;
	},

	mute: (change: OptionalChangeset): OptionalChangeset => {
		return { childChange: change.childChange };
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
		nodeManager.composeDetachAttach(change1.nodeDetach, change1.nodeDetach, 1, true);
	}

	return makeChangeset(composedReplace, composedDetach, composedChildChange);
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
			// change2 either renames or detaches this node (the latter case implying that change1 reattaches/moves it).
			// In either case, the composition ends with the node detached by `newDetachId`.
			// Note that even if change2 detaches the node with a location-targeting detach (e.g. an optional field clear),
			// the composition should still have a node-targeting detach.
			// This is because change1 must attach the node in the location targeted by the detach,
			// and rebasing does not affect attaches, although that could change if slice moves are implemented.
			return newDetachId;
		}
	}

	if (change1.nodeDetach !== undefined) {
		return change1.nodeDetach;
	}

	return change1.valueReplace === undefined ? change2.nodeDetach : undefined;
}

function composeReplaces(
	change1: OptionalChangeset,
	change2: OptionalChangeset,
): Replace | undefined {
	const firstReplace = change1.valueReplace ?? change2.valueReplace;
	if (firstReplace === undefined) {
		return undefined;
	}

	const isEmpty = change1.nodeDetach === undefined ? firstReplace.isEmpty : false;
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
		detachId1 === undefined
			? change1.valueReplace?.src === undefined
				? change2.childChange
				: undefined
			: nodeManager.getNewChangesForBaseDetach(detachId1, 1).value?.nodeChange;

	let composedChildChange: NodeId | undefined;
	if (change1.childChange !== undefined || childChangesFromChange2 !== undefined) {
		composedChildChange = composeChild(change1.childChange, childChangesFromChange2);
	}
	return composedChildChange;
}

function makeChangeset(
	replace: Replace | undefined,
	nodeDetach: ChangeAtomId | undefined,
	childChange: NodeId | undefined,
): OptionalChangeset {
	const changeset: Mutable<OptionalChangeset> = {};
	if (replace !== undefined) {
		changeset.valueReplace = replace;
	}

	if (nodeDetach !== undefined) {
		changeset.nodeDetach = nodeDetach;
	}

	if (childChange !== undefined) {
		changeset.childChange = childChange;
	}
	return changeset;
}

function replaceReplaceRevisions(
	replace: Replace | undefined,
	replacer: RevisionReplacer,
): Replace | undefined {
	if (replace === undefined) {
		return undefined;
	}

	const updated: Mutable<Replace> = {
		...replace,
		dst: replacer.getUpdatedAtomId(replace.dst),
	};

	if (replace.src !== undefined) {
		updated.src = replacer.getUpdatedAtomId(replace.src);
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
	 * @param isEmpty - whether the field is empty when creating this change
	 * @param ids - the ids associated with the change.
	 */
	set(
		isEmpty: boolean,
		ids: {
			/** The ID of the node to attach in the field. */
			fill: ChangeAtomId;
			/** The ID to assign to whichever node (if any) is detached from the field when the change applies. */
			detach: ChangeAtomId;
		},
	): OptionalChangeset;

	/**
	 * Creates a change which clears the field's contents (if any).
	 * @param isEmpty - whether the field is empty when creating this change
	 * @param detachId - the ID to assign to whichever node (if any) is detached from the field when the change applies.
	 */
	clear(isEmpty: boolean, detachId: ChangeAtomId): OptionalChangeset;
}

export const optionalFieldEditor: OptionalFieldEditor = {
	set: (
		isEmpty: boolean,
		ids: {
			fill: ChangeAtomId;
			detach: ChangeAtomId;
		},
	): OptionalChangeset => ({
		valueReplace: {
			isEmpty,
			src: ids.fill,
			dst: ids.detach,
		},
	}),

	clear: (isEmpty: boolean, detachId: ChangeAtomId): OptionalChangeset => ({
		valueReplace: {
			isEmpty,
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
		return childChange === undefined ? {} : { childChange };
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
	if (!areEqualChangeAtomIdOpts(detachId, attachId)) {
		markIsANoop = false;

		if (detachId !== undefined) {
			mark.detach = nodeIdFromChangeAtom(detachId);
		}
		if (attachId !== undefined) {
			mark.attach = nodeIdFromChangeAtom(attachId);
		}
	}

	if (change.childChange !== undefined) {
		mark.fields = deltaFromChild(change.childChange);
		markIsANoop = false;
	}

	return { marks: markIsANoop ? [] : [mark] };
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
	getDetachCellIds: (_change) => [],
};

function getCrossFieldKeys(change: OptionalChangeset): CrossFieldKeyRange[] {
	const keys: CrossFieldKeyRange[] = [];
	if (change.valueReplace?.src !== undefined) {
		keys.push({
			key: { ...change.valueReplace.src, target: NodeMoveType.Attach },
			count: 1,
		});
	}

	const detachId = getEffectiveDetachId(change);

	if (detachId !== undefined) {
		keys.push({ key: { ...detachId, target: NodeMoveType.Detach }, count: 1 });
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

function isPin(change: OptionalChangeset): boolean {
	return (
		change.nodeDetach !== undefined &&
		areEqualChangeAtomIdOpts(change.nodeDetach, change.valueReplace?.src)
	);
}

interface Optional
	extends FlexFieldKind<
		OptionalFieldEditor,
		typeof optionalIdentifier,
		Multiplicity.Optional
	> {}

/**
 * 0 or 1 items.
 */
export const optional: Optional = new FlexFieldKind(
	optionalIdentifier,
	Multiplicity.Optional,
	{
		changeHandler: optionalChangeHandler,
		allowMonotonicUpgradeFrom: new Set([
			identifierFieldIdentifier,
			requiredIdentifier,
			forbiddenFieldKindIdentifier,
		]),
	},
);
