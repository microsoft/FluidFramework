/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { JsonCompatible, JsonCompatibleReadOnly } from "../../util";
import { IJsonCodec, makeCodecFamily } from "../../codec";
import { jsonableTreeFromCursor, singleTextCursor } from "../treeTextCursor";
import { Changeset, Mark } from "./format";
import { isSkipMark } from "./utils";

export const sequenceFieldChangeCodecFactory = <TNodeChange>(childCodec: IJsonCodec<TNodeChange>) =>
	makeCodecFamily<Changeset<TNodeChange>>([
		[
			0,
			{
				encode: (changeset) => encodeForJson(changeset, childCodec),
				decode: (changeset) => decodeJson(changeset, childCodec),
			},
		],
	]);

function encodeForJson<TNodeChange>(
	markList: Changeset<TNodeChange>,
	childCodec: IJsonCodec<TNodeChange>,
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
					if (mark.changes !== undefined) {
						jsonMarks.push({
							...mark,
							changes: childCodec.encode(mark.changes),
						} as unknown as JsonCompatible);
					} else {
						jsonMarks.push(mark as Mark<TNodeChange> & JsonCompatible);
					}

					break;
				case "Revive": {
					const content = mark.content.map(jsonableTreeFromCursor);
					if (mark.changes !== undefined) {
						jsonMarks.push({
							...mark,
							content,
							changes: childCodec.encode(mark.changes),
						} as unknown as JsonCompatible);
					} else {
						jsonMarks.push({
							...mark,
							content,
						} as unknown as JsonCompatible);
					}
					break;
				}
				case "Modify":
					jsonMarks.push({
						...mark,
						changes: childCodec.encode(mark.changes),
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
	return jsonMarks;
}

function decodeJson<TNodeChange>(
	change: JsonCompatibleReadOnly,
	childCodec: IJsonCodec<TNodeChange>,
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
						changes: childCodec.decode(mark.changes),
					});
					break;
				}
				case "Insert":
				case "Delete":
				case "MoveOut":
				case "ReturnFrom": {
					if (mark.changes !== undefined) {
						marks.push({
							...mark,
							changes: childCodec.decode(mark.changes),
						});
					} else {
						marks.push(mark as Mark<TNodeChange>);
					}
					break;
				}
				case "Revive": {
					const content = mark.content.map(singleTextCursor);
					if (mark.changes !== undefined) {
						marks.push({
							...mark,
							content,
							changes: childCodec.decode(mark.changes),
						});
					} else {
						marks.push({
							...mark,
							content,
						} as unknown as Mark<TNodeChange>);
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
