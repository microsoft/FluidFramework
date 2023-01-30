/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SequenceField as SF } from "../../../feature-libraries";
import { TestChange, TestChangeEncoder } from "../../testChange";
import { deepFreeze } from "../../utils";
import { ChangeMaker as Change, TestChangeset } from "./testEdits";

describe("SequenceField - Encoder", () => {
	it("with child change", () => {
		const change: TestChangeset = Change.modify(1, TestChange.mint([], 1));
		deepFreeze(change);
		const childEncoder = new TestChangeEncoder();
		const encoded = JSON.stringify(
			SF.encodeForJson(0, change, (c) => childEncoder.encodeForJson(0, c)),
		);
		const decoded = SF.decodeJson(0, JSON.parse(encoded), (c) => childEncoder.decodeJson(0, c));
		assert.deepEqual(decoded, change);
	});

	it("without child change", () => {
		const change: TestChangeset = Change.delete(2, 2);
		deepFreeze(change);
		const encoded = JSON.stringify(
			SF.encodeForJson(0, change, () => assert.fail("Child encoder should not be called")),
		);
		const decoded = SF.decodeJson(0, JSON.parse(encoded), () =>
			assert.fail("Child decoder should not be called"),
		);
		assert.deepEqual(decoded, change);
	});
});
