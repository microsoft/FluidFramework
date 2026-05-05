/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { SessionId } from "@fluidframework/id-compressor";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import { currentVersion, type CodecWriteOptions } from "../../codec/index.js";
import { TreeStoredSchemaRepository, type ChangeEncodingContext } from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { decode } from "../../feature-libraries/chunked-forest/codec/chunkDecoding.js";
// eslint-disable-next-line import-x/no-internal-modules
import { uncompressedEncodeV1 } from "../../feature-libraries/chunked-forest/codec/uncompressedEncode.js";
import type {
	EncodedFieldBatchV1OrV2,
	FieldBatchCodec,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../feature-libraries/chunked-forest/index.js";
import {
	type FieldBatch,
	type FieldBatchEncodingContext,
	FieldBatchFormatVersion,
	FieldKinds,
	type ModularChangeset,
	defaultSchemaPolicy,
	fieldKindConfigurations,
	makeModularChangeCodecFamily,
	newChangeAtomIdBTree,
} from "../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { newCrossFieldKeyTable } from "../../feature-libraries/modular-schema/modularChangeTypes.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { Changeset } from "../../feature-libraries/sequence-field/types.js";
// eslint-disable-next-line import-x/no-internal-modules
import { makeSharedTreeChangeCodecFamily } from "../../shared-tree/sharedTreeChangeCodecs.js";
import { brand } from "../../util/index.js";
import { ajvValidator } from "../codec/index.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../snapshots/index.js";
import { testIdCompressor, testRevisionTagCodec } from "../utils.js";

const codecOptions: CodecWriteOptions = {
	jsonValidator: ajvValidator,
	minVersionForCollab: currentVersion,
};

describe("sharedTreeChangeCodec", () => {
	useSnapshotDirectory("sharedTreeChangeCodec");

	// Dummy FieldBatchCodec codec which asserts when encoding or decoding.
	const failFieldBatchCodec: FieldBatchCodec = {
		encode: (): EncodedFieldBatchV1OrV2 => assert.fail(),
		decode: (): FieldBatch => assert.fail(),
		writeVersion: FieldBatchFormatVersion.v2,
	};

	it("codec schema snapshot", () => {
		const modularChangeCodecs = makeModularChangeCodecFamily(
			fieldKindConfigurations,
			testRevisionTagCodec,
			failFieldBatchCodec,
			codecOptions,
		);

		const sharedTreeChangeCodec = makeSharedTreeChangeCodecFamily(
			modularChangeCodecs,
			codecOptions,
		);

		const formats = [...sharedTreeChangeCodec.getSupportedFormats()];
		const schema = formats.map((format) => {
			const codec = sharedTreeChangeCodec.resolve(format);
			assert(codec.encodedSchema !== undefined);
			return { version: format, schema: codec.encodedSchema };
		});
		// Capture the portion of the schema validated at the root.
		// Currently this does not include the schema for the modular change which is validated separately in the modular change codec,
		// but it does include the schema for the inner change wrapper.
		takeJsonSnapshot(schema);
	});

	// This ensures that the schema for schema changes is getting included in the TreeChangeCodec's schema.
	it("rejects malformed schema-change data", () => {
		const modularChangeCodecs = makeModularChangeCodecFamily(
			fieldKindConfigurations,
			testRevisionTagCodec,
			failFieldBatchCodec,
			{ jsonValidator: FormatValidatorBasic },
		);
		const codec = makeSharedTreeChangeCodecFamily(modularChangeCodecs, codecOptions).resolve(
			3,
		);

		assert.throws(
			() =>
				codec.decode(
					// missing 'old' field
					[{ schema: { new: {} } }],
					{} as unknown as ChangeEncodingContext,
				),
			validateAssertionError(/must have required property 'old'/),
		);
	});

	it("passes down the context's schema to the fieldBatchCodec", () => {
		const dummyFieldBatchCodec: FieldBatchCodec = {
			encode: (
				data: FieldBatch,
				context: FieldBatchEncodingContext,
			): EncodedFieldBatchV1OrV2 => {
				// Checks that the context's schema matches the schema passed into the sharedTreeChangeCodec.
				assert.equal(context.schema?.schema, dummyTestSchema);
				return uncompressedEncodeV1(data);
			},
			decode: (
				data: EncodedFieldBatchV1OrV2,
				context: FieldBatchEncodingContext,
			): FieldBatch => {
				return decode(data, {
					idCompressor: context.idCompressor,
					originatorId: context.originatorId,
				}).map((chunk) => chunk.cursor());
			},
			writeVersion: FieldBatchFormatVersion.v2,
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
		).resolve(3);

		const dummyTestSchema = new TreeStoredSchemaRepository();
		const dummyContext = {
			originatorId: "dummySessionID" as SessionId,
			schema: { policy: defaultSchemaPolicy, schema: dummyTestSchema },
			revision: undefined,
			idCompressor: testIdCompressor,
		};
		const changeA: Changeset = [];
		const dummyModularChangeSet: ModularChangeset = {
			nodeChanges: newChangeAtomIdBTree(),
			fieldChanges: new Map([
				[brand("fA"), { fieldKind: FieldKinds.sequence.identifier, change: brand(changeA) }],
			]),
			nodeToParent: newChangeAtomIdBTree(),
			nodeAliases: newChangeAtomIdBTree(),
			crossFieldKeys: newCrossFieldKeyTable(),
		};
		sharedTreeChangeCodec.encode(
			{ changes: [{ type: "data", innerChange: dummyModularChangeSet }] },
			dummyContext,
		);
	});
});
