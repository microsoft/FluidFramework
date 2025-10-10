/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	makeCodecFamily,
} from "../../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
} from "../../core/index.js";
import type { FieldBatchCodec } from "../chunked-forest/index.js";
import {
	TreeCompressionStrategy,
	type TreeCompressionStrategyPrivate,
} from "../treeCompressionUtils.js";
import type { FieldKindConfiguration } from "./fieldKindConfiguration.js";
import type { ModularChangeset } from "./modularChangeTypes.js";
import { makeModularChangeCodecV1 } from "./modularChangeCodecV1.js";
import { makeModularChangeCodecV2 } from "./modularChangeCodecV2.js";
import type { JsonCompatibleReadOnly } from "../../util/index.js";

export function makeModularChangeCodecFamily(
	fieldKindConfigurations: ReadonlyMap<number, FieldKindConfiguration>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	fieldsCodec: FieldBatchCodec,
	codecOptions: ICodecOptions,
	chunkCompressionStrategy: TreeCompressionStrategyPrivate = TreeCompressionStrategy.Compressed,
): ICodecFamily<ModularChangeset, ChangeEncodingContext> {
	return makeCodecFamily(
		Array.from(fieldKindConfigurations.entries(), ([version, fieldKinds]) => [
			version,
			makeModularChangeCodec(
				version,
				fieldKinds,
				revisionTagCodec,
				fieldsCodec,
				codecOptions,
				chunkCompressionStrategy,
			),
		]),
	);
}

const minVersionForCodec2 = 101;

function makeModularChangeCodec(
	version: number,
	fieldKinds: FieldKindConfiguration,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	fieldsCodec: FieldBatchCodec,
	codecOptions: ICodecOptions,
	chunkCompressionStrategy: TreeCompressionStrategyPrivate = TreeCompressionStrategy.Compressed,
): IJsonCodec<
	ModularChangeset,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	ChangeEncodingContext
> {
	if (version < minVersionForCodec2) {
		return makeModularChangeCodecV1(
			fieldKinds,
			revisionTagCodec,
			fieldsCodec,
			codecOptions,
			chunkCompressionStrategy,
		);
	}

	return makeModularChangeCodecV2(
		fieldKinds,
		revisionTagCodec,
		fieldsCodec,
		codecOptions,
		chunkCompressionStrategy,
	);
}
