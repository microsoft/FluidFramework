/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { FluidClientVersion, type IJsonCodec } from "../../../codec/index.js";
import { typeboxValidator } from "../../../external-utilities/index.js";
// eslint-disable-next-line import/no-internal-modules
import { ClientVersionDispatchingCodecBuilder } from "../../../codec/versioned/codec.js";
import { validateUsageError } from "../../utils.js";
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
		const codecV1: IJsonCodec<number> = {
			encode: (x) => ({ version: 1, value1: x }),
			decode: (x) => (x as unknown as V1).value1,
		};
		const codecV2: IJsonCodec<number> = {
			encode: (x) => ({ version: 2, value2: x }),
			decode: (x) => (x as unknown as V2).value2,
		};

		it("using oldestCompatibleClient", () => {
			const builder = new ClientVersionDispatchingCodecBuilder(
				"Test",
				{ formatVersion: 1, oldestCompatibleClient: 0 as FluidClientVersion, codec: codecV1 },
				{ formatVersion: 2, oldestCompatibleClient: 5 as FluidClientVersion, codec: codecV2 },
			);

			const codec1 = builder.build({
				oldestCompatibleClient: 2 as FluidClientVersion,
				jsonValidator: typeboxValidator,
				writeVersionOverrides: new Map([["Unrelated", 100]]),
			});
			const codec2 = builder.build({
				oldestCompatibleClient: 6 as FluidClientVersion,
				jsonValidator: typeboxValidator,
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
				validateUsageError(`Unsupported version 3 encountered while decoding data. Supported versions for this data are: 1, 2.
The client which encoded this data likely specified an "oldestCompatibleClient" value which corresponds to a version newer than the version of this client ("${pkgVersion}").`),
			);
		});

		it("overridden", () => {
			const builder = new ClientVersionDispatchingCodecBuilder(
				"Test",
				{ formatVersion: 1, oldestCompatibleClient: FluidClientVersion.v2_0, codec: codecV1 },
				{ formatVersion: 2, oldestCompatibleClient: undefined, codec: codecV2 },
			);

			assert.throws(
				() =>
					builder.build({
						oldestCompatibleClient: FluidClientVersion.v2_0 - 1,
						jsonValidator: typeboxValidator,
						writeVersionOverrides: new Map([["Test", 1]]),
					}),
				validateUsageError(
					`Codec "Test" does not support requested format version 1 because it is only compatible back to client version 2 and the requested oldest compatible client was 1. Use "allowPossiblyIncompatibleOverrides" to override this error.`,
				),
			);

			const codec1 = builder.build({
				oldestCompatibleClient: FluidClientVersion.v2_0,
				jsonValidator: typeboxValidator,
				writeVersionOverrides: new Map([["Test", 1]]),
			});
			const codec2 = builder.build({
				oldestCompatibleClient: FluidClientVersion.v2_0,
				jsonValidator: typeboxValidator,
				writeVersionOverrides: new Map([["Test", 2]]),
				allowPossiblyIncompatibleWriteVersionOverrides: true,
			});
			const v1 = codec1.encode(42);
			const v2 = codec2.encode(42);
			assert.deepEqual(v1, { version: 1, value1: 42 });
			assert.deepEqual(v2, { version: 2, value2: 42 });
		});
	});
});
