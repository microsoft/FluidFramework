/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, TAnySchema, Type } from "@sinclair/typebox";
import { assert } from "@fluidframework/common-utils";
import {
	FieldKey,
	FieldKindIdentifier,
	FieldKindIdentifierSchema,
	GlobalFieldKey,
	GlobalFieldKeySchema,
	isGlobalFieldKey,
	keyFromSymbol,
	LocalFieldKey,
	LocalFieldKeySchema,
	RevisionTagSchema,
	symbolFromKey,
} from "../../core";
import {
	brand,
	fail,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnlySchema,
	Mutable,
} from "../../util";
import {
	ICodecFamily,
	ICodecOptions,
	IJsonCodec,
	IMultiFormatCodec,
	makeCodecFamily,
	SchemaValidationFunction,
} from "../../codec";
import { ChangesetLocalIdSchema } from "./crossFieldQueries";
import {
	FieldChangeMap,
	FieldChangeset,
	ModularChangeset,
	NodeChangeset,
	RevisionInfo,
} from "./fieldChangeHandler";
import { FieldKind } from "./fieldKind";
import { genericFieldKind } from "./genericFieldKind";

const EncodedValueChange = Type.Object(
	{
		revision: Type.Optional(RevisionTagSchema),
		value: Type.Optional(JsonCompatibleReadOnlySchema),
	},
	{ additionalProperties: false },
);
type EncodedValueChange = Static<typeof EncodedValueChange>;

const EncodedValueConstraint = Type.Object(
	{
		value: Type.Optional(JsonCompatibleReadOnlySchema),
		violated: Type.Boolean(),
	},
	{ additionalProperties: false },
);
type EncodedValueConstraint = Static<typeof EncodedValueConstraint>;

const EncodedFieldChange = Type.Object({
	fieldKey: Type.Union([LocalFieldKeySchema, GlobalFieldKeySchema]),
	keyIsGlobal: Type.Boolean(),
	fieldKind: FieldKindIdentifierSchema,
	// Implementation note: node and field change encoding is mutually recursive.
	// This field marks a boundary in that recursion to avoid constructing excessively complex
	// recursive types. Encoded changes are validated at this boundary at runtime--see logic
	// later in this file's codec.
	change: JsonCompatibleReadOnlySchema,
});

interface EncodedFieldChange extends Static<typeof EncodedFieldChange> {
	/**
	 * Encoded in format selected by `fieldKind`
	 */
	change: JsonCompatibleReadOnly;
}

const EncodedFieldChangeMap = Type.Array(EncodedFieldChange);

/**
 * Format for encoding as json.
 *
 * This chooses to use lists of named objects instead of maps:
 * this choice is somewhat arbitrary, but avoids user data being used as object keys,
 * which can sometimes be an issue (for example handling that for "__proto__" can require care).
 * It also allows dealing with global vs local field key disambiguation via a flag on the field.
 */
type EncodedFieldChangeMap = Static<typeof EncodedFieldChangeMap>;

const EncodedNodeExistsConstraint = Type.Object({
	violated: Type.Boolean(),
});
type EncodedNodeExistsConstraint = Static<typeof EncodedNodeExistsConstraint>;

const EncodedNodeChangeset = Type.Object({
	valueChange: Type.Optional(EncodedValueChange),
	fieldChanges: Type.Optional(EncodedFieldChangeMap),
	valueConstraint: Type.Optional(EncodedValueConstraint),
	nodeExistsConstraint: Type.Optional(EncodedNodeExistsConstraint),
});

/**
 * Format for encoding as json.
 */
type EncodedNodeChangeset = Static<typeof EncodedNodeChangeset>;

const EncodedRevisionInfo = Type.Object({
	revision: Type.Readonly(RevisionTagSchema),
	rollbackOf: Type.ReadonlyOptional(RevisionTagSchema),
});

const EncodedModularChangeset = Type.Object({
	maxId: Type.Optional(ChangesetLocalIdSchema),
	changes: EncodedFieldChangeMap,
	revisions: Type.ReadonlyOptional(Type.Array(EncodedRevisionInfo)),
});

type EncodedModularChangeset = Static<typeof EncodedModularChangeset>;

function makeV0Codec(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
	{ jsonValidator: validator }: ICodecOptions,
): IJsonCodec<ModularChangeset> {
	const nodeChangesetCodec: IJsonCodec<NodeChangeset, EncodedNodeChangeset> = {
		encode: encodeNodeChangesForJson,
		decode: decodeNodeChangesetFromJson,
		encodedSchema: EncodedNodeChangeset,
	};

	const getMapEntry = (field: FieldKind) => {
		const codec = field.changeHandler.codecsFactory(nodeChangesetCodec).resolve(0);
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

			const global = isGlobalFieldKey(field);
			const fieldKey: LocalFieldKey | GlobalFieldKey = global ? keyFromSymbol(field) : field;
			const encodedField: EncodedFieldChange = {
				fieldKey,
				keyIsGlobal: global,
				fieldKind: fieldChange.fieldKind,
				change: encodedChange,
			};

			encodedFields.push(encodedField);
		}

		return encodedFields;
	}

	function encodeNodeChangesForJson(change: NodeChangeset): EncodedNodeChangeset {
		const encodedChange: EncodedNodeChangeset = {};
		const { valueChange, fieldChanges, valueConstraint, nodeExistsConstraint } = change;
		if (valueChange !== undefined) {
			encodedChange.valueChange = valueChange;
		}

		if (fieldChanges !== undefined) {
			encodedChange.fieldChanges = encodeFieldChangesForJson(fieldChanges);
		}

		if (valueConstraint !== undefined) {
			encodedChange.valueConstraint = valueConstraint;
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

			const fieldKey: FieldKey = field.keyIsGlobal
				? symbolFromKey(brand<GlobalFieldKey>(field.fieldKey))
				: brand<LocalFieldKey>(field.fieldKey);

			decodedFields.set(fieldKey, {
				fieldKind: field.fieldKind,
				change: brand(fieldChangeset),
			});
		}

		return decodedFields;
	}

	function decodeNodeChangesetFromJson(encodedChange: EncodedNodeChangeset): NodeChangeset {
		const decodedChange: NodeChangeset = {};
		const { valueChange, fieldChanges, valueConstraint, nodeExistsConstraint } = encodedChange;
		if (valueChange) {
			decodedChange.valueChange = valueChange;
		}

		if (fieldChanges !== undefined) {
			decodedChange.fieldChanges = decodeFieldChangesFromJson(fieldChanges);
		}

		if (valueConstraint !== undefined) {
			decodedChange.valueConstraint = {
				value: valueConstraint.value,
				violated: valueConstraint.violated,
			};
		}

		if (nodeExistsConstraint !== undefined) {
			decodedChange.nodeExistsConstraint = nodeExistsConstraint;
		}

		return decodedChange;
	}

	return {
		encode: (change) => {
			return {
				maxId: change.maxId,
				revisions: change.revisions as readonly RevisionInfo[] & JsonCompatibleReadOnly,
				changes: encodeFieldChangesForJson(change.fieldChanges),
			};
		},
		decode: (change) => {
			const encodedChange = change as unknown as EncodedModularChangeset;
			const decoded: Mutable<ModularChangeset> = {
				fieldChanges: decodeFieldChangesFromJson(encodedChange.changes),
			};
			if (encodedChange.revisions !== undefined) {
				decoded.revisions = encodedChange.revisions;
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
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
	options: ICodecOptions,
): ICodecFamily<ModularChangeset> {
	return makeCodecFamily([[0, makeV0Codec(fieldKinds, options)]]);
}
