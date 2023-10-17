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
	fields: Delta.FieldsChanges<TIn>,
	func: (tree: TIn) => TOut,
): Delta.FieldsChanges<TOut> {
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
	if (fieldChanges.attached !== undefined) {
		out.attached = mapMarkList(fieldChanges.attached, func);
	}
	if (fieldChanges.detached !== undefined) {
		out.detached = fieldChanges.detached.map(({ id, fields }) => ({
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
	if (fieldChanges.relocate !== undefined) {
		out.relocate = fieldChanges.relocate;
	}
	if (fieldChanges.destroy !== undefined) {
		out.destroy = fieldChanges.destroy;
	}
	return out;
}

/**
 * Converts a `Delta.MarkList` whose tree content is represented with by `TIn` instances
 * into a `Delta.MarkList`whose tree content is represented with by `TOut` instances.
 *
 * This function is useful for converting `Delta`s that represent tree content with cursors
 * into `Delta`s that represent tree content with a deep-comparable representation of the content.
 * See {@link assertMarkListEqual}.
 * @param list - The list of marks to convert. Not mutated.
 * @param func - The functions used to map tree content.
 */
export function mapMarkList<TIn, TOut>(
	list: Delta.MarkList<TIn>,
	func: (tree: TIn) => TOut,
): Delta.MarkList<TOut> {
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
