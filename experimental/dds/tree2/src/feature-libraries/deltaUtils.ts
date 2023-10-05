/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils";
import { Delta, FieldKey, isSkipMark } from "../core";
import { Mutable } from "../util";

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
export function mapFieldMarks<TIn, TOut>(
	fields: Delta.FieldMarks<TIn>,
	func: (tree: TIn) => TOut,
): Delta.FieldMarks<TOut> {
	const out: Map<FieldKey, Delta.MarkList<TOut>> = new Map();
	for (const [k, v] of fields) {
		out.set(k, mapMarkList(v, func));
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
	if (isSkipMark(mark)) {
		return mark;
	}
	const type = mark.type;
	switch (type) {
		case Delta.MarkType.Insert: {
			return {
				type: Delta.MarkType.Insert,
				...mapModifications(mark, func),
				content: mark.content.map(func),
			};
		}
		case Delta.MarkType.Modify: {
			return {
				type: Delta.MarkType.Modify,
				...mapModifications(mark, func),
			};
		}
		case Delta.MarkType.MoveOut: {
			return {
				type: Delta.MarkType.MoveOut,
				count: mark.count,
				moveId: mark.moveId,
				...mapModifications(mark, func),
			};
		}
		case Delta.MarkType.Delete: {
			return {
				type: Delta.MarkType.Delete,
				count: mark.count,
				...mapModifications(mark, func),
			};
		}
		case Delta.MarkType.MoveIn:
			return mark;
		default:
			unreachableCase(type);
	}
}

function mapModifications<TIn, TOut>(
	mark: Delta.HasModifications<TIn>,
	func: (tree: TIn) => TOut,
): Delta.HasModifications<TOut> {
	const out: Mutable<Delta.HasModifications<TOut>> = {};
	if (mark.fields !== undefined) {
		out.fields = mapFieldMarks(mark.fields, func);
	}
	return out;
}

export function populateChildModifications(
	modifications: Delta.HasModifications,
	deltaMark: Mutable<Delta.HasModifications>,
): void {
	if (modifications.fields !== undefined) {
		deltaMark.fields = modifications.fields;
	}
}
