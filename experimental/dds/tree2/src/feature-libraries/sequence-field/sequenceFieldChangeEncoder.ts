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

type JsonCompatibleEffect = JsonCompatible & Effect<JsonCompatible | JsonCompatibleReadOnly>;
type JsonCompatibleMark = JsonCompatible & Mark<JsonCompatible | JsonCompatibleReadOnly>;

function makeV0Codec<TNodeChange>(
	childCodec: IJsonCodec<TNodeChange>,
): IJsonCodec<Changeset<TNodeChange>> {
	function encodeEffect(effect: Effect<TNodeChange>): JsonCompatibleEffect {
		const type = effect.type;
		switch (type) {
			case "Insert":
			case "Delete":
			case "MoveOut":
			case "ReturnFrom":
				return (
					effect.changes !== undefined
						? {
								...effect,
								changes: childCodec.encode(effect.changes),
						  }
						: effect
				) as JsonCompatibleEffect;
			case "Revive": {
				const content = effect.content.map(jsonableTreeFromCursor);
				return (
					effect.changes !== undefined
						? {
								...effect,
								content,
								changes: childCodec.encode(effect.changes),
						  }
						: {
								...effect,
								content,
						  }
				) as JsonCompatibleEffect;
			}
			case "Modify":
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				return {
					...effect,
					changes: childCodec.encode(effect.changes),
				} as JsonCompatibleEffect;
			case NoopMarkType:
			case "MoveIn":
			case "ReturnTo":
				return effect as JsonCompatibleEffect;
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
					jsonMarks.push(mark as JsonCompatibleMark);
				} else {
					const encodedMark: JsonCompatibleMark = {
						count: mark.count,
						effect: effect.map((e) => encodeEffect(e)),
					};
					if (mark.cellId !== undefined) {
						encodedMark.cellId = mark.cellId;
					}
					jsonMarks.push(encodedMark as JsonCompatibleMark);
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
					const decodedMark: Mark<TNodeChange> = {
						count: mark.count,
						effect: mark.effect.map((e) => decodeEffect(e)),
					};
					if (mark.cellId !== undefined) {
						decodedMark.cellId = mark.cellId;
					}
					marks.push(decodedMark);
				}
			}
			return marks;
		},
		encodedSchema: Changeset(childCodec.encodedSchema ?? Type.Any()),
	};
}
