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
import { recordHistoryTrace } from "../../util/index.js";
import { TreeCompressionStrategy } from "../treeCompressionUtils.js";

import type { FieldKindConfiguration } from "./fieldKindConfiguration.js";
import {
	encodeChange,
	decodeChange,
	getFieldChangesetCodecs,
} from "./modularChangeCodecV1.js";
import { areDeltaEquivalent } from "./modularChangeDelta.js";
import { EncodedModularChangesetV2 } from "./modularChangeFormatV2.js";
import type { ModularChangeset } from "./modularChangeTypes.js";
import { fieldKindsFromConfiguration, isChangesetValid } from "./modularChangeUtils.js";

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
			let stage = "encodeInputValidation";
			recordHistoryTrace(context.historyTrace, "HistoryChangeEncodeStarted", {
				inputMaxId: change.maxId,
				codec: "modularV2",
			});
			try {
				strictRebaseValidation("Malformed V2 encode input", () =>
					isChangesetValid(change, fieldKindsFromConfiguration(fieldKinds)),
				);
				stage = "encode";
				const encoded = encodeChange(
					change,
					context,
					fieldKinds,
					fieldChangesetCodecs,
					revisionTagCodec,
					fieldsCodec,
					chunkCompressionStrategy,
				) as EncodedModularChangesetV2;
				encoded.noChangeConstraint = change.noChangeConstraint;
				cheapRebaseValidation("V2 encode output", (): true | string => {
					stage = "validationDecode";
					recordHistoryTrace(context.historyTrace, "HistoryValidationDecodeStarted", {
						encodedMaxId: encoded.maxId,
						codec: "modularV2",
					});
					const decoded = modularChangeCodec.decode(encoded, context);
					stage = "deltaComparison";
					recordHistoryTrace(context.historyTrace, "HistoryValidationDecodeCompleted", {
						encodedMaxId: encoded.maxId,
						decodedMaxId: decoded.maxId,
						codec: "modularV2",
					});
					return (
						areDeltaEquivalent(change, decoded, fieldKindsFromConfiguration(fieldKinds)) ||
						"does not match decode output"
					);
				});
				recordHistoryTrace(context.historyTrace, "HistoryChangeEncoded", {
					encodedMaxId: encoded.maxId,
					codec: "modularV2",
				});
				return encoded;
			} catch (error: unknown) {
				recordHistoryTrace(context.historyTrace, "HistoryChangeEncodeFailed", {
					stage,
					inputMaxId: change.maxId,
					codec: "modularV2",
				});
				throw error;
			}
		},

		decode: (encodedChange: EncodedModularChangesetV2, context) => {
			let stage = "decode";
			try {
				const decoded = decodeChange(
					encodedChange,
					context,
					fieldKinds,
					fieldChangesetCodecs,
					revisionTagCodec,
					fieldsCodec,
					chunkCompressionStrategy,
					"modularV2",
				);
				if (encodedChange.noChangeConstraint !== undefined) {
					decoded.noChangeConstraint = encodedChange.noChangeConstraint;
				}
				stage = "decodeOutputValidation";
				cheapRebaseValidation("Malformed V2 decode output", () =>
					isChangesetValid(decoded, fieldKindsFromConfiguration(fieldKinds)),
				);
				return decoded;
			} catch (error: unknown) {
				recordHistoryTrace(context.historyTrace, "HistoryChangeDecodeFailed", {
					stage,
					encodedMaxId: encodedChange.maxId,
					codec: "modularV2",
				});
				throw error;
			}
		},
	};

	return withSchemaValidation(
		EncodedModularChangesetV2,
		modularChangeCodec,
		codecOptions.jsonValidator,
	);
}
