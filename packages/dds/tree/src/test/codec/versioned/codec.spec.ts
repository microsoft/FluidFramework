/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { lowestMinVersionForCollab } from "@fluidframework/runtime-utils/internal";
import {
	validateAssertionError,
	validateUsageError,
} from "@fluidframework/test-runtime-utils/internal";

import { FluidClientVersion, Versioned } from "../../../codec/index.js";
import {
	ClientVersionDispatchingCodecBuilder,
	type CodecAndSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../codec/versioned/codec.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import { pkgVersion } from "../../../packageVersion.js";

describe("versioned Codecs", () => {
	describe("ClientVersionDispatchingCodecBuilder", () => {
		interface V1 {
			version: 1;
			value1: number;
		}
		interface V2 {
			version: 2;
			value2: number;
		}
		interface VX {
			version: "X";
			valueX: number;
		}
		const codecV1: CodecAndSchema<number> = {
			encode: (x) => ({ version: 1, value1: x }),
			decode: (x) => (x as unknown as V1).value1,
			schema: Versioned,
		};
		const codecV2: CodecAndSchema<number> = {
			encode: (x) => ({ version: 2, value2: x }),
			decode: (x) => (x as unknown as V2).value2,
			schema: Versioned,
		};
		const codecVX: CodecAndSchema<number> = {
			encode: (x) => ({ version: "X", valueX: x }),
			decode: (x) => (x as unknown as VX).valueX,
			schema: Versioned,
		};

		const builder = ClientVersionDispatchingCodecBuilder.build("Test", [
			{
				minVersionForCollab: lowestMinVersionForCollab,
				formatVersion: 1,
				codec: codecV1,
			},
			{
				minVersionForCollab: FluidClientVersion.v2_43,
				formatVersion: 2,
				codec: () => codecV2,
			},
			{
				minVersionForCollab: "none",
				formatVersion: "X",
				codec: codecVX,
			},
		]);

		it("round trip", () => {
			const codec1 = builder.build({
				minVersionForCollab: "2.0.0",
				jsonValidator: FormatValidatorBasic,
			});
			const codec2 = builder.build({
				minVersionForCollab: "2.55.0",
				jsonValidator: FormatValidatorBasic,
			});
			const v1 = codec1.encode(42);
			const v2 = codec2.encode(42);
			assert.deepEqual(v1, { version: 1, value1: 42 });
			assert.deepEqual(v2, { version: 2, value2: 42 });
			assert.equal(codec1.decode(v1), 42);
			assert.equal(codec1.decode(v2), 42);
			assert.equal(codec2.decode(v1), 42);
			assert.equal(codec2.decode(v2), 42);

			assert.throws(
				() => codec1.decode({ version: 3, value2: 42 }),
				validateUsageError(`Unsupported version 3 encountered while decoding Test data. Supported versions for this data are: [1,2,"X"].
The client which encoded this data likely specified an "minVersionForCollab" value which corresponds to a version newer than the version of this client ("${pkgVersion}").`),
			);
		});

		it("unstable version", () => {
			const codecX = builder.build({
				minVersionForCollab: "2.0.0",
				jsonValidator: FormatValidatorBasic,
				allowPossiblyIncompatibleWriteVersionOverrides: true,
				writeVersionOverrides: new Map([["Test", "X"]]),
			});
			const codec2 = builder.build({
				minVersionForCollab: "2.55.0",
				jsonValidator: FormatValidatorBasic,
			});
			const vx = codecX.encode(42);
			const v2 = codec2.encode(42);
			assert.deepEqual(vx, { version: "X", valueX: 42 });
			assert.deepEqual(v2, { version: 2, value2: 42 });
			assert.equal(codecX.decode(vx), 42);
			assert.equal(codecX.decode(v2), 42);
			assert.equal(codec2.decode(vx), 42);
			assert.equal(codec2.decode(v2), 42);
		});

		it("bad override", () => {
			assert.throws(
				() =>
					builder.build({
						minVersionForCollab: "2.0.0",
						jsonValidator: FormatValidatorBasic,
						writeVersionOverrides: new Map([["Test", "X"]]),
					}),
				validateUsageError(
					`Codec "Test" does not support requested format version "X" because it is has minVersionForCollab "none". Use "allowPossiblyIncompatibleWriteVersionOverrides" to suppress this error if appropriate.`,
				),
			);

			assert.throws(
				() =>
					builder.build({
						minVersionForCollab: "2.0.0",
						jsonValidator: FormatValidatorBasic,
						allowPossiblyIncompatibleWriteVersionOverrides: true,
						writeVersionOverrides: new Map([["Test", "1"]]),
					}),
				validateUsageError(
					`Codec "Test" does not support requested format version "1". Supported versions are: [1,2,"X"].`,
				),
			);
		});
	});
});
