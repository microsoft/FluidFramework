/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { Type } from "@sinclair/typebox";
import { JsonCompatible, JsonCompatibleReadOnly, fail } from "../../util";
import { IJsonCodec, makeCodecFamily } from "../../codec";
import { jsonableTreeFromCursor, singleTextCursor } from "../treeTextCursor";
import { Changeset, Mark, NoopMarkType } from "./format";

export const sequenceFieldChangeCodecFactory = <TNodeChange>(childCodec: IJsonCodec<TNodeChange>) =>
	makeCodecFamily<Changeset<TNodeChange>>([[0, makeV0Codec(childCodec)]]);

function makeV0Codec<TNodeChange>(
	childCodec: IJsonCodec<TNodeChange>,
): IJsonCodec<Changeset<TNodeChange>> {
	return {
		encode: (changeset) => {
			const jsonMarks: JsonCompatible[] = [];
			for (const mark of changeset) {
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
					case NoopMarkType:
					case "MoveIn":
					case "ReturnTo":
						jsonMarks.push(mark as unknown as JsonCompatible);
						break;
					case "Placeholder":
						fail("Should not have placeholders in serialized changeset");
					default:
						unreachableCase(type);
				}
			}
			return jsonMarks;
		},
		decode: (changeset) => {
			const marks: Changeset<TNodeChange> = [];
			const array = changeset as unknown as Changeset<JsonCompatibleReadOnly>;
			for (const mark of array) {
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
					case NoopMarkType:
					case "MoveIn":
					case "ReturnTo":
						marks.push(mark);
						break;
					case "Placeholder":
						fail("Should not have placeholders in serialized changeset");
					default:
						unreachableCase(type);
				}
			}
			return marks;
		},
		encodedSchema: Changeset(childCodec.encodedSchema ?? Type.Any()),
	};
}
