/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { Type } from "@sinclair/typebox";
import { JsonCompatible, JsonCompatibleReadOnly, fail } from "../../util";
import { IJsonCodec, makeCodecFamily } from "../../codec";
import { jsonableTreeFromCursor, singleTextCursor } from "../treeTextCursor";
import { Changeset, Effect, Mark, NoopMarkType } from "./format";

export const sequenceFieldChangeCodecFactory = <TNodeChange>(childCodec: IJsonCodec<TNodeChange>) =>
	makeCodecFamily<Changeset<TNodeChange>>([[0, makeV0Codec(childCodec)]]);

function makeV0Codec<TNodeChange>(
	childCodec: IJsonCodec<TNodeChange>,
): IJsonCodec<Changeset<TNodeChange>> {
	function encodeEffect(effect: Effect<TNodeChange>): JsonCompatibleReadOnly {
		const type = effect.type;
		switch (type) {
			case "Insert":
			case "Delete":
			case "MoveOut":
			case "ReturnFrom":
				return effect.changes !== undefined
					? ({
							...effect,
							changes: childCodec.encode(effect.changes),
					  } as unknown as JsonCompatible)
					: (effect as Effect<JsonCompatibleReadOnly> & JsonCompatibleReadOnly);
			case "Revive": {
				const content = effect.content.map(jsonableTreeFromCursor);
				return effect.changes !== undefined
					? ({
							...effect,
							content,
							changes: childCodec.encode(effect.changes),
					  } as unknown as JsonCompatible)
					: ({
							...effect,
							content,
					  } as unknown as JsonCompatible);
			}
			case "Modify":
				return {
					...effect,
					changes: childCodec.encode(effect.changes),
				} as unknown as JsonCompatible;
			case NoopMarkType:
			case "MoveIn":
			case "ReturnTo":
				return effect as unknown as JsonCompatible;
			case "Placeholder":
				fail("Should not have placeholders in serialized changeset");
			default:
				unreachableCase(type);
		}
	}

	function decodeEffect(effect: Effect<JsonCompatibleReadOnly>): Effect<TNodeChange> {
		const type = effect.type;
		switch (type) {
			case "Modify": {
				return {
					...effect,
					changes: childCodec.decode(effect.changes),
				};
			}
			case "Insert":
			case "Delete":
			case "MoveOut":
			case "ReturnFrom": {
				return effect.changes !== undefined
					? {
							...effect,
							changes: childCodec.decode(effect.changes),
					  }
					: (effect as Effect<never>);
			}
			case "Revive": {
				const content = effect.content.map(singleTextCursor);
				return effect.changes !== undefined
					? {
							...effect,
							content,
							changes: childCodec.decode(effect.changes),
					  }
					: ({
							...effect,
							content,
					  } as unknown as Effect<never>);
			}
			case NoopMarkType:
			case "MoveIn":
			case "ReturnTo":
				return effect;
			case "Placeholder":
				fail("Should not have placeholders in serialized changeset");
			default:
				unreachableCase(type);
		}
	}

	return {
		encode: (changeset) => {
			const jsonMarks: JsonCompatible[] = [];
			for (const mark of changeset) {
				const effect = mark.effect;
				if (effect === undefined) {
					jsonMarks.push(mark as unknown as JsonCompatible);
				} else {
					jsonMarks.push({
						count: mark.count,
						cellId: mark.cellId,
						effect: effect.map((e) => encodeEffect(e)),
					} as unknown as JsonCompatible);
				}
			}
			return jsonMarks;
		},
		decode: (changeset) => {
			const marks: Changeset<TNodeChange> = [];
			const array = changeset as unknown as Changeset<JsonCompatibleReadOnly>;
			for (const mark of array) {
				if (mark.effect === undefined) {
					marks.push(mark as Mark<TNodeChange>);
				} else {
					marks.push({
						count: mark.count,
						cellId: mark.cellId,
						effect: mark.effect.map((e) => decodeEffect(e)),
					});
				}
			}
			return marks;
		},
		encodedSchema: Changeset(childCodec.encodedSchema ?? Type.Any()),
	};
}
