/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ICodecOptions,
	type IJsonCodec,
	withSchemaValidation,
} from "../../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	FieldKey,
	RevisionTag,
} from "../../core/index.js";
import type { FieldBatchCodec } from "../chunked-forest/index.js";
import { TreeCompressionStrategy } from "../treeCompressionUtils.js";

import type { FieldKindConfiguration } from "./fieldKindConfiguration.js";
import { EncodedModularChangesetVConstraint } from "./modularChangeFormatVConstraint.js";
import type { FieldChange, ModularChangeset } from "./modularChangeTypes.js";
import {
	encodeChange,
	decodeChange,
	getFieldChangesetCodecs,
	type FieldChangesetCodecs,
	encodeFieldV1,
	decodeFieldChangeV1,
} from "./modularChangeCodecV1.js";
import type { FieldChangeEncodingContext } from "./fieldChangeHandler.js";
import type { EncodedFieldChangeVConstraint } from "./modularChangeFormatVConstraint.js";
import type { BrandedType } from "../../util/index.js";

type ModularChangeCodec = IJsonCodec<
	ModularChangeset,
	EncodedModularChangesetVConstraint,
	EncodedModularChangesetVConstraint,
	ChangeEncodingContext
>;

export function encodeFieldVConstraint(
	field: FieldKey,
	fieldChange: FieldChange,
	context: FieldChangeEncodingContext,
	fieldChangesetCodecs: FieldChangesetCodecs,
): EncodedFieldChangeVConstraint {
	const encodedField: EncodedFieldChangeVConstraint = encodeFieldV1(
		field,
		fieldChange,
		context,
		fieldChangesetCodecs,
	);
	if (fieldChange.fieldShallowChangeConstraint !== undefined) {
		encodedField.fieldShallowChangeConstraint = {
			violated: fieldChange.fieldShallowChangeConstraint.violated,
		};
	}
	return encodedField;
}

export function decodeFieldChangeVConstraint(
	field: EncodedFieldChangeVConstraint,
	fieldChangeset: BrandedType<unknown, "FieldChangeset">,
): FieldChange {
	const decodedField = decodeFieldChangeV1(field, fieldChangeset);
	if (
		field.fieldShallowChangeConstraint !== undefined &&
		field.fieldShallowChangeConstraint !== null
	) {
		decodedField.fieldShallowChangeConstraint = {
			violated: field.fieldShallowChangeConstraint.violated,
		};
	}
	return decodedField;
}

export function makeModularChangeCodecVConstraint(
	fieldKinds: FieldKindConfiguration,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	fieldsCodec: FieldBatchCodec,
	codecOptions: ICodecOptions,
	chunkCompressionStrategy: TreeCompressionStrategy = TreeCompressionStrategy.Compressed,
): ModularChangeCodec {
	const fieldChangesetCodecs = getFieldChangesetCodecs(
		fieldKinds,
		revisionTagCodec,
		codecOptions,
	);

	const modularChangeCodec: ModularChangeCodec = {
		encode: (change, context) => {
			const encoded = encodeChange(
				change,
				context,
				fieldChangesetCodecs,
				revisionTagCodec,
				fieldsCodec,
				chunkCompressionStrategy,
				encodeFieldVConstraint,
			) as EncodedModularChangesetVConstraint;
			encoded.noChangeConstraint = change.noChangeConstraint;
			return encoded;
		},

		decode: (encodedChange: EncodedModularChangesetVConstraint, context) => {
			const decoded = decodeChange(
				encodedChange,
				context,
				fieldKinds,
				fieldChangesetCodecs,
				revisionTagCodec,
				fieldsCodec,
				chunkCompressionStrategy,
				decodeFieldChangeVConstraint,
			);
			if (encodedChange.noChangeConstraint !== undefined) {
				decoded.noChangeConstraint = encodedChange.noChangeConstraint;
			}
			return decoded;
		},
	};

	return withSchemaValidation(
		EncodedModularChangesetVConstraint,
		modularChangeCodec,
		codecOptions.jsonValidator,
	);
}
