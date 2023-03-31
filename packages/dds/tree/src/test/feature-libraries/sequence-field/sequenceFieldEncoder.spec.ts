/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { mintRevisionTag } from "../../../core";
import { SequenceField as SF } from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { Changeset } from "../../../feature-libraries/sequence-field";
import { TestChange } from "../../testChange";
import { deepFreeze, fakeRepair } from "../../utils";
import { ChangeMaker as Change } from "./testEdits";

const encodingTestData: [string, Changeset<TestChange>][] = [
	["with child change", Change.modify(1, TestChange.mint([], 1))],
	["without child change", Change.delete(2, 2)],
	["with repair data", Change.revive(0, 1, mintRevisionTag(), undefined, fakeRepair)],
];

describe("SequenceField encoding", () => {
	const version = 0;
	const childCodec = TestChange.codec.json;

	for (const [name, data] of encodingTestData) {
		describe(name, () => {
			it("roundtrip", () => {
				deepFreeze(data);
				const encoded = SF.encodeForJson<TestChange>(version, data, childCodec);
				const decoded = SF.decodeJson(version, encoded, childCodec);
				assert.deepEqual(decoded, data);
			});

			it("json roundtrip", () => {
				const encoded = JSON.stringify(SF.encodeForJson(version, data, childCodec));
				const decoded = SF.decodeJson(version, JSON.parse(encoded), childCodec);
				assert.deepEqual(decoded, data);
			});
		});
	}
});
