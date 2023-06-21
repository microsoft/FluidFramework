/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Invariant } from "../../util";
import { ReadonlyRepairDataStore } from "../repair";
import { AnchorSet } from "../tree";
import type { RevisionTag } from "./types";

/**
 * Rebasing logic for a particular kind of change.
 *
 * This interface is used to provide rebase policy to `Rebaser`.
 *
 * The implementation must ensure TChangeset forms a [group](https://en.wikipedia.org/wiki/Group_(mathematics)) where:
 * - `compose([])` is the identity element.
 * - associativity is defined as `compose([...a, ...b])` is equal to
 * `compose([compose(a), compose(b)])` for all `a` and `b`.
 * - `inverse(a)` gives the inverse element of `a`.
 *
 * In these requirements the definition of equality is up to the implementer,
 * but it is required that any two changes which are considered equal:
 * - have the same impact when applied to any tree.
 * - can be substituted for each-other in all methods on this
 * interface and produce equal (by this same definition) results.
 *
 * For the sake of testability, implementations will likely want to have a concrete equality implementation.
 *
 * This API uses `compose` on arrays instead of an explicit identity element and associative binary operator
 * to allow the implementation more room for optimization,
 * but should otherwise be equivalent to the identity element and binary operator group approach.
 *
 * TODO:
 * Be more specific about the above requirements.
 * For example, would something that is close to forming a group but has precision issues
 * (ex: the floating point numbers and addition) be ok?
 * Would this cause decoherence (and thus be absolutely not ok),
 * or just minor semantic precision issues, which could be tolerated.
 * For now assume that such issues are not ok.
 */
export interface ChangeRebaser<TChangeset> {
	_typeCheck?: Invariant<TChangeset>;

	/**
	 * Compose a collection of changesets into a single one.
	 * See {@link ChangeRebaser} for requirements.
	 */
	compose(changes: TaggedChange<TChangeset>[]): TChangeset;

	/**
	 * @param changes - The changes to invert.
	 * @param isRollback - Whether the inverted change is meant to rollback a change on a branch as is the case when
	 * performing a sandwich rebase.
	 * This flag is relevant to merge semantics that are dependent on edit sequencing order:
	 * - In the context of an undo, this function inverts a change that is sequenced and applied before the produced inverse.
	 * - In the context of a rollback, this function inverts a change that is sequenced after but applied before the produced inverse.
	 * @param repairStore - The store to query for repair data.
	 * If undefined, dummy data will be created instead.
	 * @returns the inverse of `changes`.
	 *
	 * `compose([changes, inverse(changes)])` be equal to `compose([])`:
	 * See {@link ChangeRebaser} for details.
	 */
	invert(
		changes: TaggedChange<TChangeset>,
		isRollback: boolean,
		// TODO: make the repair store mandatory when all usages of this method have repair data support.
		repairStore?: ReadonlyRepairDataStore,
	): TChangeset;

	/**
	 * Rebase `change` over `over`.
	 *
	 * The resulting changeset should, as much as possible, replicate the same semantics as `change`,
	 * except be valid to apply after `over` instead of before it.
	 *
	 * Requirements:
	 * The implementation must ensure that for all possible changesets `a`, `b` and `c`:
	 * - `rebase(a, compose([b, c])` is equal to `rebase(rebase(a, b), c)`.
	 * - `rebase(compose([a, b]), c)` is equal to
	 * `compose([rebase(a, c), rebase(b, compose([inverse(a), c, rebase(a, c)])])`.
	 * - `rebase(a, compose([]))` is equal to `a`.
	 * - `rebase(compose([]), a)` is equal to `a`.
	 */
	rebase(change: TChangeset, over: TaggedChange<TChangeset>): TChangeset;

	// TODO: we are forcing a single AnchorSet implementation, but also making ChangeRebaser deal depend on/use it.
	// This isn't ideal, but it might be fine?
	// Performance and implications for custom Anchor types (ex: Place anchors) aren't clear.
	rebaseAnchors(anchors: AnchorSet, over: TChangeset): void;
}

/**
 * @alpha
 */
export interface TaggedChange<TChangeset> {
	readonly revision: RevisionTag | undefined;
	/**
	 * When populated, indicates that the changeset is a rollback for the purpose of a rebase sandwich.
	 * The value corresponds to the `revision` of the original changeset being rolled back.
	 */
	readonly rollbackOf?: RevisionTag;
	readonly change: TChangeset;
}

export function tagChange<T>(change: T, revision: RevisionTag | undefined): TaggedChange<T> {
	return { revision, change };
}

export function tagRollbackInverse<T>(
	inverseChange: T,
	revision: RevisionTag | undefined,
	rollbackOf: RevisionTag | undefined,
): TaggedChange<T> {
	return {
		revision,
		change: inverseChange,
		rollbackOf,
	};
}

export function makeAnonChange<T>(change: T): TaggedChange<T> {
	return { revision: undefined, change };
}

export interface FinalChange {
	readonly status: FinalChangeStatus;
}

export enum FinalChangeStatus {
	conflicted,
	rebased,
	commuted,
}
