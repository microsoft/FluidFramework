/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";
import { type IUser } from "@fluidframework/protocol-definitions";
import { type AttributionInfo } from "@fluidframework/runtime-definitions";
import { Attributor } from "../attributor.js";

describe("Attributor", () => {
	it("can retrieve user information from its initial entries", () => {
		const key = 42;
		const timestamp = 50;
		const user: IUser = { id: "user foo" };
		const attributor = new Attributor([[key, { user, timestamp }]]);
		assert.deepEqual(attributor.getAttributionInfo(key), { user, timestamp });
	});

	it(".entries() retrieves all user information", () => {
		const entries: Iterable<[number, AttributionInfo]> = [
			[50, { user: { id: "a" }, timestamp: 30 }],
			[51, { user: { id: "b" }, timestamp: 60 }],
		];
		const attributor = new Attributor(entries);
		assert.deepEqual([...attributor.entries()], entries);
	});

	it("getAttributionInfo throws on attempt to retrieve user information for an invalid key", () => {
		const attributor = new Attributor();
		assert.throws(
			() => attributor.getAttributionInfo(42),
			/Requested attribution information for unstored key/,
			"invalid key should throw",
		);
	});

	it("tryGetAttributionInfo returns undefined to retrieve user information for an invalid key", () => {
		const attributor = new Attributor();
		assert.equal(attributor.tryGetAttributionInfo(42), undefined);
	});
});
