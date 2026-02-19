/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";

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
import { type Values, strictEnum } from "../../util/index.js";
import type { FieldBatchCodec } from "../chunked-forest/index.js";
import { TreeCompressionStrategy } from "../treeCompressionUtils.js";

import type { FieldKindConfiguration } from "./fieldKindConfiguration.js";
import { makeModularChangeCodecV1 } from "./modularChangeCodecV1.js";
import { makeModularChangeCodecV2 } from "./modularChangeCodecV2.js";
import type { ModularChangeset } from "./modularChangeTypes.js";

export function makeModularChangeCodecFamily(
	fieldKindConfigurations: ReadonlyMap<ModularChangeFormatVersion, FieldKindConfiguration>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	fieldsCodec: FieldBatchCodec,
	codecOptions: ICodecOptions,
	chunkCompressionStrategy: TreeCompressionStrategy = TreeCompressionStrategy.Compressed,
): ICodecFamily<ModularChangeset, ChangeEncodingContext> {
	return makeCodecFamily(
		Array.from(fieldKindConfigurations.entries(), ([version, fieldKinds]) => {
			switch (version) {
				case ModularChangeFormatVersion.v3:
				case ModularChangeFormatVersion.v4: {
					return [
						version,
						makeModularChangeCodecV1(
							fieldKinds,
							revisionTagCodec,
							fieldsCodec,
							codecOptions,
							chunkCompressionStrategy,
						),
					];
				}
				case ModularChangeFormatVersion.v5: {
					return [
						version,
						makeModularChangeCodecV2(
							fieldKinds,
							revisionTagCodec,
							fieldsCodec,
							codecOptions,
							chunkCompressionStrategy,
						),
					];
				}
				default: {
					fail(0xcc5 /* Unsupported modular change codec version */);
				}
			}
		}),
	);
}

/**
 * The format version for `ModularChangeset`.
 */
export const ModularChangeFormatVersion = strictEnum("ModularChangeFormatVersion", {
	/**
	 * Introduced prior to 2.0 and used beyond.
	 * Reading capability must be maintained for backwards compatibility.
	 * Writing capability needs to be maintained so long as {@link lowestMinVersionForCollab} is less than 2.2.0.
	 */
	v3: 3,
	/**
	 * Introduced in 2.2.0.
	 * Was inadvertently made usable for writing in 2.43.0 (through configuredSharedTree) and remains available.
	 * Reading capability must be maintained for backwards compatibility.
	 * Writing capability could be dropped in favor of {@link ModularChangeFormatVersion.v3},
	 * but doing so would make the pattern of writable versions more complex and gain little
	 * because the logic for this format is shared with {@link ModularChangeFormatVersion.v3}.
	 */
	v4: 4,
	/**
	 * Introduced and made available for writing in 2.80.0
	 * Adds support for "no change" constraints.
	 */
	v5: 5,
});
export type ModularChangeFormatVersion = Values<typeof ModularChangeFormatVersion>;
