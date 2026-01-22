/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RevisionMetadataSource, RevisionTag, TaggedChange } from "../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { RebaseRevisionMetadata } from "../feature-libraries/modular-schema/index.js";

/**
 * Given a state tree, constructs the sequence of edits which led to that state.
 */
export function getSequentialEdits<TContent, TChangeset, TMeta = undefined>(
	initialState: FieldStateTree<TContent, TChangeset, TMeta>,
): NamedChangeset<TChangeset, TMeta>[] {
	const edits: NamedChangeset<TChangeset, TMeta>[] = [];
	for (const state of getSequentialStates(initialState)) {
		if (state.mostRecentEdit !== undefined) {
			edits.push(state.mostRecentEdit);
		}
	}
	return edits;
}

export function getSequentialStates<TContent, TChangeset, TMeta = undefined>(
	state: FieldStateTree<TContent, TChangeset, TMeta>,
): FieldStateTree<TContent, TChangeset, TMeta>[] {
	const states: FieldStateTree<TContent, TChangeset, TMeta>[] = [];
	for (
		let current: FieldStateTree<TContent, TChangeset, TMeta> | undefined = state;
		current !== undefined;
		current = current.parent
	) {
		states.push(current);
	}
	states.reverse();
	return states;
}

/**
 * Simplification of a FieldChangeRebaser which assumes the test author has already chosen particular:
 * - child field types (commonly TestChange)
 * - id allocation strategy
 * - revision metadata source
 */
export interface BoundFieldChangeRebaser<TChangeset> {
	invert(
		change: TaggedChange<TChangeset>,
		revision: RevisionTag | undefined,
		isRollback: boolean,
	): TChangeset;
	rebase(
		change: TaggedChange<TChangeset>,
		base: TaggedChange<TChangeset>,
		metadata?: RebaseRevisionMetadata,
	): TChangeset;
	/**
	 * Rebase the provided change over the composition of a set of base changes.
	 *
	 * @remarks A revision metadata source is provided to this function currently in order to retain
	 * metadata from original edits in the case of repeated composition (i.e. what happens when sandwich
	 * rebasing). This is a bit inconsistent with the spirit of the rest of this interface, and depending
	 * on further refactoring would be nice to remove.
	 */
	rebaseComposed(
		metadata: RebaseRevisionMetadata,
		change: TaggedChange<TChangeset>,
		...baseChanges: TaggedChange<TChangeset>[]
	): TChangeset;
	compose(
		change1: TaggedChange<TChangeset>,
		change2: TaggedChange<TChangeset>,
		metadata?: RevisionMetadataSource,
	): TChangeset;
	createEmpty(): TChangeset;
	inlineRevision(change: TChangeset, revision: RevisionTag): TChangeset;
	assertEqual?(
		change1: TaggedChange<TChangeset> | undefined,
		change2: TaggedChange<TChangeset> | undefined,
	): void;
	isEmpty?(change1: TChangeset): boolean;
	assertChangesetsEquivalent?(
		change1: TaggedChange<TChangeset>,
		change2: TaggedChange<TChangeset>,
	): void;
}

export interface NamedChangeset<TChangeset, TMeta = undefined> {
	changeset: TaggedChange<TChangeset>;

	/**
	 * Intention for the changeset.
	 */
	intention: number;

	/**
	 * Friendly string describing the change.
	 * This is typically used to name test cases.
	 */
	description: string;

	/**
	 * Metadata associated with the changeset.
	 * Ignored by the test utils.
	 * Useful for storing extra information for use by the test author.
	 */
	meta?: TMeta;
}

/**
 * Utility type for modeling valid series of edits to a field. Each node in the tree stores the contents
 * of the field as well as information about the change applied to the parent state to get to this state.
 * Because the tree is structured as an up-tree (stores parent pointers), the series of actions taken from
 * some initial state to get to the state at a given node can be recovered by walking up the tree.
 *
 * This concept is similar to trees constructed in {@link https://en.wikipedia.org/wiki/State_space_search | state space search}
 * or the tree implicit to the {@link https://en.wikipedia.org/wiki/Minimax | minimax algorithm}.
 *
 * It's a useful data structure for testing rebasing because it allows more automatic test case generation, e.g.
 * by exhaustively validating axioms against particular nodes in the tree up to a certain depth, or randomly selecting
 * only certain nodes in the case of combinatorial explosion.
 *
 * This file largely contains helpers for selecting nodes of certain types in this tree.
 * In order to use them with a particular field, that field must have an implementation of {@link ChildStateGenerator}.
 */
export interface FieldStateTree<TContent, TChangeset, TMeta = undefined> {
	content: TContent;
	mostRecentEdit?: NamedChangeset<TChangeset, TMeta>;
	parent?: FieldStateTree<TContent, TChangeset, TMeta>;
}

/**
 * Given a particular state in a {@link FieldStateTree}, generates possible child states, i.e. states
 * which can be reached by applying a single valid change.
 */
export type ChildStateGenerator<TContent, TChangeset, TMeta = undefined> = (
	state: FieldStateTree<TContent, TChangeset, TMeta>,
	tagFromIntention: (intention: number) => RevisionTag,
	mintIntention: (count?: number) => number,
) => Iterable<FieldStateTree<TContent, TChangeset, TMeta>>;

function* depthFirstWalk<TContent, TChangeset, TMeta>(
	initialState: FieldStateTree<TContent, TChangeset, TMeta>,
	generateChildStates: ChildStateGenerator<TContent, TChangeset, TMeta>,
	depth: number,
	tagFromIntention: (intention: number) => RevisionTag,
	mintIntention: () => number,
): Iterable<FieldStateTree<TContent, TChangeset, TMeta>> {
	yield initialState;
	if (depth > 0) {
		for (const childState of generateChildStates(
			initialState,
			tagFromIntention,
			mintIntention,
		)) {
			yield* depthFirstWalk(
				childState,
				generateChildStates,
				depth - 1,
				tagFromIntention,
				mintIntention,
			);
		}
	}
}

export function makeIntentionMinter(): (count?: number) => number {
	let intent = 0;
	return (count: number = 1) => {
		const result = intent;
		intent += count;
		return result;
	};
}

/**
 * Generates all possible sequences of edits of a fixed length.
 * Revision tags will be prefixed with the provided `tagPrefix`.
 */
export function* generatePossibleSequenceOfEdits<TContent, TChangeset, TMeta = undefined>(
	initialState: FieldStateTree<TContent, TChangeset, TMeta>,
	generateChildStates: ChildStateGenerator<TContent, TChangeset, TMeta>,
	numberOfEdits: number,
	tagPrefix: string,
	intentionMinter?: (count?: number) => number,
): Iterable<NamedChangeset<TChangeset, TMeta>[]> {
	for (const state of depthFirstWalk(
		initialState,
		generateChildStates,
		numberOfEdits,
		(intention: number) => `${tagPrefix}${intention}` as unknown as RevisionTag,
		intentionMinter ?? makeIntentionMinter(),
	)) {
		const edits: NamedChangeset<TChangeset, TMeta>[] = [];
		for (
			let current: FieldStateTree<TContent, TChangeset, TMeta> | undefined = state;
			current?.mostRecentEdit !== undefined;
			current = current.parent
		) {
			edits.push(current.mostRecentEdit);
		}

		if (edits.length === numberOfEdits) {
			edits.reverse();
			yield edits;
		}
	}
}
