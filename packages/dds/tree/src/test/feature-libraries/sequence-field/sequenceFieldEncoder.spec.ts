/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { mintRevisionTag } from "../../../core";
import { SequenceField as SF } from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { Changeset } from "../../../feature-libraries/sequence-field";
import { TestChange, TestChangeEncoder } from "../../testChange";
import { deepFreeze, fakeRepair } from "../../utils";
import { ChangeMaker as Change } from "./testEdits";

const encodingTestData: [string, Changeset<TestChange>][] = [
	["with child change", Change.modify(1, TestChange.mint([], 1))],
	["without child change", Change.delete(2, 2)],
	["with repair data", Change.revive(0, 1, mintRevisionTag(), undefined, fakeRepair)],
];

describe("SequenceField encoding", () => {
	const version = 0;
	const childEncoder = new TestChangeEncoder();

	for (const [name, data] of encodingTestData) {
		describe(name, () => {
			it("roundtrip", () => {
				deepFreeze(data);
				const encoded = SF.encodeForJson<TestChange>(version, data, (c) =>
					childEncoder.encodeForJson(0, c),
				);
				const decoded = SF.decodeJson(version, encoded, (c) =>
					childEncoder.decodeJson(0, c),
				);
				assert.deepEqual(decoded, data);
			});

			it("json roundtrip", () => {
				const encoded = JSON.stringify(
					SF.encodeForJson(version, data, (c) => childEncoder.encodeForJson(0, c)),
				);
				const decoded = SF.decodeJson(version, JSON.parse(encoded), (c) =>
					childEncoder.decodeJson(0, c),
				);
				assert.deepEqual(decoded, data);
			});
		});
	}
});
