/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { TUnsafe } from "@sinclair/typebox";

import { eraseEncodedType, makeCodecFamily } from "../../../codec/index.js";
import {
	makeDetachedNodeId,
	Multiplicity,
	type FieldKindIdentifier,
	type DeltaFieldChanges,
} from "../../../core/index.js";
import {
	type FieldChangeEncodingContext,
	type FieldChangeHandler,
	type FieldChangeRebaser,
	FlexFieldKind,
	referenceFreeFieldChangeRebaser,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";
import { brandConst, JsonCompatibleReadOnlySchema } from "../../../util/index.js";
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
	mute: (changes: TChange) => TChange;
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
		mute: (_change: ReplaceOp<T>) => {
			return 0;
		},
	});
}

export type ValueChangeset = ReplaceOp<number>;

export const valueHandler = {
	rebaser: replaceRebaser(),
	codecsFactory: () => {
		const inner = makeValueCodec<TUnsafe<ValueChangeset>, FieldChangeEncodingContext>(
			JsonCompatibleReadOnlySchema,
		);
		return makeCodecFamily([[1, eraseEncodedType(inner)]]);
	},
	editor: { buildChildChanges: () => assert.fail("Child changes not supported") },

	intoDelta: (change): DeltaFieldChanges => {
		if (change !== 0) {
			// We use the new and old numbers as the node ids.
			// These would have no real meaning to a delta consumer, but these delta are only used for testing.
			const detach = makeDetachedNodeId(undefined, change.old);
			const attach = makeDetachedNodeId(undefined, change.new);
			return { marks: [{ count: 1, attach, detach }] };
		}
		return { marks: [] };
	},

	isEmpty: (change) => change === 0,
	getNestedChanges: (change) => [],
	createEmpty: () => 0,
	getCrossFieldKeys: (_change) => [],
	getDetachCellIds: (_change) => [],
} satisfies FieldChangeHandler<ValueChangeset>;

export const valueField = new FlexFieldKind(
	brandConst("Value")<FieldKindIdentifier>(),
	Multiplicity.Single,
	{ changeHandler: valueHandler, allowMonotonicUpgradeFrom: new Set() },
);
