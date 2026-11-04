/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { TaggedChange } from "../../../core/index.js";
import type { SharedTreeChange, TreeCheckout } from "../../../shared-tree/index.js";

import {
	generateSharedTreeChanges,
	type SharedTreeTestOperation,
} from "./changeGeneration.js";
import type { OperationGeneratorConfig } from "./multiFieldFixture.js";

/**
 * A complete committed change and the description of the operation that authored it.
 */
export interface NamedSharedTreeChange {
	readonly description: string;
	readonly change: TaggedChange<SharedTreeChange>;
}

/**
 * An ordered history of committed changes, without live exploration checkouts.
 */
export type SharedTreeHistory = readonly NamedSharedTreeChange[];

/**
 * Enumerate histories containing exactly `length` committed changes.
 * @param parent - The initial checkout, which is not edited or disposed by this function.
 * @param operations - Candidates derived from the current checkout and zero-based depth.
 * @param length - A nonnegative integer. Zero yields one empty history.
 * @remarks
 * Candidates must submit exactly one commit; invalid candidates fail enumeration.
 * Each descendant is explored before advancing the owning change iterator, so its ancestor forks remain alive.
 * Completion, failure, and iterator closure release all exploration forks.
 * Captured changes are borrowed data; do not mutate them or release their chunk references.
 */
export function* generateSharedTreeHistories(
	parent: TreeCheckout,
	operations: (
		state: TreeCheckout,
		depth: number,
		config: OperationGeneratorConfig,
	) => Iterable<SharedTreeTestOperation>,
	length: number,
	config: OperationGeneratorConfig,
): IterableIterator<SharedTreeHistory> {
	assert(
		Number.isInteger(length) && length >= 0,
		"History length must be a nonnegative integer",
	);

	function* visit(
		state: TreeCheckout,
		history: SharedTreeHistory,
	): IterableIterator<SharedTreeHistory> {
		if (history.length === length) {
			yield history;
			return;
		}
		for (const candidate of generateSharedTreeChanges(
			state,
			operations(state, history.length, config),
		)) {
			yield* visit(candidate.checkout, [
				...history,
				{ description: candidate.description, change: candidate.change },
			]);
		}
	}

	yield* visit(parent, []);
}
