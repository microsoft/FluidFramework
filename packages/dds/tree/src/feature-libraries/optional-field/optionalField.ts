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
	type ContextualizedFieldChange,
	type RootsInfo,
} from "../modular-schema/index.js";

import type { OptionalChangeset, Replace } from "./optionalFieldChangeTypes.js";
import { makeOptionalFieldCodecFamily } from "./optionalFieldCodecs.js";

export const optionalChangeRebaser: FieldChangeRebaser<OptionalChangeset> = {
	compose,
	invert: (
		{ change }: ContextualizedFieldChange<OptionalChangeset>,
		isRollback: boolean,
		genId: IdAllocator<ChangesetLocalId>,
		revision: RevisionTag | undefined,
		nodeManager: InvertNodeManager,
	): OptionalChangeset => {
		const inverted: Mutable<OptionalChangeset> = {};
		let childChange = change.childChange;

		const replace = change.valueReplace;
		if (isReplaceEffectful(replace)) {
			const invertedReplace: Mutable<Replace> =
				replace.src === undefined
					? {
							isEmpty: true,
							dst: makeChangeAtomId(genId.allocate(), revision),
						}
					: {
							isEmpty: false,
							dst: isRollback ? replace.src : makeChangeAtomId(genId.allocate(), revision),
						};
			if (!replace.isEmpty) {
				invertedReplace.src = makeChangeAtomId(genId.allocate(), revision);
				nodeManager.invertDetach(replace.dst, 1, change.childChange, invertedReplace.src);
				childChange = undefined;
			}

			if (replace.src !== undefined) {
				childChange = nodeManager.invertAttach(replace.src, 1, invertedReplace.dst).value;
			}

			inverted.valueReplace = invertedReplace;
		}

		if (childChange !== undefined) {
			inverted.childChange = childChange;
		}

		return inverted;
	},

	rebase: (
		{ change: newChange, roots: newRoots }: ContextualizedFieldChange<OptionalChangeset>,
		{ change: overChange }: ContextualizedFieldChange<OptionalChangeset>,
		rebaseChild: NodeChangeRebaser,
		_genId: IdAllocator,
		nodeManager: RebaseNodeManager,
	): OptionalChangeset => {
		// `newChange` can be any of the following 7 cases:
		// (_ _)
		// (_▲_)
		// (A A)
		// (A▼A)
		// (A B)
		// (A _)
		// (_ B)

		// The same is true for `overChange` but we don't care about intentions that have no effect.
		const overReplace = isReplaceEffectful(overChange.valueReplace)
			? overChange.valueReplace
			: undefined;

		// This does not however lead to 7*5=35 possible rebase cases because both input changes must have the same input context:
		if (newChange.valueReplace?.isEmpty === true) {
			assert(
				overChange.valueReplace?.isEmpty !== false,
				"Inconsistent input context: empty in newChange but populated in overChange",
			);
		} else if (newChange.valueReplace?.isEmpty === false) {
			assert(
				overChange.valueReplace?.isEmpty !== true,
				"Inconsistent input context: populated in newChange but empty in overChange",
			);
		}
		// This leaves us with 4*3=12 cases when the field is populated in the input context:
		// +-------+   +-------+
		// |  new  |   | over  |
		// +-------+   +-------+
		// | (A A) |   | (A A) |
		// | (A▼A) | x | (A C) |
		// | (A B) |   | (A _) |
		// | (A _) |   +-------+
		// +-------+
		// And 3*2=6 cases when the field is empty in the input context:
		// +-------+   +-------+
		// |  new  |   | over  |
		// +-------+   +-------+
		// | (_ _) |   | (_ _) |
		// | (_▲_) | x | (_ C) |
		// | (_ B) |   +-------+
		// +-------+
		// For a total of 12+6=18 cases.

		const rebasedChildChangeForA = rebaseChild(newChange.childChange, overChange.childChange);
		const newReplace = newChange.valueReplace;
		const rebased: Mutable<OptionalChangeset> = {};
		if (newReplace === undefined) {
			// This branch deals with the 3+2=5 cases where `newChange` is (A A) or (_ _).
			// There are no shallow change intentions to rebase.
			// However, we need to inform the node manager of any child changes since they ought to be represented at the location of A in the input context of the rebased change.
			if (overReplace !== undefined && !overReplace.isEmpty) {
				// This branch deals with the following cases:
				// (A A) ↷ (A C)
				// (A A) ↷ (A _)
				nodeManager.rebaseOverDetach(overReplace.dst, 1, undefined, rebasedChildChangeForA);
			}
		} else if (overReplace === undefined) {
			// This branch deals with the 4+3=7 cases where `overChange` is (A A) or (_ _),
			// though two of these cases have already be dealt with in the previous branch).
			// There are no shallow change intentions to rebase over, so `newChange` shallow change intentions are unchanged.
			rebased.valueReplace = newReplace;
		} else {
			// This branch deals with the remaining 8 cases where both changesets have shallow change intentions:
			// (A▼A) ↷ (A C)
			// (A▼A) ↷ (A _)
			// (A B) ↷ (A C)
			// (A B) ↷ (A _)
			// (A _) ↷ (A C)
			// (A _) ↷ (A _)
			// (_▲_) ↷ (_ C)
			// (_ B) ↷ (_ C)

			const replace: Mutable<Replace> = {
				// The `overChange` determines whether the field is empty in its output context
				isEmpty: overReplace.src === undefined,
				// There is no way for the `dst` field to be affected by the rebasing
				dst: newReplace.dst,
			};
			// We now turn our attention to the `src` field.
			if (newReplace.src === undefined) {
				// This branch deals with the 2+1=3 cases where `newChange` is (A _) or (_▲_).
				// `newChange` represent an intention to clear the field.
				// This is unaffected by anything that `overChange` may do.
			} else {
				// This branch deals with the remaining 5 cases:
				// (A▼A) ↷ (A C)
				// (A▼A) ↷ (A _)
				// (A B) ↷ (A C)
				// (A B) ↷ (A _)
				// (_ B) ↷ (_ C)
				// In all cases, `newChange`'s intention to attach a node is unaffected by the rebasing,
				// but it's possible that `overChange` has an impact on how the rebased change should refer to the node it attaches.
				if (isPin(newReplace, newRoots)) {
					// This branch deals with cases (A▼A) ↷ (A C) and (A▼A) ↷ (A _).
					// In both cases, `overChange` detaches node A which is pinned by `newChange`.
					// The rebased change should therefore attach A from wherever `overChange` has sent it.
					replace.src = newReplace.src;
					nodeManager.rebaseOverDetach(
						overReplace.dst,
						1,
						// XXX: This is a dirty trick:
						// We want to tell the MCF that we now want to detach the node being pinned with ID `replace.src`.
						// We would normally do this by passing `replace.src` here, which would create the desired rename from `overReplace.dst` to `replace.src`.
						// However, the MCF still has our old rename from `replace.dst` to `replace.src`.
						// There's no way to tell the MCF that we don't want to keep the that old rename anymore.
						// So instead, we pass `replace.dst` here to trick the MCF into building a rename chain from  `overReplace.dst` to `replace.dst` to `replace.src`
						// which it will compress into a single rename from `overReplace.dst` to `replace.src`.
						replace.dst,
						rebasedChildChangeForA,
					);
				} else {
					// This branch deals with the remaining 3 cases:
					// (A B) ↷ (A _)
					// (A B) ↷ (A C)
					// (_ B) ↷ (_ C)
					// Note that in the last two cases, it's possible for nodes B and C to actually be the same node.
					if (
						overReplace.src !== undefined &&
						nodeManager.areSameRenamedNodes(overReplace.src, newReplace.src)
					) {
						// This branch deals with the cases (A B) ↷ (A C) and (_ B) ↷ (_ C) where B and C are the same node.
						// The rebased change becomes a pin.
						replace.src = newReplace.src;
						// This is necessary to ensure that the rebased change contains a rename from `replace.dst` to `replace.src`.
						// One way to rationalize this is that as a result of `overReplace` attaching the node in the field,
						// the intention to attach that node now needs to account for it being attached and for it being detached with `replace.dst`.
						nodeManager.rebaseOverDetach(replace.dst, 1, replace.src, undefined);
					} else {
						// This branch deals with the following cases where B and C are different nodes:
						// (A B) ↷ (A _)
						// (A B) ↷ (A C)
						// (_ B) ↷ (_ C)
						// In all other cases, the location of B is unaffected by the rebasing.
						replace.src = newReplace.src;
						// We need to inform the node manager of any child changes since they ought to be represented at the location of A in the input context of the rebased change.
						nodeManager.rebaseOverDetach(
							overReplace.dst,
							1,
							undefined,
							rebasedChildChangeForA,
						);
					}
				}
			}
			rebased.valueReplace = replace;
		}

		// In this block we determine which child changes should be included in `rebased` if any.
		if (overReplace !== undefined) {
			if (overReplace.src !== undefined) {
				// Some new node is attached by `overChange`.
				// The rebased changeset must represent any nested changes for that node in as part of the field changeset.
				const changesForAttachedNode = nodeManager.getNewChangesForBaseAttach(
					overReplace.src,
					1,
				).value;
				if (changesForAttachedNode?.nodeChange !== undefined) {
					rebased.childChange = changesForAttachedNode.nodeChange;
				}
			}
		} else if (rebasedChildChangeForA !== undefined) {
			rebased.childChange = rebasedChildChangeForA;
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

		return updated;
	},
};

function compose(
	{ change: change1 }: ContextualizedFieldChange<OptionalChangeset>,
	{ change: change2 }: ContextualizedFieldChange<OptionalChangeset>,
	composeChild: NodeChangeComposer,
	_genId: IdAllocator,
	nodeManager: ComposeNodeManager,
): OptionalChangeset {
	const composedReplace = composeShallowChanges(
		change1.valueReplace,
		change2.valueReplace,
		nodeManager,
	);

	sendNewChildChanges(change1, change2, nodeManager);

	const composedChildChange = getComposedChildChanges(
		change1,
		change2,
		nodeManager,
		composeChild,
	);

	return makeChangeset(composedReplace, composedChildChange);
}

/**
 * Composes the shallow changes from two changesets.
 * This function has the side-effect of informing the node manager of any attach/detach pairs that are being composed.
 * @param replace1 - The first change to compose. Conceptually applies before `replace2`.
 * @param replace2 - The second change to compose. Conceptually applies after `replace1`.
 * @param nodeManager - The node manager.
 * @returns The composed shallow changes.
 */
function composeShallowChanges(
	replace1: Replace | undefined,
	replace2: Replace | undefined,
	nodeManager: ComposeNodeManager,
): Replace | undefined {
	if (replace1 === undefined || replace2 === undefined) {
		return replace1 ?? replace2;
	} else {
		if (replace1.src !== undefined) {
			// If a node is present in the field in the intermediate context, then it is being attached by `replace1` and detached by `replace2`.
			// We consider this to be true even when the node is being pinned by either or both changes.
			nodeManager.composeAttachDetach(replace1.src, replace2.dst, 1);
		}

		// If the field is empty in the input context of `replace1`, then `replace1.dst` is the dormant ID that will be used to detach any node that might be attached by a concurrent change.
		// If the field is not empty, then `replace1.dst` is the detach ID we associate with that node. This is true even if that node is then reattached by `replace1.src` or `replace2.src`.
		const composedDst = replace1.dst;
		// Since the optional field has LWW semantics, `replace2` has the final word on what node (if any) should reside in the field in the output context of the composition.
		const composedSrc = replace2.src;
		return makeShallowChangeset(replace1.isEmpty, composedDst, composedSrc);
	}
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
	// We need to determine what the child changes are in change2 for the node (if any) that resides in the field in the input context of change1.
	const childChangesFromChange2: NodeId | undefined =
		// If such a node did exist, the changes for it in change2 would come from wherever change1 sends that node.
		// Note: in both branches of this ternary, we are leveraging the fact querying for changes of a non-existent node safely yields undefined
		change1.valueReplace !== undefined
			? nodeManager.getNewChangesForBaseDetach(change1.valueReplace.dst, 1).value
			: change2.childChange;

	let composedChildChange: NodeId | undefined;
	if (change1.childChange !== undefined || childChangesFromChange2 !== undefined) {
		composedChildChange = composeChild(change1.childChange, childChangesFromChange2);
	}
	return composedChildChange;
}

function makeShallowChangeset(
	isEmpty: boolean,
	dst: ChangeAtomId,
	src?: ChangeAtomId,
): Replace | undefined {
	if (areEqualChangeAtomIdOpts(dst, src)) {
		// This can occur when composing a change and its rollback together, which amounts to a no-op.
		// The reason we prefer a no-op as opposed to a pin is twofold:
		// 1. A rollback is not a new intention to be composed with the existing one, so much as it is a retraction of the previous intention.
		// 2. If we were to represent this composition as a pin, such a pin would use the same ID for its src and dst which makes it unrebasable over an attach.
		return undefined;
	}

	const replace: Mutable<Replace> | undefined = {
		isEmpty,
		dst,
	};
	if (src !== undefined) {
		replace.src = src;
	}
	return replace;
}

function makeChangeset(replace?: Replace, childChange?: NodeId): OptionalChangeset {
	const changeset: Mutable<OptionalChangeset> = {};
	if (replace !== undefined) {
		changeset.valueReplace = replace;
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

type EffectfulReplace =
	| {
			isEmpty: true;
			src?: ChangeAtomId;
			dst: ChangeAtomId;
	  }
	| {
			isEmpty: boolean;
			src: ChangeAtomId;
			dst: ChangeAtomId;
	  };

function isReplaceEffectful(
	replace: Replace | undefined,
	rootsInfo?: RootsInfo,
): replace is EffectfulReplace {
	if (replace === undefined) {
		return false;
	}

	if (rootsInfo !== undefined && isPin(replace, rootsInfo)) {
		return false;
	}
	return !replace.isEmpty || replace.src !== undefined;
}

function isPin(
	replace: Replace | undefined,
	rootsInfo: RootsInfo,
): replace is Replace & { isEmpty: false; src: ChangeAtomId } {
	if (replace?.src === undefined || replace.isEmpty) {
		return false;
	}
	return rootsInfo.areSameNodes(replace.dst, replace.src);
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
		},
	): OptionalChangeset => ({
		valueReplace: {
			isEmpty: wasEmpty,
			src: ids.fill,
			dst: ids.detach,
		},
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

	const replace = change.valueReplace;
	if (replace !== undefined && !areEqualChangeAtomIdOpts(replace.dst, replace.src)) {
		if (!replace.isEmpty) {
			mark.detach = nodeIdFromChangeAtom(replace.dst);
			markIsANoop = false;
		}
		if (replace.src !== undefined) {
			mark.attach = nodeIdFromChangeAtom(replace.src);
			markIsANoop = false;
		}
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
		change.childChange === undefined && change.valueReplace === undefined,

	getNestedChanges,

	createEmpty: () => ({}),
	getCrossFieldKeys,
};

function getCrossFieldKeys(change: OptionalChangeset): CrossFieldKeyRange[] {
	const keys: CrossFieldKeyRange[] = [];
	if (change.valueReplace !== undefined) {
		keys.push({
			key: { ...change.valueReplace.dst, target: CrossFieldTarget.Source },
			count: 1,
		});

		if (change.valueReplace.src !== undefined) {
			keys.push({
				key: { ...change.valueReplace.src, target: CrossFieldTarget.Destination },
				count: 1,
			});
		}
	}

	return keys;
}

function getNestedChanges(change: OptionalChangeset): NestedChangesIndices {
	if (change.childChange === undefined) {
		return [];
	}

	return [[change.childChange, 0]];
}
