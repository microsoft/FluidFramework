/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase, fail } from "@fluidframework/core-utils/internal";
import type { TAnySchema } from "@sinclair/typebox";

import {
	DiscriminatedUnionDispatcher,
	type DiscriminatedUnionLibrary,
	type IJsonCodec,
} from "../../codec/index.js";
import {
	areEqualChangeAtomIdOpts,
	areEqualChangeAtomIds,
	type ChangeAtomId,
	type ChangeEncodingContext,
	type ChangesetLocalId,
	type EncodedRevisionTag,
	type RevisionTag,
} from "../../core/index.js";
import { type JsonCompatibleReadOnly, type Mutable, brand } from "../../util/index.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";

import { Changeset as ChangesetSchema, type Encoded } from "./formatV2.js";
import {
	type Attach,
	type Changeset,
	type Detach,
	type Mark,
	type MarkEffect,
	NoopMarkType,
	type Rename,
} from "./types.js";
import {
	getAttachedNodeId,
	getDetachedNodeId,
	getDetachOutputCellId,
	getMovedNodeId,
	isNoopMark,
	splitMark,
} from "./utils.js";
import type { FieldChangeEncodingContext } from "../index.js";
import { EncodedNodeChangeset, type EncodedChangeAtomId } from "../modular-schema/index.js";
import type { SequenceCodecHelpers } from "./helperTypes.js";
import { rangeQueryChangeAtomIdMap } from "../modular-schema/modularChangeFamily.js";
import { isMoveMark } from "./moveEffectTable.js";

export function makeV2CodecHelpers(
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): SequenceCodecHelpers<MarkEffect, Encoded.MarkEffect> {
	const changeAtomIdCodec = makeChangeAtomIdCodec(revisionTagCodec);
	const markEffectCodec: IJsonCodec<
		MarkEffect,
		Encoded.MarkEffect,
		Encoded.MarkEffect,
		FieldChangeEncodingContext
	> = {
		encode(effect: MarkEffect, context: FieldChangeEncodingContext): Encoded.MarkEffect {
			function encodeRevision(
				revision: RevisionTag | undefined,
			): EncodedRevisionTag | undefined {
				if (revision === undefined || revision === context.baseContext.revision) {
					return undefined;
				}

				return revisionTagCodec.encode(revision, context.baseContext);
			}

			const type = effect.type;
			switch (type) {
				case "Insert":
					return context.isMoveId(getAttachedNodeId(effect), 1).value
						? {
								moveIn: { revision: encodeRevision(effect.revision), id: effect.id },
							}
						: {
								insert: {
									revision: encodeRevision(effect.revision),
									id: effect.id,
								},
							};
				case "Remove": {
					const encodedIdOverride =
						effect.idOverride === undefined
							? undefined
							: changeAtomIdCodec.encode(effect.idOverride, context.baseContext);

					// Having an idOverride means that this is not the final detach location, and should be encoded as a move.
					return context.isMoveId(getDetachedNodeId(effect), 1).value ||
						!areEqualChangeAtomIdOpts(effect.idOverride, {
							revision: effect.revision,
							localId: effect.id,
						})
						? {
								moveOut: {
									revision: encodeRevision(effect.revision),
									id: effect.id,
									idOverride: encodedIdOverride,
								},
							}
						: {
								remove: {
									revision: encodeRevision(effect.revision),
									idOverride: encodedIdOverride,
									id: effect.id,
								},
							};
				}
				case "Rename":
					return encodeRename(effect, context, changeAtomIdCodec, revisionTagCodec);
				case NoopMarkType:
					fail(0xb2c /* Mark type: NoopMarkType should not be encoded. */);
				default:
					unreachableCase(type);
			}
		},
		decode(encoded: Encoded.MarkEffect, context: FieldChangeEncodingContext): MarkEffect {
			return decoderDispatcher.dispatch(encoded, context.baseContext);
		},
	};

	function decodeRevision(
		encodedRevision: EncodedRevisionTag | undefined,
		context: ChangeEncodingContext,
	): RevisionTag {
		if (encodedRevision === undefined) {
			assert(context.revision !== undefined, 0x996 /* Implicit revision should be provided */);
			return context.revision;
		}

		return revisionTagCodec.decode(encodedRevision, context);
	}

	const decoderLibrary: DiscriminatedUnionLibrary<
		Encoded.MarkEffect,
		/* args */ [context: ChangeEncodingContext],
		MarkEffect
	> = {
		moveIn(encoded: Encoded.MoveIn, context: ChangeEncodingContext): Attach {
			const { id, revision } = encoded;
			const endpoint =
				encoded.finalEndpoint !== undefined
					? changeAtomIdCodec.decode(encoded.finalEndpoint, context)
					: undefined;

			const mark: Attach = {
				type: "Insert",
				id: endpoint?.localId ?? id,
				revision: endpoint?.revision ?? decodeRevision(revision, context),
			};

			return mark;
		},
		insert(encoded: Encoded.Insert, context: ChangeEncodingContext): Attach {
			const { id, revision } = encoded;
			const mark: Attach = {
				type: "Insert",
				id,
			};

			mark.revision = decodeRevision(revision, context);
			return mark;
		},
		remove(encoded: Encoded.Remove, context: ChangeEncodingContext): Detach {
			const { id, revision, idOverride } = encoded;
			const mark: Mutable<Detach> = {
				type: "Remove",
				id,
			};

			mark.revision = decodeRevision(revision, context);
			if (idOverride !== undefined) {
				mark.idOverride = changeAtomIdCodec.decode(idOverride, context);
			}
			return mark;
		},
		moveOut(encoded: Encoded.MoveOut, context: ChangeEncodingContext): Detach {
			const { id, idOverride, revision } = encoded;
			const mark: Mutable<Detach> = {
				type: "Remove",
				id,
			};

			// XXX: Final endpoint
			mark.revision = decodeRevision(revision, context);
			if (idOverride !== undefined) {
				mark.idOverride = changeAtomIdCodec.decode(idOverride, context);
			}

			return mark;
		},
		attachAndDetach(encoded: Encoded.AttachAndDetach, context: ChangeEncodingContext): Rename {
			const attach = decoderDispatcher.dispatch(encoded.attach, context) as Attach;
			const detach = decoderDispatcher.dispatch(encoded.detach, context) as Detach;

			// In documents generated by clients on release >=2.2 (i.e., running the code from the PR that added this comment),
			// renames are encoded as AttachAndDetach with a special id.
			// This ensures forward-compatibility of clients on release <=2.1 with documents/ops generated by clients on release >=2.2.
			if (attach.id === renameLocalId) {
				assert(detach.idOverride !== undefined, 0x9f8 /* Rename must have idOverride */);
				return {
					type: "Rename",
					idOverride: detach.idOverride,
				};
			}

			return {
				type: "Rename",
				idOverride: getDetachOutputCellId(detach),
			};
		},
	};

	const decoderDispatcher = new DiscriminatedUnionDispatcher<
		Encoded.MarkEffect,
		/* args */ [context: ChangeEncodingContext],
		MarkEffect
	>(decoderLibrary);

	return {
		changeAtomIdCodec,
		markEffectCodec,
		decoderLibrary,
		decodeRevision,
	};
}

export function makeV2Codec(
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): IJsonCodec<
	Changeset,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	FieldChangeEncodingContext
> {
	const { markEffectCodec, changeAtomIdCodec } = makeV2CodecHelpers(revisionTagCodec);
	/**
	 * If we want to make the node change aspect of this codec more type-safe, we could adjust generics
	 * to be in terms of the schema rather than the concrete type of the node change.
	 */
	type NodeChangeSchema = TAnySchema;

	return {
		encode: (
			changeset: Changeset,
			context: FieldChangeEncodingContext,
		): JsonCompatibleReadOnly & Encoded.Changeset<NodeChangeSchema> => {
			const jsonMarks: Encoded.Changeset<NodeChangeSchema> = [];
			for (const mark of changeset) {
				jsonMarks.push(...encodeMark(mark, context, markEffectCodec, changeAtomIdCodec));
			}
			return jsonMarks;
		},
		decode: (
			changeset: Encoded.Changeset<NodeChangeSchema>,
			context: FieldChangeEncodingContext,
		): Changeset => {
			const marks: Changeset = [];
			for (const mark of changeset) {
				const decodedMark: Mark = {
					count: mark.count,
				};

				if (mark.cellId !== undefined) {
					decodedMark.cellId = changeAtomIdCodec.decode(mark.cellId, context.baseContext);
				}

				if (mark.effect !== undefined) {
					Object.assign(decodedMark, markEffectCodec.decode(mark.effect, context));
				}

				if (mark.changes !== undefined) {
					assert(mark.cellId === undefined, "XXX");
					decodedMark.changes = context.decodeNode(mark.changes);
				}

				marks.push(decodedMark);
				reportRootChangesForMark(mark, decodedMark, context);
			}
			return marks;
		},
		encodedSchema: ChangesetSchema(EncodedNodeChangeset),
	};
}

function encodeMark(
	mark: Mark,
	context: FieldChangeEncodingContext,
	markEffectCodec: IJsonCodec<
		MarkEffect,
		Encoded.MarkEffect,
		Encoded.MarkEffect,
		FieldChangeEncodingContext
	>,
	changeAtomIdCodec: IJsonCodec<
		ChangeAtomId,
		EncodedChangeAtomId,
		EncodedChangeAtomId,
		ChangeEncodingContext
	>,
): Encoded.Mark<TAnySchema>[] {
	const splitLength = getLengthToSplitMark(mark, context);
	if (splitLength < mark.count) {
		const [mark1, mark2] = splitMark(mark, splitLength);
		return [
			encodeSplitMark(mark1, context, markEffectCodec, changeAtomIdCodec),
			...encodeMark(mark2, context, markEffectCodec, changeAtomIdCodec),
		];
	}

	return [encodeSplitMark(mark, context, markEffectCodec, changeAtomIdCodec)];
}

function encodeRename(
	effect: Rename,
	context: FieldChangeEncodingContext,
	changeAtomIdCodec: IJsonCodec<
		ChangeAtomId,
		EncodedChangeAtomId,
		EncodedChangeAtomId,
		ChangeEncodingContext
	>,
	revisionCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): Encoded.MarkEffect {
	if (context.isDetachId(effect.idOverride, 1).value) {
		// This is the final detach location of moved nodes.
		const encodedRevision =
			effect.idOverride.revision !== undefined
				? revisionCodec.encode(effect.idOverride.revision, context.baseContext)
				: undefined;

		return {
			attachAndDetach: {
				attach: {
					moveIn: {
						revision: encodedRevision,
						id: effect.idOverride.localId,
					},
				},
				detach: {
					remove: {
						revision: encodedRevision,
						id: effect.idOverride.localId,
					},
				},
			},
		};
	}

	// In documents generated by clients on release >=2.2 (i.e., running the code from the PR that added this comment),
	// renames are encoded as AttachAndDetach with a special id.
	// This ensures forward-compatibility of clients on release <=2.1 with documents/ops generated by clients on release >=2.2.
	return {
		attachAndDetach: {
			attach: { insert: { id: renameLocalId } },
			detach: {
				remove: {
					id: renameLocalId,
					idOverride: changeAtomIdCodec.encode(effect.idOverride, context.baseContext),
				},
			},
		},
	};
}

function getLengthToSplitMark(mark: Mark, context: FieldChangeEncodingContext): number {
	// XXX: Split for renames and `isDetachId`.
	const length1 =
		mark.cellId !== undefined
			? rangeQueryChangeAtomIdMap(context.rootNodeChanges, mark.cellId, mark.count).length
			: mark.count;

	return isMoveMark(mark)
		? context.isMoveId(getMovedNodeId(mark), mark.count).length
		: length1;
}

function encodeSplitMark(
	mark: Mark,
	context: FieldChangeEncodingContext,
	markEffectCodec: IJsonCodec<
		MarkEffect,
		Encoded.MarkEffect,
		Encoded.MarkEffect,
		FieldChangeEncodingContext
	>,
	changeAtomIdCodec: IJsonCodec<
		ChangeAtomId,
		EncodedChangeAtomId,
		EncodedChangeAtomId,
		ChangeEncodingContext
	>,
): Encoded.Mark<TAnySchema> {
	const encodedMark: Encoded.Mark<TAnySchema> = {
		count: mark.count,
	};
	if (!isNoopMark(mark)) {
		encodedMark.effect = markEffectCodec.encode(mark, context);
	}
	if (mark.cellId !== undefined) {
		encodedMark.cellId = changeAtomIdCodec.encode(mark.cellId, context.baseContext);
	}
	if (mark.changes !== undefined) {
		encodedMark.changes = context.encodeNode(mark.changes);
	}

	return encodedMark;
}

function reportRootChangesForMark(
	encodedMark: Encoded.Mark<TAnySchema>,
	mark: Mark,
	context: FieldChangeEncodingContext,
): void {
	if (mark.cellId !== undefined && mark.changes !== undefined) {
		context.decodeRootNodeChange(mark.cellId, mark.changes);
	}

	// Note that if the mark was encoded as a move-in, we do not report a rename.
	if (encodedMark.effect?.insert !== undefined) {
		assert(mark.type === "Insert", "Expected mark to have decoded to an insert.");
		const attachId = getAttachedNodeId(mark);
		if (mark.cellId !== undefined && !areEqualChangeAtomIds(mark.cellId, attachId)) {
			context.decodeRootRename(mark.cellId, attachId, mark.count);
		}
	} else if (encodedMark.effect?.attachAndDetach !== undefined) {
		assert(mark.cellId !== undefined, "Attach and detach should target an empty cell");
		assert(mark.type === "Rename", "Expected attach and detach to decode to a rename");
		const isNodeMove = encodedMark.effect.attachAndDetach.attach.moveIn !== undefined;
		if (
			!isNodeMove &&
			encodedMark.effect.attachAndDetach.detach.remove?.id !== renameLocalId
		) {
			context.decodeRootRename(mark.cellId, mark.idOverride, mark.count);
		}
	}
}

/**
 * Arbitrary ID that is used to indicate a Rename effect.
 */
const renameLocalId: ChangesetLocalId = brand(-1);
