/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";
import * as Type from "@sinclair/typebox";

import { makeCodecFamily, type IJsonCodec } from "../../codec/index.js";
import { Multiplicity, type ChangeAtomId } from "../../core/index.js";
import { brand } from "../../util/index.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";
import { chunkFieldSingle, defaultChunkPolicy } from "../chunked-forest/index.js";
import { cursorForMapTreeField } from "../mapTreeCursor.js";
import { counterFieldIdentifier } from "../fieldKindIdentifiers.js";
import {
	EncodedChangeAtomId,
	FlexFieldKind,
	type FieldChangeHandler,
	type FieldChangeRebaser,
	type FieldEditor,
	type FieldChangeEncodingContext,
	type FieldChangeDecodingContext,
} from "../modular-schema/index.js";

/**
 * A counter contribution and the context needed to materialize it without reading the forest.
 * @remarks
 * The numeric child is replaced on every effective edit; neither ID is its persistent identity.
 * Both IDs must be distinct and reserved in the enclosing modular changeset's ID namespace.
 * Delta application releases both temporary storage locations before the next delta.
 */
export interface CounterAddition {
	/**
	 * The value in this change's input context; rebasing updates it to the base change's output.
	 */
	readonly before: number;
	/**
	 * The contribution to apply, retained across rebases and negated on inversion.
	 */
	readonly amount: number;
	/**
	 * Temporary detached location where the new numeric leaf is built before attachment.
	 */
	readonly fillId: ChangeAtomId;
	/**
	 * Temporary detached location for the old leaf, which is destroyed in the same delta.
	 */
	readonly detachId: ChangeAtomId;
}

/**
 * A single composed counter contribution, or `undefined` for an empty change.
 * A zero contribution also has no delta effect.
 */
export type CounterChangeset = CounterAddition | undefined;

/**
 * Constructs counter changes from caller-supplied values and reserved storage IDs.
 * Numeric children cannot receive independent edits through `buildChildChanges`.
 */
export interface CounterFieldEditor extends FieldEditor<CounterChangeset> {
	/**
	 * Records an addition without reading or changing tree state.
	 * @param before - The numeric value immediately before the edit.
	 * @param amount - The contribution to add. Numeric validation is the caller's responsibility.
	 * @param fillId - Reserved ID for building and attaching the computed result.
	 * @param detachId - A distinct reserved ID for detaching and destroying the old leaf.
	 * @returns The additive change, including the context needed for delta conversion.
	 */
	add(
		before: number,
		amount: number,
		fillId: ChangeAtomId,
		detachId: ChangeAtomId,
	): CounterChangeset;
}

/**
 * Composes contributions, rebases their input values, and inverts them without numeric repair data.
 * @remarks
 * Uses ordinary JavaScript arithmetic; algebraic equivalence is limited by its rounding and overflow.
 * Temporary storage IDs participate in revision replacement but not in child or cross-field tracking.
 */
export const counterRebaser: FieldChangeRebaser<CounterChangeset> = {
	compose: (first, second) =>
		first === undefined
			? second
			: second === undefined
				? first
				: { ...first, amount: first.amount + second.amount },
	invert: (change, isRollback, genId, revision) =>
		change === undefined
			? undefined
			: {
					before: change.before + change.amount,
					amount: -change.amount,
					// Rollback revisions are normalized to the original revision. Fresh IDs based
					// on one transaction step's maxId can collide with later steps in that revision.
					// Both temporary IDs are released after every delta, so rollback can reuse them.
					fillId: isRollback ? change.fillId : { localId: genId.allocate(), revision },
					detachId: isRollback ? change.detachId : { localId: genId.allocate(), revision },
				},
	rebase: (change, over) =>
		change === undefined || over === undefined
			? change
			: { ...change, before: over.before + over.amount },
	prune: (change) => change,
	replaceRevisions: (change, replacer) =>
		change === undefined
			? undefined
			: {
					...change,
					fillId: replacer.getUpdatedAtomId(change.fillId),
					detachId: replacer.getUpdatedAtomId(change.detachId),
				},
	filterEdits: (change, options) =>
		(options.preserveValueChanges ?? options.preserveOtherEdits) ? change : undefined,
};

/**
 * Counter codec version 1: contextual additions with encoded storage IDs, or `null` for an empty change.
 */
const EncodedCounterChange = Type.Union([
	Type.Null(),
	Type.Object({
		before: Type.Number(),
		amount: Type.Number(),
		fillId: EncodedChangeAtomId,
		detachId: EncodedChangeAtomId,
	}),
]);
type EncodedCounterChange = Type.Static<typeof EncodedCounterChange>;

/**
 * Lowers additive changes to single-leaf replacements using existing delta operations.
 * @remarks
 * Each effective change builds its result and destroys the old leaf in the same delta.
 * Undo recomputes a numeric result rather than restoring a leaf's identity.
 * Counter edits therefore need neither retained numeric roots nor independently edited children.
 */
export const counterChangeHandler: FieldChangeHandler<CounterChangeset, CounterFieldEditor> = {
	rebaser: counterRebaser,
	codecsFactory: (revisionCodec) => {
		const ids = makeChangeAtomIdCodec(revisionCodec);
		const codec: IJsonCodec<
			CounterChangeset,
			EncodedCounterChange,
			EncodedCounterChange,
			FieldChangeEncodingContext,
			FieldChangeDecodingContext
		> = {
			encodedSchema: EncodedCounterChange,
			encode: (change, context) =>
				change === undefined
					? null
					: {
							...change,
							fillId: ids.encode(change.fillId, context.baseContext),
							detachId: ids.encode(change.detachId, context.baseContext),
						},
			decode: (change, context) =>
				change === null
					? undefined
					: {
							...change,
							fillId: ids.decode(change.fillId, context.baseContext),
							detachId: ids.decode(change.detachId, context.baseContext),
						},
		};
		return makeCodecFamily([[1, codec]]);
	},
	editor: {
		buildChildChanges: (changes) => {
			for (const _change of changes) {
				fail("Counter children cannot be edited independently");
			}
			return undefined;
		},
		add: (before, amount, fillId, detachId) => ({ before, amount, fillId, detachId }),
	},
	intoDelta: (change) => {
		if (change === undefined || change.amount === 0) {
			return {};
		}
		const fill = { major: change.fillId.revision, minor: change.fillId.localId };
		const detach = { major: change.detachId.revision, minor: change.detachId.localId };
		return {
			build: [
				{
					id: fill,
					trees: chunkFieldSingle(
						cursorForMapTreeField([
							{
								type: brand("com.fluidframework.leaf.number"),
								fields: new Map(),
								value: change.before + change.amount,
							},
						]),
						{ policy: defaultChunkPolicy, idCompressor: undefined },
					),
				},
			],
			local: { marks: [{ count: 1, attach: fill, detach }] },
			destroy: [{ id: detach, count: 1 }],
		};
	},
	relevantRemovedRoots: () => [],
	isEmpty: (change) => change === undefined || change.amount === 0,
	getNestedChanges: () => [],
	getCrossFieldKeys: () => [],
	createEmpty: () => undefined,
};

/**
 * Experimental field containing exactly one built-in numeric leaf, edited by addition.
 * @remarks
 * Its stored identity and merge semantics differ from a required field even though their forest shapes match.
 * No schema upgrade between these kinds is enabled; encoding requires the experimental counter format.
 */
export const counter = new FlexFieldKind(counterFieldIdentifier, Multiplicity.Single, {
	changeHandler: counterChangeHandler,
	allowMonotonicUpgradeFrom: new Set(),
});
