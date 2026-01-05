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
	RevisionTag,
} from "../../core/index.js";
import type { FieldBatchCodec } from "../chunked-forest/index.js";
import { TreeCompressionStrategy } from "../treeCompressionUtils.js";

import type { FieldKindConfiguration } from "./fieldKindConfiguration.js";
import { EncodedModularChangesetV2 } from "./modularChangeFormatV2.js";
import type { ModularChangeset } from "./modularChangeTypes.js";
import {
	encodeChange,
	decodeChange,
	getFieldChangesetCodecs,
} from "./modularChangeCodecV1.js";

type ModularChangeCodec = IJsonCodec<
	ModularChangeset,
	EncodedModularChangesetV2,
	EncodedModularChangesetV2,
	ChangeEncodingContext
>;

export function makeModularChangeCodecV2(
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
			) as EncodedModularChangesetV2;
			encoded.noChangeConstraint = change.noChangeConstraint;
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
			return decoded;
		},
	};

	return withSchemaValidation(
		EncodedModularChangesetV2,
		modularChangeCodec,
		codecOptions.jsonValidator,
	);
}
