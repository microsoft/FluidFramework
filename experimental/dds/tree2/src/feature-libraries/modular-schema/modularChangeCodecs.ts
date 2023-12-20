/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema } from "@sinclair/typebox";
import { assert } from "@fluidframework/core-utils";
import { SessionId } from "@fluidframework/id-compressor";
import {
	ChangesetLocalId,
	ChangeEncodingContext,
	EncodedRevisionTag,
	FieldKey,
	FieldKindIdentifier,
	ITreeCursorSynchronous,
	RevisionInfo,
	RevisionTag,
} from "../../core";
import {
	brand,
	fail,
	JsonCompatibleReadOnly,
	Mutable,
	nestedMapFromFlatList,
	nestedMapToFlatList,
} from "../../util";
import {
	ICodecOptions,
	IJsonCodec,
	IMultiFormatCodec,
	SchemaValidationFunction,
	SessionAwareCodec,
} from "../../codec";
import {
	FieldBatchCodec,
	TreeChunk,
	chunkFieldSingle,
	defaultChunkPolicy,
} from "../chunked-forest";
import {
	FieldChangeMap,
	FieldChangeset,
	ModularChangeset,
	NodeChangeset,
} from "./modularChangeTypes";
import { FieldKindWithEditor } from "./fieldKind";
import { genericFieldKind } from "./genericFieldKind";
import {
	EncodedBuilds,
	EncodedBuildsArray,
	EncodedFieldChange,
	EncodedFieldChangeMap,
	EncodedModularChangeset,
	EncodedNodeChangeset,
	EncodedRevisionInfo,
} from "./modularChangeFormat";

export function makeV0Codec(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
	revisionTagCodec: SessionAwareCodec<RevisionTag, EncodedRevisionTag>,
	fieldsCodec: FieldBatchCodec,
	{ jsonValidator: validator }: ICodecOptions,
): IJsonCodec<
	ModularChangeset,
	EncodedModularChangeset,
	EncodedModularChangeset,
	ChangeEncodingContext
> {
	const nodeChangesetCodec: SessionAwareCodec<NodeChangeset, EncodedNodeChangeset> = {
		encode: encodeNodeChangesForJson,
		decode: decodeNodeChangesetFromJson,
		encodedSchema: EncodedNodeChangeset,
	};

	const getMapEntry = (field: FieldKindWithEditor) => {
		const codec = field.changeHandler
			.codecsFactory(nodeChangesetCodec, revisionTagCodec)
			.resolve(0);
		return {
			codec,
			compiledSchema: codec.json.encodedSchema
				? validator.compile(codec.json.encodedSchema)
				: undefined,
		};
	};

	type FieldCodec = IMultiFormatCodec<
		FieldChangeset,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		SessionId
	>;

	const fieldChangesetCodecs: Map<
		FieldKindIdentifier,
		{
			compiledSchema?: SchemaValidationFunction<TAnySchema>;
			codec: FieldCodec;
		}
	> = new Map([[genericFieldKind.identifier, getMapEntry(genericFieldKind)]]);

	fieldKinds.forEach((fieldKind, identifier) => {
		fieldChangesetCodecs.set(identifier, getMapEntry(fieldKind));
	});

	const getFieldChangesetCodec = (
		fieldKind: FieldKindIdentifier,
	): {
		compiledSchema?: SchemaValidationFunction<TAnySchema>;
		codec: FieldCodec;
	} => {
		const entry = fieldChangesetCodecs.get(fieldKind);
		assert(entry !== undefined, 0x5ea /* Tried to encode unsupported fieldKind */);
		return entry;
	};

	function encodeFieldChangesForJson(
		change: FieldChangeMap,
		originatorId: SessionId,
	): EncodedFieldChangeMap {
		const encodedFields: EncodedFieldChangeMap = [];
		for (const [field, fieldChange] of change) {
			const { codec, compiledSchema } = getFieldChangesetCodec(fieldChange.fieldKind);
			const encodedChange = codec.json.encode(fieldChange.change, originatorId);
			if (compiledSchema !== undefined && !compiledSchema.check(encodedChange)) {
				fail("Encoded change didn't pass schema validation.");
			}

			const fieldKey: FieldKey = field;
			const encodedField: EncodedFieldChange = {
				fieldKey,
				fieldKind: fieldChange.fieldKind,
				change: encodedChange,
			};

			encodedFields.push(encodedField);
		}

		return encodedFields;
	}

	function encodeNodeChangesForJson(
		change: NodeChangeset,
		originatorId: SessionId,
	): EncodedNodeChangeset {
		const encodedChange: EncodedNodeChangeset = {};
		const { fieldChanges, nodeExistsConstraint } = change;

		if (fieldChanges !== undefined) {
			encodedChange.fieldChanges = encodeFieldChangesForJson(fieldChanges, originatorId);
		}

		if (nodeExistsConstraint !== undefined) {
			encodedChange.nodeExistsConstraint = nodeExistsConstraint;
		}

		return encodedChange;
	}

	function decodeFieldChangesFromJson(
		encodedChange: EncodedFieldChangeMap,
		originatorId: SessionId,
	): FieldChangeMap {
		const decodedFields: FieldChangeMap = new Map();
		for (const field of encodedChange) {
			const { codec, compiledSchema } = getFieldChangesetCodec(field.fieldKind);
			if (compiledSchema !== undefined && !compiledSchema.check(field.change)) {
				fail("Encoded change didn't pass schema validation.");
			}
			const fieldChangeset = codec.json.decode(field.change, originatorId);

			const fieldKey: FieldKey = brand<FieldKey>(field.fieldKey);

			decodedFields.set(fieldKey, {
				fieldKind: field.fieldKind,
				change: brand(fieldChangeset),
			});
		}

		return decodedFields;
	}

	function decodeNodeChangesetFromJson(
		encodedChange: EncodedNodeChangeset,
		originatorId: SessionId,
	): NodeChangeset {
		const decodedChange: NodeChangeset = {};
		const { fieldChanges, nodeExistsConstraint } = encodedChange;

		if (fieldChanges !== undefined) {
			decodedChange.fieldChanges = decodeFieldChangesFromJson(fieldChanges, originatorId);
		}

		if (nodeExistsConstraint !== undefined) {
			decodedChange.nodeExistsConstraint = nodeExistsConstraint;
		}

		return decodedChange;
	}

	function encodeBuilds(
		builds: ModularChangeset["builds"],
		context: ChangeEncodingContext,
	): EncodedBuilds | undefined {
		if (builds === undefined) {
			return undefined;
		}

		const treesToEncode: ITreeCursorSynchronous[] = [];
		const buildsArray: EncodedBuildsArray = nestedMapToFlatList(builds).map(([r, i, t]) => {
			treesToEncode.push(t.cursor());
			const treeIndexInBatch = treesToEncode.length - 1;
			// `undefined` does not round-trip through JSON strings, so it needs special handling.
			// Most entries will have an undefined revision due to the revision information being inherited from the `ModularChangeset`.
			// We therefore optimize for the common case by omitting the revision when it is undefined.
			return r !== undefined
				? [revisionTagCodec.encode(r, context.originatorId), i, treeIndexInBatch]
				: [i, treeIndexInBatch];
		});
		return buildsArray.length === 0
			? undefined
			: { builds: buildsArray, trees: fieldsCodec.encode(treesToEncode) };
	}

	function decodeBuilds(
		encoded: EncodedBuilds | undefined,
		context: ChangeEncodingContext,
	): ModularChangeset["builds"] {
		if (encoded === undefined || encoded.builds.length === 0) {
			return undefined;
		}

		const chunks = fieldsCodec.decode(encoded.trees);
		const getChunk = (index: number): TreeChunk => {
			assert(index < chunks.length, "out of bounds index for build chunk");
			return chunkFieldSingle(chunks[index], defaultChunkPolicy);
		};

		const list: [RevisionTag | undefined, ChangesetLocalId, TreeChunk][] = encoded.builds.map(
			(tuple) =>
				tuple.length === 3
					? [
							revisionTagCodec.decode(tuple[0], context.originatorId),
							tuple[1],
							getChunk(tuple[2]),
					  ]
					: [undefined, tuple[0], getChunk(tuple[1])],
		);
		return nestedMapFromFlatList(list);
	}

	function encodeRevisionInfos(
		revisions: readonly RevisionInfo[],
		originatorId: SessionId,
	): EncodedRevisionInfo[] {
		const encodedRevisions = [];
		for (const revision of revisions) {
			const encodedRevision: Mutable<EncodedRevisionInfo> = {
				revision: revisionTagCodec.encode(revision.revision, originatorId),
			};

			if (revision.rollbackOf !== undefined) {
				encodedRevision.rollbackOf = revisionTagCodec.encode(
					revision.rollbackOf,
					originatorId,
				);
			}

			encodedRevisions.push(encodedRevision);
		}

		return encodedRevisions;
	}

	function decodeRevisionInfos(
		revisions: readonly EncodedRevisionInfo[],
		originatorId: SessionId,
	): RevisionInfo[] {
		const decodedRevisions = [];
		for (const revision of revisions) {
			const decodedRevision: Mutable<RevisionInfo> = {
				revision: revisionTagCodec.decode(revision.revision, originatorId),
			};

			if (revision.rollbackOf !== undefined) {
				decodedRevision.rollbackOf = revisionTagCodec.decode(
					revision.rollbackOf,
					originatorId,
				);
			}

			decodedRevisions.push(decodedRevision);
		}

		return decodedRevisions;
	}

	// TODO: use withSchemaValidation here to validate data against format.
	return {
		encode: (change, context) => {
			return {
				maxId: change.maxId,
				revisions:
					change.revisions === undefined
						? change.revisions
						: encodeRevisionInfos(change.revisions, context.originatorId),
				changes: encodeFieldChangesForJson(change.fieldChanges, context.originatorId),
				builds: encodeBuilds(change.builds, context),
			};
		},
		decode: (change, context) => {
			const encodedChange = change as unknown as EncodedModularChangeset;
			const decoded: Mutable<ModularChangeset> = {
				fieldChanges: decodeFieldChangesFromJson(
					encodedChange.changes,
					context.originatorId,
				),
			};
			if (encodedChange.builds !== undefined) {
				decoded.builds = decodeBuilds(encodedChange.builds, context);
			}
			if (encodedChange.revisions !== undefined) {
				decoded.revisions = decodeRevisionInfos(
					encodedChange.revisions,
					context.originatorId,
				);
			}
			if (encodedChange.maxId !== undefined) {
				decoded.maxId = encodedChange.maxId;
			}
			return decoded;
		},
		encodedSchema: EncodedModularChangeset,
	};
}
