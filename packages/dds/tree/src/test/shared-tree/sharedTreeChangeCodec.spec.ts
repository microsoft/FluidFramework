/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SessionId } from "@fluidframework/id-compressor";
import {
	FieldBatch,
	FieldBatchEncodingContext,
	ModularChangeset,
	SequenceField,
	defaultSchemaPolicy,
	fieldKinds,
	makeV0Codec,
} from "../../feature-libraries/index.js";
import { TreeStoredSchemaRepository } from "../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { sequence } from "../../feature-libraries/default-schema/defaultFieldKinds.js";
import { ICodecOptions, noopValidator } from "../../codec/index.js";
import { ajvValidator } from "../codec/index.js";
// eslint-disable-next-line import/no-internal-modules
import { makeSharedTreeChangeCodec } from "../../shared-tree/sharedTreeChangeCodecs.js";
// eslint-disable-next-line import/no-internal-modules
import { brand } from "../../util/brand.js";
// eslint-disable-next-line import/no-internal-modules
import { EncodedFieldBatch } from "../../feature-libraries/chunked-forest/index.js";
// eslint-disable-next-line import/no-internal-modules
import { uncompressedEncode } from "../../feature-libraries/chunked-forest/codec/uncompressedEncode.js";
// eslint-disable-next-line import/no-internal-modules
import { decode } from "../../feature-libraries/chunked-forest/codec/chunkDecoding.js";
import { testRevisionTagCodec } from "../utils.js";

const codecOptions: ICodecOptions = { jsonValidator: ajvValidator };

describe("sharedTreeChangeCodec", () => {
	it("passes down the context's schema to the fieldBatchCodec", () => {
		const dummyFieldBatchCodec = {
			encode: (data: FieldBatch, context: FieldBatchEncodingContext): EncodedFieldBatch => {
				// Checks that the context's schema matches the schema passed into the sharedTreeChangeCodec.
				assert.equal(context.schema?.schema, dummyTestSchema);
				return uncompressedEncode(data);
			},
			decode: (data: EncodedFieldBatch): FieldBatch => {
				return decode(data).map((chunk) => chunk.cursor());
			},
		};
		const modularChangeCodec = makeV0Codec(
			fieldKinds,
			testRevisionTagCodec,
			dummyFieldBatchCodec,
			codecOptions,
		);
		const sharedTreeChangeCodec = makeSharedTreeChangeCodec(modularChangeCodec, {
			jsonValidator: noopValidator,
		});

		const dummyTestSchema = new TreeStoredSchemaRepository();
		const dummyContext = {
			originatorId: "dummySessionID" as SessionId,
			schema: { policy: defaultSchemaPolicy, schema: dummyTestSchema },
		};
		const changeA: SequenceField.Changeset = [];
		const dummyModularChangeSet: ModularChangeset = {
			fieldChanges: new Map([
				[brand("fA"), { fieldKind: sequence.identifier, change: brand(changeA) }],
			]),
		};
		sharedTreeChangeCodec.encode(
			{ changes: [{ type: "data", innerChange: dummyModularChangeSet }] },
			dummyContext,
		);
	});
});
