/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { singleTextCursor } from "../../treeTextCursor";
import { TreeSchemaIdentifier, FieldKey, Value, Delta } from "../../../core";
import { brand, brandOpaque, clone, fail, makeArray, OffsetListFactory } from "../../../util";
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

function convertMarkList(marks: T.MarkList): Delta.MarkList {
	const out = new OffsetListFactory<Delta.Mark>();
	for (const mark of marks) {
		if (isSkipMark(mark)) {
			out.pushOffset(mark);
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
					out.pushContent(insertMark);
					break;
				}
				case "MInsert": {
					const insertMark: Delta.InsertAndModify = {
						...convertModify(mark),
						type: Delta.MarkType.InsertAndModify,
						content: singleTextCursor(mark.content),
					};
					out.pushContent(insertMark);
					break;
				}
				case "MoveIn": {
					const moveMark: Delta.MoveIn = {
						type: Delta.MarkType.MoveIn,
						count: mark.count,
						moveId: brandOpaque<Delta.MoveId>(mark.id),
					};
					out.pushContent(moveMark);
					break;
				}
				case "MMoveIn":
					fail(ERR_NOT_IMPLEMENTED);
				case "Bounce":
				case "Intake":
					// These have no impacts on the document state.
					break;
				case "Modify": {
					if (mark.tomb === undefined) {
						out.pushContent({
							type: Delta.MarkType.Modify,
							...convertModify(mark),
						});
					}
					break;
				}
				case "Delete": {
					const deleteMark: Delta.Delete = {
						type: Delta.MarkType.Delete,
						count: mark.count,
					};
					out.pushContent(deleteMark);
					break;
				}
				case "MDelete": {
					const fields = convertModify(mark).fields;
					if (fields !== undefined) {
						const deleteMark: Delta.ModifyAndDelete = {
							type: Delta.MarkType.ModifyAndDelete,
							fields,
						};
						out.pushContent(deleteMark);
					} else {
						const deleteMark: Delta.Delete = {
							type: Delta.MarkType.Delete,
							count: 1,
						};
						out.pushContent(deleteMark);
					}
					break;
				}
				case "MoveOut": {
					const moveMark: Delta.MoveOut = {
						type: Delta.MarkType.MoveOut,
						moveId: brandOpaque<Delta.MoveId>(mark.id),
						count: mark.count,
					};
					out.pushContent(moveMark);
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
					out.pushContent(insertMark);
					break;
				}
				case "MRevive": {
					const insertMark: Delta.Insert = {
						type: Delta.MarkType.Insert,
						// TODO: Restore the actual node
						content: [singleTextCursor({ type: DUMMY_REVIVED_NODE_TYPE })],
					};
					out.pushContent(insertMark);
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
	return out.list;
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
	fields?: Delta.FieldMarks;
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

function convertFieldMarks(fields: T.FieldMarks): Delta.FieldMarks {
	const outFields: Map<FieldKey, Delta.MarkList> = new Map();
	for (const key of Object.keys(fields)) {
		const marks = convertMarkList(fields[key]);
		const brandedKey: FieldKey = brand(key);
		outFields.set(brandedKey, marks);
	}
	return outFields;
}
