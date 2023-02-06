/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { singleTextCursor } from "../../treeTextCursor";
import { TreeSchemaIdentifier, FieldKey, Value, Delta } from "../../../core";
import {
	brand,
	brandOpaque,
	clone,
	fail,
	makeArray,
	Mutable,
	OffsetListFactory,
} from "../../../util";
import { Transposed as T } from "./format";
import { isSkipMark } from "./utils";

/**
 * Converts a Changeset into a Delta.
 * @param changeset - The Changeset to convert
 * @returns A Delta for applying the changes described in the given Changeset.
 */
export function toDelta(changeset: T.LocalChangeset): Delta.Root {
	// Save result to a constant to work around linter bug:
	// https://github.com/typescript-eslint/typescript-eslint/issues/5014
	const out: Delta.Root = convertFieldMarks(changeset.marks);
	return out;
}

function convertMarkList(marks: T.MarkList): Delta.FieldChanges {
	const markList = new OffsetListFactory<Delta.Mark>();
	const beforeShallow: Delta.NestedChange[] = [];
	const afterShallow: Delta.NestedChange[] = [];
	let inputIndex = 0;
	let outputIndex = 0;
	for (const mark of marks) {
		if (isSkipMark(mark)) {
			markList.pushOffset(mark);
			inputIndex += mark;
			outputIndex += mark;
		} else {
			// Inline into `switch(mark.type)` once we upgrade to TS 4.7
			const type = mark.type;
			switch (type) {
				case "Insert": {
					const insertMark: Delta.Insert = {
						type: Delta.MarkType.Insert,
						// TODO: can we skip this clone?
						content: clone(mark.content).map(singleTextCursor),
					};
					markList.pushContent(insertMark);
					outputIndex += mark.content.length;
					break;
				}
				case "MInsert": {
					const insertMark: Delta.Insert = {
						type: Delta.MarkType.Insert,
						content: [singleTextCursor(mark.content)],
					};
					markList.pushContent(insertMark);
					afterShallow.push({ index: outputIndex, ...convertModify(mark) });
					outputIndex += 1;
					break;
				}
				case "MoveIn": {
					const moveMark: Delta.MoveIn = {
						type: Delta.MarkType.MoveIn,
						count: mark.count,
						moveId: brandOpaque<Delta.MoveId>(mark.id),
					};
					markList.pushContent(moveMark);
					outputIndex += mark.count;
					break;
				}
				case "MMoveIn":
					fail(ERR_NOT_IMPLEMENTED);
				case "Bounce":
				case "Intake":
					// These have no impacts on the document state.
					break;
				case "Modify": {
					beforeShallow.push({ index: inputIndex, ...convertModify(mark) });
					inputIndex += 1;
					outputIndex += 1;
					break;
				}
				case "Delete": {
					const deleteMark: Delta.Delete = {
						type: Delta.MarkType.Delete,
						count: mark.count,
					};
					markList.pushContent(deleteMark);
					inputIndex += mark.count;
					break;
				}
				case "MDelete": {
					const fields = convertModify(mark).fields;
					if (fields !== undefined) {
						beforeShallow.push({ index: inputIndex, ...convertModify(mark) });
					}
					const deleteMark: Delta.Delete = {
						type: Delta.MarkType.Delete,
						count: 1,
					};
					markList.pushContent(deleteMark);
					inputIndex += 1;
					break;
				}
				case "MoveOut": {
					const moveMark: Delta.MoveOut = {
						type: Delta.MarkType.MoveOut,
						moveId: brandOpaque<Delta.MoveId>(mark.id),
						count: mark.count,
					};
					markList.pushContent(moveMark);
					inputIndex += mark.count;
					break;
				}
				case "Revive": {
					const insertMark: Delta.Insert = {
						type: Delta.MarkType.Insert,
						// TODO: Restore the actual node
						content: makeArray(mark.count, () =>
							singleTextCursor({ type: DUMMY_REVIVED_NODE_TYPE }),
						),
					};
					markList.pushContent(insertMark);
					outputIndex += mark.count;
					break;
				}
				case "MRevive": {
					const insertMark: Delta.Insert = {
						type: Delta.MarkType.Insert,
						// TODO: Restore the actual node
						content: [singleTextCursor({ type: DUMMY_REVIVED_NODE_TYPE })],
					};
					markList.pushContent(insertMark);
					outputIndex += 1;
					break;
				}
				case "MMoveOut":
				case "Return":
				case "MReturn":
				case "Gap":
					fail(ERR_NOT_IMPLEMENTED);
				case "Tomb": {
					// These tombs are only used to precisely describe the location of other attaches.
					// They have no impact on the current state.
					break;
				}
				default:
					unreachableCase(type);
			}
		}
	}
	const fieldChanges: Mutable<Delta.FieldChanges> = {};
	if (beforeShallow.length > 0) {
		fieldChanges.beforeShallow = beforeShallow;
	}
	if (markList.list.length > 0) {
		fieldChanges.shallow = markList.list;
	}
	if (afterShallow.length > 0) {
		fieldChanges.afterShallow = afterShallow;
	}
	return fieldChanges;
}

const DUMMY_REVIVED_NODE_TYPE: TreeSchemaIdentifier = brand("RevivedNode");

const ERR_NOT_IMPLEMENTED = "Not implemented";

/**
 * Modifications to a subtree as described by a Changeset.
 */
interface ChangesetMods {
	value?: T.SetValue;
	fields?: T.FieldMarks;
}

/**
 * Modifications to a subtree as described by a Delta.
 */
interface DeltaMods {
	fields?: Delta.FieldChangeMap;
	setValue?: Value;
}

/**
 * Converts tree modifications from the Changeset to the Delta format.
 */
function convertModify(modify: ChangesetMods): DeltaMods {
	const out: DeltaMods = {};
	if (modify.value !== undefined) {
		out.setValue = modify.value.value;
	}
	const fields = modify.fields;
	if (fields !== undefined) {
		out.fields = convertFieldMarks(fields);
	}
	return out;
}

function convertFieldMarks(fields: T.FieldMarks): Delta.FieldChangeMap {
	const outFields: Map<FieldKey, Delta.FieldChanges> = new Map();
	for (const key of Object.keys(fields)) {
		const changes = convertMarkList(fields[key]);
		const brandedKey: FieldKey = brand(key);
		outFields.set(brandedKey, changes);
	}
	return outFields;
}
