// XXX
// /*!
//  * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
//  * Licensed under the MIT License.
//  */

// import type { SessionId } from "@fluidframework/id-compressor";

// import { brand } from "../../../util/index.js";
// import {
// 	type EncodingTestData,
// 	makeEncodingTestSuite,
// 	mintRevisionTag,
// 	testIdCompressor,
// 	testRevisionTagCodec,
// } from "../../utils.js";
// import {
// 	type OptionalChangeset,
// 	makeOptionalFieldCodecFamily,
// 	optionalFieldEditor,
// 	// eslint-disable-next-line import/no-internal-modules
// } from "../../../feature-libraries/optional-field/index.js";
// import type { FieldChangeEncodingContext } from "../../../feature-libraries/index.js";
// import { TestNodeId } from "../../testNodeId.js";
// import { TestChange } from "../../testChange.js";
// import { Change, inlineRevision } from "./optionalFieldUtils.js";

// const nodeChange1: TestNodeId = TestNodeId.create(
// 	{ localId: brand(0) },
// 	TestChange.mint([], 1),
// );
// const tag1 = mintRevisionTag();

// const change1 = inlineRevision(
// 	Change.atOnce(Change.reserve("self", brand(1)), Change.move(brand(41), "self")),
// 	tag1,
// );

// const change2: OptionalChangeset = inlineRevision(
// 	optionalFieldEditor.set(false, {
// 		fill: { localId: brand(42), revision: tag1 },
// 		detach: { localId: brand(2), revision: tag1 },
// 	}),
// 	tag1,
// );

// const change2Inverted = inlineRevision(
// 	Change.atOnce(Change.clear("self", brand(42)), Change.move(brand(2), "self")),
// 	tag1,
// );

// const changeWithChildChange = inlineRevision(
// 	optionalFieldEditor.buildChildChange(0, nodeChange1),
// 	tag1,
// );

// const change1WithChildChange = inlineRevision(
// 	Change.atOnce(
// 		Change.clear("self", brand(1)),
// 		Change.move(brand(41), "self"),
// 		Change.child(nodeChange1),
// 	),
// 	tag1,
// );

// const clearEmpty = inlineRevision(Change.reserve("self", brand(3)), tag1);

// const pin = inlineRevision(Change.pin(brand(4)), tag1);

// export function testCodecs() {
// 	describe("Codecs", () => {
// 		const baseContext = {
// 			originatorId: "session1" as SessionId,
// 			revision: undefined,
// 			idCompressor: testIdCompressor,
// 		};
// 		const context: FieldChangeEncodingContext = {
// 			baseContext,
// 			encodeNode: (nodeId) => TestNodeId.encode(nodeId, baseContext),
// 			decodeNode: (nodeId) => TestNodeId.decode(nodeId, baseContext),
// 		};

// 		const encodingTestData: EncodingTestData<
// 			OptionalChangeset,
// 			unknown,
// 			FieldChangeEncodingContext
// 		> = {
// 			successes: [
// 				["set from empty", change1, context],
// 				["set from non-empty", change2, context],
// 				["child change", changeWithChildChange, context],
// 				["field set with child change", change1WithChildChange, context], // Note: should only get sent over the wire when using transaction APIs.
// 				["undone field change", change2Inverted, context],
// 				["clear from empty", clearEmpty, context],
// 				["pin", pin, context],
// 			],
// 		};

// 		makeEncodingTestSuite(
// 			makeOptionalFieldCodecFamily(testRevisionTagCodec),
// 			encodingTestData,
// 		);
// 	});
// }
