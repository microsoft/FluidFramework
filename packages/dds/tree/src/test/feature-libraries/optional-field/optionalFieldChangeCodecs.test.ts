/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SessionId } from "@fluidframework/id-compressor";
import { NodeChangeset } from "../../../feature-libraries/index.js";
import { JsonCompatibleReadOnly, brand } from "../../../util/index.js";
import { EncodingTestData, makeEncodingTestSuite, testRevisionTagCodec } from "../../utils.js";
import {
	OptionalChangeset,
	makeOptionalFieldCodecFamily,
	optionalFieldEditor,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/optional-field/index.js";
import { IJsonCodec } from "../../../codec/index.js";
import { ChangeEncodingContext } from "../../../core/index.js";
import { changesetForChild } from "../fieldKindTestUtils.js";
import { Change } from "./optionalFieldUtils.js";

const nodeChange1 = changesetForChild("nodeChange1");

const encodedChild = "encoded child";

const childCodec1: IJsonCodec<
	NodeChangeset,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	ChangeEncodingContext
> = {
	encode: (change: NodeChangeset) => {
		assert.deepEqual(change, nodeChange1);
		return encodedChild;
	},
	decode: (encodedChange: JsonCompatibleReadOnly) => {
		assert.equal(encodedChange, encodedChild);
		return nodeChange1;
	},
};

const change1 = Change.atOnce(Change.reserve("self", brand(1)), Change.move(brand(41), "self"));

const change2: OptionalChangeset = optionalFieldEditor.set(false, {
	fill: brand(42),
	detach: brand(2),
});

const change2Inverted = Change.atOnce(
	Change.clear("self", brand(42)),
	Change.move(brand(2), "self"),
);

const changeWithChildChange = optionalFieldEditor.buildChildChange(0, nodeChange1);

const change1WithChildChange = Change.atOnce(
	Change.clear("self", brand(1)),
	Change.move(brand(41), "self"),
	Change.child(nodeChange1),
);

export function testCodecs() {
	describe("Codecs", () => {
		const sessionId = { originatorId: "session1" as SessionId };
		const encodingTestData: EncodingTestData<
			OptionalChangeset,
			unknown,
			ChangeEncodingContext
		> = {
			successes: [
				["set from empty", change1, sessionId],
				["set from non-empty", change2, sessionId],
				["child change", changeWithChildChange, sessionId],
				["field set with child change", change1WithChildChange, sessionId], // Note: should only get sent over the wire when using transaction APIs.
				["undone field change", change2Inverted, sessionId],
			],
		};

		makeEncodingTestSuite(
			makeOptionalFieldCodecFamily(childCodec1, testRevisionTagCodec),
			encodingTestData,
		);
	});
}
