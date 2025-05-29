/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	FluidClientVersion,
	type ICodecFamily,
	type IJsonCodec,
	makeCodecFamily,
} from "../../../codec/index.js";
import { typeboxValidator } from "../../../external-utilities/index.js";
import { ClientVersionDispatchingCodecBuilder } from "../../../codec/versioned/codec.js";
import type { JsonCompatibleReadOnly } from "../../../util/utils.js";
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
		const codecV1: IJsonCodec<number, JsonCompatibleReadOnly> = {
			encode: (x) => ({ version: 1, value1: x }),
			decode: (x) => (x as unknown as V1).value1,
		};
		const codecV2: IJsonCodec<number, JsonCompatibleReadOnly> = {
			encode: (x) => ({ version: 2, value2: x }),
			decode: (x) => (x as unknown as V2).value2,
		};

		const family: ICodecFamily<number> = makeCodecFamily([
			[1, codecV1],
			[2, codecV2],
		]);
		const builder = new ClientVersionDispatchingCodecBuilder(
			family,
			(oldestCompatibleClient: FluidClientVersion) => (oldestCompatibleClient > 5 ? 2 : 1),
		);

		it("round trip", () => {
			const codec1 = builder.build({
				oldestCompatibleClient: 2 as FluidClientVersion,
				jsonValidator: typeboxValidator,
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
	});
});
