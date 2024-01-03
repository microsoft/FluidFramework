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
} from "../../core/index.js";
import { brand, fail, JsonCompatibleReadOnly, Mutable } from "../../util/index.js";
import {
	ICodecOptions,
	IJsonCodec,
	IMultiFormatCodec,
	SchemaValidationFunction,
	SessionAwareCodec,
} from "../../codec/index.js";
import {
	FieldBatchCodec,
	TreeChunk,
	chunkFieldSingle,
	defaultChunkPolicy,
} from "../chunked-forest/index.js";
import {
	FieldChangeMap,
	FieldChangeset,
	ModularChangeset,
	NodeChangeset,
} from "./modularChangeTypes.js";
import { FieldKindWithEditor } from "./fieldKind.js";
import { genericFieldKind } from "./genericFieldKind.js";
import {
	EncodedBuilds,
	EncodedBuildsArray,
	EncodedFieldChange,
	EncodedFieldChangeMap,
	EncodedModularChangeset,
	EncodedNodeChangeset,
	EncodedRevisionInfo,
} from "./modularChangeFormat.js";

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
		const buildsArray: EncodedBuildsArray = Array.from(builds.entries()).map(
			([r, commitBuilds]) => {
				const commitBuildsEncoded: [ChangesetLocalId, number][] = Array.from(
					commitBuilds.entries(),
				).map(([i, t]) => {
					treesToEncode.push(t.cursor());
					const treeIndexInBatch = treesToEncode.length - 1;
					return [i, treeIndexInBatch];
				});
				// `undefined` does not round-trip through JSON strings, so it needs special handling.
				// Most entries will have an undefined revision due to the revision information being inherited from the `ModularChangeset`.
				// We therefore optimize for the common case by omitting the revision when it is undefined.
				return r !== undefined
					? [commitBuildsEncoded, revisionTagCodec.encode(r, context.originatorId)]
					: [commitBuildsEncoded];
			},
		);
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

		const map: ModularChangeset["builds"] = new Map();
		encoded.builds.forEach((build) => {
			// EncodedRevisionTag cannot be an array so this ensures that we can isolate the tuple
			const revision =
				build[1] === undefined
					? undefined
					: revisionTagCodec.decode(build[1], context.originatorId);
			map.set(revision, new Map(build[0].map(([i, n]) => [i, getChunk(n)])));
		});

		return map;
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
			// Destroys only exist in rollback changesets, which are never sent.
			assert(change.destroys === undefined, "Unexpected changeset with destroys");
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
