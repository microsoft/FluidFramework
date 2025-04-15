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
	areEqualChangeAtomIds,
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
import { base } from "../../simple-tree/api/testRecursiveDomain.js";

export const optionalChangeRebaser: FieldChangeRebaser<OptionalChangeset> = {
	compose: (
		change1: OptionalChangeset,
		change2: OptionalChangeset,
		composeChild: NodeChangeComposer,
		_genId: IdAllocator,
		nodeManager: ComposeNodeManager,
	): OptionalChangeset => {
		// There are three contexts to consider:
		// - context #1: before change1
		// - context #2: between change1 and change2
		// - context #3: after change2
		// Because changesets are about representing the journey that each node takes from context to context,
		// it's helpful to consider the nodes present in the field at each context:
		// We can represent then as (A B C), where...
		// A is the node present in the field in before change1,
		// B is the node present in the field in between change1 and change2,
		// C is the node present in the field in after change2.
		// It's possible for the field to be empty (represented as `_`), which gives us the following patterns:
		// +---+---+---+---------+
		// | A | B | C | Pattern |
		// +---+---+---+---------+
		// | A | B | C | (A B C) |
		// | A | B | _ | (A B _) |
		// | A | _ | C | (A _ C) |
		// | A | _ | _ | (A _ _) |
		// | _ | B | C | (_ B C) |
		// | _ | B | _ | (_ B _) |
		// | _ | _ | C | (_ _ C) |
		// | _ | _ | _ | (_ _ _) |
		// +---+---+---+---------+
		// For each pair of nodes (A, B), (B, C), and (A, C), the two nodes can either be the same (represented as `S`) or be different.
		// For the base pattern `A B C`, this gives us 8 cases, three of which are impossible:
		// +-------+-------+-------+----------+---------+
		// | A==B? | B==C? | A==C? | Possible | Pattern |
		// +-------+-------+-------+----------+---------+
		// |   F   |   F   |   F   |    Y     | (A B C) |
		// |   T   |   T   |   T   |    Y     | (S S S) |
		// |   F   |   T   |   F   |    Y     | (A S S) |
		// |   F   |   F   |   T   |    Y     | (S B S) |
		// |   T   |   F   |   F   |    Y     | (S S C) |
		// |   T   |   T   |   F   |    N     |         |
		// |   T   |   F   |   T   |    N     |         |
		// |   F   |   T   |   T   |    N     |         |
		// +-------+-------+-------+----------+---------+
		// The other base patterns are similar but with fewer possibilities since there are fewer nodes.
		// This yields the following 15 cases:
		// ├─ Base pattern (A B C)
		// │  ├─ (A B C)
		// │  ├─ (A S S)
		// │  ├─ (S B S)
		// │  ├─ (S S C)
		// │  └─ (S S S)
		// ├─ Base pattern (_ B C)
		// │  ├─ (_ B C)
		// │  └─ (_ S S)
		// ├─ Base pattern (A _ C)
		// │  ├─ (A _ C)
		// │  └─ (S _ S)
		// ├─ Base pattern (A B _)
		// │  ├─ (A B _)
		// │  └─ (S S _)
		// ├─ Base pattern (A _ _)
		// │  └─ (A _ _)
		// ├─ Base pattern (_ B _)
		// │  └─ (_ B _)
		// ├─ Base pattern (_ _ C)
		// │  └─ (_ _ C)
		// └─ Base pattern (_ _ _)
		//    └─ (_ _ _)
		// We also want to consider why a change may leave an input node untouched (S S):
		//   It could either be because there is no intention to change it or because there is an intention to pin down the node in the field.
		//   We represent the pin with a `▼` symbol between the two `S`: (S▼S) and keep using (S S) otherwise.
		// Similarly, we also want to consider why a change may leave an empty field untouched (_ _):
		//   It could either be because there is no intention to change it or because there is an intention clear the field.
		//   We represent the clear with a `▲` symbol between the two `_`: (_▲_) and keep using (_ _) otherwise.
		// These two considerations add 12 new cases to the previous 15 for a total of 27 cases:
		// ├─ Base pattern (A B C)
		// │  ├─ (A B C)
		// │  ├─ (A S S)
		// │  ├─ (A S▼S) <- new
		// │  ├─ (S B S)
		// │  ├─ (S S C)
		// │  ├─ (S▼S C) <- new
		// │  └─ (S S S)
		// │  └─ (S▼S S) <- new
		// │  └─ (S S▼S) <- new
		// │  └─ (S▼S▼S) <- new
		// ├─ Base pattern (_ B C)
		// │  ├─ (_ B C)
		// │  ├─ (_ S S)
		// │  └─ (_ S▼S) <- new
		// ├─ Base pattern (A _ C)
		// │  ├─ (A _ C)
		// │  └─ (S _ S)
		// ├─ Base pattern (A B _)
		// │  ├─ (A B _)
		// │  ├─ (S S _)
		// │  └─ (S▼S _) <- new
		// ├─ Base pattern (A _ _)
		// │  ├─ (A _ _)
		// │  └─ (A _▲_) <- new
		// ├─ Base pattern (_ B _)
		// │  └─ (_ B _)
		// ├─ Base pattern (_ _ C)
		// │  ├─ (_ _ C)
		// │  └─ (_▲_ C) <- new
		// └─ Base pattern (_ _ _)
		//    ├─ (_ _ _)
		//    ├─ (_▲_ _) <- new
		//    ├─ (_ _▲_) <- new
		//    └─ (_▲_▲_) <- new
		let composedReplace: Mutable<Replace> | undefined;
		if (change1.valueReplace === undefined || change2.valueReplace === undefined) {
			// In this branch, at most one of the changes has intentions regarding content of the field.
			// This corresponds to the following 12 cases:
			// ├─ No intentions:
			// |  ├─ (S S S)
			// |  └─ (_ _ _)
			// ├─ Only change1 has intentions:
			// |  ├─ (S▼S S)
			// |  ├─ (A S S)
			// |  ├─ (_ S S)
			// |  ├─ (_ _▲_)
			// |  └─ (A _ _)
			// └─ Only change2 has intentions:
			//    ├─ (S S▼S)
			//    ├─ (S S C)
			//    ├─ (S S _)
			//    ├─ (_▲_ _)
			//    └─ (_ _ C)
			// In all these cases we can ignore which ever change has no intentions.
			composedReplace = change1.valueReplace ?? change2.valueReplace;
		} else {
			const replace1 = change1.valueReplace;
			const replace2 = change2.valueReplace;
			let composedDst: ChangeAtomId;
			let composedSrc: ChangeAtomId | undefined;
			if (isPin(replace1, nodeManager) && isPin(replace2, nodeManager)) {
				// This branch deals with case (S▼S▼S).
				// Pinning the node twice is equivalent to pinning it once.
				// Since there are multiple IDs to referer to the same node, there are multiple ways to represent the same pin intention.
				// We use the following normalization rules:
				// 1. Detaches should the earliest possible ID for a node (i.e., before any renames).
				// 2. Attaches should the latest possible ID for a node (i.e., after any renames).
				composedDst = replace1.dst;
				composedSrc = replace2.src;
			} else if (isPin(replace1, nodeManager)) {
				// This branch deals with cases (S▼S C) and (S▼S _).
				// In both cases, the pin intention is made irrelevant by replace2 since it detaches the pinned node,
				// and the replace2 has the last word of whether and which node should be attached to the field.
				composedSrc = replace2.src;
				// Note that there are two ways to refer to S: replace1.dst and replace2.dst.
				// While we could use either to generate a valid output, we must pick the one that leads to a normalized output.
				// We use the following normalization rules:
				// 1. Detaches should the earliest possible ID for a node (i.e., before any renames).
				// 2. Attaches should the latest possible ID for a node (i.e., after any renames).
				// In this situation, rule 1 applies, so we use replace1.dst.
				composedDst = replace1.dst;
				// However, we need to inform the node manager of the rename
				nodeManager.composeAttachDetach(replace1.dst, replace2.dst, 1);
			} else if (isPin(replace2, nodeManager)) {
				// This branch deals with cases (A S▼S) and (_ S▼S).
				assert(replace1.src !== undefined, "Replace1.src should be defined");
				// In both cases, node S should be attached to the field.
				// Note that there are two ways to refer to S: replace1.src and replace2.dst.
				// While we could use either to generate a valid output, we must pick the one that leads to a normalized output.
				// We use the following normalization rules:
				// 1. Detaches should the earliest possible ID for a node (i.e., before any renames).
				// 2. Attaches should the latest possible ID for a node (i.e., after any renames).
				// In this situation, rule 2 applies, so we use replace2.src.
				composedSrc = replace2.src;
				// However, we need to inform the node manager of the rename
				nodeManager.composeAttachDetach(replace1.src, replace2.dst, 1);
				// In case (A S▼S), A is detached using the detach ID from change1
				// In case (_ S▼S), the detach ID from change1 is the ID that should be used if the composed changeset were to be rebased over a change that attaches a node in the field.
				composedDst = replace1.dst;
			} else {
				// This branch deals with the remaining 10 cases:
				// (A B C)
				// (_ B C)
				// (A B _)
				// (_ B _)
				// (A _ C)
				// (S B S)
				// (S _ S)
				// (A _▲_)
				// (_▲_ B)
				// (_▲_▲_)

				const change1ClearsEmptyField = replace1.isEmpty && replace1.src === undefined;
				const change2ClearsEmptyField = replace2.isEmpty && replace2.src === undefined;
				if (change1ClearsEmptyField || change2ClearsEmptyField) {
					// This branch deals with the cases (A _▲_), (_▲_ B), and (_▲_▲_)
					// In all cases, change2 has the final word as to whether and what to attach.
					composedSrc = replace2.src;
					composedDst = replace1.dst;
				} else {
					// This branch deals with the remaining 7 cases, which can be organized as follows:
					// +-------------------+--------------------------------+
					// |                   | Same node in contexts 1 & 3 ?  |
					// |                   +----------------+---------------+
					// |                   |       Yes      |      No       |
					// +-------------+-----+----------------+---------------+
					// |             |     |     (S B S)    |    (A B C)    |
					// | Is change 1 |     |                |    (_ B C)    |
					// |  attaching  | Yes |                |    (A B _)    |
					// |   some new  |     |                |    (_ B _)    |
					// |   node B?   +-----+----------------+---------------+
					// |             |  No |     (S _ S)    |    (A _ C)    |
					// +-------------+-----+----------------+---------------+

					// In all cases where change 1 attaches a node B (i.e, the "Yes" row), that node is being detached by change2.
					// This must be communicated to the node manager.
					if (replace1.src !== undefined) {
						nodeManager.composeAttachDetach(replace1.src, replace2.dst, 1);
					}

					if (
						replace2.src !== undefined &&
						nodeManager.composeDetachAttach(replace1.dst, replace2.src, 1)
					) {
						// This branch deals with cases (S B S) and (S _ S) (i.e, the "Yes" column).
						// Both cases are equivalent to pinning the node S.
						// We use the following normalization rules:
						// 1. Detaches should the earliest possible ID for a node (i.e., before any renames).
						// 2. Attaches should the latest possible ID for a node (i.e., after any renames).
						composedDst = replace1.dst;
						composedSrc = replace2.src;
					} else {
						// This branch deals with the remaining 5 cases (ie., the "No" column):
						// (A B C)
						// (A _ C)
						// (A B _)
						// (_ B C)
						// (_ B _)
						// In all cases, change2 has the final word as to whether and what to attach.
						composedSrc = replace2.src;
						// In cases (A ...), A is detached using the detach ID from change1
						// In cases (_ ...), the detach ID from change1 is the ID that should be used if the composed changeset were to be rebased over a change that attaches a node in the field.
						composedDst = replace1.dst;
					}
				}
			}
			composedReplace = {
				isEmpty: replace1.isEmpty,
				dst: composedDst,
			};
			if (composedSrc !== undefined) {
				assert(
					!areEqualChangeAtomIdOpts(composedReplace.dst, composedReplace.src),
					"Pins should be represented explicitly",
				);
				composedReplace.src = composedSrc;
			}
		}

		// Note that when it comes to managing child changes, differences in intentions do not matter given identical effect.
		// This means that we only have to consider the following 15 cases:
		// (A B C)
		// (A S S)
		// (S B S)
		// (S S C)
		// (S S S)
		// (_ B C)
		// (_ S S)
		// (A _ C)
		// (S _ S)
		// (A B _)
		// (S S _)
		// (A _ _)
		// (_ B _)
		// (_ _ C)
		// (_ _ _)

		// Fields are responsible for composing the child changes for nodes are attached in context 1.
		// In optional fields, that would be node A if it exists.
		let newChildChangesForA: NodeId | undefined;
		// If A did exist, the new changes would come from wherever node A is being sent by change1.
		// eslint-disable-next-line unicorn/prefer-ternary
		if (isReplaceEffectful(change1.valueReplace)) {
			// This branch deals with the cases A exists and is being detached (and not reattached) by change1:
			// (A B C)
			// (A S S)
			// (S B S)
			// (A _ C)
			// (S _ S)
			// (A B _)
			// (A _ _)
			newChildChangesForA = nodeManager.getNewChangesForBaseDetach(
				change1.valueReplace.dst,
				1,
			).value;
		} else {
			// This branch deals with the 8 remaining cases which can be organized as follows:
			// ├─ A does not exist:
			// |  ├─ (_ B C)
			// |  ├─ (_ S S)
			// |  ├─ (_ B _)
			// |  ├─ (_ _ C)
			// |  └─ (_ _ _)
			// └─ A does exist and is not being detached by change1:
			//    ├─ (S S C)
			//    ├─ (S S _)
			//    └─ (S S S)
			// In the first group of cases, change2.childChange will be undefined because the field in change2's input context.
			// In the second group of cases, change2.childChange represents the new child changes (if any) for node A.
			// In both cases, it's safe to use change2.childChange.
			newChildChangesForA = change2.childChange;
		}

		let composedChild: NodeId | undefined;
		if (change1.childChange !== undefined || newChildChangesForA !== undefined) {
			composedChild = composeChild(change1.childChange, newChildChangesForA);
		}

		// Fields are also responsible for sending new child changes to the node manager for nodes that are being attached by change1.
		if (change2.childChange !== undefined && isReplaceEffectful(change1.valueReplace)) {
			// The presence of new child implies that there is some node B present in the field in context 2.
			// The fact that the change1 has a shallow effect implies that node B was attached by change1.
			// This branch therefore deals with the following cases:
			// (A B C)
			// (A B _)
			// (A S S)
			// (_ S S)
			// (S B S)
			// (_ B C)
			// (_ B _)
			assert(change1.valueReplace.src !== undefined, "Replace1.src should be defined");
			nodeManager.sendNewChangesToBaseSourceLocation(
				change1.valueReplace.src,
				change2.childChange,
			);
		}

		const composed: Mutable<OptionalChangeset> = {};
		if (composedReplace !== undefined) {
			composed.valueReplace = composedReplace;
		}
		if (composedChild !== undefined) {
			composed.childChange = composedChild;
		}
		return composed;
	},

	invert: (
		change: OptionalChangeset,
		isRollback: boolean,
		genId: IdAllocator<ChangesetLocalId>,
		revision: RevisionTag | undefined,
		nodeManager: InvertNodeManager,
	): OptionalChangeset => {
		const inverted: Mutable<OptionalChangeset> = {};
		let childChange = change.childChange;

		if (isReplaceEffectful(change.valueReplace)) {
			const replace: Mutable<Replace> =
				change.valueReplace.src === undefined
					? {
							isEmpty: true,
							dst: makeChangeAtomId(genId.allocate(), revision),
						}
					: {
							isEmpty: false,
							dst: isRollback
								? change.valueReplace.src
								: makeChangeAtomId(genId.allocate(), revision),
						};
			if (!change.valueReplace.isEmpty) {
				replace.src = change.valueReplace.dst;

				// XXX: We should use a new attach ID
				nodeManager.invertDetach(
					change.valueReplace.dst,
					1,
					change.childChange,
					change.valueReplace.dst,
				);
				childChange = undefined;
			}

			if (change.valueReplace.src !== undefined) {
				// XXX: If we use a new detach ID, need to update the `invertRenames` flag.
				childChange = nodeManager.invertAttach(change.valueReplace.src, 1, true).value;
			}

			inverted.valueReplace = replace;
		}

		if (childChange !== undefined) {
			inverted.childChange = childChange;
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
		// This makes (_ _) equivalent to (_▲_), and makes (A A) equivalent to (A▼A).
		// This leaves us with the following 5 cases to consider for `overChange`:
		// (_ _)
		// (A A)
		// (A C)
		// (A _)
		// (_ C)

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
		const rebased: Mutable<OptionalChangeset> = {};
		if (newChange.valueReplace === undefined) {
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
			rebased.valueReplace = newChange.valueReplace;
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
				dst: newChange.valueReplace.dst,
			};
			// We now turn our attention to the `src` field.
			if (newChange.valueReplace.src === undefined) {
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
				if (isPin(newChange.valueReplace)) {
					// This branch deals with cases (A▼A) ↷ (A C) and (A▼A) ↷ (A _).
					// In both cases, `overChange` detaches node A which is pinned by `newChange`.
					// The rebased change should therefore attach A from wherever `overChange` has sent it.
					replace.src = newChange.valueReplace.dst;
					// We need to inform the node manager of any child changes since they ought to be represented at the location of A in the input context of the rebased change.
					// We also need to inform the node manager that the rebased change needs to detach A from its new location.
					nodeManager.rebaseOverDetach(
						overReplace.dst,
						1,
						replace.dst,
						rebasedChildChangeForA,
					);
				} else {
					// This branch deals with the remaining 3 cases:
					// (A B) ↷ (A _)
					// (A B) ↷ (A C)
					// (_ B) ↷ (_ C)
					// Note that in the last two cases, it's possible for nodes B and C to actually be the same node.
					// XXX: Consider renames when comparing register IDs (remember to use the last know ID for the node).
					// eslint-disable-next-line unicorn/prefer-ternary
					if (areEqualChangeAtomIdOpts(overReplace.src, newChange.valueReplace.src)) {
						// This branch deal with the cases (A B) ↷ (A C) and (_ B) ↷ (_ C) where B and C are the same node.
						// The rebased change becomes a pin, in which case its `src` must match its `dst`.
						replace.src = newChange.valueReplace.dst;
						// XXX: should rebaseOverDetach be called in this case as well?.
					} else {
						// This branch deals with the following cases where B and C are different nodes:
						// (A B) ↷ (A _)
						// (A B) ↷ (A C)
						// (_ B) ↷ (_ C)
						// In all other cases, the location of B is unaffected by the rebasing.
						replace.src = newChange.valueReplace.src;
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

function rebaseReplaceSource(
	source: Replace,
	baseReplace: Replace | undefined,
): ChangeAtomId | undefined {
	// eslint-disable-next-line unicorn/prefer-ternary
	if (areEqualChangeAtomIdOpts(baseReplace?.src, source.src)) {
		// If the base change attaches the node that the rebased change is trying to attach,
		// then the rebased change becomes a pin.
		// XXX: Consider renames when comparing register IDs (remember to use the last know ID for the node).
		return source.dst;
	} else {
		return source.src;
	}
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

function isReplaceEffectful(replace: Replace | undefined): replace is EffectfulReplace {
	if (replace === undefined) {
		return false;
	}

	if (isPin(replace)) {
		return false;
	}
	return !replace.isEmpty || replace.src !== undefined;
}

function getEffectfulDst(replace: Replace | undefined): ChangeAtomId | undefined {
	return replace === undefined || replace.isEmpty || isPin(replace) ? undefined : replace.dst;
}

function isPin(
	replace: Replace,
	nodeManager?: ComposeNodeManager,
): replace is Replace & { isEmpty: false; src: ChangeAtomId } {
	if (replace.src === undefined) {
		return false;
	}
	if (nodeManager !== undefined) {
		return nodeManager.composeDetachAttach(replace.dst, replace.src, 1);
	}
	return areEqualChangeAtomIds(replace.dst, replace.src);
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

	if (change.valueReplace !== undefined && isReplaceEffectful(change.valueReplace)) {
		if (!change.valueReplace.isEmpty) {
			mark.detach = nodeIdFromChangeAtom(change.valueReplace.dst);
		}
		if (change.valueReplace.src !== undefined) {
			mark.attach = nodeIdFromChangeAtom(change.valueReplace.src);
		}
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
