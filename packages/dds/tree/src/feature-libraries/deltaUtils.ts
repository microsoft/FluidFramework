/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
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
		case Delta.MarkType.Modify: {
			if (mark.fields === undefined && mark.setValue === undefined) {
				return { type: Delta.MarkType.Modify };
			}
			return mark.fields === undefined
				? {
						type: Delta.MarkType.Modify,
						setValue: mark.setValue,
				  }
				: {
						...mark,
						fields: mapFieldMarks(mark.fields, func),
				  };
		}
		case Delta.MarkType.ModifyAndMoveOut: {
			if (mark.fields === undefined && mark.setValue === undefined) {
				return {
					type: Delta.MarkType.ModifyAndMoveOut,
					moveId: mark.moveId,
				};
			}
			return mark.fields === undefined
				? {
						type: Delta.MarkType.ModifyAndMoveOut,
						moveId: mark.moveId,
						setValue: mark.setValue,
				  }
				: {
						...mark,
						fields: mapFieldMarks(mark.fields, func),
				  };
		}
		case Delta.MarkType.MoveInAndModify:
		case Delta.MarkType.ModifyAndDelete: {
			return {
				...mark,
				fields: mapFieldMarks(mark.fields, func),
			};
		}
		case Delta.MarkType.Insert: {
			return {
				type: Delta.MarkType.Insert,
				content: mark.content.map(func),
			};
		}
		case Delta.MarkType.InsertAndModify: {
			const out: Mutable<Delta.InsertAndModify<TOut>> = {
				type: Delta.MarkType.InsertAndModify,
				content: func(mark.content),
			};
			if (mark.fields !== undefined) {
				out.fields = mapFieldMarks(mark.fields, func);
			}
			if (Object.prototype.hasOwnProperty.call(mark, "setValue")) {
				out.setValue = mark.setValue;
			}
			return out;
		}
		case Delta.MarkType.Delete:
		case Delta.MarkType.MoveIn:
		case Delta.MarkType.MoveOut:
			return mark;
		default:
			unreachableCase(type);
	}
}
