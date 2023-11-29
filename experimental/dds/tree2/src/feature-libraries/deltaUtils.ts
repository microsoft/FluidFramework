/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeAtomId, Delta, FieldKey, makeDetachedNodeId } from "../core";
import { Mutable } from "../util";

export function nodeIdFromChangeAtom(changeAtom: ChangeAtomId): Delta.DetachedNodeId {
	return makeDetachedNodeId(changeAtom.revision, changeAtom.localId);
}

/**
 * Converts a `Delta.Root` whose tree content is represented with by `TIn` instances
 * into a `Delta.Root`whose tree content is represented with by `TOut` instances.
 *
 * This function is useful for converting `Delta`s that represent tree content with cursors
 * into `Delta`s that represent tree content with a deep-comparable representation of the content.
 * See {@link assertDeltaEqual}.
 * @param root - The delta to convert. Not mutated.
 * @param func - The functions used to map tree content.
 */
export function mapRootChanges<TIn, TOut>(
	root: Delta.Root<TIn>,
	func: (tree: TIn) => TOut,
): Delta.Root<TOut> {
	const out: Mutable<Delta.Root<TOut>> = {};
	if (root.fields !== undefined) {
		out.fields = mapFieldsChanges(root.fields, func);
	}
	if (root.build !== undefined) {
		out.build = root.build.map(({ id, trees }) => ({
			id,
			trees: trees.map(func),
		}));
	}
	return out;
}

/**
 * Converts a `Delta.FieldMarks` whose tree content is represented with by `TIn` instances
 * into a `Delta.FieldMarks`whose tree content is represented with by `TOut` instances.
 *
 * This function is useful for converting `Delta`s that represent tree content with cursors
 * into `Delta`s that represent tree content with a deep-comparable representation of the content.
 * See {@link assertDeltaEqual}.
 * @param fields - The Map of fields to convert. Not mutated.
 * @param func - The functions used to map tree content.
 */
export function mapFieldsChanges<TIn, TOut>(
	fields: Delta.FieldMap<TIn>,
	func: (tree: TIn) => TOut,
): Delta.FieldMap<TOut> {
	const out: Map<FieldKey, Delta.FieldChanges<TOut>> = new Map();
	for (const [k, v] of fields) {
		out.set(k, mapFieldChanges(v, func));
	}
	return out;
}

/**
 * Converts a `Delta.FieldChanges` whose tree content is represented with by `TIn` instances
 * into a `Delta.FieldChanges`whose tree content is represented with by `TOut` instances.
 *
 * This function is useful for converting `Delta`s that represent tree content with cursors
 * into `Delta`s that represent tree content with a deep-comparable representation of the content.
 * See {@link assertMarkListEqual}.
 * @param fieldChanges - The instance to convert. Not mutated.
 * @param func - The functions used to map tree content.
 */
export function mapFieldChanges<TIn, TOut>(
	fieldChanges: Delta.FieldChanges<TIn>,
	func: (tree: TIn) => TOut,
): Delta.FieldChanges<TOut> {
	const out: Mutable<Delta.FieldChanges<TOut>> = {};
	if (fieldChanges.local !== undefined) {
		out.local = mapMarkList(fieldChanges.local, func);
	}
	if (fieldChanges.global !== undefined) {
		out.global = fieldChanges.global.map(({ id, fields }) => ({
			id,
			fields: mapFieldsChanges(fields, func),
		}));
	}
	if (fieldChanges.build !== undefined) {
		out.build = fieldChanges.build.map(({ id, trees }) => ({
			id,
			trees: trees.map(func),
		}));
	}
	if (fieldChanges.rename !== undefined) {
		out.rename = fieldChanges.rename;
	}
	return out;
}

/**
 * Converts a list of `Delta.Mark`s whose tree content is represented by `TIn` instances
 * into a list of `Delta.Mark`s whose tree content is represented by `TOut` instances.
 *
 * This function is useful for converting `Delta`s that represent tree content with cursors
 * into `Delta`s that represent tree content with a deep-comparable representation of the content.
 * See {@link assertMarkListEqual}.
 * @param list - The list of marks to convert. Not mutated.
 * @param func - The functions used to map tree content.
 */
export function mapMarkList<TIn, TOut>(
	list: readonly Delta.Mark<TIn>[],
	func: (tree: TIn) => TOut,
): Delta.Mark<TOut>[] {
	return list.map((mark: Delta.Mark<TIn>) => mapMark(mark, func));
}

/**
 * Converts a `Delta.Mark` whose tree content is represented with by `TIn` instances
 * into a `Delta.Mark`whose tree content is represented with by `TOut` instances.
 *
 * This function is useful for converting `Delta`s that represent tree content with cursors
 * into `Delta`s that represent tree content with a deep-comparable representation of the content.
 * See {@link assertMarkListEqual}.
 * @param mark - The mark to convert. Not mutated.
 * @param func - The functions used to map tree content.
 */
export function mapMark<TIn, TOut>(
	mark: Delta.Mark<TIn>,
	func: (tree: TIn) => TOut,
): Delta.Mark<TOut> {
	const out: Mutable<Delta.Mark<TOut>> = { count: mark.count };
	if (mark.fields !== undefined) {
		out.fields = mapFieldsChanges(mark.fields, func);
	}
	if (mark.detach !== undefined) {
		out.detach = mark.detach;
	}
	if (mark.attach !== undefined) {
		out.attach = mark.attach;
	}
	return out;
}
