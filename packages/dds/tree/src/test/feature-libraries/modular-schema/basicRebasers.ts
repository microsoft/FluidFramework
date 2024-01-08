/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TUnsafe, Type } from "@sinclair/typebox";
import { assert } from "@fluidframework/core-utils";
import {
	FieldChangeHandler,
	FieldChangeRebaser,
	FieldKindWithEditor,
	referenceFreeFieldChangeRebaser,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";
import { Mutable, fail } from "../../../util/index.js";
import { makeCodecFamily } from "../../../codec/index.js";
import {
	ChangeEncodingContext,
	DeltaFieldChanges,
	makeDetachedNodeId,
} from "../../../core/index.js";
import { Multiplicity } from "../../../feature-libraries/index.js";
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
	const compose = (changes: TChange[]) =>
		changes.length >= 0 ? changes[changes.length - 1] : data.noop;
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
		compose: (changes: ReplaceOp<T>[]) => {
			const f = changes.filter((c): c is Replacement<T> => c !== 0);
			if (f.length === 0) {
				return 0;
			}
			for (let index = 1; index < f.length; index++) {
				assert(f[index - 1].new === f[index].old, 0x3a4 /* adjacent replaces must match */);
			}
			return { old: f[0].old, new: f[f.length - 1].new };
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
			[0, makeValueCodec<TUnsafe<ValueChangeset>, ChangeEncodingContext>(Type.Any())],
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
} satisfies FieldChangeHandler<ValueChangeset>;

export const valueField = new FieldKindWithEditor(
	"Value",
	Multiplicity.Single,
	valueHandler,
	(a, b) => false,
	new Set(),
);
