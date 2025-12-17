/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { FluidClientVersion, Versioned } from "../../../codec/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";

import {
	ClientVersionDispatchingCodecBuilder,
	type CodecAndSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../codec/versioned/codec.js";
import { pkgVersion } from "../../../packageVersion.js";
import { lowestMinVersionForCollab } from "@fluidframework/runtime-utils/internal";

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

		const builder = ClientVersionDispatchingCodecBuilder.build("Test", {
			[lowestMinVersionForCollab]: {
				formatVersion: 1,
				codec: codecV1,
			},
			[FluidClientVersion.v2_43]: {
				formatVersion: 2,
				codec: () => codecV2,
			},
		});

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
				validateUsageError(`Unsupported version 3 encountered while decoding Test data. Supported versions for this data are: 1, 2.
The client which encoded this data likely specified an "minVersionForCollab" value which corresponds to a version newer than the version of this client ("${pkgVersion}").`),
			);
		});
	});
});
