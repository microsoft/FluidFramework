/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TUnsafe, Type } from "@sinclair/typebox";

import { makeCodecFamily } from "../../../codec/index.js";
import { DeltaFieldChanges, makeDetachedNodeId, Multiplicity } from "../../../core/index.js";
import {
	FieldChangeEncodingContext,
	FieldChangeHandler,
	FieldChangeRebaser,
	FieldKindWithEditor,
	referenceFreeFieldChangeRebaser,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";
import { Mutable, fail } from "../../../util/index.js";
import { makeValueCodec } from "../../codec/index.js";

/**
 * Picks the last value written.
 *
 * TODO: it seems impossible for this to obey the desired axioms.
 * Specifically inverse needs to cancel, restoring the value from the previous change which was discarded.
 */
export function lastWriteWinsRebaser<TChange>(data: {
	noop: TChange;
	invert: (changes: TChange) => TChange;
}): FieldChangeRebaser<TChange> {
	const compose = (_change1: TChange, change2: TChange) => change2;
	const rebase = (change: TChange, _over: TChange) => change;
	return referenceFreeFieldChangeRebaser({ ...data, compose, rebase });
}

export interface Replacement<T> {
	old: T;
	new: T;
}

export type ReplaceOp<T> = Replacement<T> | 0;

/**
 * Picks the last value written.
 *
 * Consistent if used on valid paths with correct old states.
 */
export function replaceRebaser<T>(): FieldChangeRebaser<ReplaceOp<T>> {
	return referenceFreeFieldChangeRebaser({
		rebase: (change: ReplaceOp<T>, over: ReplaceOp<T>) => {
			if (change === 0) {
				return 0;
			}
			if (over === 0) {
				return change;
			}
			return { old: over.new, new: change.new };
		},
		compose: (change1: ReplaceOp<T>, change2: ReplaceOp<T>) => {
			if (change1 === 0) {
				return change2;
			} else if (change2 === 0) {
				return change1;
			}

			return { old: change1.old, new: change2.new };
		},
		invert: (changes: ReplaceOp<T>) => {
			return changes === 0 ? 0 : { old: changes.new, new: changes.old };
		},
	});
}

export type ValueChangeset = ReplaceOp<number>;

export const valueHandler = {
	rebaser: replaceRebaser(),
	codecsFactory: () =>
		makeCodecFamily([
			[1, makeValueCodec<TUnsafe<ValueChangeset>, FieldChangeEncodingContext>(Type.Any())],
		]),
	editor: { buildChildChange: (index, change) => fail("Child changes not supported") },

	intoDelta: ({ change, revision }): DeltaFieldChanges => {
		const delta: Mutable<DeltaFieldChanges> = {};
		if (change !== 0) {
			// We use the new and old numbers as the node ids.
			// These would have no real meaning to a delta consumer, but these delta are only used for testing.
			const detach = makeDetachedNodeId(revision, change.old);
			const attach = makeDetachedNodeId(revision, change.new);
			delta.local = [{ count: 1, attach, detach }];
		}
		return delta;
	},

	relevantRemovedRoots: (change) => [],
	isEmpty: (change) => change === 0,
	createEmpty: () => 0,
} satisfies FieldChangeHandler<ValueChangeset>;

export const valueField = new FieldKindWithEditor(
	"Value",
	Multiplicity.Single,
	valueHandler,
	(a, b) => false,
	new Set(),
);
