/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ICodecOptions,
	type IJsonCodec,
	type JsonCodecPart,
	withSchemaValidation,
} from "../../codec/index.js";
import {
	type ChangeEncodingContext,
	type ChangeDecodingContext,
	type RevisionTag,
	type RevisionTagSchema,
	cheapRebaseValidation,
	strictRebaseValidation,
} from "../../core/index.js";
import type { FieldBatchCodec } from "../chunked-forest/index.js";
import { TreeCompressionStrategy } from "../treeCompressionUtils.js";

import type { FieldKindConfiguration } from "./fieldKindConfiguration.js";
import {
	encodeChange,
	decodeChange,
	getFieldChangesetCodecs,
} from "./modularChangeCodecV1.js";
import { EncodedModularChangesetV2 } from "./modularChangeFormatV2.js";
import type { ModularChangeset } from "./modularChangeTypes.js";
import {
	areEquivalent,
	fieldKindsFromConfiguration,
	isChangesetValid,
} from "./modularChangeUtils.js";

type ModularChangeCodec = IJsonCodec<
	ModularChangeset,
	EncodedModularChangesetV2,
	EncodedModularChangesetV2,
	ChangeEncodingContext,
	ChangeDecodingContext
>;

export function makeModularChangeCodecV2(
	fieldKinds: FieldKindConfiguration,
	revisionTagCodec: JsonCodecPart<
		RevisionTag,
		typeof RevisionTagSchema,
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
			strictRebaseValidation("Malformed V2 encode input", () =>
				isChangesetValid(change, fieldKindsFromConfiguration(fieldKinds)),
			);
			const encoded = encodeChange(
				change,
				context,
				fieldChangesetCodecs,
				revisionTagCodec,
				fieldsCodec,
				chunkCompressionStrategy,
			) as EncodedModularChangesetV2;
			encoded.noChangeConstraint = change.noChangeConstraint;
			cheapRebaseValidation("V2 encode output", (): true | string => {
				const decoded = modularChangeCodec.decode(encoded, context);
				return (
					areEquivalent(change, decoded, fieldKindsFromConfiguration(fieldKinds)) ||
					"does not match decode output"
				);
			});
			return encoded;
		},

		decode: (encodedChange: EncodedModularChangesetV2, context) => {
			const decoded = decodeChange(
				encodedChange,
				context,
				fieldKinds,
				fieldChangesetCodecs,
				revisionTagCodec,
				fieldsCodec,
				chunkCompressionStrategy,
			);
			if (encodedChange.noChangeConstraint !== undefined) {
				decoded.noChangeConstraint = encodedChange.noChangeConstraint;
			}
			cheapRebaseValidation("Malformed V2 decode output", () =>
				isChangesetValid(decoded, fieldKindsFromConfiguration(fieldKinds)),
			);
			return decoded;
		},
	};

	return withSchemaValidation(
		EncodedModularChangesetV2,
		modularChangeCodec,
		codecOptions.jsonValidator,
	);
}
