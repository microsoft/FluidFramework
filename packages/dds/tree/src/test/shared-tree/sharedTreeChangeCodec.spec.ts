/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { SessionId } from "@fluidframework/id-compressor";

import { currentVersion, type CodecWriteOptions } from "../../codec/index.js";
import { TreeStoredSchemaRepository } from "../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { decode } from "../../feature-libraries/chunked-forest/codec/chunkDecoding.js";
// eslint-disable-next-line import-x/no-internal-modules
import { uncompressedEncodeV1 } from "../../feature-libraries/chunked-forest/codec/uncompressedEncode.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { EncodedFieldBatch } from "../../feature-libraries/chunked-forest/index.js";
import {
	type FieldBatch,
	type FieldBatchEncodingContext,
	FieldKinds,
	type ModularChangeset,
	defaultSchemaPolicy,
	fieldKindConfigurations,
	makeModularChangeCodecFamily,
	newChangeAtomIdBTree,
} from "../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { newRootTable } from "../../feature-libraries/modular-schema/modularChangeFamily.js";
// eslint-disable-next-line import-x/no-internal-modules
import { newCrossFieldRangeTable } from "../../feature-libraries/modular-schema/modularChangeTypes.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { Changeset } from "../../feature-libraries/sequence-field/types.js";
// eslint-disable-next-line import-x/no-internal-modules
import { makeSharedTreeChangeCodecFamily } from "../../shared-tree/sharedTreeChangeCodecs.js";
import { brand } from "../../util/index.js";
import { ajvValidator } from "../codec/index.js";
import { testIdCompressor, testRevisionTagCodec } from "../utils.js";

const codecOptions: CodecWriteOptions = {
	jsonValidator: ajvValidator,
	minVersionForCollab: currentVersion,
};

describe("sharedTreeChangeCodec", () => {
	it("passes down the context's schema to the fieldBatchCodec", () => {
		const dummyFieldBatchCodec = {
			encode: (data: FieldBatch, context: FieldBatchEncodingContext): EncodedFieldBatch => {
				// Checks that the context's schema matches the schema passed into the sharedTreeChangeCodec.
				assert.equal(context.schema?.schema, dummyTestSchema);
				return uncompressedEncodeV1(data);
			},
			decode: (data: EncodedFieldBatch, context: FieldBatchEncodingContext): FieldBatch => {
				return decode(data, {
					idCompressor: context.idCompressor,
					originatorId: context.originatorId,
				}).map((chunk) => chunk.cursor());
			},
		};
		const modularChangeCodecs = makeModularChangeCodecFamily(
			fieldKindConfigurations,
			testRevisionTagCodec,
			dummyFieldBatchCodec,
			codecOptions,
		);
		const sharedTreeChangeCodec = makeSharedTreeChangeCodecFamily(
			modularChangeCodecs,
			codecOptions,
		).resolve(3).json;

		const dummyTestSchema = new TreeStoredSchemaRepository();
		const dummyContext = {
			originatorId: "dummySessionID" as SessionId,
			schema: { policy: defaultSchemaPolicy, schema: dummyTestSchema },
			revision: undefined,
			idCompressor: testIdCompressor,
		};
		const changeA: Changeset = [];
		const dummyModularChangeSet: ModularChangeset = {
			rebaseVersion: 1,
			rootNodes: newRootTable(),
			nodeChanges: newChangeAtomIdBTree(),
			fieldChanges: new Map([
				[brand("fA"), { fieldKind: FieldKinds.sequence.identifier, change: brand(changeA) }],
			]),
			nodeToParent: newChangeAtomIdBTree(),
			nodeAliases: newChangeAtomIdBTree(),
			crossFieldKeys: newCrossFieldRangeTable(),
		};
		sharedTreeChangeCodec.encode(
			{ changes: [{ type: "data", innerChange: dummyModularChangeSet }] },
			dummyContext,
		);
	});
});
