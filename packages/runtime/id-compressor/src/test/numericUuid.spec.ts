/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { StableId } from "..//index.js";
import {
	addNumericUuids,
	assertIsSessionId,
	numericUuidFromStableId,
	offsetNumericUuid,
	stableIdFromNumericUuid,
	subtractNumericUuids,
} from "../utilities.js";
import { readNumericUuid, writeNumericUuid } from "../persistanceUtilities.js";

describe("NumericUuid", () => {
	it("can roundtrip a uuid string", () => {
		const uuidString = "00000000-0000-4000-8000-000000000000" as StableId;
		assert.equal(stableIdFromNumericUuid(numericUuidFromStableId(uuidString)), uuidString);
	});

	it("can add to a uuid", () => {
		const numeric = numericUuidFromStableId("00000000-0000-4000-8000-000000000000" as StableId);
		assert.equal(
			stableIdFromNumericUuid(offsetNumericUuid(numeric, 1)),
			"00000000-0000-4000-8000-000000000001",
		);
	});

	it("can add to a uuid that would spill over the version and variant bits", () => {
		const numeric = numericUuidFromStableId("e507602d-b150-4fcc-bfff-ffffffffffff" as StableId);
		const uuidString = stableIdFromNumericUuid(offsetNumericUuid(numeric, 1));
		assertIsSessionId(uuidString);
		assert.equal(uuidString, "e507602d-b150-4fcd-8000-000000000000");
	});

	it("can subtract from a uuid", () => {
		const numeric1 = numericUuidFromStableId(
			"10000000-0000-4000-8000-000000000005" as StableId,
		);
		const numeric2 = numericUuidFromStableId(
			"20000000-0000-4000-8000-000000000009" as StableId,
		);
		assert.equal(
			stableIdFromNumericUuid(subtractNumericUuids(numeric2, numeric1)),
			"10000000-0000-4000-8000-000000000004",
		);
	});

	it("can do general uuid math", () => {
		const uuids = [
			numericUuidFromStableId("10000000-0000-4000-8000-000000000005" as StableId),
			numericUuidFromStableId("00000000-0000-4000-8000-000000000000" as StableId),
			numericUuidFromStableId("00000000-b7c5-4c99-83ff-c1b8e02c09d6" as StableId),
			numericUuidFromStableId("748540ca-b7c5-4c99-83ff-c1b8e02c09d6" as StableId),
			numericUuidFromStableId("748540ca-b7c5-4c99-83ef-c1b8e02c09d6" as StableId),
			numericUuidFromStableId("748540ca-b7c5-4c99-831f-c1b8e02c09d6" as StableId),
			numericUuidFromStableId("0002c79e-b536-4776-b000-000266c252d5" as StableId),
			numericUuidFromStableId("082533b9-6d05-4068-a008-fe2cc43543f7" as StableId),
			numericUuidFromStableId("2c9fa1f8-48d5-4554-a466-000000000000" as StableId),
			numericUuidFromStableId("2c9fa1f8-48d5-4000-a000-000000000000" as StableId),
			numericUuidFromStableId("10000000-0000-4000-b000-000000000000" as StableId),
			numericUuidFromStableId("10000000-0000-4000-b020-000000000000" as StableId),
			numericUuidFromStableId("10000000-0000-4000-b00f-ffffffffffff" as StableId),
			numericUuidFromStableId("10000000-0000-4000-b040-000000000000" as StableId),
			numericUuidFromStableId("f0000000-0000-4000-8000-000000000000" as StableId),
			numericUuidFromStableId("efffffff-ffff-4fff-bfff-ffffffffffff" as StableId),
		];
		uuids.sort();
		const offsets = [1, 100, 1000000, 10000000000000000];
		for (let i = 0; i < uuids.length; i++) {
			const uuidA = uuids[i];
			for (const offset of offsets) {
				assertIsSessionId(stableIdFromNumericUuid(offsetNumericUuid(uuidA, offset)));
			}
			for (let j = i; j < uuids.length; j++) {
				const uuidB = uuids[j];
				const uuidDelta = addNumericUuids(uuidB, subtractNumericUuids(uuidA, uuidB));
				assert.equal(uuidDelta, uuidA);
			}
		}
	});

	it("can serialize a uuid", () => {
		const uuidString = "00000000-0000-4000-8000-000000000000" as StableId;
		const numeric = numericUuidFromStableId(uuidString);
		const serialized = new BigUint64Array(2);
		writeNumericUuid(serialized, 0, numeric);
		const roundtripped = readNumericUuid({
			bufferUint: serialized,
			bufferFloat: new Float64Array(serialized.buffer),
			index: 0,
		});
		assert.equal(roundtripped, numeric);
	});
});
