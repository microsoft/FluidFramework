/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionId } from "@fluidframework/id-compressor";

import { brand } from "../../../util/index.js";
import { EncodingTestData, makeEncodingTestSuite, testRevisionTagCodec } from "../../utils.js";
import {
	OptionalChangeset,
	makeOptionalFieldCodecFamily,
	optionalFieldEditor,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/optional-field/index.js";
import { FieldChangeEncodingContext } from "../../../feature-libraries/index.js";
import { TestNodeId } from "../../testNodeId.js";
import { TestChange } from "../../testChange.js";
import { Change } from "./optionalFieldUtils.js";

const nodeChange1: TestNodeId = TestNodeId.create({ localId: brand(0) }, TestChange.mint([], 1));

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

const clearEmpty = Change.reserve("self", brand(3));

const pin = Change.pin(brand(4));

export function testCodecs() {
	describe("Codecs", () => {
		const sessionId = { originatorId: "session1" as SessionId };
		const context: FieldChangeEncodingContext = {
			baseContext: sessionId,
			encodeNode: (nodeId) => TestNodeId.encode(nodeId, sessionId),
			decodeNode: (nodeId) => TestNodeId.decode(nodeId, sessionId),
		};

		const encodingTestData: EncodingTestData<
			OptionalChangeset,
			unknown,
			FieldChangeEncodingContext
		> = {
			successes: [
				["set from empty", change1, context],
				["set from non-empty", change2, context],
				["child change", changeWithChildChange, context],
				["field set with child change", change1WithChildChange, context], // Note: should only get sent over the wire when using transaction APIs.
				["undone field change", change2Inverted, context],
				["clear from empty", clearEmpty, context],
				["pin", pin, context],
			],
		};

		makeEncodingTestSuite(makeOptionalFieldCodecFamily(testRevisionTagCodec), encodingTestData);
	});
}
