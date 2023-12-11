/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ChangeAtomId,
	DeltaDetachedNodeId,
	DeltaFieldChanges,
	DeltaFieldMap,
	DeltaMark,
	DeltaRoot,
	FieldKey,
	RevisionTag,
	makeDetachedNodeId,
} from "../core";
import { Mutable } from "../util";

export function nodeIdFromChangeAtom(
	changeAtom: ChangeAtomId,
	fallbackRevision?: RevisionTag,
): DeltaDetachedNodeId {
	return makeDetachedNodeId(changeAtom.revision ?? fallbackRevision, changeAtom.localId);
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
	root: DeltaRoot<TIn>,
	func: (tree: TIn) => TOut,
): DeltaRoot<TOut> {
	const out: Mutable<DeltaRoot<TOut>> = {};
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
	fields: DeltaFieldMap<TIn>,
	func: (tree: TIn) => TOut,
): DeltaFieldMap<TOut> {
	const out: Map<FieldKey, DeltaFieldChanges<TOut>> = new Map();
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
	fieldChanges: DeltaFieldChanges<TIn>,
	func: (tree: TIn) => TOut,
): DeltaFieldChanges<TOut> {
	const out: Mutable<DeltaFieldChanges<TOut>> = {};
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
	list: readonly DeltaMark<TIn>[],
	func: (tree: TIn) => TOut,
): DeltaMark<TOut>[] {
	return list.map((mark: DeltaMark<TIn>) => mapMark(mark, func));
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
	mark: DeltaMark<TIn>,
	func: (tree: TIn) => TOut,
): DeltaMark<TOut> {
	const out: Mutable<DeltaMark<TOut>> = { count: mark.count };
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
