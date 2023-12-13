/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema } from "@sinclair/typebox";
import { assert } from "@fluidframework/core-utils";
import {
	ChangesetLocalId,
	EncodedRevisionTag,
	FieldKey,
	FieldKindIdentifier,
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
	ICodecFamily,
	ICodecOptions,
	IJsonCodec,
	IMultiFormatCodec,
	makeCodecFamily,
	SchemaValidationFunction,
} from "../../codec";
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
	EncodedFieldChange,
	EncodedFieldChangeMap,
	EncodedModularChangeset,
	EncodedNodeChangeset,
	EncodedRevisionInfo,
} from "./modularChangeFormat";

function makeV0Codec(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
	revisionTagCodec: IJsonCodec<RevisionTag, EncodedRevisionTag>,
	{ jsonValidator: validator }: ICodecOptions,
): IJsonCodec<ModularChangeset> {
	const nodeChangesetCodec: IJsonCodec<NodeChangeset, EncodedNodeChangeset> = {
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

	const fieldChangesetCodecs: Map<
		FieldKindIdentifier,
		{
			compiledSchema?: SchemaValidationFunction<TAnySchema>;
			codec: IMultiFormatCodec<FieldChangeset>;
		}
	> = new Map([[genericFieldKind.identifier, getMapEntry(genericFieldKind)]]);

	fieldKinds.forEach((fieldKind, identifier) => {
		fieldChangesetCodecs.set(identifier, getMapEntry(fieldKind));
	});

	const getFieldChangesetCodec = (
		fieldKind: FieldKindIdentifier,
	): {
		codec: IMultiFormatCodec<FieldChangeset>;
		compiledSchema?: SchemaValidationFunction<TAnySchema>;
	} => {
		const entry = fieldChangesetCodecs.get(fieldKind);
		assert(entry !== undefined, 0x5ea /* Tried to encode unsupported fieldKind */);
		return entry;
	};

	function encodeFieldChangesForJson(change: FieldChangeMap): EncodedFieldChangeMap {
		const encodedFields: EncodedFieldChangeMap = [];
		for (const [field, fieldChange] of change) {
			const { codec, compiledSchema } = getFieldChangesetCodec(fieldChange.fieldKind);
			const encodedChange = codec.json.encode(fieldChange.change);
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

	function encodeNodeChangesForJson(change: NodeChangeset): EncodedNodeChangeset {
		const encodedChange: EncodedNodeChangeset = {};
		const { fieldChanges, nodeExistsConstraint } = change;

		if (fieldChanges !== undefined) {
			encodedChange.fieldChanges = encodeFieldChangesForJson(fieldChanges);
		}

		if (nodeExistsConstraint !== undefined) {
			encodedChange.nodeExistsConstraint = nodeExistsConstraint;
		}

		return encodedChange;
	}

	function decodeFieldChangesFromJson(encodedChange: EncodedFieldChangeMap): FieldChangeMap {
		const decodedFields: FieldChangeMap = new Map();
		for (const field of encodedChange) {
			const { codec, compiledSchema } = getFieldChangesetCodec(field.fieldKind);
			if (compiledSchema !== undefined && !compiledSchema.check(field.change)) {
				fail("Encoded change didn't pass schema validation.");
			}
			const fieldChangeset = codec.json.decode(field.change);

			const fieldKey: FieldKey = brand<FieldKey>(field.fieldKey);

			decodedFields.set(fieldKey, {
				fieldKind: field.fieldKind,
				change: brand(fieldChangeset),
			});
		}

		return decodedFields;
	}

	function decodeNodeChangesetFromJson(encodedChange: EncodedNodeChangeset): NodeChangeset {
		const decodedChange: NodeChangeset = {};
		const { fieldChanges, nodeExistsConstraint } = encodedChange;

		if (fieldChanges !== undefined) {
			decodedChange.fieldChanges = decodeFieldChangesFromJson(fieldChanges);
		}

		if (nodeExistsConstraint !== undefined) {
			decodedChange.nodeExistsConstraint = nodeExistsConstraint;
		}

		return decodedChange;
	}

	function encodeBuilds(builds: ModularChangeset["builds"]): EncodedBuilds | undefined {
		if (builds === undefined) {
			return undefined;
		}
		const encoded: EncodedBuilds = nestedMapToFlatList(builds).map(([r, i, t]) =>
			// `undefined` does not round-trip through JSON strings, so it needs special handling.
			// Most entries will have an undefined revision due to the revision information being inherited from the `ModularChangeset`.
			// We therefore optimize for the common case by omitting the revision when it is undefined.
			r !== undefined ? [revisionTagCodec.encode(r), i, t] : [i, t],
		);
		return encoded.length === 0 ? undefined : encoded;
	}

	function decodeBuilds(encoded: EncodedBuilds | undefined): ModularChangeset["builds"] {
		if (encoded === undefined || encoded.length === 0) {
			return undefined;
		}
		const list: [RevisionTag | undefined, ChangesetLocalId, any][] = encoded.map((tuple) =>
			tuple.length === 3
				? [revisionTagCodec.decode(tuple[0]), tuple[1], tuple[2]]
				: [undefined, ...tuple],
		);
		return nestedMapFromFlatList(list);
	}

	function encodeRevisionInfos(revisions: readonly RevisionInfo[]): EncodedRevisionInfo[] {
		const encodedRevisions = [];
		for (const revision of revisions) {
			const encodedRevision: Mutable<EncodedRevisionInfo> = {
				revision: revisionTagCodec.encode(revision.revision),
			};

			if (revision.rollbackOf !== undefined) {
				encodedRevision.rollbackOf = revisionTagCodec.encode(revision.rollbackOf);
			}

			encodedRevisions.push(encodedRevision);
		}

		return encodedRevisions;
	}

	function decodeRevisionInfos(revisions: readonly EncodedRevisionInfo[]): RevisionInfo[] {
		const decodedRevisions = [];
		for (const revision of revisions) {
			const decodedRevision: Mutable<RevisionInfo> = {
				revision: revisionTagCodec.decode(revision.revision),
			};

			if (revision.rollbackOf !== undefined) {
				decodedRevision.rollbackOf = revisionTagCodec.decode(revision.rollbackOf);
			}

			decodedRevisions.push(decodedRevision);
		}

		return decodedRevisions;
	}

	return {
		encode: (change) => {
			return {
				maxId: change.maxId,
				revisions:
					change.revisions === undefined
						? change.revisions
						: (encodeRevisionInfos(
								change.revisions,
						  ) as unknown as readonly RevisionInfo[] & JsonCompatibleReadOnly),
				changes: encodeFieldChangesForJson(change.fieldChanges),
				builds: encodeBuilds(change.builds),
			};
		},
		decode: (change) => {
			const encodedChange = change as unknown as EncodedModularChangeset;
			const decoded: Mutable<ModularChangeset> = {
				fieldChanges: decodeFieldChangesFromJson(encodedChange.changes),
			};
			if (encodedChange.builds !== undefined) {
				decoded.builds = decodeBuilds(encodedChange.builds);
			}
			if (encodedChange.revisions !== undefined) {
				decoded.revisions = decodeRevisionInfos(encodedChange.revisions);
			}
			if (encodedChange.maxId !== undefined) {
				decoded.maxId = encodedChange.maxId;
			}
			return decoded;
		},
		encodedSchema: EncodedModularChangeset,
	};
}

export function makeModularChangeCodecFamily(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
	revisionTagCodec: IJsonCodec<RevisionTag, EncodedRevisionTag>,
	options: ICodecOptions,
): ICodecFamily<ModularChangeset> {
	return makeCodecFamily([[0, makeV0Codec(fieldKinds, revisionTagCodec, options)]]);
}
