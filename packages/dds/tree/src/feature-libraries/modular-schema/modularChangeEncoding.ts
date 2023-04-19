/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	FieldKey,
	FieldKindIdentifier,
	GlobalFieldKey,
	isGlobalFieldKey,
	keyFromSymbol,
	LocalFieldKey,
	symbolFromKey,
} from "../../core";
import { brand, JsonCompatibleReadOnly, Mutable } from "../../util";
import { ICodecFamily, IJsonCodec, IMultiFormatCodec, makeCodecFamily } from "../../codec";
import { ChangesetLocalId } from "./crossFieldQueries";
import {
	FieldChangeMap,
	FieldChangeset,
	ModularChangeset,
	NodeChangeset,
	RevisionInfo,
	ValueChange,
	ValueConstraint,
} from "./fieldChangeHandler";
import { FieldKind } from "./fieldKind";
import { genericFieldKind } from "./genericFieldKind";

/**
 * Format for encoding as json.
 */
interface EncodedNodeChangeset {
	valueChange?: ValueChange;
	fieldChanges?: EncodedFieldChangeMap;
	valueConstraint?: ValueConstraint;
}

interface EncodedModularChangeset {
	maxId?: ChangesetLocalId;
	changes: EncodedFieldChangeMap;
	revisions?: readonly RevisionInfo[];
}

/**
 * Format for encoding as json.
 *
 * This chooses to use lists of named objects instead of maps:
 * this choice is somewhat arbitrary, but avoids user data being used as object keys,
 * which can sometimes be an issue (for example handling that for "__proto__" can require care).
 * It also allows dealing with global vs local field key disambiguation via a flag on the field.
 */
type EncodedFieldChangeMap = EncodedFieldChange[];

interface EncodedFieldChange {
	fieldKey: LocalFieldKey | GlobalFieldKey;
	keyIsGlobal: boolean;
	fieldKind: FieldKindIdentifier;
	/**
	 * Encoded in format selected by `fieldKind`
	 */
	change: JsonCompatibleReadOnly;
}

function makeV0Codec(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
): IJsonCodec<ModularChangeset> {
	const nodeChangesetCodec: IJsonCodec<NodeChangeset> = {
		encode: encodeNodeChangesForJson,
		decode: decodeNodeChangesetFromJson,
	};

	const fieldChangesetCodecs: Map<
		FieldKindIdentifier,
		IMultiFormatCodec<FieldChangeset>
	> = new Map([
		[
			genericFieldKind.identifier,
			genericFieldKind.changeHandler.codecsFactory(nodeChangesetCodec).resolve(0),
		],
	]);

	fieldKinds.forEach((fieldKind, identifier) => {
		const codec = fieldKind.changeHandler.codecsFactory(nodeChangesetCodec).resolve(0);
		fieldChangesetCodecs.set(identifier, codec);
	});

	const getFieldChangesetCodec = (
		fieldKind: FieldKindIdentifier,
	): IMultiFormatCodec<FieldChangeset> => {
		const codec = fieldChangesetCodecs.get(fieldKind);
		assert(codec !== undefined, 0x5ea /* Tried to encode unsupported fieldKind */);
		return codec;
	};

	function encodeFieldChangesForJson(
		change: FieldChangeMap,
	): EncodedFieldChangeMap & JsonCompatibleReadOnly {
		const encodedFields: EncodedFieldChangeMap & JsonCompatibleReadOnly = [];
		for (const [field, fieldChange] of change) {
			const encodedChange = getFieldChangesetCodec(fieldChange.fieldKind).json.encode(
				fieldChange.change,
			);

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

	function encodeNodeChangesForJson(
		change: NodeChangeset,
	): EncodedNodeChangeset & JsonCompatibleReadOnly {
		const encodedChange: EncodedNodeChangeset & JsonCompatibleReadOnly = {};
		if (change.valueChange !== undefined) {
			encodedChange.valueChange = change.valueChange;
		}

		if (change.fieldChanges !== undefined) {
			const encodedFieldChanges = encodeFieldChangesForJson(change.fieldChanges);
			encodedChange.fieldChanges = encodedFieldChanges as unknown as EncodedFieldChangeMap;
		}

		if (change.valueConstraint !== undefined) {
			encodedChange.valueConstraint = change.valueConstraint;
		}

		return encodedChange;
	}

	function decodeFieldChangesFromJson(encodedChange: EncodedFieldChangeMap): FieldChangeMap {
		const decodedFields: FieldChangeMap = new Map();
		for (const field of encodedChange) {
			const fieldChangeset = getFieldChangesetCodec(field.fieldKind).json.decode(
				field.change,
			);

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

	function decodeNodeChangesetFromJson(change: JsonCompatibleReadOnly): NodeChangeset {
		const encodedChange = change as EncodedNodeChangeset;
		const decodedChange: NodeChangeset = {};
		if (encodedChange.valueChange !== undefined) {
			decodedChange.valueChange = encodedChange.valueChange;
		}

		if (encodedChange.fieldChanges !== undefined) {
			decodedChange.fieldChanges = decodeFieldChangesFromJson(encodedChange.fieldChanges);
		}

		if (encodedChange.valueConstraint !== undefined) {
			decodedChange.valueConstraint = encodedChange.valueConstraint;
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
	};
}

export function makeModularChangeCodecFamily(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
): ICodecFamily<ModularChangeset> {
	return makeCodecFamily([[0, makeV0Codec(fieldKinds)]]);
}
