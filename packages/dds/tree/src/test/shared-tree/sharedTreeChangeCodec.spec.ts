/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { SessionId } from "@fluidframework/id-compressor";

import { ICodecOptions, noopValidator } from "../../codec/index.js";
import { TreeStoredSchemaRepository } from "../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { decode } from "../../feature-libraries/chunked-forest/codec/chunkDecoding.js";
// eslint-disable-next-line import/no-internal-modules
import { uncompressedEncode } from "../../feature-libraries/chunked-forest/codec/uncompressedEncode.js";
// eslint-disable-next-line import/no-internal-modules
import { EncodedFieldBatch } from "../../feature-libraries/chunked-forest/index.js";
import {
	fieldKindConfigurations,
	sequence,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/default-schema/defaultFieldKinds.js";
import {
	FieldBatch,
	FieldBatchEncodingContext,
	ModularChangeset,
	SequenceField,
	defaultSchemaPolicy,
	makeModularChangeCodecFamily,
} from "../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { makeSharedTreeChangeCodecFamily } from "../../shared-tree/sharedTreeChangeCodecs.js";
// eslint-disable-next-line import/no-internal-modules
import { brand } from "../../util/brand.js";
import { ajvValidator } from "../codec/index.js";
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
		const modularChangeCodecs = makeModularChangeCodecFamily(
			fieldKindConfigurations,
			testRevisionTagCodec,
			dummyFieldBatchCodec,
			codecOptions,
		);
		const sharedTreeChangeCodec = makeSharedTreeChangeCodecFamily(modularChangeCodecs, {
			jsonValidator: noopValidator,
		}).resolve(1).json;

		const dummyTestSchema = new TreeStoredSchemaRepository();
		const dummyContext = {
			originatorId: "dummySessionID" as SessionId,
			schema: { policy: defaultSchemaPolicy, schema: dummyTestSchema },
			revision: undefined,
		};
		const changeA: SequenceField.Changeset = [];
		const dummyModularChangeSet: ModularChangeset = {
			nodeChanges: new Map(),
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
