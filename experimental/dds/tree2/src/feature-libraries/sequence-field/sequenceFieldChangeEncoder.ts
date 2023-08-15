/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { Type } from "@sinclair/typebox";
import { JsonCompatible, JsonCompatibleReadOnly, fail } from "../../util";
import { IJsonCodec, makeCodecFamily } from "../../codec";
import { jsonableTreeFromCursor, singleTextCursor } from "../treeTextCursor";
import { Changeset, Mark, NoopMarkType, Revive } from "./format";

export const sequenceFieldChangeCodecFactory = <TNodeChange>(childCodec: IJsonCodec<TNodeChange>) =>
	makeCodecFamily<Changeset<TNodeChange>>([[0, makeV0Codec(childCodec)]]);

function makeV0Codec<TNodeChange>(
	childCodec: IJsonCodec<TNodeChange>,
): IJsonCodec<Changeset<TNodeChange>> {
	return {
		encode: (changeset) => {
			const jsonMarks: JsonCompatible[] = [];
			for (const mark of changeset) {
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				const encodedMark = { ...mark } as Mark<JsonCompatibleReadOnly>;
				if (mark.changes !== undefined) {
					encodedMark.changes = childCodec.encode(mark.changes);
				}
				const type = mark.type;
				switch (type) {
					case NoopMarkType:
					case "MoveIn":
					case "ReturnTo":
					case "Insert":
					case "Delete":
					case "MoveOut":
					case "ReturnFrom":
						break;
					case "Revive": {
						(encodedMark as unknown as { content: JsonCompatible[] }).content =
							mark.content.map(jsonableTreeFromCursor) as unknown as JsonCompatible[];
						break;
					}
					case "Placeholder":
						fail("Should not have placeholders in serialized changeset");
					default:
						unreachableCase(type);
				}
				jsonMarks.push(encodedMark as unknown as JsonCompatible);
			}
			return jsonMarks;
		},
		decode: (changeset) => {
			const marks: Changeset<TNodeChange> = [];
			const array = changeset as unknown as Changeset<JsonCompatibleReadOnly>;
			for (const mark of array) {
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				const decodedMark = { ...mark } as Mark<TNodeChange>;
				if (mark.changes !== undefined) {
					decodedMark.changes = childCodec.decode(mark.changes);
				}
				const type = mark.type;
				switch (type) {
					case NoopMarkType:
					case "MoveIn":
					case "ReturnTo":
					case "Insert":
					case "Delete":
					case "MoveOut":
					case "ReturnFrom":
						break;
					case "Revive": {
						(decodedMark as Revive<unknown>).content =
							mark.content.map(singleTextCursor);
						break;
					}
					case "Placeholder":
						fail("Should not have placeholders in serialized changeset");
					default:
						unreachableCase(type);
				}
				marks.push(decodedMark);
			}
			return marks;
		},
		encodedSchema: Changeset(childCodec.encodedSchema ?? Type.Any()),
	};
}
