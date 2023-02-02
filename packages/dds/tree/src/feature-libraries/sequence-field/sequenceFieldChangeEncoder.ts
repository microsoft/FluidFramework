/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { JsonCompatible, JsonCompatibleReadOnly } from "../../util";
import { FieldChangeEncoder } from "../modular-schema";
import { Changeset, Mark } from "./format";
import { isSkipMark } from "./utils";

export const sequenceFieldChangeEncoder: FieldChangeEncoder<Changeset> = {
	encodeForJson,
	decodeJson,
};

export type NodeChangeEncoder<TNodeChange> = (change: TNodeChange) => JsonCompatibleReadOnly;
export type NodeChangeDecoder<TNodeChange> = (change: JsonCompatibleReadOnly) => TNodeChange;

export function encodeForJson<TNodeChange>(
	formatVersion: number,
	markList: Changeset<TNodeChange>,
	encodeChild: NodeChangeEncoder<TNodeChange>,
): JsonCompatibleReadOnly {
	const jsonMarks: JsonCompatible[] = [];
	for (const mark of markList) {
		if (isSkipMark(mark)) {
			jsonMarks.push(mark);
		} else {
			const type = mark.type;
			switch (type) {
				case "Insert":
				case "Delete":
				case "MoveOut":
				case "ReturnFrom":
				case "Revive":
					if (mark.changes !== undefined) {
						jsonMarks.push({
							...mark,
							changes: encodeChild(mark.changes),
						} as unknown as JsonCompatible);
					} else {
						jsonMarks.push(mark as Mark<TNodeChange> & JsonCompatible);
					}

					break;
				case "Modify":
					jsonMarks.push({
						...mark,
						changes: encodeChild(mark.changes),
					} as unknown as JsonCompatible);
					break;
				case "MoveIn":
				case "ReturnTo":
					jsonMarks.push(mark as unknown as JsonCompatible);
					break;
				default:
					unreachableCase(type);
			}
		}
	}
	return jsonMarks as JsonCompatibleReadOnly;
}

export function decodeJson<TNodeChange>(
	formatVersion: number,
	change: JsonCompatibleReadOnly,
	decodeChild: NodeChangeDecoder<TNodeChange>,
): Changeset<TNodeChange> {
	const marks: Changeset<TNodeChange> = [];
	const array = change as Changeset<JsonCompatibleReadOnly>;
	for (const mark of array) {
		if (isSkipMark(mark)) {
			marks.push(mark);
		} else {
			const type = mark.type;
			switch (type) {
				case "Modify": {
					marks.push({
						...mark,
						changes: decodeChild(mark.changes),
					});
					break;
				}
				case "Insert":
				case "Delete":
				case "MoveOut":
				case "ReturnFrom":
				case "Revive": {
					if (mark.changes !== undefined) {
						marks.push({
							...mark,
							changes: decodeChild(mark.changes),
						});
					} else {
						marks.push(mark as Mark<TNodeChange>);
					}
					break;
				}
				case "MoveIn":
				case "ReturnTo":
					marks.push(mark);
					break;
				default:
					unreachableCase(type);
			}
		}
	}
	return marks;
}
