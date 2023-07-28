/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { Type } from "@sinclair/typebox";
import { JsonCompatibleReadOnly, fail } from "../../util";
import { IJsonCodec, makeCodecFamily } from "../../codec";
import { jsonableTreeFromCursor, singleTextCursor } from "../treeTextCursor";
import { Changeset, Effect, Mark, NoopMarkType } from "./format";

export const sequenceFieldChangeCodecFactory = <TNodeChange>(childCodec: IJsonCodec<TNodeChange>) =>
	makeCodecFamily<Changeset<TNodeChange>>([[0, makeV0Codec(childCodec)]]);

type EncodedEffect = JsonCompatibleReadOnly & Effect<JsonCompatibleReadOnly>;
type EncodedMark = JsonCompatibleReadOnly & Mark<JsonCompatibleReadOnly>;
type EncodedChangeset = JsonCompatibleReadOnly & Changeset<JsonCompatibleReadOnly>;

function makeV0Codec<TNodeChange>(
	childCodec: IJsonCodec<TNodeChange>,
): IJsonCodec<Changeset<TNodeChange>> {
	function encodeEffect(effect: Effect<TNodeChange>): EncodedEffect {
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
				) as EncodedEffect;
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
				) as EncodedEffect;
			}
			case "Modify":
				return {
					...effect,
					changes: childCodec.encode(effect.changes),
				};
			case NoopMarkType:
			case "MoveIn":
			case "ReturnTo":
				return effect as EncodedEffect;
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
			const encodedMarks: EncodedMark[] = [];
			for (const mark of changeset) {
				const encodedMark: EncodedMark = {
					count: mark.count,
				};
				const encodedEffects = mark.effects?.map((e) => encodeEffect(e));
				if (encodedEffects !== undefined && encodedEffects.length > 0) {
					encodedMark.effects = encodedEffects;
				}
				if (mark.cellId !== undefined) {
					encodedMark.cellId = mark.cellId;
				}
				encodedMarks.push(encodedMark);
			}
			return encodedMarks;
		},
		decode: (changeset) => {
			const decodedMarks: Changeset<TNodeChange> = [];
			const marks = changeset as EncodedChangeset;
			for (const mark of marks) {
				const decodedMark: Mark<TNodeChange> = {
					count: mark.count,
				};
				const decodedEffects = mark.effects?.map((e) => decodeEffect(e));
				if (decodedEffects !== undefined && decodedEffects.length > 0) {
					decodedMark.effects = decodedEffects;
				}
				if (mark.cellId !== undefined) {
					decodedMark.cellId = mark.cellId;
				}
				decodedMarks.push(decodedMark);
			}
			return decodedMarks;
		},
		encodedSchema: Changeset(childCodec.encodedSchema ?? Type.Any()),
	};
}
