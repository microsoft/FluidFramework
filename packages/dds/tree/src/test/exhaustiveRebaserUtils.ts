/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RevisionMetadataSource, RevisionTag, TaggedChange } from "../core";
// eslint-disable-next-line import/no-internal-modules
import { RebaseRevisionMetadata } from "../feature-libraries/modular-schema";

/**
 * Given a state tree, constructs the sequence of edits which led to that state.
 */
export function getSequentialEdits<TContent, TChangeset>(
	initialState: FieldStateTree<TContent, TChangeset>,
): NamedChangeset<TChangeset>[] {
	const edits: NamedChangeset<TChangeset>[] = [];
	for (const state of getSequentialStates(initialState)) {
		if (state.mostRecentEdit !== undefined) {
			edits.push(state.mostRecentEdit);
		}
	}
	return edits;
}

export function getSequentialStates<TContent, TChangeset>(
	state: FieldStateTree<TContent, TChangeset>,
): FieldStateTree<TContent, TChangeset>[] {
	const states: FieldStateTree<TContent, TChangeset>[] = [];
	for (
		let current: FieldStateTree<TContent, TChangeset> | undefined = state;
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
	invert(change: TaggedChange<TChangeset>): TChangeset;
	rebase(
		change: TChangeset,
		base: TaggedChange<TChangeset>,
		metadata?: RebaseRevisionMetadata,
	): TChangeset;
	/**
	 * Rebase the provided change over the composition of a set of base changes.
	 *
	 * @remarks - A revision metadata source is provided to this function currently in order to retain
	 * metadata from original edits in the case of repeated composition (i.e. what happens when sandwich
	 * rebasing). This is a bit inconsistent with the spirit of the rest of this interface, and depending
	 * on further refactoring would be nice to remove.
	 */
	rebaseComposed(
		metadata: RebaseRevisionMetadata,
		change: TChangeset,
		...baseChanges: TaggedChange<TChangeset>[]
	): TChangeset;
	compose(changes: TaggedChange<TChangeset>[], metadata?: RevisionMetadataSource): TChangeset;
	assertEqual?(
		change1: TaggedChange<TChangeset> | undefined,
		change2: TaggedChange<TChangeset> | undefined,
	): void;
}

export interface NamedChangeset<TChangeset> {
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
}

/**
 * Utility type for modeling valid series of edits to a field. Each node in the tree stores the contents
 * of the field as well as information about the change applied to the parent state to get to this state.
 * Because the tree is structured as an up-tree (stores parent pointers), the series of actions taken from
 * some initial state to get to the state at a given node can be recovered by walking up the tree.
 *
 * This concept is similar to trees constructed in [state space search](https://en.wikipedia.org/wiki/State_space_search)
 * or the tree implicit to the [minimax algorithm](https://en.wikipedia.org/wiki/Minimax).
 *
 * It's a useful data structure for testing rebasing because it allows more automatic test case generation, e.g.
 * by exhaustively validating axioms against particular nodes in the tree up to a certain depth, or randomly selecting
 * only certain nodes in the case of combinatorial explosion.
 *
 * This file largely contains helpers for selecting nodes of certain types in this tree.
 * In order to use them with a particular field, that field must have an implementation of {@link ChildStateGenerator}.
 */
export interface FieldStateTree<TContent, TChangeset> {
	content: TContent;
	mostRecentEdit?: NamedChangeset<TChangeset>;
	parent?: FieldStateTree<TContent, TChangeset>;
}

/**
 * Given a particular state in a {@link FieldStateTree}, generates possible child states, i.e. states
 * which can be reached by applying a single valid change.
 */
export type ChildStateGenerator<TContent, TChangeset> = (
	state: FieldStateTree<TContent, TChangeset>,
	tagFromIntention: (intention: number) => RevisionTag,
	mintIntention: () => number,
) => Iterable<FieldStateTree<TContent, TChangeset>>;

function* depthFirstWalk<TContent, TChangeset>(
	initialState: FieldStateTree<TContent, TChangeset>,
	generateChildStates: ChildStateGenerator<TContent, TChangeset>,
	depth: number,
	tagFromIntention: (intention: number) => RevisionTag,
	mintIntention: () => number,
): Iterable<FieldStateTree<TContent, TChangeset>> {
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

export function makeIntentionMinter(): () => number {
	let intent = 0;
	return () => intent++;
}

/**
 * Generates all possible sequences of edits of a fixed length.
 * Revision tags will be prefixed with the provided `tagPrefix`.
 */
export function* generatePossibleSequenceOfEdits<TContent, TChangeset>(
	initialState: FieldStateTree<TContent, TChangeset>,
	generateChildStates: ChildStateGenerator<TContent, TChangeset>,
	numberOfEdits: number,
	tagPrefix: string,
	intentionMinter?: () => number,
): Iterable<NamedChangeset<TChangeset>[]> {
	for (const state of depthFirstWalk(
		initialState,
		generateChildStates,
		numberOfEdits,
		(intention: number) => `${tagPrefix}${intention}` as RevisionTag,
		intentionMinter ?? makeIntentionMinter(),
	)) {
		const edits: NamedChangeset<TChangeset>[] = [];
		for (
			let current: FieldStateTree<TContent, TChangeset> | undefined = state;
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
